"""Push team L10 vs same-handed SP metrics to Google Sheets."""

import os

import pandas as pd

from core.config import DATA_DIR, SHEET_ID, SHEET_TABS, check_google_credentials
from outputs.push_sheets import get_client, push_df


def run():
    if not check_google_credentials():
        print("  Skipping Team_L10_SP_Hand Google Sheets push (credentials unavailable).")
        return

    path = os.path.join(DATA_DIR, "team_l10_sp_hand.csv")
    games_path = os.path.join(DATA_DIR, "team_l10_sp_hand_games.csv")
    if not os.path.exists(path):
        print("  WARNING: team_l10_sp_hand.csv not found")
        return

    print("Connecting to Google Sheets (team L10 vs SP hand)...")
    try:
        client = get_client()
        sheet = client.open_by_key(SHEET_ID)
        df = pd.read_csv(path)
        push_df(sheet, SHEET_TABS["team_l10_sp_hand"], df)
        print(f"  Pushed {SHEET_TABS['team_l10_sp_hand']}: {len(df)} rows")
        if os.path.exists(games_path):
            gdf = pd.read_csv(games_path)
            push_df(sheet, SHEET_TABS["team_l10_sp_hand_games"], gdf)
            print(f"  Pushed {SHEET_TABS['team_l10_sp_hand_games']}: {len(gdf)} rows")
        print("\nTeam L10 vs SP hand Google Sheets push complete.")
    except Exception as exc:
        print(f"  WARNING: Team_L10_SP_Hand push failed ({exc})")


if __name__ == "__main__":
    run()
