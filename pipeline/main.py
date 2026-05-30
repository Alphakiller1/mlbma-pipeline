import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

from pipeline.deps import check_step_deps

ROOT = Path(__file__).resolve().parent.parent


def _resolve_python() -> Path:
    candidates = [
        Path((Path.cwd() / "crawl_env" / "Scripts" / "python.exe")),
        Path((ROOT / "crawl_env" / "Scripts" / "python.exe")),
        Path((ROOT.parent / "crawl_env" / "Scripts" / "python.exe")),
        Path(sys.executable),
    ]
    for c in candidates:
        if c and c.exists():
            return c
    return Path(sys.executable)


PYTHON = _resolve_python()

# Required: Savant is the minimum data source for the pipeline to proceed.
SCRIPTS_REQUIRED = [
    "scrapers.scrape_savant",
]

# Optional: failures log WARNING and execution continues (FanGraphs-free / partial runs).
SCRIPTS_OPTIONAL = [
    "scrapers.scrape_fangraphs",
    "core.compute",
    "outputs.push_sheets",
    "scrapers.scrape_matchups",
    "scrapers.scrape_weather",
]


def _fmt_elapsed(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.1f}s"
    return f"{int(seconds // 60)}m {seconds % 60:.0f}s"


def run_script(module: str, required: bool = True) -> bool:
    dep_key = module
    if not check_step_deps(dep_key, required=required):
        return not required

    print(f"\n{'='*50}")
    print(f"Running {module}...")
    print(f"{'='*50}")
    t0 = time.perf_counter()
    result = subprocess.run(
        [str(PYTHON), "-m", module],
        cwd=str(ROOT),
    )
    elapsed = time.perf_counter() - t0
    ok = result.returncode == 0
    status = "OK" if ok else ("ERROR" if required else "WARNING")
    print(f"  [{status}] {module} finished in {_fmt_elapsed(elapsed)}")
    if not ok:
        if required:
            print(f"ERROR: {module} failed")
        else:
            print(f"WARNING: {module} failed - continuing")
    return ok


def _run_step(label: str, dep_key: str, fn, required: bool = False) -> bool:
    if not check_step_deps(dep_key, required=required):
        return False
    print(f"\n{'='*50}")
    print(f"{label}")
    print(f"{'='*50}")
    t0 = time.perf_counter()
    try:
        fn()
        elapsed = time.perf_counter() - t0
        print(f"  [OK] {label} finished in {_fmt_elapsed(elapsed)}")
        return True
    except Exception as exc:
        elapsed = time.perf_counter() - t0
        print(f"  [WARNING] {label} failed after {_fmt_elapsed(elapsed)}: {exc}")
        return False


def run_signals():
    """Compute cross-metric signals; non-fatal on failure."""
    if not check_step_deps("core.compute_signals"):
        return

    def _signals():
        from core.compute_signals import run as run_signals_module

        run_signals_module()

    _run_step("Running core.compute_signals", "core.compute_signals", _signals)


def run_lineups():
    """Scrape Rotowire lineups; non-fatal on failure."""

    def _lineups():
        from scrapers.scrape_lineups import run as run_lineups

        run_lineups()

    _run_step("Running scrapers.scrape_lineups", "scrapers.scrape_matchups", _lineups)


def run_game_results():
    """Scrape + compute + push team game-results metrics; non-fatal on failure."""

    def _fn():
        from scrapers.scrape_results import run as run_scrape_results

        run_scrape_results()
        from core.compute_results import run as run_compute_results

        run_compute_results()
        from outputs.push_team_results import run as run_push_team_results

        run_push_team_results()

    _run_step(
        "Step Results: scrape_results + compute_results + push_team_results",
        "scrapers.scrape_results",
        _fn,
    )


