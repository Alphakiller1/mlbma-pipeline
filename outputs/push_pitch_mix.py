"""Push pitch-mix datasets to Google Sheets."""

from __future__ import annotations

import os

import pandas as pd

from core.config import DATA_DIR, SHEET_ID, SHEET_TABS, check_google_credentials
from outputs.push_sheets import get_client, push_df

PITCH_MIX_FILES = {
    "pitch_mix_pitcher": "pitch_mix_pitcher.csv",
    "pitch_mix_pitcher_l14": "pitch_mix_pitcher_l14.csv",
    "pitch_mix_batter": "pitch_mix_batter.csv",
    "pitch_mix_batter_l14": "pitch_mix_batter_l14.csv",
    "pitch_mix_team_pitching": "pitch_mix_team_pitching.csv",
    "pitch_mix_team_pitching_l14": "pitch_mix_team_pitching_l14.csv",
    "pitch_mix_team_batting": "pitch_mix_team_batting.csv",
    "pitch_mix_team_batting_l14": "pitch_mix_team_batting_l14.csv",
}


def run() -> None:
    if not check_google_credentials():
        print("  Skipping Pitch Mix Google Sheets push (credentials unavailable).")
        return

    print("Connecting to Google Sheets (pitch mix)...")
    try:
        client = get_client()
        sheet = client.open_by_key(SHEET_ID)
        for tab_key, filename in PITCH_MIX_FILES.items():
            path = os.path.join(DATA_DIR, filename)
            tab_name = SHEET_TABS[tab_key]
            if not os.path.exists(path):
                print(f"  WARNING: {filename} not found -- skipping {tab_name}")
                continue
            df = pd.read_csv(path)
            push_df(sheet, tab_name, df)
            print(f"  Pushed {len(df)} rows -> {tab_name}")
        print("\nPitch mix Google Sheets push complete.")
    except Exception as exc:
        print(f"  WARNING: Pitch mix push failed ({exc})")


if __name__ == "__main__":
    run()
