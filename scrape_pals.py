import requests
import pandas as pd
import numpy as np
import os
from datetime import datetime, timedelta
import gspread
from google.oauth2.service_account import Credentials

DATA_DIR = r"C:\Users\chase\mlbma_pipeline\data"
SHEET_ID = "1D28pC1lqMbsCcTBP67WhJPzYHn2UdtveMEv6RsUSczk"
CREDS_FILE = r"C:\Users\chase\mlbma_pipeline\google_credentials.json"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

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
    """Pull all completed games this season with starting pitchers"""
    season_start = "2025-03-01"
    today = datetime.now().strftime("%Y-%m-%d")
    
    print(f"Fetching game log from {season_start} to {today}...")
    url = f"https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate={season_start}&endDate={today}&hydrate=probablePitcher,team&gameType=R"
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

                records.append({
                    "date": game_date,
                    "team": away_team,
                    "opp_sp": home_sp,
                })
                records.append({
                    "date": game_date,
                    "team": home_team,
                    "opp_sp": away_sp,
                })
            except Exception as e:
                continue

    df = pd.DataFrame(records)
    print(f"  Found {len(df)} team-game records")
    return df

def load_sp_xfip():
    """Load SP xFIP from existing data"""
    path = os.path.join(DATA_DIR, "sp_standard.csv")
    df = pd.read_csv(path)
    df = df[df["IP"].apply(pd.to_numeric, errors="coerce") >= 10]
    df["xFIP"] = pd.to_numeric(df["xFIP"], errors="coerce")
    df = df.dropna(subset=["xFIP"])
    
    # Build last-name lookup
    df["last_name"] = df["Name"].str.split().str[-1].str.lower()
    print(f"  Loaded {len(df)} qualified SPs with xFIP")
    return df

def match_sp(sp_name, sp_df):
    """Match SP name to xFIP"""
    if sp_name == "TBD" or not sp_name:
        return None
    last = sp_name.split()[-1].lower()
    match = sp_df[sp_df["last_name"] == last]
    if match.empty:
        return None
    return match.iloc[0]["xFIP"]

def calc_pals():
    """Calculate PALS for all 30 teams"""
    games = get_season_games()
    sp_df = load_sp_xfip()
    
    # Match each game to opposing SP xFIP
    games["opp_xfip"] = games["opp_sp"].apply(lambda x: match_sp(x, sp_df))
    matched = games.dropna(subset=["opp_xfip"])
    print(f"  Matched {len(matched)} of {len(games)} games to SP xFIP")

    # Average xFIP faced per team (PTF+)
    ptf = matched.groupby("team")["opp_xfip"].mean().reset_index()
    ptf.columns = ["Tm", "avg_xFIP_faced"]
    
    # Load OSI
    osi_df = pd.read_csv(os.path.join(DATA_DIR, "metrics_vs_RHP.csv"))[["Tm", "OSI"]]
    
    # Merge
    df = osi_df.merge(ptf, on="Tm", how="left")
    df = df.dropna(subset=["avg_xFIP_faced"])
    
    # Normalize both to 0-100
    def normalize(series, invert=False):
        mn, mx = series.min(), series.max()
        if mx == mn:
            return pd.Series([50.0] * len(series), index=series.index)
        norm = (series - mn) / (mx - mn) * 100
        return 100 - norm if invert else norm

    df["BA_plus"] = normalize(df["OSI"])
    df["PTF_plus"] = normalize(df["avg_xFIP_faced"], invert=True)  # Lower xFIP faced = easier schedule
    df["PALS"] = (df["BA_plus"] + df["PTF_plus"]) / 2

    df = df.sort_values("PALS", ascending=False).reset_index(drop=True)
    df.index += 1
    df["avg_xFIP_faced"] = df["avg_xFIP_faced"].round(2)
    df["BA_plus"] = df["BA_plus"].round(1)
    df["PTF_plus"] = df["PTF_plus"].round(1)
    df["PALS"] = df["PALS"].round(1)

    print("\n── PALS Results ──")
    print(df[["Tm", "OSI", "avg_xFIP_faced", "BA_plus", "PTF_plus", "PALS"]].to_string())
    return df

def push_to_sheets(df):
    creds = Credentials.from_service_account_file(CREDS_FILE, scopes=SCOPES)
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
    df = calc_pals()
    fname = os.path.join(DATA_DIR, "metrics_pals.csv")
    df.to_csv(fname, index=False)
    print(f"Saved: {fname}")
    push_to_sheets(df)
    print("Done.")

if __name__ == "__main__":
    run()