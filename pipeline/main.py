import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PYTHON = ROOT / "crawl_env" / "Scripts" / "python.exe"

SCRIPTS = [
    "scrapers.scrape_savant",
    "scrapers.scrape_fangraphs",
    "core.compute",
    "outputs.push_sheets",
    "scrapers.scrape_matchups",
    "scrapers.scrape_weather",
]


def run_script(module: str) -> bool:
    print(f"\n{'='*50}")
    print(f"Running {module}...")
    print(f"{'='*50}")
    result = subprocess.run(
        [str(PYTHON), "-m", module],
        cwd=str(ROOT),
    )
    if result.returncode != 0:
        print(f"ERROR: {module} failed")
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
    print(f"MLBMA Pipeline starting at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    for script in SCRIPTS:
        if not run_script(script):
            sys.exit(1)
        if script == "scrapers.scrape_matchups":
            run_lineups()

    if not run_script("scrapers.scrape_pals"):
        print("WARNING: PALS scrape failed - continuing")

    run_signals()

    run_sp_gamelog()
    run_sp_splits()

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


if __name__ == "__main__":
    run()
