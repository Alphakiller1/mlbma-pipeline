"""Push batter prop hit-rate outputs to Google Sheets."""

import os

import pandas as pd

from core.config import DATA_DIR, SHEET_ID, SHEET_TABS, check_google_credentials
from outputs.push_sheets import get_client, push_df


def run():
    if not check_google_credentials():
        print("  Skipping Batter_Prop_HitRates Google Sheets push (credentials unavailable).")
        return

    path = os.path.join(DATA_DIR, "batter_prop_hitrates.csv")
    if not os.path.exists(path):
        print("  WARNING: batter_prop_hitrates.csv not found -- skipping push")
        return

    try:
        df = pd.read_csv(path)
    except Exception as exc:
        print(f"  WARNING: could not read batter_prop_hitrates.csv ({exc})")
        return

    tab = SHEET_TABS["batter_prop_hitrates"]
    print(f"Connecting to Google Sheets ({tab})...")
    try:
        client = get_client()
        sheet = client.open_by_key(SHEET_ID)
        push_df(sheet, tab, df)
        print(f"  Pushed {len(df)} rows -> {tab}")
        print("Batter prop hit-rates Google Sheets push complete.")
    except Exception as exc:
        print(f"  WARNING: Batter_Prop_HitRates push failed ({exc})")


if __name__ == "__main__":
    run()
