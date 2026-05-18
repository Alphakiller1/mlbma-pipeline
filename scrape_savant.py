import requests
import pandas as pd
from io import StringIO
import os

DATA_DIR = r"C:\Users\chase\mlbma_pipeline\data"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
}

TEAM_MAP = {
    133: "ATH", 134: "PIT", 135: "SDP", 136: "SEA", 137: "SFG",
    138: "STL", 139: "TBR", 140: "TEX", 141: "TOR", 142: "MIN",
    143: "PHI", 144: "ATL", 145: "CHW", 146: "MIA", 147: "NYY",
    158: "MIL", 108: "LAA", 109: "ARI", 110: "BAL", 111: "BOS",
    112: "CHC", 113: "CIN", 114: "CLE", 115: "COL", 116: "DET",
    117: "HOU", 118: "KCR", 119: "LAD", 120: "WSN", 121: "NYM",
}

def fetch_player_team_map():
    print("Fetching player-team map...")
    r = requests.get(
        "https://statsapi.mlb.com/api/v1/sports/1/players",
        params={"season": "2025", "gameType": "R"},
        headers=HEADERS
    )
    players = r.json()["people"]
    lookup = {}
    for p in players:
        pid = p.get("id")
        team_id = p.get("currentTeam", {}).get("id")
        if pid and team_id:
            lookup[pid] = TEAM_MAP.get(team_id, f"T{team_id}")
    print(f"  Mapped {len(lookup)} players")
    return lookup

def fetch_savant_leaderboard(player_team_map):
    url = "https://baseballsavant.mlb.com/leaderboard/custom"
    params = {
        "year": "2025",
        "type": "batter",
        "filter": "",
        "min": "50",
        "selections": "xba,xslg,xwoba,barrel_batted_rate,hard_hit_percent,whiff_percent,oz_swing_percent,z_contact_percent,oz_contact_percent",
        "chart": "false",
        "x": "xwoba",
        "y": "xwoba",
        "r": "no",
        "chartType": "beeswarm",
        "csv": "true",
    }
    print("Fetching Savant leaderboard...")
    r = requests.get(url, params=params, headers=HEADERS)
    print(f"  Status: {r.status_code}")
    df = pd.read_csv(StringIO(r.text))
    print(f"  Players: {len(df)}")
    df["Tm"] = df["player_id"].map(player_team_map)
    df = df.dropna(subset=["Tm"])
    agg_cols = [c for c in [
        "xba", "xslg", "xwoba",
        "barrel_batted_rate", "hard_hit_percent",
        "whiff_percent", "oz_swing_percent",
        "z_contact_percent", "oz_contact_percent"
    ] if c in df.columns]
    team_df = df.groupby("Tm")[agg_cols].mean().reset_index()
    team_df.rename(columns={
        "oz_swing_percent":   "Chase%",
        "whiff_percent":      "SwStr%",
        "z_contact_percent":  "ZCon%",
        "oz_contact_percent": "OCon%",
        "barrel_batted_rate": "Barrel%",
        "hard_hit_percent":   "HardHit%",
        "xwoba":              "xwOBA",
    }, inplace=True)
    print(f"  Teams: {len(team_df)} | Cols: {list(team_df.columns)}")
    fname = os.path.join(DATA_DIR, "savant_team_leaderboard.csv")
    team_df.to_csv(fname, index=False)
    print(f"  Saved: {fname}")
    return team_df

def fetch_savant_splits(pitcher_hand=None):
    url = "https://baseballsavant.mlb.com/statcast_search/csv"
    params = {
        "all": "true",
        "hfSea": "2025|",
        "hfGT": "R|",
        "player_type": "batter",
        "group_by": "name",
        "sort_col": "pitches",
        "sort_order": "desc",
        "min_pitches": "0",
        "min_results": "0",
        "min_pas": "0",
        "type": "details",
    }
    if pitcher_hand:
        params["pitcher_throws"] = pitcher_hand
    label = f"vs_{'RHP' if pitcher_hand == 'R' else 'LHP' if pitcher_hand == 'L' else 'ALL'}"
    print(f"Fetching splits {label}...")
    r = requests.get(url, params=params, headers=HEADERS, timeout=60)
    print(f"  Status: {r.status_code} | Rows: ", end="")
    if r.status_code != 200:
        print("Error")
        return None
    df = pd.read_csv(StringIO(r.text))
    print(len(df))
    team_col = next((c for c in ["batting_team", "home_team", "team"] if c in df.columns), None)
    if not team_col:
        print("  No team column found")
        return None
    agg_cols = {c: "mean" for c in ["estimated_woba_using_speedangle", "launch_speed", "launch_angle"] if c in df.columns}
    team_df = df.groupby(team_col).agg(agg_cols).reset_index()
    team_df.rename(columns={
        team_col: "Tm",
        "estimated_woba_using_speedangle": "xwOBA",
        "launch_speed": "exit_velo",
        "launch_angle": "launch_angle",
    }, inplace=True)
    print(f"  Teams: {len(team_df)} | Cols: {list(team_df.columns)}")
    fname = os.path.join(DATA_DIR, f"savant_{label}.csv")
    team_df.to_csv(fname, index=False)
    print(f"  Saved: {fname}")
    return team_df

def run():
    player_team_map = fetch_player_team_map()
    fetch_savant_leaderboard(player_team_map)
    fetch_savant_splits("R")
    fetch_savant_splits("L")
    print("Savant scrape complete.")

if __name__ == "__main__":
    run()
