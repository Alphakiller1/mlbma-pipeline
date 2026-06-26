"""Finish only stale pipeline steps; parallelize independent scrapers."""

from __future__ import annotations

import os
import subprocess
import sys
import time
from datetime import date, datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
PYTHON = ROOT / "crawl_env" / "Scripts" / "python.exe"
if not PYTHON.exists():
    PYTHON = Path(sys.executable)

TODAY = date.today()
ENV = {
    **os.environ,
    "PYTHONUTF8": "1",
    "PYTHONIOENCODING": "utf-8",
    "PYTHONUNBUFFERED": "1",
}


def _fmt_elapsed(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.1f}s"
    return f"{int(seconds // 60)}m {seconds % 60:.0f}s"


def file_fresh(name: str, min_rows: int = 1) -> bool:
    path = DATA / name
    if not path.exists():
        return False
    if datetime.fromtimestamp(path.stat().st_mtime).date() < TODAY:
        return False
    if min_rows <= 0:
        return True
    try:
        return len(pd.read_csv(path)) >= min_rows
    except Exception:
        return False


def run_module(module: str, *, required: bool = False) -> bool:
    if module == "scrapers.scrape_pitch_mix" and file_fresh("pitch_mix_pitcher.csv", 10):
        print(f"  [SKIP] {module} — pitch_mix_pitcher.csv already fresh today")
        return True
    if module == "scrapers.scrape_reliever_gamelog" and file_fresh("reliever_gamelog.csv", 500):
        print(f"  [SKIP] {module} — reliever_gamelog.csv already fresh today")
        return True
    if module == "scrapers.scrape_fangraphs" and file_fresh("vs_RHP_standard.csv", 20):
        print(f"  [SKIP] {module} — FanGraphs team exports fresh today")
        return True
    if module == "scrapers.scrape_batter_splits" and file_fresh("batter_splits_overall.csv", 200):
        mtime = datetime.fromtimestamp((DATA / "batter_splits_overall.csv").stat().st_mtime).date()
        if mtime >= TODAY:
            print(f"  [SKIP] {module} — batter splits fresh today")
            return True

    print(f"\n{'=' * 50}\nRunning {module}...\n{'=' * 50}")
    t0 = time.perf_counter()
    result = subprocess.run([str(PYTHON), "-u", "-m", module], cwd=str(ROOT), env=ENV)
    ok = result.returncode == 0
    tag = "OK" if ok else ("ERROR" if required else "WARNING")
    print(f"  [{tag}] {module} finished in {_fmt_elapsed(time.perf_counter() - t0)}")
    return ok


def run_callable(label: str, fn) -> bool:
    print(f"\n{'=' * 50}\n{label}\n{'=' * 50}")
    t0 = time.perf_counter()
    try:
        fn()
        print(f"  [OK] {label} finished in {_fmt_elapsed(time.perf_counter() - t0)}")
        return True
    except Exception as exc:
        print(f"  [WARNING] {label} failed: {exc}")
        return False


def popen_module(module: str) -> subprocess.Popen:
    print(f"  [PARALLEL] starting {module}")
    return subprocess.Popen(
        [str(PYTHON), "-u", "-m", module],
        cwd=str(ROOT),
        env=ENV,
    )


def main() -> int:
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    print(f"Smart pipeline finish at {datetime.now():%Y-%m-%d %H:%M:%S}")
    failures: list[str] = []
    parallel: list[tuple[str, subprocess.Popen]] = []

    # ── Phase A: long independent scrapers in parallel ─────────────────────
    need_pitch_mix = not file_fresh("pitch_mix_pitcher.csv", 10)
    need_reliever = not file_fresh("reliever_gamelog.csv", 500)

    pitch_proc = popen_module("scrapers.scrape_pitch_mix") if need_pitch_mix else None
    relief_proc = popen_module("scrapers.scrape_reliever_gamelog") if need_reliever else None

    if pitch_proc:
        parallel.append(("scrapers.scrape_pitch_mix", pitch_proc))
    if relief_proc:
        parallel.append(("scrapers.scrape_reliever_gamelog", relief_proc))

    for name, proc in parallel:
        code = proc.wait()
        tag = "OK" if code == 0 else "WARNING"
        print(f"  [{tag}] {name} parallel job exit {code}")
        if code != 0:
            failures.append(name)

    # ── Phase B: pitch-mix push + FanGraphs (Chrome) ───────────────────────
    if need_pitch_mix or file_fresh("pitch_mix_pitcher.csv", 10):
        if not run_module("outputs.push_pitch_mix"):
            failures.append("outputs.push_pitch_mix")

    if not run_module("scrapers.scrape_fangraphs"):
        failures.append("scrapers.scrape_fangraphs")
    else:
        if not run_module("core.compute"):
            failures.append("core.compute")
        if not run_module("outputs.push_sheets"):
            failures.append("outputs.push_sheets")

    # ── Phase C: bullpen refresh ───────────────────────────────────────────
    def bullpen():
        from core.compute_bullpen_profile import run as compute

        compute()
        from outputs.push_bullpen import run as push

        push()

    if not file_fresh("reliever_gamelog.csv", 500):
        failures.append("reliever_gamelog (stale/missing)")
    elif not run_callable("compute_bullpen_profile + push_bullpen", bullpen):
        failures.append("bullpen")

    # ── Phase D: batter splits + downstream profiles ───────────────────────
    if not run_module("scrapers.scrape_batter_splits"):
        failures.append("scrapers.scrape_batter_splits")
    else:

        def batter_profiles():
            from core.compute_batter_profile import run as compute

            compute()
            from outputs.push_batter_profiles import run as push

            push()

        if not run_callable("compute_batter_profile + push_batter_profiles", batter_profiles):
            failures.append("batter_profiles")

    def team_profiles():
        from core.compute_team_profile import run as compute

        compute()
        from outputs.push_team_profiles import run as push

        push()

    if not run_callable("compute_team_profile + push_team_profiles", team_profiles):
        failures.append("team_profiles")

    # ── Phase E: today's slate + sharp-money signals ───────────────────────
    slate = [
        "scrapers.scrape_lineups",
        "scrapers.scrape_matchups",
        "scrapers.scrape_weather",
    ]
    for mod in slate:
        if not run_module(mod):
            failures.append(mod)

    if not run_module("core.compute_signals"):
        failures.append("core.compute_signals")

    if not run_module("outputs.push_supabase"):
        failures.append("outputs.push_supabase")

    print(f"\nSmart finish complete at {datetime.now():%Y-%m-%d %H:%M:%S}")
    if failures:
        print("Warnings / incomplete:")
        for name in failures:
            print(f"  - {name}")
        return 1
    print("All targeted steps succeeded.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
