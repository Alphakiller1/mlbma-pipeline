"""
Sharp-money daily refresh — today's slate + board export only.

Does NOT scrape pitch_mix, sp_gamelog, batter_splits, or FanGraphs. Those are
MLBMA pipeline jobs (scripts.sync_from_cache / scripts.finish_pipeline_smart).

Steps (each skipped when the output CSV is already fresh today):
  1. scrapers.scrape_lineups   -> today_lineups.csv
  2. scrapers.scrape_matchups  -> today_matchups.csv
  3. scrapers.scrape_weather   -> today_weather.csv
  4. core.compute_signals      -> signals_today.csv
  5. sharp-money export_boards.py (includes push_projections when Supabase is configured)

Usage:
  python -m scripts.refresh_sharp_money
  python -m scripts.refresh_sharp_money --export-only   # skip all MLBMA scrapes
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHARP = Path(os.getenv("SHARP_MONEY_DIR", ROOT.parent / "sharp-money-tracker"))
PYTHON = ROOT / "crawl_env" / "Scripts" / "python.exe"
if not PYTHON.exists():
    PYTHON = Path(sys.executable)

ENV = {**os.environ, "PYTHONUTF8": "1", "PYTHONUNBUFFERED": "1"}

# module -> (output csv, min_rows)
SLATE_STEPS: tuple[tuple[str, str, int], ...] = (
    ("scrapers.scrape_lineups", "today_lineups.csv", 1),
    ("scrapers.scrape_matchups", "today_matchups.csv", 1),
    ("scrapers.scrape_weather", "today_weather.csv", 1),
    ("core.compute_signals", "signals_today.csv", 1),
)

SKIPPED: list[str] = []
RAN: list[str] = []


def _fmt_elapsed(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.1f}s"
    return f"{int(seconds // 60)}m {seconds % 60:.0f}s"


def _file_fresh(name: str, min_rows: int = 1) -> bool:
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    from scripts.pipeline_freshness import file_fresh

    return file_fresh(name, min_rows=min_rows)


def run_module(module: str, *, force: bool = False, output: str = "", min_rows: int = 1) -> bool:
    if not force and output and _file_fresh(output, min_rows):
        msg = f"{module} — {output} already fresh today"
        print(f"  [SKIP] {msg}")
        SKIPPED.append(msg)
        return True

    print(f"\n>> {module}")
    t0 = time.perf_counter()
    r = subprocess.run([str(PYTHON), "-u", "-m", module], cwd=str(ROOT), env=ENV)
    ok = r.returncode == 0
    tag = "OK" if ok else "ERROR"
    print(f"  [{tag}] {module} finished in {_fmt_elapsed(time.perf_counter() - t0)}")
    if ok:
        RAN.append(module)
    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description="Refresh sharp-money boards from MLBMA CSVs")
    parser.add_argument(
        "--export-only",
        action="store_true",
        help="Skip MLBMA slate scrapes; only export_boards + push_projections",
    )
    args = parser.parse_args()

    if not SHARP.is_dir():
        print(f"ERROR: sharp-money-tracker not found at {SHARP}")
        print("  Clone: git clone https://github.com/Alphakiller1/sharp-money-tracker.git")
        return 1

    env_file = SHARP / ".env"
    if not env_file.exists():
        print(f"ERROR: missing {env_file} (set MLBMA_DATA_DIR)")
        return 1

    print(f"Sharp-money refresh at {datetime.now():%Y-%m-%d %H:%M:%S}")
    ok = True

    if not args.export_only:
        for mod, csv_name, min_rows in SLATE_STEPS:
            ok = run_module(mod, output=csv_name, min_rows=min_rows) and ok

    print(f"\n>> sharp-money export_boards ({SHARP})")
    t0 = time.perf_counter()
    r = subprocess.run([sys.executable, "export_boards.py"], cwd=str(SHARP), env=ENV)
    export_ok = r.returncode == 0
    tag = "OK" if export_ok else "ERROR"
    print(f"  [{tag}] export_boards finished in {_fmt_elapsed(time.perf_counter() - t0)}")
    ok = export_ok and ok
    if export_ok:
        RAN.append("export_boards.py (+ push_projections if configured)")

    print(f"\nRan ({len(RAN)}): {', '.join(RAN) or 'none'}")
    print(f"Skipped ({len(SKIPPED)}): {', '.join(SKIPPED) or 'none'}")
    if ok:
        print("\nSharp money boards updated from pipeline CSVs.")
    else:
        print("\nSome steps failed — check output above.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
