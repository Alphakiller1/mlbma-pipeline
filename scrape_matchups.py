import requests
import pandas as pd
from datetime import datetime
import os
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

HEADERS = {
    "User-Agent": "Mozilla/5.0"
}

def get_today_schedule():
    today = datetime.now().strftime("%Y-%m-%d")
    url = f"https://statsapi.mlb.com/api/v1/schedule?sportId=1&date={today}&hydrate=probablePitcher,lineups,team"
    print(f"Fetching schedule for {today}...")
    r = requests.get(url, headers=HEADERS)
    data = r.json()

    games = []
    for date in data.get("dates", []):
        for game in date.get("games", []):
            try:
                away_team = game["teams"]["away"]["team"]["name"]
                home_team = game["teams"]["home"]["team"]["name"]
                away_abbr = TEAM_MAP.get(away_team, away_team[:3].upper())
                home_abbr = TEAM_MAP.get(home_team, home_team[:3].upper())

                game_time = game.get("gameDate", "")
                if game_time:
                    dt = datetime.strptime(game_time, "%Y-%m-%dT%H:%M:%SZ")
                    game_time_str = dt.strftime("%-I:%M %p ET") if os.name != 'nt' else dt.strftime("%I:%M %p ET")
                else:
                    game_time_str = "TBD"

                away_sp = game["teams"]["away"].get("probablePitcher", {}).get("fullName", "TBD")
                home_sp = game["teams"]["home"].get("probablePitcher", {}).get("fullName", "TBD")

                away_sp_hand = game["teams"]["away"].get("probablePitcher", {}).get("pitchHand", {}).get("code", "R")
                home_sp_hand = game["teams"]["home"].get("probablePitcher", {}).get("pitchHand", {}).get("code", "R")

                games.append({
                    "Game_Time": game_time_str,
                    "Away_Team": away_abbr,
                    "Home_Team": home_abbr,
                    "Away_SP": away_sp,
                    "Away_SP_Hand": away_sp_hand,
                    "Home_SP": home_sp,
                    "Home_SP_Hand": home_sp_hand,
                })
            except Exception as e:
                print(f"  Error parsing game: {e}")
                continue

    print(f"  Found {len(games)} games")
    return pd.DataFrame(games)

def load_sp_stats():
    path = os.path.join(DATA_DIR, "sp_standard.csv")
    if not os.path.exists(path):
        print("  WARNING: sp_standard.csv not found")
        return pd.DataFrame()
    df = pd.read_csv(path)
    df = df[~df["Tm"].str.contains("Tms", na=False)]
    return df

def load_pitching_scores():
    path = os.path.join(DATA_DIR, "metrics_pitching_score.csv")
    if not os.path.exists(path):
        print("  WARNING: metrics_pitching_score.csv not found")
        return pd.DataFrame()
    return pd.read_csv(path)

def load_osi():
    rhp = pd.read_csv(os.path.join(DATA_DIR, "metrics_vs_RHP.csv"))
    lhp = pd.read_csv(os.path.join(DATA_DIR, "metrics_vs_LHP.csv"))
    return rhp, lhp

def get_sp_stats(sp_name, sp_df):
    if sp_df.empty or sp_name == "TBD":
        return {"K%": "—", "BB%": "—", "HR/9": "—", "FIP": "—", "IP": "—"}
    match = sp_df[sp_df["Name"].str.contains(sp_name.split()[-1], case=False, na=False)]
    if match.empty:
        return {"K%": "—", "BB%": "—", "HR/9": "—", "FIP": "—", "IP": "—"}
    row = match.iloc[0]
    return {
        "K%": row.get("K%", "—"),
        "BB%": row.get("BB%", "—"),
        "HR/9": row.get("HR/9", "—"),
        "FIP": row.get("FIP", "—"),
        "IP": row.get("IP", "—"),
    }

def get_team_osi(team, hand, rhp_df, lhp_df):
    df = rhp_df if hand == "R" else lhp_df
    match = df[df["Tm"] == team]
    if match.empty:
        return None
    return round(match.iloc[0]["OSI"], 1)

def build_matchups():
    print("Building matchup sheet...")
    games = get_today_schedule()
    if games.empty:
        print("No games today")
        return pd.DataFrame()

    sp_df = load_sp_stats()
    ps_df = load_pitching_scores()
    rhp_df, lhp_df = load_osi()

    rows = []
    for _, g in games.iterrows():
        away_stats = get_sp_stats(g["Away_SP"], sp_df)
        home_stats = get_sp_stats(g["Home_SP"], sp_df)

        # Lineup OSI vs opposing SP handedness
        away_lineup_osi = get_team_osi(g["Away_Team"], g["Home_SP_Hand"], rhp_df, lhp_df)
        home_lineup_osi = get_team_osi(g["Home_Team"], g["Away_SP_Hand"], rhp_df, lhp_df)

        # Edge
        if away_lineup_osi and home_lineup_osi:
            edge_team = g["Away_Team"] if away_lineup_osi > home_lineup_osi else g["Home_Team"]
            edge_gap = abs((away_lineup_osi or 0) - (home_lineup_osi or 0))
            edge = f"{edge_team} +{edge_gap:.1f}"
        else:
            edge = "—"

        rows.append({
            "Time": g["Game_Time"],
            "Away": g["Away_Team"],
            "Home": g["Home_Team"],
            "Away_SP": g["Away_SP"],
            "Away_Hand": g["Away_SP_Hand"],
            "Away_K%": away_stats["K%"],
            "Away_BB%": away_stats["BB%"],
            "Away_HR9": away_stats["HR/9"],
            "Away_FIP": away_stats["FIP"],
            "Home_SP": g["Home_SP"],
            "Home_Hand": g["Home_SP_Hand"],
            "Home_K%": home_stats["K%"],
            "Home_BB%": home_stats["BB%"],
            "Home_HR9": home_stats["HR/9"],
            "Home_FIP": home_stats["FIP"],
            "Away_OSI": away_lineup_osi,
            "Home_OSI": home_lineup_osi,
            "Lineup_Edge": edge,
        })

    df = pd.DataFrame(rows)
    print(f"  Built {len(df)} matchup rows")
    return df

def push_to_sheets(df):
    if df.empty:
        print("No data to push")
        return

    creds = Credentials.from_service_account_file(CREDS_FILE, scopes=SCOPES)
    client = gspread.authorize(creds)
    sheet = client.open_by_key(SHEET_ID)

    try:
        ws = sheet.worksheet("Today_Matchups")
        ws.clear()
    except gspread.exceptions.WorksheetNotFound:
        ws = sheet.add_worksheet(title="Today_Matchups", rows=50, cols=25)

    df = df.fillna("—")
    data = [df.columns.tolist()] + df.values.tolist()
    ws.update(data)
    print(f"  Pushed Today_Matchups: {len(df)} games")

def run():
    df = build_matchups()
    if not df.empty:
        fname = os.path.join(DATA_DIR, "today_matchups.csv")
        df.to_csv(fname, index=False)
        print(f"  Saved: {fname}")
        push_to_sheets(df)
        print("\nMatchup sheet:")
        print(df[["Time", "Away", "Home", "Away_SP", "Away_Hand", "Home_SP", "Home_Hand", "Away_OSI", "Home_OSI", "Lineup_Edge"]].to_string())
    print("\nDone.")

if __name__ == "__main__":
    run()