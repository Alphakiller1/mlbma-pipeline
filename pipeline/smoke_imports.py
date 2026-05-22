"""Verify all pipeline modules import cleanly (no network/scrape side effects)."""
import importlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

MODULES = [
    "core.config",
    "core.metrics_utils",
    "core.compute_abq",
    "core.compute_rcv",
    "core.compute_obr",
    "core.compute_osi",
    "core.compute_pitching",
    "core.compute_oor",
    "core.compute_pals",
    "core.compute_signals",
    "core.compute",
    "scrapers.scrape_savant",
    "scrapers.scrape_fangraphs",
    "scrapers.scrape_lineups",
    "scrapers.scrape_matchups",
    "scrapers.scrape_pals",
    "scrapers.scrape_weather",
    "outputs.push_sheets",
    "core.dashboard_terminal",
]

EMPTY_PLACEHOLDERS = [
    "outputs.push_matchups",
]


def main():
    failed = []
    for name in MODULES + EMPTY_PLACEHOLDERS:
        try:
            importlib.import_module(name)
            print(f"  OK  {name}")
        except Exception as e:
            print(f"  FAIL {name}: {e}")
            failed.append(name)
    if failed:
        print(f"\n{len(failed)} module(s) failed.")
        sys.exit(1)
    print(f"\nAll {len(MODULES) + len(EMPTY_PLACEHOLDERS)} modules imported successfully.")


if __name__ == "__main__":
    main()
