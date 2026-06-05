import requests
from bs4 import BeautifulSoup
import pandas as pd
import os
import gspread
from datetime import datetime

from core.config import DATA_DIR, SHEET_ID, SHEET_TABS, check_google_credentials
from core.slate_date import eastern_slate_date_iso

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
}

def scrape_lineups():
    slate_date = eastern_slate_date_iso()
    print("Fetching Rotowire lineups...")
    r = requests.get(
        "https://www.rotowire.com/baseball/daily-lineups.php",
        headers=HEADERS,
        timeout=30,
    )
    r.raise_for_status()
    print(f"  Status: {r.status_code}")
    soup = BeautifulSoup(r.text, "html.parser")
    lineup_divs = soup.find_all("div", class_="lineup")
    print(f"  Found {len(lineup_divs)} lineup cards")

    all_lineups = []
    games = []

    for div in lineup_divs:
        try:
            # Get team abbreviations
            abbrs = div.find_all("div", class_="lineup__abbr")
            if len(abbrs) < 2:
                continue
            away_abbr = abbrs[0].text.strip()
            home_abbr = abbrs[1].text.strip()
            # Normalize to our standard abbreviations
            abbr_fix = {
                "TB": "TBR",
                "WSH": "WSN",
                "KC": "KCR",
                "CWS": "CHW",
                "SD": "SDP",
                "SF": "SFG",
                "OAK": "ATH",
                "AZ": "ARI",
                "FLA": "MIA",
            }
            away_abbr = abbr_fix.get(away_abbr, away_abbr)
            home_abbr = abbr_fix.get(home_abbr, home_abbr)

            # Get game time
            time_el = div.find("div", class_="lineup__time")
            game_time = time_el.text.strip() if time_el else "TBD"

            # Get starting pitchers
            away_sp = "TBD"
            home_sp = "TBD"
            sp_names = div.select("div.lineup__main .lineup__player-highlight a")
            if len(sp_names) >= 2:
                away_sp = sp_names[0].text.strip()
                home_sp = sp_names[1].text.strip()
            elif len(sp_names) == 1:
                away_sp = sp_names[0].text.strip()

            games.append({
                "Away": away_abbr,
                "Home": home_abbr,
                "Time": game_time,
                "Away_SP": away_sp,
                "Home_SP": home_sp,
                "Slate_Date": slate_date,
            })

            # Get batting orders
            lists = div.find_all("ul", class_="lineup__list")
            for side_idx, ul in enumerate(lists[:2]):
                side = "AWAY" if side_idx == 0 else "HOME"
                team = away_abbr if side == "AWAY" else home_abbr
                players = ul.find_all("li", class_="lineup__player")

                for bat_order, li in enumerate(players, 1):
                    pos_el = li.find("div", class_="lineup__pos")
                    name_el = li.find("a")
                    hand_el = li.find("span", class_=lambda c: c and "lineup__bats" in c) or li.find("div", class_="lineup__bats")

                    pos = pos_el.text.strip() if pos_el else "?"
                    name = name_el.text.strip() if name_el else "TBD"
                    hand = hand_el.text.strip() if hand_el else "?"

                    all_lineups.append({
                        "Game": f"{away_abbr}@{home_abbr}",
                        "Time": game_time,
                        "Team": team,
                        "Side": side,
                        "Bat_Order": bat_order,
                        "Position": pos,
                        "Player": name,
                        "Bats": hand,
                        "Slate_Date": slate_date,
                    })

        except Exception as e:
            print(f"  Error parsing {away_abbr if 'away_abbr' in dir() else '?'}: {e}")
            continue

    lineup_df = pd.DataFrame(all_lineups) if all_lineups else pd.DataFrame()
    games_df = pd.DataFrame(games) if games else pd.DataFrame()

    print(f"  Parsed {len(games_df)} games, {len(lineup_df)} player rows")
    return lineup_df, games_df


def reconcile_slate_with_api(lineup_df, games_df):
    """MLB Stats API is authoritative for which games are on today's slate.

    Rotowire keeps stale/next-day lineup cards on the page, which is why the
    dashboard matchup cards were showing yesterday's games. Drop any Rotowire
    game not on the API schedule, and add API games Rotowire is missing so the
    slate (today_games.csv -> Today_Games sheet) always matches the real slate.
    """
    try:
        from scrapers.scrape_matchups import get_today_schedule
        api_df = get_today_schedule()
    except Exception as e:
        print(f"  WARNING: schedule reconcile skipped ({e}) - using Rotowire slate as-is")
        return lineup_df, games_df

    if api_df is None or api_df.empty:
        print("  WARNING: MLB API returned no games - keeping Rotowire slate unverified")
        return lineup_df, games_df

    api_keys = {f"{r.Away_Team}@{r.Home_Team}" for r in api_df.itertuples()}
    slate_date = eastern_slate_date_iso()

    # Drop stale Rotowire games not on the authoritative schedule
    if not games_df.empty:
        rw_keys = {f"{r.Away}@{r.Home}" for r in games_df.itertuples()}
        stale = sorted(rw_keys - api_keys)
        if stale:
            print(f"  Dropping {len(stale)} stale Rotowire game(s): {', '.join(stale)}")
        games_df = games_df[games_df.apply(
            lambda x: f"{x['Away']}@{x['Home']}" in api_keys, axis=1)].copy()

    # Add API games Rotowire is missing (no lineups yet, but slate must be complete)
    present = {f"{r.Away}@{r.Home}" for r in games_df.itertuples()} if not games_df.empty else set()
    add_rows = []
    for r in api_df.itertuples():
        key = f"{r.Away_Team}@{r.Home_Team}"
        if key not in present:
            add_rows.append({
                "Away": r.Away_Team,
                "Home": r.Home_Team,
                "Time": getattr(r, "Game_Time", "TBD"),
                "Away_SP": getattr(r, "Away_SP", "TBD"),
                "Home_SP": getattr(r, "Home_SP", "TBD"),
                "Slate_Date": slate_date,
            })
    if add_rows:
        added = ', '.join(f"{r['Away']}@{r['Home']}" for r in add_rows)
        print(f"  Adding {len(add_rows)} API game(s) missing from Rotowire: {added}")
        games_df = pd.concat([games_df, pd.DataFrame(add_rows)], ignore_index=True)

    # Filter lineups to the authoritative slate (drop stale-game lineup rows)
    if not lineup_df.empty:
        lineup_df = lineup_df[lineup_df["Game"].isin(api_keys)].copy()

    print(f"  Reconciled slate: {len(api_keys)} authoritative game(s)")
    return lineup_df, games_df