def run():
    """
    Pipeline order (19 logical steps):
      1 scrape_savant (required)
      2 scrape_fangraphs (optional)
      3 core.compute (optional, needs Savant + FanGraphs)
      4 push_sheets core metrics (optional)
      5 scrape_matchups + 6 scrape_lineups (optional / lineups after matchups)
      7 scrape_weather (optional)
      8 scrape_pals (optional)
      9 compute_signals (optional)
     10 scrape_sp_gamelog (optional)
     11 compute_sp_splits + push (optional)
     12 scrape_reliever_gamelog (optional)
     13 bullpen compute + push (optional)
     14 scrape_player_registry (optional)
     15 scrape_batter_splits (optional)
     16-17 batter compute + push (optional)
     18-19 team compute + push (optional)
    """
    pipeline_t0 = time.perf_counter()
    print(f"MLBMA Pipeline starting at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    for script in SCRIPTS_REQUIRED:
        if not run_script(script, required=True):
            sys.exit(1)

    for script in SCRIPTS_OPTIONAL:
        run_script(script, required=False)

    run_lineups()
    run_game_results()

    if check_step_deps("scrapers.scrape_pals"):
        run_script("scrapers.scrape_pals", required=False)
    else:
        print("WARNING: Skipping scrapers.scrape_pals (dependencies not met)")

    run_signals()

    run_sp_gamelog()
    run_sp_splits()
    run_reliever_gamelog()
    run_bullpen_profiles()

    run_player_registry()
    run_batter_splits()
    run_batter_profiles()
    run_team_profiles()

    total = time.perf_counter() - pipeline_t0
    print(f"\nPipeline complete at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Total elapsed: {_fmt_elapsed(total)}")
    print("All metrics pushed to Google Sheets")


def run_sp_gamelog():
    """Step 10: SP game logs from MLB Stats API; non-fatal on failure."""

    def _fn():
        from scrapers.scrape_sp_gamelog import run as run_sp_gamelog_module

        run_sp_gamelog_module()

    _run_step("Step 10: scrapers.scrape_sp_gamelog", "scrapers.scrape_sp_gamelog", _fn)


def run_sp_splits():
    """Step 11: SP split profiles + Sheets push; non-fatal on failure."""

    def _fn():
        from core.compute_sp_splits import run as run_compute_sp_splits

        run_compute_sp_splits()
        from outputs.push_sp_splits import run as run_push_sp_splits

        run_push_sp_splits()

    _run_step(
        "Step 11: compute_sp_splits + push_sp_splits",
        "core.compute_sp_splits",
        _fn,
    )


def run_reliever_gamelog():
    """Step 12: reliever game logs from MLB Stats API; non-fatal on failure."""

    def _fn():
        from scrapers.scrape_reliever_gamelog import run as run_reliever_gamelog_module

        run_reliever_gamelog_module()

    _run_step("Step 12: scrapers.scrape_reliever_gamelog", "scrapers.scrape_reliever_gamelog", _fn)


def run_bullpen_profiles():
    """Step 13: bullpen profiles + Sheets push; non-fatal on failure."""

    def _fn():
        from core.compute_bullpen_profile import run as run_compute_bullpen

        run_compute_bullpen()
        from outputs.push_bullpen import run as run_push_bullpen

        run_push_bullpen()

    _run_step(
        "Step 13: compute_bullpen_profile + push_bullpen",
        "core.compute_bullpen_profile",
        _fn,
    )


def run_player_registry():
    """Step 14: MLB player registry + Sheets push; non-fatal on failure."""

    def _fn():
        from scrapers.scrape_player_registry import run as run_registry

        run_registry()

    _run_step("Step 14: scrapers.scrape_player_registry", "scrapers.scrape_player_registry", _fn)


def run_batter_splits():
    """Step 15: FanGraphs batter splits; non-fatal on failure."""

    def _fn():
        from scrapers.scrape_batter_splits import run as run_batter_splits_module

        run_batter_splits_module()

    _run_step("Step 15: scrapers.scrape_batter_splits", "scrapers.scrape_batter_splits", _fn)


def run_batter_profiles():
    """Step 16-17: batter metrics + Sheets push; non-fatal on failure."""

    def _fn():
        from core.compute_batter_profile import run as run_compute_batter

        run_compute_batter()
        from outputs.push_batter_profiles import run as run_push_batter

        run_push_batter()

    _run_step(
        "Step 16-17: compute_batter_profile + push_batter_profiles",
        "core.compute_batter_profile",
        _fn,
    )


def run_team_profiles():
    """Step 18-19: team profiles + Sheets push; non-fatal on failure."""

    def _fn():
        from core.compute_team_profile import run as run_compute_team

        run_compute_team()
        from outputs.push_team_profiles import run as run_push_team

        run_push_team()

    _run_step(
        "Step 18-19: compute_team_profile + push_team_profiles",
        "core.compute_team_profile",
        _fn,
    )


if __name__ == "__main__":
    run()
