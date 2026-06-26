"""
Fast bring-up-to-date from existing MLBMA data/ CSVs.

Skips scrapes whose outputs are already dated today with sufficient rows.
Runs compute-only steps when upstream files are fresh but derived files lag.

Typical saves vs full pipeline.main:
  - sp_gamelog fresh + sp_profiles stale  -> compute_sp_splits only (~seconds)
  - pitch_mix season fresh, L14 missing   -> scrape_pitch_mix --l14-only (~5 min)
  - batter_splits overall fresh, l14 stale -> --splits l14 (~5 min vs ~45 min full)

Usage:
  python -m scripts.sync_from_cache
  python -m scripts.sync_from_cache --audit-only
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
PYTHON = ROOT / "crawl_env" / "Scripts" / "python.exe"
if not PYTHON.exists():
    PYTHON = Path(sys.executable)

ENV = {
    **os.environ,
    "PYTHONUTF8": "1",
    "PYTHONIOENCODING": "utf-8",
    "PYTHONUNBUFFERED": "1",
}

AUDIT_FILES = [
    "sp_gamelog.csv",
    "sp_profiles.csv",
    "pitch_mix_pitcher.csv",
    "pitch_mix_pitcher_l14.csv",
    "batter_splits_overall.csv",
    "batter_splits_l14.csv",
    "today_matchups.csv",
    "signals_today.csv",
]

SKIPPED: list[str] = []
RAN: list[str] = []


def _fmt_elapsed(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.1f}s"
    return f"{int(seconds // 60)}m {seconds % 60:.0f}s"


def _import_freshness():
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    from scripts.pipeline_freshness import (
        file_fresh,
        needs_recompute,
        print_audit,
    )

    return file_fresh, needs_recompute, print_audit


def run_module(module: str, *extra_args: str) -> bool:
    label = module + (" " + " ".join(extra_args) if extra_args else "")
    print(f"\n{'=' * 50}\nRunning {label}...\n{'=' * 50}")
    t0 = time.perf_counter()
    cmd = [str(PYTHON), "-u", "-m", module, *extra_args]
    result = subprocess.run(cmd, cwd=str(ROOT), env=ENV)
    ok = result.returncode == 0
    tag = "OK" if ok else "ERROR"
    print(f"  [{tag}] {label} finished in {_fmt_elapsed(time.perf_counter() - t0)}")
    if ok:
        RAN.append(label)
    return ok


def run_callable(label: str, fn) -> bool:
    print(f"\n{'=' * 50}\n{label}\n{'=' * 50}")
    t0 = time.perf_counter()
    try:
        fn()
        print(f"  [OK] {label} finished in {_fmt_elapsed(time.perf_counter() - t0)}")
        RAN.append(label)
        return True
    except Exception as exc:
        print(f"  [ERROR] {label} failed: {exc}")
        return False


def sync_pitch_mix(file_fresh) -> None:
    season_ok = file_fresh("pitch_mix_pitcher.csv", 10)
    l14_ok = file_fresh("pitch_mix_pitcher_l14.csv", 10)
    if season_ok and l14_ok:
        SKIPPED.append("scrapers.scrape_pitch_mix (season + L14 fresh today)")
        return
    if season_ok and not l14_ok:
        run_module("scrapers.scrape_pitch_mix", "--l14-only")
        return
    run_module("scrapers.scrape_pitch_mix")


def sync_batter_splits(file_fresh, needs_recompute) -> None:
    overall_ok = file_fresh("batter_splits_overall.csv", 200)
    l14_ok = file_fresh("batter_splits_l14.csv", 50)
    if overall_ok and l14_ok:
        SKIPPED.append("scrapers.scrape_batter_splits (overall + l14 fresh today)")
        return
    if overall_ok and not l14_ok:
        run_module("scrapers.scrape_batter_splits", "--splits", "l14")
        return
    if not overall_ok:
        run_module("scrapers.scrape_batter_splits")


def sync_sp_profiles(needs_recompute) -> None:
    if needs_recompute("sp_profiles.csv", "sp_gamelog.csv", min_rows=1):
        run_callable("core.compute_sp_splits", _compute_sp_splits)
    else:
        SKIPPED.append("core.compute_sp_splits (sp_profiles fresh vs gamelog)")


def _compute_sp_splits() -> None:
    from core.compute_sp_splits import run

    run()


def sync_downstream(file_fresh) -> None:
    if file_fresh("batter_splits_overall.csv", 200):

        def batter_profiles():
            from core.compute_batter_profile import run as compute

            compute()
            from outputs.push_batter_profiles import run as push

            push()

        run_callable("compute_batter_profile + push_batter_profiles", batter_profiles)

    def team_profiles():
        from core.compute_team_profile import run as compute

        compute()
        from outputs.push_team_profiles import run as push

        push()

    run_callable("compute_team_profile + push_team_profiles", team_profiles)

    if file_fresh("pitch_mix_pitcher.csv", 10):
        run_module("outputs.push_pitch_mix")


def main() -> int:
    file_fresh, needs_recompute, print_audit = _import_freshness()
    parser = argparse.ArgumentParser(description="Sync MLBMA from cached CSVs")
    parser.add_argument("--audit-only", action="store_true", help="Print freshness audit and exit")
    args = parser.parse_args()

    print(f"Sync from cache at {datetime.now():%Y-%m-%d %H:%M:%S}")
    print_audit("File freshness audit", AUDIT_FILES)
    if args.audit_only:
        return 0

    sync_sp_profiles(needs_recompute)
    sync_pitch_mix(file_fresh)
    sync_batter_splits(file_fresh, needs_recompute)
    sync_downstream(file_fresh)

    print(f"\nSync complete at {datetime.now():%Y-%m-%d %H:%M:%S}")
    print(f"  Ran ({len(RAN)}): {', '.join(RAN) or 'none'}")
    print(f"  Skipped ({len(SKIPPED)}): {', '.join(SKIPPED) or 'none'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
