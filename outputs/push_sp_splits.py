"""Push SP split outputs to Google Sheets."""

import os
import shutil
from pathlib import Path

import pandas as pd

from core.config import DATA_DIR, SHEET_ID, SHEET_TABS, check_google_credentials
from outputs.push_sheets import get_client, push_df

ROOT = Path(__file__).resolve().parent.parent
DASHBOARD_DATA = ROOT / "dashboard" / "data"

# Local dashboard fallbacks when Sheets / ../data fetch paths differ by host.
DASHBOARD_SYNC_FILES = (
    "sp_vs_LHH.csv",
    "sp_vs_RHH.csv",
    "sp_gamelog.csv",
    "sp_metric_splits.csv",
    "sp_standard.csv",
)


def sync_dashboard_data() -> None:
    DASHBOARD_DATA.mkdir(parents=True, exist_ok=True)
    copied = []
    for name in DASHBOARD_SYNC_FILES:
        src = DATA_DIR / name
        if not src.exists():
            continue
        dst = DASHBOARD_DATA / name
        shutil.copy2(src, dst)
        copied.append(name)
    if copied:
        print(f"  Synced {len(copied)} file(s) -> dashboard/data/ ({', '.join(copied)})")


def run():
    if not check_google_credentials():
        print("  Skipping SP splits Google Sheets push (credentials unavailable).")
        return

    print("Connecting to Google Sheets (SP splits)...")
    client = get_client()
    sheet = client.open_by_key(SHEET_ID)
    print("Connected.\n")

    files = {
        SHEET_TABS["sp_metric_splits"]: "sp_metric_splits.csv",
        SHEET_TABS["sp_profiles"]: "sp_profiles.csv",
        SHEET_TABS["sp_game_log"]: "sp_gamelog.csv",
        SHEET_TABS["sp_l14"]: "sp_l14.csv",
    }

    for tab_name, filename in files.items():
        path = os.path.join(DATA_DIR, filename)
        if os.path.exists(path):
            df = pd.read_csv(path)
            push_df(sheet, tab_name, df)
        else:
            print(f"  WARNING: {filename} not found")

    print("\nSP splits Google Sheets push complete.")
    sync_dashboard_data()


if __name__ == "__main__":
    run()
