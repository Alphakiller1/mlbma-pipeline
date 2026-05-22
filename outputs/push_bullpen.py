"""Push bullpen profile outputs to Google Sheets."""

import os

import pandas as pd

from core.config import DATA_DIR, SHEET_ID, SHEET_TABS, check_google_credentials
from outputs.push_sheets import get_client, push_df, sanitize_df_for_sheets


def run():
    if not check_google_credentials():
        print("  Skipping bullpen Google Sheets push (credentials unavailable).")
        return

    print("Connecting to Google Sheets (bullpen)...")
    client = get_client()
    sheet = client.open_by_key(SHEET_ID)
    print("Connected.\n")

    files = {
        SHEET_TABS["bullpen_unit"]: "bullpen_unit.csv",
        SHEET_TABS["bullpen_individual"]: "bullpen_individual.csv",
        SHEET_TABS["reliever_log"]: "reliever_gamelog.csv",
    }

    for tab_name, filename in files.items():
        path = os.path.join(DATA_DIR, filename)
        if os.path.exists(path):
            df = pd.read_csv(path)
            df = sanitize_df_for_sheets(df)
            push_df(sheet, tab_name, df)
        else:
            print(f"  WARNING: {filename} not found")

    print("\nBullpen Google Sheets push complete.")


if __name__ == "__main__":
    run()
