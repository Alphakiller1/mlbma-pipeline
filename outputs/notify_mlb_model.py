"""Dispatch the MLB Model deployment after an MLBMA pipeline run completes."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import urllib.request

MODEL_REPO = os.getenv("MLB_MODEL_REPO", "Alphakiller1/mlb-model")
MODEL_REF = os.getenv("MLB_MODEL_REF", "main")
MODEL_WORKFLOW = os.getenv("MLB_MODEL_WORKFLOW", "deploy-pages.yml")


def _token() -> str:
    return (
        os.getenv("MLB_MODEL_GITHUB_TOKEN")
        or os.getenv("GH_TOKEN")
        or os.getenv("GITHUB_TOKEN")
        or ""
    )


def _dispatch_with_token(token: str) -> None:
    body = json.dumps({"ref": MODEL_REF}).encode()
    request = urllib.request.Request(
        f"https://api.github.com/repos/{MODEL_REPO}/actions/workflows/"
        f"{MODEL_WORKFLOW}/dispatches",
        data=body,
        method="POST",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2026-03-10",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status != 204:
            raise RuntimeError(f"workflow dispatch returned HTTP {response.status}")


def _dispatch_with_gh() -> None:
    subprocess.run(
        [
            "gh", "workflow", "run", MODEL_WORKFLOW,
            "--repo", MODEL_REPO,
            "--ref", MODEL_REF,
        ],
        check=True,
    )


def run() -> bool:
    token = _token()
    if token:
        _dispatch_with_token(token)
        print(f"  Dispatched {MODEL_REPO}:{MODEL_WORKFLOW} at {MODEL_REF} via API")
        return True
    if shutil.which("gh"):
        _dispatch_with_gh()
        print(f"  Dispatched {MODEL_REPO}:{MODEL_WORKFLOW} at {MODEL_REF} via gh")
        return True
    print(
        "  WARNING: MLB Model sync dispatch skipped. Configure "
        "MLB_MODEL_GITHUB_TOKEN or authenticate the GitHub CLI."
    )
    return False


if __name__ == "__main__":
    run()
