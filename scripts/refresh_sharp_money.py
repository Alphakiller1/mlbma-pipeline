"""Refresh today's slate in MLBMA, then update sharp-money-tracker boards from pipeline CSVs."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHARP = Path(os.getenv("SHARP_MONEY_DIR", ROOT.parent / "sharp-money-tracker"))
PYTHON = ROOT / "crawl_env" / "Scripts" / "python.exe"
if not PYTHON.exists():
    PYTHON = Path(sys.executable)

ENV = {**os.environ, "PYTHONUTF8": "1", "PYTHONUNBUFFERED": "1"}


def run_module(module: str) -> bool:
    print(f"\n>> {module}")
    r = subprocess.run([str(PYTHON), "-u", "-m", module], cwd=str(ROOT), env=ENV)
    return r.returncode == 0


def main() -> int:
    if not SHARP.is_dir():
        print(f"ERROR: sharp-money-tracker not found at {SHARP}")
        print("  Clone: git clone https://github.com/Alphakiller1/sharp-money-tracker.git")
        return 1

    env_file = SHARP / ".env"
    if not env_file.exists():
        print(f"ERROR: missing {env_file} (set MLBMA_DATA_DIR)")
        return 1

    ok = True
    for mod in (
        "scrapers.scrape_lineups",
        "scrapers.scrape_matchups",
        "scrapers.scrape_weather",
        "core.compute_signals",
    ):
        ok = run_module(mod) and ok

    print(f"\n>> sharp-money export_boards ({SHARP})")
    r = subprocess.run([sys.executable, "export_boards.py"], cwd=str(SHARP), env=ENV)
    ok = r.returncode == 0 and ok

    if ok:
        print("\nSharp money boards updated from pipeline CSVs.")
    else:
        print("\nSome steps failed — check output above.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
