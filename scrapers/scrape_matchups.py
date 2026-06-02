import requests
import pandas as pd
from datetime import datetime, timedelta, timezone
import os
import gspread

from core.config import DATA_DIR, SHEET_ID, SHEET_TABS, TEAM_MAP, check_google_credentials

HEADERS = {
    "User-Agent": "Mozilla/5.0"
}

def get_today_schedule():
    today = datetime.now().strftime("%Y-%m-%d")
    url = f"https://statsapi.mlb.com/api/v1/schedule?sportId=1&date={today}&hydrate=probablePitcher,lineups,team"
    print(f"Fetching schedule for {today}...")
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
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
                    utc_dt = datetime.strptime(game_time, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                    # MLB Stats API sends UTC. Convert to Eastern before labeling ET.
                    dt = utc_dt - timedelta(hours=4)
                    game_time_str = dt.strftime("%-I:%M %p ET") if os.name != 'nt' else dt.strftime("%I:%M %p ET").lstrip("0")
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
    rhp_path = os.path.join(DATA_DIR, "metrics_vs_RHP.csv")
    lhp_path = os.path.join(DATA_DIR, "metrics_vs_LHP.csv")
    if not os.path.exists(rhp_path) or not os.path.exists(lhp_path):
        print("  WARNING: metrics_vs_RHP/LHP not found -- lineup OSI columns will be empty")
        return pd.DataFrame(), pd.DataFrame()
    return pd.read_csv(rhp_path), pd.read_csv(lhp_path)

def get_sp_stats(sp_name, sp_df):
    if sp_df.empty or sp_name == "TBD":
        return {"K%": "--", "BB%": "--", "HR/9": "--", "FIP": "--", "IP": "--"}
    match = sp_df[sp_df["Name"].str.contains(sp_name.split()[-1], case=False, na=False)]
    if match.empty:
        return {"K%": "--", "BB%": "--", "HR/9": "--", "FIP": "--", "IP": "--"}
    row = match.iloc[0]
    return {
        "K%": row.get("K%", "--"),
        "BB%": row.get("BB%", "--"),
        "HR/9": row.get("HR/9", "--"),
        "FIP": row.get("FIP", "--"),
        "IP": row.get("IP", "--"),
    }

def get_team_osi(team, hand, rhp_df, lhp_df):
    df = rhp_df if hand == "R" else lhp_df
    if df.empty or "Tm" not in df.columns:
        return None
    match = df[df["Tm"] == team]
    if match.empty:
        return None
    return round(match.iloc[0]["OSI"], 1)

def get_pitch_score(team, ps_df):
    if ps_df.empty or "Tm" not in ps_df.columns or "PitchScore" not in ps_df.columns:
        return None
    match = ps_df[ps_df["Tm"] == team]
    if match.empty:
        return None
    val = pd.to_numeric(match.iloc[0]["PitchScore"], errors="coerce")
    return None if pd.isna(val) else round(float(val), 1)

def load_games_from_rotowire_exports():
    """Schedule from scrape_lineups (Today_Games / today_lineups) — must match lineup cards."""
    games_path = os.path.join(DATA_DIR, "today_games.csv")
    if os.path.exists(games_path):
        gdf = pd.read_csv(games_path)
        if not gdf.empty and "Away" in gdf.columns and "Home" in gdf.columns:
            records = []
            for _, row in gdf.iterrows():
                records.append({
                    "Away_Team": str(row.get("Away", "")).strip(),
                    "Home_Team": str(row.get("Home", "")).strip(),
                    "Game_Time": str(row.get("Time", "TBD")).strip(),
                    "Away_SP": str(row.get("Away_SP", "TBD")).strip(),
                    "Home_SP": str(row.get("Home_SP", "TBD")).strip(),
                    "Away_SP_Hand": "R",
                    "Home_SP_Hand": "R",
                })
            return pd.DataFrame(records)

    lineup_path = os.path.join(DATA_DIR, "today_lineups.csv")
    if not os.path.exists(lineup_path):
        return pd.DataFrame()
    lu = pd.read_csv(lineup_path)
    if lu.empty or "Game" not in lu.columns:
        return pd.DataFrame()
    records = []
    for game, grp in lu.groupby("Game"):
        parts = str(game).split("@")
        if len(parts) != 2:
            continue
        records.append({
            "Away_Team": parts[0].strip(),
            "Home_Team": parts[1].strip(),
            "Game_Time": grp["Time"].iloc[0] if "Time" in grp.columns else "TBD",
            "Away_SP": "TBD",
            "Home_SP": "TBD",
            "Away_SP_Hand": "R",
            "Home_SP_Hand": "R",
        })
    return pd.DataFrame(records)


def schedule_game_keys(games_df):
    if games_df is None or games_df.empty:
        return set()
    return {
        f"{row['Away_Team']}@{row['Home_Team']}"
        for _, row in games_df.iterrows()
    }


def merge_rotowire_with_api_schedule(rotowire, api_games):
    """Use Rotowire lineup details when present, and append API-only games."""
    if api_games.empty:
        print(f"  MLB API schedule empty -> using Rotowire slate ({len(rotowire)} games)")
        return rotowire

    if rotowire.empty:
        print(f"  Rotowire slate empty -> using live MLB API schedule ({len(api_games)} games)")
        return api_games

    api_keys = schedule_game_keys(api_games)
    rw_keys = schedule_game_keys(rotowire)
    overlap = len(api_keys & rw_keys)
    missing_api = api_games[
        ~api_games.apply(lambda row: f"{row['Away_Team']}@{row['Home_Team']}" in rw_keys, axis=1)
    ]

    if missing_api.empty:
        print(
            f"  Rotowire slate: {len(rotowire)} games; MLB API overlap={overlap}/{len(api_keys)} "
            "-> using Rotowire"
        )
        return rotowire

    print(
        f"  Rotowire slate: {len(rotowire)} games; MLB API schedule: {len(api_games)}; "
        f"overlap={overlap}; appending {len(missing_api)} API-only games"
    )
    return pd.concat([rotowire, missing_api], ignore_index=True)


def build_matchups():
    print("Building matchup sheet...")
    rotowire = load_games_from_rotowire_exports()
    games = get_today_schedule()
    games = merge_rotowire_with_api_schedule(rotowire, games)
    if False and not rotowire.empty:
        api_keys = schedule_game_keys(games)
        rw_keys = schedule_game_keys(rotowire)
        overlap = len(api_keys & rw_keys)
        # The live MLB Stats API schedule is the source of truth. Only use the
        # Rotowire export when it actually matches today's slate (good overlap) —
        # otherwise it's a stale cache and we fall back to the API schedule.
        if not api_keys or overlap >= max(1, len(api_keys) // 2):
            print(f"  Rotowire slate: {len(rotowire)} games; MLB API overlap={overlap} -> using Rotowire")
            games = rotowire
        else:
            print(f"  Rotowire stale (overlap {overlap}/{len(api_keys)}) -> using live MLB API schedule")
    elif games.empty:
        print("  No Rotowire export and MLB API schedule empty")
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

        # Team pitching score (composite SP/staff quality)
        away_pitch_score = get_pitch_score(g["Away_Team"], ps_df)
        home_pitch_score = get_pitch_score(g["Home_Team"], ps_df)

        # Edge
        if away_lineup_osi and home_lineup_osi:
            edge_team = g["Away_Team"] if away_lineup_osi > home_lineup_osi else g["Home_Team"]
            edge_gap = abs((away_lineup_osi or 0) - (home_lineup_osi or 0))
            edge = f"{edge_team} +{edge_gap:.1f}"
        else:
            edge = "--"

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
            "Away_PitchScore": away_pitch_score,
            "Home_SP": g["Home_SP"],
            "Home_Hand": g["Home_SP_Hand"],
            "Home_K%": home_stats["K%"],
            "Home_BB%": home_stats["BB%"],
            "Home_HR9": home_stats["HR/9"],
            "Home_FIP": home_stats["FIP"],
            "Home_PitchScore": home_pitch_score,
            "Away_OSI": away_lineup_osi,
            "Home_OSI": home_lineup_osi,
            "Lineup_Edge": edge,
        })

    df = pd.DataFrame(rows)
    if "Time" in df.columns:
        sort_time = pd.to_datetime(
            df["Time"].astype(str).str.replace(" ET", "", regex=False),
            format="%I:%M %p",
            errors="coerce",
        )
        df = (
            df.assign(_sort_time=sort_time)
            .sort_values("_sort_time", na_position="last")
            .drop(columns=["_sort_time"])
            .reset_index(drop=True)
        )
    print(f"  Built {len(df)} matchup rows")
    return df

def push_to_sheets(df):
    if df.empty:
        print("No data to push")
        return
    if not check_google_credentials():
        print("  Skipping Today_Matchups push (credentials unavailable).")
        return

    from core.config import CREDS_FILE, SCOPES
    from google.oauth2.service_account import Credentials

    creds = Credentials.from_service_account_file(str(CREDS_FILE), scopes=SCOPES)
    client = gspread.authorize(creds)
    sheet = client.open_by_key(SHEET_ID)

    tab = SHEET_TABS["today_matchups"]
    try:
        ws = sheet.worksheet(tab)
        ws.clear()
    except gspread.exceptions.WorksheetNotFound:
        ws = sheet.add_worksheet(title=tab, rows=50, cols=25)

    df = df.fillna("--")
    data = [df.columns.tolist()] + df.values.tolist()
    ws.update(data)
    print(f"  Pushed {tab}: {len(df)} games")

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
