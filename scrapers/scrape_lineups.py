import requests
from bs4 import BeautifulSoup
import pandas as pd
import os
import gspread

from core.config import DATA_DIR, SHEET_ID, SHEET_TABS, check_google_credentials

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
}

def scrape_lineups():
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
                    })

        except Exception as e:
            print(f"  Error parsing {away_abbr if 'away_abbr' in dir() else '?'}: {e}")
            continue

    lineup_df = pd.DataFrame(all_lineups) if all_lineups else pd.DataFrame()
    games_df = pd.DataFrame(games) if games else pd.DataFrame()

    print(f"  Parsed {len(games_df)} games, {len(lineup_df)} player rows")
    return lineup_df, games_df

def push_to_sheets(lineup_df, games_df):
    if not check_google_credentials():
        print("  Skipping lineup/games Sheets push (credentials unavailable).")
        return

    from core.config import CREDS_FILE, SCOPES
    from google.oauth2.service_account import Credentials

    creds = Credentials.from_service_account_file(str(CREDS_FILE), scopes=SCOPES)
    client = gspread.authorize(creds)
    sheet = client.open_by_key(SHEET_ID)

    for tab_name, df in [
        (SHEET_TABS["today_lineups"], lineup_df),
        (SHEET_TABS["today_games"], games_df),
    ]:
        if df is None or df.empty:
            continue
        try:
            ws = sheet.worksheet(tab_name)
            ws.clear()
        except gspread.exceptions.WorksheetNotFound:
            ws = sheet.add_worksheet(title=tab_name, rows=300, cols=10)
        data = [df.columns.tolist()] + df.values.tolist()
        ws.update(data)
        print(f"  Pushed {tab_name}: {len(df)} rows")

def run():
    try:
        lineup_df, games_df = scrape_lineups()
    except requests.RequestException as e:
        print(f"WARNING: scrape_lineups failed - continuing ({e})")
        return

    if not lineup_df.empty:
        lineup_df.to_csv(os.path.join(DATA_DIR, "today_lineups.csv"), index=False)
        print("  Saved: today_lineups.csv")

    if not games_df.empty:
        games_df.to_csv(os.path.join(DATA_DIR, "today_games.csv"), index=False)
        print("\nGame summary:")
        print(games_df.to_string())

    push_to_sheets(lineup_df, games_df)

    # Keep Today_Matchups on the same slate as lineups (avoids stale MLB-only schedule on dashboard).
    try:
        from scrapers import scrape_matchups
        print("\nRefreshing Today_Matchups to match lineup slate...")
        scrape_matchups.run()
    except Exception as e:
        print(f"  WARNING: Today_Matchups refresh after lineups failed: {e}")

    print("\nDone.")

if __name__ == "__main__":
    run()