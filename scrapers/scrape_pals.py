import os
from datetime import datetime

import gspread
import pandas as pd
import requests
from google.oauth2.service_account import Credentials

from core.compute_pals import calc_pals, load_osi_for_pals, load_sp_xfip
from core.config import CREDS_FILE, DATA_DIR, SCOPES, SHEET_ID

TEAM_MAP = {
    "Arizona Diamondbacks": "ARI", "Atlanta Braves": "ATL",
    "Baltimore Orioles": "BAL", "Boston Red Sox": "BOS",
    "Chicago Cubs": "CHC", "Chicago White Sox": "CHW",
    "Cincinnati Reds": "CIN", "Cleveland Guardians": "CLE",
    "Colorado Rockies": "COL", "Detroit Tigers": "DET",
    "Houston Astros": "HOU", "Kansas City Royals": "KCR",
    "Los Angeles Angels": "LAA", "Los Angeles Dodgers": "LAD",
    "Miami Marlins": "MIA", "Milwaukee Brewers": "MIL",
    "Minnesota Twins": "MIN", "New York Mets": "NYM",
    "New York Yankees": "NYY", "Athletics": "ATH",
    "Philadelphia Phillies": "PHI", "Pittsburgh Pirates": "PIT",
    "San Diego Padres": "SDP", "San Francisco Giants": "SFG",
    "Seattle Mariners": "SEA", "St. Louis Cardinals": "STL",
    "Tampa Bay Rays": "TBR", "Texas Rangers": "TEX",
    "Toronto Blue Jays": "TOR", "Washington Nationals": "WSN",
}

HEADERS = {"User-Agent": "Mozilla/5.0"}


def get_season_games():
    """Pull all completed games this season with starting pitchers."""
    season_start = "2025-03-01"
    today = datetime.now().strftime("%Y-%m-%d")

    print(f"Fetching game log from {season_start} to {today}...")
    url = (
        f"https://statsapi.mlb.com/api/v1/schedule?sportId=1"
        f"&startDate={season_start}&endDate={today}"
        f"&hydrate=probablePitcher,team&gameType=R"
    )
    r = requests.get(url, headers=HEADERS)
    data = r.json()

    records = []
    for date in data.get("dates", []):
        for game in date.get("games", []):
            if game.get("status", {}).get("abstractGameState") != "Final":
                continue
            try:
                away_team = TEAM_MAP.get(game["teams"]["away"]["team"]["name"], "UNK")
                home_team = TEAM_MAP.get(game["teams"]["home"]["team"]["name"], "UNK")
                away_sp = game["teams"]["away"].get("probablePitcher", {}).get("fullName", "TBD")
                home_sp = game["teams"]["home"].get("probablePitcher", {}).get("fullName", "TBD")
                game_date = date["date"]

                records.append({"date": game_date, "team": away_team, "opp_sp": home_sp})
                records.append({"date": game_date, "team": home_team, "opp_sp": away_sp})
            except Exception:
                continue

    df = pd.DataFrame(records)
    print(f"  Found {len(df)} team-game records")
    return df


def push_to_sheets(df):
    creds = Credentials.from_service_account_file(str(CREDS_FILE), scopes=SCOPES)
    client = gspread.authorize(creds)
    sheet = client.open_by_key(SHEET_ID)
    try:
        ws = sheet.worksheet("PALS")
        ws.clear()
    except gspread.exceptions.WorksheetNotFound:
        ws = sheet.add_worksheet(title="PALS", rows=40, cols=10)
    df_out = df.fillna("—")
    data = [df_out.columns.tolist()] + df_out.values.tolist()
    ws.update(data)
    print("Pushed PALS to Google Sheets")


def run():
    games = get_season_games()
    sp_df = load_sp_xfip()
    osi_df = load_osi_for_pals()
    df = calc_pals(games, sp_df, osi_df)
    fname = os.path.join(DATA_DIR, "metrics_pals.csv")
    df.to_csv(fname, index=False)
    print(f"Saved: {fname}")
    push_to_sheets(df)
    print("Done.")


if __name__ == "__main__":
    run()
