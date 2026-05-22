"""Push bullpen profile outputs to Google Sheets."""

import os

import pandas as pd

from core.config import DATA_DIR, SHEET_ID, SHEET_TABS
from outputs.push_sheets import get_client, push_df


def run():
    print("Connecting to Google Sheets (bullpen)...")
    client = get_client()
    sheet = client.open_by_key(SHEET_ID)
    print("Connected.\n")

    files = {
        SHEET_TABS["bullpen_unit"]: "bullpen_unit.csv",
        SHEET_TABS["bullpen_individual"]: "bullpen_individual.csv",
    }

    for tab_name, filename in files.items():
        path = os.path.join(DATA_DIR, filename)
        if os.path.exists(path):
            df = pd.read_csv(path)
            push_df(sheet, tab_name, df)
        else:
            print(f"  WARNING: {filename} not found")

    print("\nBullpen Google Sheets push complete.")


if __name__ == "__main__":
    run()
