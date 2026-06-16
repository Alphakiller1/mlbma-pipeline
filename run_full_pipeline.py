"""
Chase Analytics — unified pipeline orchestrator.

One command refreshes AND publishes the whole three-repo stack so the live
dashboards never drift out of sync again:

  1. MLBMA pipeline      python -m pipeline.main        -> data/*.csv + Google Sheets
                                                           + Supabase + dashboard
                                                           (powers chase-analytics.com)
  2. Bet Evaluator       export_web_data.py             -> docs/data/site.json
                                                           (powers the bet-evaluator site)
  3. Sharp Money Tracker export_dashboard.py            -> docs/data.json
                                                           (powers the sharp-tracker site)

Then it commits + pushes each repo (only when something actually changed), so the
two GitHub-Pages dashboards redeploy with fresh numbers on every run.

    python run_full_pipeline.py                # full refresh + commit + push
    python run_full_pipeline.py --skip-scrape  # downstream only (data/ already fresh today)
    python run_full_pipeline.py --fetch-odds   # ALSO refresh the sharp market (spends Odds-API credits)
    python run_full_pipeline.py --no-push      # commit locally, do not push
    python run_full_pipeline.py --no-commit    # refresh data only, touch no git
    python run_full_pipeline.py --dry-run      # print the plan, change nothing

Safety:
  * The paid Odds-API fetch (sharp_tracker.py) is OFF unless --fetch-odds is passed.
  * A failing stage is reported and the run continues to the next stage; the final
    summary shows exactly what succeeded, changed, and pushed.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import os
import shutil
import subprocess
import sys
from pathlib import Path

# ── Locations ────────────────────────────────────────────────────────────────
MLBMA = Path(__file__).resolve().parent
# The bet-evaluator and sharp repos live beside the user's Documents, not next to
# this repo. Override with env vars if you move them.
BET_EVAL = Path(os.getenv("BET_EVALUATOR_DIR", r"C:\Users\chase\Documents\bet-evaluator"))
SHARP = Path(os.getenv("SHARP_TRACKER_DIR", r"C:\Users\chase\Documents\sharp-money-tracker"))


def _python() -> str:
    """The interpreter that actually has the deps (pandas / playwright / PIL)."""
    for cand in (
        MLBMA / "crawl_env" / "Scripts" / "python.exe",
        Path(os.path.expanduser(r"~\crawl_env\Scripts\python.exe")),
    ):
        if cand.exists():
            return str(cand)
    return sys.executable or "python"


PYTHON = _python()
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}

# ── Pretty logging ───────────────────────────────────────────────────────────
def _stamp() -> str:
    return _dt.datetime.now().strftime("%H:%M:%S")


def banner(text: str) -> None:
    print(f"\n{'='*72}\n  {text}\n{'='*72}", flush=True)


def step(text: str) -> None:
    print(f"  [{_stamp()}] {text}", flush=True)


# ── Subprocess wrapper ───────────────────────────────────────────────────────
def run_cmd(cmd: list[str], cwd: Path, label: str, dry: bool,
            extra_env: dict | None = None) -> bool:
    pretty = " ".join(Path(c).name if c == PYTHON else c for c in cmd)
    step(f"{label}: {pretty}   (cwd={cwd.name})")
    if dry:
        print("        [dry-run] skipped", flush=True)
        return True
    if not cwd.exists():
        print(f"        ! {cwd} does not exist - skipping {label}", flush=True)
        return False
    env = {**ENV, **(extra_env or {})}
    try:
        proc = subprocess.run(cmd, cwd=str(cwd), env=env, text=True,
                              capture_output=True, timeout=60 * 30)
    except Exception as e:  # noqa
        print(f"        ! {label} failed to launch: {e}", flush=True)
        return False
    tail = (proc.stdout or "").strip().splitlines()[-6:]
    for ln in tail:
        print(f"        | {ln}", flush=True)
    if proc.returncode != 0:
        err = (proc.stderr or "").strip().splitlines()[-8:]
        for ln in err:
            print(f"        ! {ln}", flush=True)
        print(f"        ! {label} exited {proc.returncode}", flush=True)
        return False
    return True


# ── Git ──────────────────────────────────────────────────────────────────────
def _git(repo: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(repo), *args], text=True, capture_output=True)


def git_publish(repo: Path, add_paths: list[str], message: str,
                commit: bool, push: bool, dry: bool) -> str:
    """Stage `add_paths`, commit if anything is staged, optionally push.
    Returns a one-word status for the summary."""
    if not repo.exists():
        return "missing"
    if not commit:
        return "skipped"
    branch = _git(repo, "rev-parse", "--abbrev-ref", "HEAD").stdout.strip() or "?"
    if dry:
        step(f"[dry-run] would: git add {' '.join(add_paths)} && commit && "
             f"{'push' if push else '(no push)'}  [{repo.name}@{branch}]")
        return "dry-run"
    for p in add_paths:
        if (repo / p).exists():
            _git(repo, "add", "--", p)
    staged = _git(repo, "diff", "--cached", "--name-only").stdout.strip()
    if not staged:
        step(f"{repo.name}: nothing changed - no commit")
        return "clean"
    _git(repo, "commit", "-m", message)
    short = _git(repo, "rev-parse", "--short", "HEAD").stdout.strip()
    step(f"{repo.name}: committed {short} on {branch}")
    if not push:
        return f"committed {short}"
    pr = _git(repo, "push", "origin", branch)
    if pr.returncode != 0:
        step(f"{repo.name}: push FAILED - {pr.stderr.strip().splitlines()[-1:] or ''}")
        return f"commit {short}, push-failed"
    step(f"{repo.name}: pushed {short} -> origin/{branch}")
    return f"pushed {short}"


# ── Orchestration ────────────────────────────────────────────────────────────
def publish_ecosystem(*, commit: bool = True, push: bool = True,
                      fetch_odds: bool = False, dry: bool = False) -> dict[str, str]:
    """Stages 2-3: export + git publish bet-evaluator and sharp-money-tracker."""
    today = _dt.date.today().isoformat()
    results: dict[str, str] = {}

    banner("Bet Evaluator  (docs/data/site.json)")
    ok = run_cmd([PYTHON, "export_web_data.py"], BET_EVAL, "export site.json", dry)
    results["bet-eval export"] = "ok" if ok else "FAILED"
    results["bet-eval publish"] = git_publish(
        BET_EVAL, ["docs"], f"Daily refresh {today}: bet-evaluator site data", commit, push, dry)

    banner("Sharp Money Tracker  (docs/data.json)")
    if fetch_odds:
        step("fetch_odds set: refreshing the live market (this spends Odds-API credits)")
        ok = run_cmd([PYTHON, "sharp_tracker.py"], SHARP, "fetch sharp odds", dry)
        results["sharp fetch"] = "ok" if ok else "FAILED"
    else:
        step("paid fetch OFF - exporting from the warehouse only (pass --fetch-odds to refresh the market)")
        results["sharp fetch"] = "skipped"
    ok1 = run_cmd([PYTHON, "export_dashboard.py"], SHARP, "export data.json (signals/edges)", dry)
    ok2 = run_cmd([PYTHON, "export_boards.py"], SHARP, "export boards (pitchers/markets)", dry)
    results["sharp export"] = "ok" if (ok1 and ok2) else "FAILED"
    results["sharp publish"] = git_publish(
        SHARP, ["docs"], f"Daily refresh {today}: sharp-tracker dashboard data", commit, push, dry)
    return results


def main() -> None:
    ap = argparse.ArgumentParser(description="Refresh + publish the whole Chase Analytics stack.")
    ap.add_argument("--skip-scrape", action="store_true",
                    help="skip the heavy MLBMA scrape (use today's already-fresh data/)")
    ap.add_argument("--fetch-odds", action="store_true",
                    help="ALSO run sharp_tracker.py - spends paid Odds-API credits (default off)")
    ap.add_argument("--no-commit", action="store_true", help="refresh data only; no git")
    ap.add_argument("--no-push", action="store_true", help="commit locally but do not push")
    ap.add_argument("--dry-run", action="store_true", help="print the plan; change nothing")
    a = ap.parse_args()

    commit, push, dry = (not a.no_commit), (not a.no_push), a.dry_run
    today = _dt.date.today().isoformat()
    results: dict[str, str] = {}

    banner(f"Chase Analytics full pipeline - {today}")
    print(f"  interpreter : {PYTHON}")
    print(f"  mlbma       : {MLBMA}")
    print(f"  bet-eval    : {BET_EVAL}   {'(missing!)' if not BET_EVAL.exists() else ''}")
    print(f"  sharp       : {SHARP}   {'(missing!)' if not SHARP.exists() else ''}")
    print(f"  scrape={'no' if a.skip_scrape else 'yes'}  paid-fetch={'YES' if a.fetch_odds else 'no'}"
          f"  commit={commit}  push={push}  dry-run={dry}")

    # 1 ── MLBMA scrape (data/ + Sheets + Supabase + dashboard) ────────────────
    banner("1/3  MLBMA pipeline")
    if a.skip_scrape:
        step("--skip-scrape set: leaving data/ as-is")
        results["mlbma scrape"] = "skipped"
    else:
        ok = run_cmd(
            [PYTHON, "-u", "-m", "pipeline.main"], MLBMA, "scrape", dry,
            extra_env={"MLBMA_SKIP_ECOSYSTEM": "1"},
        )
        results["mlbma scrape"] = "ok" if ok else "FAILED"
    results["mlbma publish"] = git_publish(
        MLBMA, ["dashboard"], f"Daily refresh {today}: dashboard data", commit, push, dry)

    banner("2-3/3  Ecosystem publish (bet-evaluator + sharp-money-tracker)")
    results.update(publish_ecosystem(
        commit=commit, push=push, fetch_odds=a.fetch_odds, dry=dry))

    # ── Summary ────────────────────────────────────────────────────────────────
    banner("Summary")
    width = max(len(k) for k in results)
    for k, v in results.items():
        flag = "x" if v in ("FAILED", "missing") else "."
        print(f"  [{flag}] {k.ljust(width)}  {v}")
    failed = [k for k, v in results.items() if v in ("FAILED", "missing")]
    if failed:
        print(f"\n  {len(failed)} stage(s) need attention: {', '.join(failed)}")
        sys.exit(1)
    print("\n  All stages clean.")


if __name__ == "__main__":
    if shutil.which("git") is None:
        sys.exit("git not on PATH - required for the publish step.")
    main()
