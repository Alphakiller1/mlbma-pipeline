"""
Fast pipeline smoke test: Savant scrape → compute → Sheets push.
Skips FanGraphs (Chrome/Selenium) and PALS.
"""
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _resolve_python() -> Path:
    env_python = Path(sys.executable)
    candidates = [
        Path((Path.cwd() / "crawl_env" / "Scripts" / "python.exe")),
        Path((ROOT / "crawl_env" / "Scripts" / "python.exe")),
        Path((ROOT.parent / "crawl_env" / "Scripts" / "python.exe")),
        Path(sys.executable),
    ]
    for c in candidates:
        if c and c.exists():
            return c
    return env_python


PYTHON = _resolve_python()

SCRIPTS = [
    "scrapers.scrape_savant",
    "core.compute",
    "outputs.push_sheets",
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


def run():
    print(f"MLBMA Smoke Pipeline starting at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("(Savant + compute + push -- no FanGraphs)\n")

    for script in SCRIPTS:
        if not run_script(script):
            sys.exit(1)

    print(f"\nSmoke pipeline complete at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("Note: without FanGraphs, core.compute skips team metrics but exits successfully.")


if __name__ == "__main__":
    run()
