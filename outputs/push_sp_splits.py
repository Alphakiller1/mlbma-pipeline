"""Push SP split outputs to Google Sheets."""

import os

import pandas as pd

from core.config import DATA_DIR, SHEET_ID, SHEET_TABS, check_google_credentials
from outputs.push_sheets import get_client, push_df


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
    }

    for tab_name, filename in files.items():
        path = os.path.join(DATA_DIR, filename)
        if os.path.exists(path):
            df = pd.read_csv(path)
            push_df(sheet, tab_name, df)
        else:
            print(f"  WARNING: {filename} not found")

    print("\nSP splits Google Sheets push complete.")


if __name__ == "__main__":
    run()
