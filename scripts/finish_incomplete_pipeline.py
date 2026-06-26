"""Resume incomplete pipeline steps (non-fatal per step)."""

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


def _fmt_elapsed(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.1f}s"
    return f"{int(seconds // 60)}m {seconds % 60:.0f}s"


def run_module(module: str) -> bool:
    print(f"\n{'=' * 50}")
    print(f"Running {module}...")
    print(f"{'=' * 50}")
    t0 = time.perf_counter()
    env = {
        **os.environ,
        "PYTHONUTF8": "1",
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUNBUFFERED": "1",
    }
    result = subprocess.run(
        [str(PYTHON), "-u", "-m", module],
        cwd=str(ROOT),
        env=env,
    )
    elapsed = time.perf_counter() - t0
    ok = result.returncode == 0
    tag = "OK" if ok else "WARNING"
    print(f"  [{tag}] {module} finished in {_fmt_elapsed(elapsed)}")
    return ok


def run_fn(label: str, fn) -> bool:
    print(f"\n{'=' * 50}")
    print(label)
    print(f"{'=' * 50}")
    t0 = time.perf_counter()
    try:
        fn()
        print(f"  [OK] {label} finished in {_fmt_elapsed(time.perf_counter() - t0)}")
        return True
    except Exception as exc:
        print(f"  [WARNING] {label} failed: {exc}")
        return False


def main() -> int:
    print(f"Finishing incomplete pipeline steps at {datetime.now():%Y-%m-%d %H:%M:%S}")
    failures: list[str] = []

    modules = [
        "scrapers.scrape_pitch_mix",
        "outputs.push_pitch_mix",
        "scrapers.scrape_fangraphs",
        "core.compute",
        "outputs.push_sheets",
        "scrapers.scrape_reliever_gamelog",
    ]
    for mod in modules:
        if not run_module(mod):
            failures.append(mod)

    def bullpen():
        from core.compute_bullpen_profile import run as compute

        compute()
        from outputs.push_bullpen import run as push

        push()

    if not run_fn("compute_bullpen_profile + push_bullpen", bullpen):
        failures.append("bullpen")

    if not run_module("scrapers.scrape_batter_splits"):
        failures.append("scrapers.scrape_batter_splits")

    def batter_profiles():
        from core.compute_batter_profile import run as compute

        compute()
        from outputs.push_batter_profiles import run as push

        push()

    if not run_fn("compute_batter_profile + push_batter_profiles", batter_profiles):
        failures.append("batter_profiles")

    def team_profiles():
        from core.compute_team_profile import run as compute

        compute()
        from outputs.push_team_profiles import run as push

        push()

    if not run_fn("compute_team_profile + push_team_profiles", team_profiles):
        failures.append("team_profiles")

    if not run_module("outputs.push_supabase"):
        failures.append("outputs.push_supabase")

    print(f"\nResume complete at {datetime.now():%Y-%m-%d %H:%M:%S}")
    if failures:
        print("Steps with warnings/failures:")
        for name in failures:
            print(f"  - {name}")
        return 1
    print("All resume steps succeeded.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
