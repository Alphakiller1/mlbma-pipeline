"""Push team profile outputs to Google Sheets."""

import os

import pandas as pd

from core.config import DATA_DIR, SHEET_ID, SHEET_TABS, check_google_credentials
from outputs.push_sheets import get_client, push_df


def run():
    if not check_google_credentials():
        print("  Skipping Team_Profiles Google Sheets push (credentials unavailable).")
        return

    path = os.path.join(DATA_DIR, "team_profiles.csv")
    if not os.path.exists(path):
        print("  WARNING: team_profiles.csv not found")
        return

    print("Connecting to Google Sheets (team profiles)...")
    try:
        client = get_client()
        sheet = client.open_by_key(SHEET_ID)
        df = pd.read_csv(path)
        push_df(sheet, SHEET_TABS["team_profiles"], df)
        print("\nTeam profiles Google Sheets push complete.")
    except Exception as exc:
        print(f"  WARNING: Team_Profiles push failed ({exc})")


if __name__ == "__main__":
    run()
