import requests
import pandas as pd
from datetime import datetime, timedelta, timezone
import os
import gspread

from core.config import DATA_DIR, SHEET_ID, SHEET_TABS, TEAM_MAP, check_google_credentials
from core.compute_pitching import calc_individual_pitching_scores
from core.name_utils import normalize_player_name, player_last_name
from core.slate_date import eastern_slate_date_iso

HEADERS = {
    "User-Agent": "Mozilla/5.0"
}

def get_today_schedule():
    today = eastern_slate_date_iso()
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
    scores = calc_individual_pitching_scores(df)
    if not scores.empty:
        score_map = scores.set_index("Name")["PitchScore"]
        df = df.copy()
        df["PitchScore"] = df["Name"].map(score_map)
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

def _empty_sp_stats():
    return {
        "K%": "--", "BB%": "--", "HR/9": "--", "WHIP": "--",
        "FIP": "--", "IP": "--", "PitchScore": None,
    }


def get_sp_stats(sp_name, sp_df, team=None):
    if sp_df.empty or sp_name == "TBD":
        return _empty_sp_stats()

    target = normalize_player_name(sp_name)
    names = sp_df["Name"].map(normalize_player_name)
    match = sp_df[names == target]
    if match.empty:
        last = player_last_name(sp_name)
        match = sp_df[sp_df["Name"].map(player_last_name) == last]
        if team and "Tm" in match.columns:
            team_match = match[match["Tm"].astype(str).str.upper() == str(team).upper()]
            if not team_match.empty:
                match = team_match
    if match.empty:
        return _empty_sp_stats()
    if len(match) > 1:
        return _empty_sp_stats()
    row = match.iloc[0]
    return {
        "K%": row.get("K%", "--"),
        "BB%": row.get("BB%", "--"),
        "HR/9": row.get("HR/9", "--"),
        "WHIP": row.get("WHIP", "--"),
        "FIP": row.get("FIP", "--"),
        "IP": row.get("IP", "--"),
        "PitchScore": row.get("PitchScore"),
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

def _today_iso():
    return eastern_slate_date_iso()


def _df_matches_today(df, date_col="Slate_Date"):
    if df is None or df.empty or date_col not in df.columns:
        return True
    today = _today_iso()
    dates = df[date_col].astype(str).str.slice(0, 10)
    if not dates.str.match(r"^\d{4}-\d{2}-\d{2}$").any():
        return True
    return bool(dates.eq(today).any())


def load_games_from_rotowire_exports():
    """Schedule from scrape_lineups (Today_Games / today_lineups) — must match lineup cards."""
    games_path = os.path.join(DATA_DIR, "today_games.csv")
    if os.path.exists(games_path):
        gdf = pd.read_csv(games_path)
        if not _df_matches_today(gdf):
            print(f"  WARNING: today_games.csv Slate_Date is not {_today_iso()} — ignoring stale export")
            gdf = pd.DataFrame()
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
    if not _df_matches_today(lu):
        print(f"  WARNING: today_lineups.csv Slate_Date is not {_today_iso()} — ignoring stale export")
        return pd.DataFrame()
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


def enrich_games_with_api_pitchers(games_df, api_games):
    """Fill SP names/hands from MLB API when Rotowire rows are TBD or default R."""
    if games_df is None or games_df.empty:
        return games_df
    if api_games is None or api_games.empty:
        return games_df
    api_by_key = {}
    for _, row in api_games.iterrows():
        api_by_key[f"{row['Away_Team']}@{row['Home_Team']}"] = row
    records = []
    for _, g in games_df.iterrows():
        rec = g.to_dict()
        api = api_by_key.get(f"{rec['Away_Team']}@{rec['Home_Team']}")
        if api is None:
            records.append(rec)
            continue
        for side in ("Away", "Home"):
            sp_col = f"{side}_SP"
            hand_col = f"{side}_SP_Hand"
            api_sp = str(api.get(sp_col, "TBD")).strip()
            api_hand = str(api.get(hand_col, "R")).strip() or "R"
            cur_sp = str(rec.get(sp_col, "TBD")).strip()
            if cur_sp in ("", "TBD", "nan", "None") and api_sp not in ("", "TBD"):
                rec[sp_col] = api_sp
            if api_hand in ("L", "R"):
                rec[hand_col] = api_hand
        records.append(rec)
    return pd.DataFrame(records)


def resolve_slate_games(rotowire, api_games):
    """The MLB Stats API schedule is the AUTHORITATIVE game set for today.

    Rotowire/lineup exports only ENRICH that set (SP names, times) — they must
    never decide *which* games are today. Trusting Rotowire wholesale is exactly
    how yesterday's stale exported games leaked onto today's slate. So we reconcile:
    keep Rotowire rows that are on today's real schedule, drop ones that aren't,
    and add any real games Rotowire missed. Only if the API is unreachable do we
    fall back to the (unverified) Rotowire slate.
    """
    if rotowire is None:
        rotowire = pd.DataFrame()
    if api_games is None:
        api_games = pd.DataFrame()

    # API down/empty -> best-effort fallback to whatever Rotowire we have.
    if api_games.empty:
        if not rotowire.empty:
            print(f"  WARNING: MLB API schedule empty -> using Rotowire slate "
                  f"({len(rotowire)} games) UNVERIFIED against the live schedule")
            return rotowire.copy()
        print("  No Rotowire export and MLB API schedule empty")
        return pd.DataFrame()

    api_keyed = {f"{r['Away_Team']}@{r['Home_Team']}": r for _, r in api_games.iterrows()}
    api_keys = set(api_keyed)

    if rotowire.empty:
        print(f"  No Rotowire export -> using live MLB API schedule ({len(api_keys)} games)")
        return api_games.copy()

    rw_keyed = {f"{r['Away_Team']}@{r['Home_Team']}": r for _, r in rotowire.iterrows()}
    rw_keys = set(rw_keyed)

    stale = sorted(rw_keys - api_keys)      # Rotowire games NOT on today's real schedule
    missing = sorted(api_keys - rw_keys)    # real games Rotowire lacks

    # Keep Rotowire data for games that are genuinely on today's schedule, in
    # schedule order; append any real games Rotowire missed (from the API).
    kept = [rw_keyed[k] for k in sorted(rw_keys & api_keys)] + [api_keyed[k] for k in missing]

    if stale:
        print(f"  Dropped {len(stale)} stale Rotowire game(s) NOT on today's MLB "
              f"schedule: {', '.join(stale[:8])}")
    if missing:
        print(f"  Added {len(missing)} real game(s) from MLB API that Rotowire "
              f"lacked: {', '.join(missing[:8])}")
    print(f"  Slate reconciled to the MLB schedule: {len(kept)} games "
          f"(API authoritative = {len(api_keys)})")
    return pd.DataFrame(kept).reset_index(drop=True)


def build_matchups():
    print("Building matchup sheet...")
    rotowire = load_games_from_rotowire_exports()
    api_games = get_today_schedule()
    games = resolve_slate_games(rotowire, api_games)
    games = enrich_games_with_api_pitchers(games, api_games)
    if games.empty:
        print("No games today")
        return pd.DataFrame()

    sp_df = load_sp_stats()
    ps_df = load_pitching_scores()
    rhp_df, lhp_df = load_osi()

    rows = []
    for _, g in games.iterrows():
        away_stats = get_sp_stats(g["Away_SP"], sp_df, g["Away_Team"])
        home_stats = get_sp_stats(g["Home_SP"], sp_df, g["Home_Team"])

        # Lineup OSI vs opposing SP handedness
        away_lineup_osi = get_team_osi(g["Away_Team"], g["Home_SP_Hand"], rhp_df, lhp_df)
        home_lineup_osi = get_team_osi(g["Home_Team"], g["Away_SP_Hand"], rhp_df, lhp_df)

        # Keep full-staff strength separate from each probable starter's score.
        away_team_pitch_score = get_pitch_score(g["Away_Team"], ps_df)
        home_team_pitch_score = get_pitch_score(g["Home_Team"], ps_df)
        away_pitch_score = away_stats["PitchScore"]
        home_pitch_score = home_stats["PitchScore"]

        # Edge
        if away_lineup_osi and home_lineup_osi:
            edge_team = g["Away_Team"] if away_lineup_osi > home_lineup_osi else g["Home_Team"]
            edge_gap = abs((away_lineup_osi or 0) - (home_lineup_osi or 0))
            edge = f"{edge_team} +{edge_gap:.1f}"
        else:
            edge = "--"

        rows.append({
            "Slate_Date": _today_iso(),
            "Time": g["Game_Time"],
            "Away": g["Away_Team"],
            "Home": g["Home_Team"],
            "Away_SP": g["Away_SP"],
            "Away_Hand": g["Away_SP_Hand"],
            "Away_K%": away_stats["K%"],
            "Away_BB%": away_stats["BB%"],
            "Away_HR9": away_stats["HR/9"],
            "Away_WHIP": away_stats["WHIP"],
            "Away_FIP": away_stats["FIP"],
            "Away_PitchScore": away_pitch_score,
            "Away_Team_PitchScore": away_team_pitch_score,
            "Home_SP": g["Home_SP"],
            "Home_Hand": g["Home_SP_Hand"],
            "Home_K%": home_stats["K%"],
            "Home_BB%": home_stats["BB%"],
            "Home_HR9": home_stats["HR/9"],
            "Home_WHIP": home_stats["WHIP"],
            "Home_FIP": home_stats["FIP"],
            "Home_PitchScore": home_pitch_score,
            "Home_Team_PitchScore": home_team_pitch_score,
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
        return False
    if not check_google_credentials():
        print("  Skipping Today_Matchups push (credentials unavailable).")
        return False

    from core.config import CREDS_FILE, SCOPES
    from google.oauth2.service_account import Credentials
    from outputs.push_sheets import push_df

    creds = Credentials.from_service_account_file(str(CREDS_FILE), scopes=SCOPES)
    client = gspread.authorize(creds)
    sheet = client.open_by_key(SHEET_ID)

    tab = SHEET_TABS["today_matchups"]
    return push_df(
        sheet,
        tab,
        df,
        required_cols=["Slate_Date", "Away", "Home", "Away_SP", "Home_SP"],
    )

def clear_matchups_sheet():
    if not check_google_credentials():
        print("  Skipping Today_Matchups clear (credentials unavailable).")
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
        ws.update([["Slate_Date", "Time", "Away", "Home", "Away_SP", "Away_Hand", "Home_SP", "Home_Hand"]])
        print(f"  Cleared {tab} (no games today)")
    except gspread.exceptions.WorksheetNotFound:
        pass


def push_to_hub(df):
    """Mirror the freshly-built slate straight into Supabase hub_dataset.

    The dashboard reads Today_Matchups from the hub first (Google Sheets is the fallback),
    so this keeps the slate current even when the Sheets service-account write is missing
    or fails — the silent failure mode that left chase-analytics stuck on the prior day's
    pitchers. Runs independently of push_to_sheets: either path can fail without taking the
    slate stale. Best-effort: a hub miss is logged, never fatal here (the end-of-run
    guardrail in pipeline.main is what makes a truly stale slate loud).
    """
    if df.empty:
        return False
    try:
        from outputs.push_supabase import upsert_dataset
        from outputs.validate import check_rows, reject
    except Exception as exc:
        print(f"  WARNING: hub slate push unavailable ({exc}); slate will rely on Sheets")
        return False
    rows = [
        {str(k): ("" if v is None else str(v)) for k, v in record.items()}
        for record in df.fillna("--").to_dict("records")
    ]
    tab = SHEET_TABS["today_matchups"]
    problems = check_rows(
        tab,
        rows,
        required_keys=["Slate_Date", "Away", "Home", "Away_SP", "Home_SP"],
    )
    if problems:
        reject(f"hub_dataset[{tab}]", problems)
        return False
    try:
        upsert_dataset(tab, rows)
        print(f"  Pushed hub_dataset[{tab}]: {len(rows)} games (slate decoupled from Sheets)")
        return True
    except Exception as exc:
        print(f"  WARNING: hub slate push failed ({exc}); slate will rely on Sheets")
        return False


def run(touch_sync: bool = True):
    df = build_matchups()
    if not df.empty:
        fname = os.path.join(DATA_DIR, "today_matchups.csv")
        df.to_csv(fname, index=False)
        print(f"  Saved: {fname}")
        push_to_sheets(df)
        push_to_hub(df)
        print("\nMatchup sheet:")
        print(df[["Time", "Away", "Home", "Away_SP", "Away_Hand", "Home_SP", "Home_Hand", "Away_OSI", "Home_OSI", "Lineup_Edge"]].to_string())
    else:
        stale_path = os.path.join(DATA_DIR, "today_matchups.csv")
        if os.path.exists(stale_path):
            os.remove(stale_path)
            print("  Removed stale today_matchups.csv")
        clear_matchups_sheet()
    if touch_sync:
        try:
            from outputs.push_sheets import touch_last_updated
            touch_last_updated("Today_Matchups slate")
        except Exception as e:
            print(f"  WARNING: Last_Updated touch after matchups failed: {e}")
    print("\nDone.")

if __name__ == "__main__":
    run()
