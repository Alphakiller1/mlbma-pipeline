"""Publish the dashboard to chase-analytics.com without GitHub Actions.

This is a line-for-line local equivalent of .github/workflows/cloudflare-deploy.yml.
It exists because production is otherwise reachable only through that workflow: when
Actions is unavailable (exhausted minutes on this private repo, an outage, a runner
problem) every push to master builds nothing and the custom domain keeps serving the
last successful deploy. On 2026-07-30 that had been the case for a week.

Same three steps as the workflow, same project, same guards:
  1. build a clean web-only _site/ (no Python, no CI config, no docs)
  2. upload it to the master branch alias with wrangler
  3. trigger a PRODUCTION deployment via the Pages API and poll until it lands
     (git-integrated Pages treats a wrangler upload as a branch preview, so without
     step 3 the custom domain keeps serving the stale Git production build)

Credentials — never hard-code these, and never commit them:
  CLOUDFLARE_API_TOKEN   Pages:Edit on the account
  CLOUDFLARE_ACCOUNT_ID
Read from the environment, or from a .env in the repo root.

  python scripts/deploy_cloudflare.py --dry-run     # build + verify, publish nothing
  python scripts/deploy_cloudflare.py               # full production deploy

Exits non-zero on any failed guard, upload or deployment stage.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SITE = REPO / "_site"

PAGES_PROJECT = os.getenv("PAGES_PROJECT", "mlbma-pipeline-b")
PRODUCTION_BRANCH = os.getenv("PRODUCTION_BRANCH", "master")
WRANGLER = "wrangler@4.40.0"

# Mirrors the workflow's rsync --exclude list: ship the web surface only.
EXCLUDE_DIRS = {
    ".git", ".github", "node_modules", "core", "outputs", "pipeline", "scripts",
    "tests", "__pycache__", "_site", "data", "docs", ".pytest_cache", ".ruff_cache",
}
EXCLUDE_SUFFIXES = {".py", ".pyc", ".md", ".bat", ".log"}
EXCLUDE_NAMES = {"requirements.txt", "wrangler.jsonc", "wrangler.toml", ".assetsignore", ".gitignore"}

# A deploy that drops the dashboard's shared runtime is worse than no deploy.
GUARD_FILE = "dashboard/matchup_shared.js"
GUARD_TOKEN = "hydrateMatchupPitcherStatsFromMlb"


def fail(msg: str) -> None:
    print(f"[deploy] FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


def load_env() -> None:
    """Fill missing credentials from a .env in the repo root (values never printed)."""
    path = REPO / ".env"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if key in ("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID") and not os.getenv(key):
            os.environ[key] = value.strip().strip('"').strip("'")


def build_site() -> int:
    if SITE.exists():
        shutil.rmtree(SITE)
    count = 0
    for src in REPO.rglob("*"):
        rel = src.relative_to(REPO)
        if any(part in EXCLUDE_DIRS for part in rel.parts):
            continue
        if src.is_dir():
            continue
        if src.suffix in EXCLUDE_SUFFIXES or src.name in EXCLUDE_NAMES:
            continue
        if src.name.startswith(".env"):
            continue
        dest = SITE / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        count += 1
    return count


def verify_site() -> None:
    guard = SITE / GUARD_FILE
    if not guard.exists():
        fail(f"{GUARD_FILE} missing from the build")
    if GUARD_TOKEN not in guard.read_text(encoding="utf-8", errors="ignore"):
        fail(f"{GUARD_FILE} does not contain {GUARD_TOKEN} - refusing to publish")
    for leaked in (".env", "requirements.txt"):
        if (SITE / leaked).exists():
            fail(f"{leaked} leaked into the build")
    if any(p.suffix == ".py" for p in SITE.rglob("*")):
        fail("a .py file leaked into the build")


def api(method: str, path: str, body: dict | None = None) -> dict:
    token = os.environ["CLOUDFLARE_API_TOKEN"]
    account = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    base = (f"https://api.cloudflare.com/client/v4/accounts/{account}"
            f"/pages/projects/{PAGES_PROJECT}")
    request = urllib.request.Request(
        base + path,
        data=None if body is None else json.dumps(body).encode(),
        method=method,
        headers={"Authorization": f"Bearer {token}",
                 "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        print(exc.read().decode(errors="ignore"), file=sys.stderr)
        raise


def configure_project() -> None:
    """Static master production deploys; Git-driven builds off (matches the workflow)."""
    resp = api("PATCH", "", {
        "production_branch": PRODUCTION_BRANCH,
        "build_config": {"build_command": "", "destination_dir": "/", "root_dir": ""},
        "source": {"config": {"deployments_enabled": False,
                              "production_deployments_enabled": False}},
    })
    if not resp.get("success"):
        fail(f"could not configure Pages project: {json.dumps(resp)[:300]}")
    result = resp.get("result") or {}
    print(f"[deploy] project configured: production_branch="
          f"{result.get('production_branch')}")


def upload(sha: str, message: str) -> None:
    cmd = ["npx", "--yes", WRANGLER, "pages", "deploy", ".",
           f"--project-name={PAGES_PROJECT}", f"--branch={PRODUCTION_BRANCH}",
           "--commit-dirty=true"]
    if sha:
        cmd.append(f"--commit-hash={sha}")
    if message:
        cmd.append(f"--commit-message={message}")
    print(f"[deploy] uploading {SITE} via wrangler ...")
    proc = subprocess.run(cmd, cwd=SITE, shell=(os.name == "nt"))
    if proc.returncode != 0:
        fail(f"wrangler exited {proc.returncode}")


def deploy_production(sha: str) -> None:
    payload = {"branch": PRODUCTION_BRANCH}
    if sha:
        payload["commit_hash"] = sha
    created = api("POST", "/deployments", payload)
    if not created.get("success"):
        fail(f"could not trigger production deployment: {json.dumps(created)[:300]}")
    dep = created.get("result") or {}
    dep_id = dep.get("id")
    print(f"[deploy] triggered production deployment {dep_id} {dep.get('url', '')}")
    for attempt in range(72):
        time.sleep(10)
        info = (api("GET", f"/deployments/{dep_id}").get("result") or {})
        stages = info.get("stages") or []
        latest = info.get("latest_stage") or (stages[-1] if stages else {})
        status, name = latest.get("status"), latest.get("name")
        print(f"[deploy] poll {attempt + 1}: stage={name} status={status}")
        if status == "success":
            print(f"[deploy] production live: {info.get('url')}")
            return
        if status in {"failure", "canceled"}:
            fail(f"deployment {status} at stage {name}")
    fail("timed out waiting for the production deployment")


def git(*args: str) -> str:
    try:
        return subprocess.run(["git", *args], cwd=REPO, capture_output=True,
                              text=True, check=True).stdout.strip()
    except Exception:
        return ""


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true",
                    help="build and verify only; contact Cloudflare not at all")
    a = ap.parse_args()

    load_env()
    files = build_site()
    verify_site()
    print(f"[deploy] built _site with {files} files ({GUARD_FILE} verified)")

    branch = git("rev-parse", "--abbrev-ref", "HEAD")
    sha = git("rev-parse", "HEAD")
    subject = git("log", "-1", "--pretty=%s")
    if branch and branch != PRODUCTION_BRANCH:
        print(f"[deploy] NOTE on branch {branch!r}, publishing it as "
              f"{PRODUCTION_BRANCH} production")

    if a.dry_run:
        print("[deploy] dry run - nothing published")
        return
    for key in ("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"):
        if not os.getenv(key):
            fail(f"{key} is not set (environment or .env). "
                 f"The token needs Pages:Edit.")
    configure_project()
    upload(sha, subject)
    deploy_production(sha)


if __name__ == "__main__":
    main()
