import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PYTHON = ROOT / "crawl_env" / "Scripts" / "python.exe"

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


def run_script(module: str, required: bool = True) -> bool:
    print(f"\n{'='*50}")
    print(f"Running {module}...")
    print(f"{'='*50}")
    result = subprocess.run(
        [str(PYTHON), "-m", module],
        cwd=str(ROOT),
    )
    if result.returncode != 0:
        if required:
            print(f"ERROR: {module} failed")
        else:
            print(f"WARNING: {module} failed - continuing")
        return False
    return True


def run_signals():
    """Compute cross-metric signals; non-fatal on failure."""
    print(f"\n{'='*50}")
    print("Running core.compute_signals...")
    print(f"{'='*50}")
    try:
        from core.compute_signals import run as run_signals_module

        run_signals_module()
    except Exception as exc:
        print(f"WARNING: compute_signals failed - continuing ({exc})")


def run_lineups():
    """Scrape Rotowire lineups; non-fatal on failure."""
    print(f"\n{'='*50}")
    print("Running scrapers.scrape_lineups...")
    print(f"{'='*50}")
    try:
        from scrapers.scrape_lineups import run as run_lineups

        run_lineups()
        return True
    except Exception as exc:
        print(f"WARNING: scrape_lineups failed - continuing ({exc})")
        return False


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
    print(f"MLBMA Pipeline starting at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    for script in SCRIPTS_REQUIRED:
        if not run_script(script, required=True):
            sys.exit(1)

    for script in SCRIPTS_OPTIONAL:
        run_script(script, required=False)

    run_lineups()

    if not run_script("scrapers.scrape_pals"):
        print("WARNING: PALS scrape failed - continuing")

    run_signals()

    run_sp_gamelog()
    run_sp_splits()
    run_reliever_gamelog()
    run_bullpen_profiles()

    run_player_registry()
    run_batter_splits()
    run_batter_profiles()
    run_team_profiles()

    print(f"\nPipeline complete at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("All metrics pushed to Google Sheets")


def run_sp_gamelog():
    """Step 10: SP game logs from MLB Stats API; non-fatal on failure."""
    print(f"\n{'='*50}")
    print("Step 10: scrapers.scrape_sp_gamelog...")
    print(f"{'='*50}")
    try:
        from scrapers.scrape_sp_gamelog import run as run_sp_gamelog_module

        run_sp_gamelog_module()
    except Exception as exc:
        print(f"WARNING: scrape_sp_gamelog failed - continuing ({exc})")


def run_sp_splits():
    """Step 11: SP split profiles + Sheets push; non-fatal on failure."""
    print(f"\n{'='*50}")
    print("Step 11: compute_sp_splits + push_sp_splits...")
    print(f"{'='*50}")
    try:
        from core.compute_sp_splits import run as run_compute_sp_splits

        run_compute_sp_splits()
        from outputs.push_sp_splits import run as run_push_sp_splits

        run_push_sp_splits()
    except Exception as exc:
        print(f"WARNING: SP splits step failed - continuing ({exc})")


def run_reliever_gamelog():
    """Step 12: reliever game logs from MLB Stats API; non-fatal on failure."""
    print(f"\n{'='*50}")
    print("Step 12: scrapers.scrape_reliever_gamelog...")
    print(f"{'='*50}")
    try:
        from scrapers.scrape_reliever_gamelog import run as run_reliever_gamelog_module

        run_reliever_gamelog_module()
    except Exception as exc:
        print(f"WARNING: scrape_reliever_gamelog failed - continuing ({exc})")


def run_bullpen_profiles():
    """Step 13: bullpen profiles + Sheets push; non-fatal on failure."""
    print(f"\n{'='*50}")
    print("Step 13: compute_bullpen_profile + push_bullpen...")
    print(f"{'='*50}")
    try:
        from core.compute_bullpen_profile import run as run_compute_bullpen

        run_compute_bullpen()
        from outputs.push_bullpen import run as run_push_bullpen

        run_push_bullpen()
    except Exception as exc:
        print(f"WARNING: bullpen profile step failed - continuing ({exc})")


def run_player_registry():
    """Step 14: MLB player registry + Sheets push; non-fatal on failure."""
    print(f"\n{'='*50}")
    print("Step 14: scrapers.scrape_player_registry...")
    print(f"{'='*50}")
    try:
        from scrapers.scrape_player_registry import run as run_registry

        run_registry()
    except Exception as exc:
        print(f"WARNING: scrape_player_registry failed - continuing ({exc})")


def run_batter_splits():
    """Step 15: FanGraphs batter splits; non-fatal on failure."""
    print(f"\n{'='*50}")
    print("Step 15: scrapers.scrape_batter_splits...")
    print(f"{'='*50}")
    try:
        from scrapers.scrape_batter_splits import run as run_batter_splits_module

        run_batter_splits_module()
    except Exception as exc:
        print(f"WARNING: scrape_batter_splits failed - continuing ({exc})")


def run_batter_profiles():
    """Step 16-17: batter metrics + Sheets push; non-fatal on failure."""
    print(f"\n{'='*50}")
    print("Step 16-17: compute_batter_profile + push_batter_profiles...")
    print(f"{'='*50}")
    try:
        from core.compute_batter_profile import run as run_compute_batter

        run_compute_batter()
        from outputs.push_batter_profiles import run as run_push_batter

        run_push_batter()
    except Exception as exc:
        print(f"WARNING: batter profile step failed - continuing ({exc})")


def run_team_profiles():
    """Step 18-19: team profiles + Sheets push; non-fatal on failure."""
    print(f"\n{'='*50}")
    print("Step 18-19: compute_team_profile + push_team_profiles...")
    print(f"{'='*50}")
    try:
        from core.compute_team_profile import run as run_compute_team

        run_compute_team()
        from outputs.push_team_profiles import run as run_push_team

        run_push_team()
    except Exception as exc:
        print(f"WARNING: team profile step failed - continuing ({exc})")


if __name__ == "__main__":
    run()