def clear_sheet_tab(tab_name, header_row):
    if not check_google_credentials():
        print(f"  Skipping {tab_name} clear (credentials unavailable).")
        return
    from core.config import CREDS_FILE, SCOPES
    from google.oauth2.service_account import Credentials

    creds = Credentials.from_service_account_file(str(CREDS_FILE), scopes=SCOPES)
    client = gspread.authorize(creds)
    sheet = client.open_by_key(SHEET_ID)
    try:
        ws = sheet.worksheet(tab_name)
        ws.clear()
        ws.update([header_row])
        print(f"  Cleared {tab_name} (no slate data)")
    except gspread.exceptions.WorksheetNotFound:
        pass


def remove_stale_slate_files():
    for fname in ("today_lineups.csv", "today_games.csv"):
        path = os.path.join(DATA_DIR, fname)
        if os.path.exists(path):
            os.remove(path)
            print(f"  Removed stale {fname}")


def push_to_sheets(lineup_df, games_df):
    if not check_google_credentials():
        print("  Skipping lineup/games Sheets push (credentials unavailable).")
        return

    from core.config import CREDS_FILE, SCOPES
    from google.oauth2.service_account import Credentials

    creds = Credentials.from_service_account_file(str(CREDS_FILE), scopes=SCOPES)
    client = gspread.authorize(creds)
    sheet = client.open_by_key(SHEET_ID)

    payloads = [
        (SHEET_TABS["today_lineups"], lineup_df, ["Game", "Time", "Team", "Side", "Bat_Order", "Position", "Player", "Bats", "Slate_Date"]),
        (SHEET_TABS["today_games"], games_df, ["Away", "Home", "Time", "Away_SP", "Home_SP", "Slate_Date"]),
    ]
    for tab_name, df, header_row in payloads:
        try:
            ws = sheet.worksheet(tab_name)
            ws.clear()
        except gspread.exceptions.WorksheetNotFound:
            ws = sheet.add_worksheet(title=tab_name, rows=300, cols=12)
        if df is None or df.empty:
            ws.update([header_row])
            print(f"  Cleared {tab_name} (empty slate)")
            continue
        data = [df.columns.tolist()] + df.values.tolist()
        ws.update(data)
        print(f"  Pushed {tab_name}: {len(df)} rows")

def run():
    try:
        lineup_df, games_df = scrape_lineups()
    except Exception as e:
        # Any lineup-scrape failure (network, parse, etc.): clear the stale slate
        # so the dashboard never shows old games, and still rebuild Today_Matchups
        # from the authoritative MLB schedule below.
        print(f"WARNING: scrape_lineups failed - clearing stale slate ({e})")
        remove_stale_slate_files()
        clear_sheet_tab(SHEET_TABS["today_lineups"], ["Game", "Time", "Team", "Side", "Bat_Order", "Position", "Player", "Bats", "Slate_Date"])
        clear_sheet_tab(SHEET_TABS["today_games"], ["Away", "Home", "Time", "Away_SP", "Home_SP", "Slate_Date"])
        try:
            from scrapers import scrape_matchups
            scrape_matchups.run(touch_sync=False)
        except Exception as ex:
            print(f"  WARNING: Today_Matchups clear after lineup failure failed: {ex}")
        return

    # Make the MLB Stats API authoritative for the slate before anything is saved
    # or pushed, so the dashboard cards can never show stale/next-day Rotowire games.
    lineup_df, games_df = reconcile_slate_with_api(lineup_df, games_df)

    if not lineup_df.empty:
        lineup_df.to_csv(os.path.join(DATA_DIR, "today_lineups.csv"), index=False)
        print("  Saved: today_lineups.csv")
    else:
        remove_stale_slate_files()

    if not games_df.empty:
        games_df.to_csv(os.path.join(DATA_DIR, "today_games.csv"), index=False)
        print("\nGame summary:")
        print(games_df.to_string())

    push_to_sheets(lineup_df, games_df)

    # Keep Today_Matchups on the same slate as lineups (avoids stale MLB-only schedule on dashboard).
    try:
        from scrapers import scrape_matchups
        print("\nRefreshing Today_Matchups to match lineup slate...")
        scrape_matchups.run(touch_sync=False)
    except Exception as e:
        print(f"  WARNING: Today_Matchups refresh after lineups failed: {e}")

    try:
        from outputs.push_sheets import touch_last_updated
        touch_last_updated("Rotowire lineups + Today_Matchups")
    except Exception as e:
        print(f"  WARNING: Last_Updated touch after lineups failed: {e}")

    print("\nDone.")

if __name__ == "__main__":
    run()