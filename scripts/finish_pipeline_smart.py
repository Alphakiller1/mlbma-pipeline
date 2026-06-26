"""Finish only stale pipeline steps; parallelize independent scrapers."""

from __future__ import annotations

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


def _fmt_elapsed(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.1f}s"
    return f"{int(seconds // 60)}m {seconds % 60:.0f}s"


def _freshness():
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    from scripts.pipeline_freshness import file_fresh, needs_recompute

    return file_fresh, needs_recompute


def run_module(module: str, *extra_args: str, required: bool = False) -> bool:
    file_fresh, _ = _freshness()
    label = module + (" " + " ".join(extra_args) if extra_args else "")

    if module == "scrapers.scrape_pitch_mix" and not extra_args:
        season_ok = file_fresh("pitch_mix_pitcher.csv", 10)
        l14_ok = file_fresh("pitch_mix_pitcher_l14.csv", 10)
        if season_ok and l14_ok:
            print(f"  [SKIP] {module} — season + L14 pitch mix fresh today")
            return True
        if season_ok and not l14_ok:
            return run_module("scrapers.scrape_pitch_mix", "--l14-only", required=required)
    if module == "scrapers.scrape_pitch_mix" and extra_args == ("--l14-only",):
        if file_fresh("pitch_mix_pitcher_l14.csv", 10):
            print(f"  [SKIP] {module} — pitch_mix_pitcher_l14.csv already fresh today")
            return True
    if module == "scrapers.scrape_reliever_gamelog" and file_fresh("reliever_gamelog.csv", 500):
        print(f"  [SKIP] {module} — reliever_gamelog.csv already fresh today")
        return True
    if module == "scrapers.scrape_fangraphs" and file_fresh("vs_RHP_standard.csv", 20):
        print(f"  [SKIP] {module} — FanGraphs team exports fresh today")
        return True
    if module == "scrapers.scrape_batter_splits" and not extra_args:
        overall_ok = file_fresh("batter_splits_overall.csv", 200)
        l14_ok = file_fresh("batter_splits_l14.csv", 50)
        if overall_ok and l14_ok:
            print(f"  [SKIP] {module} — batter splits fresh today")
            return True
        if overall_ok and not l14_ok:
            return run_module("scrapers.scrape_batter_splits", "--splits", "l14", required=required)

    print(f"\n{'=' * 50}\nRunning {label}...\n{'=' * 50}")
    t0 = time.perf_counter()
    result = subprocess.run(
        [str(PYTHON), "-u", "-m", module, *extra_args],
        cwd=str(ROOT),
        env=ENV,
    )
    ok = result.returncode == 0
    tag = "OK" if ok else ("ERROR" if required else "WARNING")
    print(f"  [{tag}] {label} finished in {_fmt_elapsed(time.perf_counter() - t0)}")
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


def popen_module(module: str, *extra_args: str) -> subprocess.Popen:
    label = module + (" " + " ".join(extra_args) if extra_args else "")
    print(f"  [PARALLEL] starting {label}")
    return subprocess.Popen(
        [str(PYTHON), "-u", "-m", module, *extra_args],
        cwd=str(ROOT),
        env=ENV,
    )


def main() -> int:
    file_fresh, needs_recompute = _freshness()
    print(f"Smart pipeline finish at {datetime.now():%Y-%m-%d %H:%M:%S}")
    failures: list[str] = []
    parallel: list[tuple[str, subprocess.Popen]] = []

    # ── Phase 0: compute-only from fresh gamelog ───────────────────────────
    if needs_recompute("sp_profiles.csv", "sp_gamelog.csv", min_rows=1):

        def sp_profiles():
            from core.compute_sp_splits import run

            run()

        if not run_callable("core.compute_sp_splits (gamelog fresh)", sp_profiles):
            failures.append("core.compute_sp_splits")
    else:
        print("  [SKIP] core.compute_sp_splits — sp_profiles fresh vs sp_gamelog")

    # ── Phase A: long independent scrapers in parallel ─────────────────────
    season_ok = file_fresh("pitch_mix_pitcher.csv", 10)
    l14_ok = file_fresh("pitch_mix_pitcher_l14.csv", 10)
    need_reliever = not file_fresh("reliever_gamelog.csv", 500)

    pitch_proc = None
    if not season_ok:
        pitch_proc = popen_module("scrapers.scrape_pitch_mix")
    elif not l14_ok:
        pitch_proc = popen_module("scrapers.scrape_pitch_mix", "--l14-only")

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
    if file_fresh("pitch_mix_pitcher.csv", 10):
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
        ("scrapers.scrape_lineups", "today_lineups.csv", 1),
        ("scrapers.scrape_matchups", "today_matchups.csv", 1),
        ("scrapers.scrape_weather", "today_weather.csv", 1),
    ]
    for mod, csv_name, min_rows in slate:
        if file_fresh(csv_name, min_rows):
            print(f"  [SKIP] {mod} — {csv_name} already fresh today")
            continue
        if not run_module(mod, required=True):
            failures.append(mod)

    if file_fresh("signals_today.csv", 1):
        print("  [SKIP] core.compute_signals — signals_today.csv already fresh today")
    elif not run_module("core.compute_signals", required=True):
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
