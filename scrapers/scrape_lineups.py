import requests
from bs4 import BeautifulSoup
import pandas as pd
import os
import gspread
from datetime import datetime
from zoneinfo import ZoneInfo
import re
import unicodedata

from core.config import DATA_DIR, SHEET_ID, SHEET_TABS, check_google_credentials
from core.slate_date import eastern_slate_date_iso

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
}

ROTOWIRE_LINEUPS_URL = "https://www.rotowire.com/baseball/daily-lineups.php"
# Overnight / early morning Rotowire still serves yesterday on the default URL while
# the next MLB slate (our eastern_slate_date_iso after 5 PM ET, or calendar today
# before Rotowire flips) lives behind ?date=tomorrow. Fetch both and keep games
# that match the MLB Stats API schedule.
ROTOWIRE_TOMORROW_URL = f"{ROTOWIRE_LINEUPS_URL}?date=tomorrow"
ET = ZoneInfo("America/New_York")

ABBR_MAP = {
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


def _parse_lineup_cards(soup, slate_date):
    """Parse Rotowire lineup cards into game + batting-order rows."""
    all_lineups = []
    games = []

    for div in soup.find_all("div", class_="lineup"):
        classes = set(div.get("class") or [])
        # Skip ads / tool chrome — not real matchup cards.
        if "is-ad" in classes or "is-tools" in classes:
            continue

        away_abbr = "?"
        home_abbr = "?"
        try:
            abbrs = div.find_all("div", class_="lineup__abbr")
            if len(abbrs) < 2:
                continue
            away_abbr = ABBR_MAP.get(abbrs[0].text.strip(), abbrs[0].text.strip())
            home_abbr = ABBR_MAP.get(abbrs[1].text.strip(), abbrs[1].text.strip())

            time_el = div.find("div", class_="lineup__time")
            game_time = time_el.text.strip() if time_el else "TBD"

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

            lists = div.find_all("ul", class_="lineup__list")
            for side_idx, ul in enumerate(lists[:2]):
                side = "AWAY" if side_idx == 0 else "HOME"
                team = away_abbr if side == "AWAY" else home_abbr
                players = ul.find_all("li", class_="lineup__player")

                for bat_order, li in enumerate(players, 1):
                    pos_el = li.find("div", class_="lineup__pos")
                    name_el = li.find("a")
                    hand_el = (
                        li.find("span", class_=lambda c: c and "lineup__bats" in c)
                        or li.find("div", class_="lineup__bats")
                    )

                    all_lineups.append({
                        "Game": f"{away_abbr}@{home_abbr}",
                        "Time": game_time,
                        "Team": team,
                        "Side": side,
                        "Bat_Order": bat_order,
                        "Position": pos_el.text.strip() if pos_el else "?",
                        "Player": name_el.text.strip() if name_el else "TBD",
                        "Bats": hand_el.text.strip() if hand_el else "?",
                        "Slate_Date": slate_date,
                    })

        except Exception as e:
            print(f"  Error parsing {away_abbr}@{home_abbr}: {e}")
            continue

    lineup_df = pd.DataFrame(all_lineups) if all_lineups else pd.DataFrame()
    games_df = pd.DataFrame(games) if games else pd.DataFrame()
    return lineup_df, games_df


def _merge_rotowire_pages(page_frames, preferred_index=None):
    """Dedupe games across pages without mixing an active slate with a stale one."""
    best_games = {}
    best_lineups = {}
    best_counts = {}

    ordered_frames = list(page_frames)
    lock_preferred = preferred_index is not None
    if lock_preferred:
        preferred = ordered_frames.pop(preferred_index)
        ordered_frames.insert(0, preferred)

    for lineup_df, games_df in ordered_frames:
        if games_df is None or games_df.empty:
            continue
        for _, g in games_df.iterrows():
            key = f"{g['Away']}@{g['Home']}"
            if lineup_df is None or lineup_df.empty:
                rows = pd.DataFrame()
            else:
                rows = lineup_df[lineup_df["Game"] == key]
            count = len(rows)
            if key not in best_counts or (not lock_preferred and count > best_counts[key]):
                best_counts[key] = count
                best_games[key] = g
                best_lineups[key] = rows

    if not best_games:
        return pd.DataFrame(), pd.DataFrame()

    games_df = pd.DataFrame(list(best_games.values())).reset_index(drop=True)
    lineup_parts = [df for df in best_lineups.values() if df is not None and not df.empty]
    lineup_df = (
        pd.concat(lineup_parts, ignore_index=True) if lineup_parts else pd.DataFrame()
    )
    return lineup_df, games_df


def _rotowire_urls_for_slate(slate_date, calendar_date=None):
    """Return Rotowire pages in active-slate priority order.

    Consecutive games in the same series share an away/home key. When the
    default and tomorrow pages are equally complete, merge ties keep the first
    page. After the 5 PM slate rollover, tomorrow must be first or yesterday's
    lineup can be relabeled as tomorrow's.
    """
    if calendar_date is None:
        calendar_date = datetime.now(ET).date().isoformat()
    if slate_date > calendar_date:
        return (ROTOWIRE_TOMORROW_URL, ROTOWIRE_LINEUPS_URL)
    return (ROTOWIRE_LINEUPS_URL, ROTOWIRE_TOMORROW_URL)


def _pitcher_surname(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    tokens = re.findall(r"[a-z]+", text)
    return tokens[-1] if tokens else ""


def _page_pitcher_match_score(games_df, api_df):
    """Score a Rotowire page against MLB's active-slate probable pitchers."""
    if games_df is None or games_df.empty or api_df is None or api_df.empty:
        return 0
    api_by_key = {
        f"{row['Away_Team']}@{row['Home_Team']}": row
        for _, row in api_df.iterrows()
    }
    score = 0
    for _, game in games_df.iterrows():
        api = api_by_key.get(f"{game['Away']}@{game['Home']}")
        if api is None:
            continue
        for side in ("Away", "Home"):
            rw_name = _pitcher_surname(game.get(f"{side}_SP"))
            api_name = _pitcher_surname(api.get(f"{side}_SP"))
            if rw_name and api_name and rw_name == api_name:
                score += 1
    return score


def scrape_lineups():
    slate_date = eastern_slate_date_iso()
    print("Fetching Rotowire lineups...")
    page_frames = []

    for url in _rotowire_urls_for_slate(slate_date):
        label = url.split("daily-lineups.php")[-1] or " (default)"
        r = requests.get(url, headers=HEADERS, timeout=30)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        lineup_df, games_df = _parse_lineup_cards(soup, slate_date)
        print(
            f"  {label}: status {r.status_code}, "
            f"{len(games_df)} games, {len(lineup_df)} player rows"
        )
        page_frames.append((lineup_df, games_df))

    preferred_index = None
    try:
        from scrapers.scrape_matchups import get_today_schedule

        api_df = get_today_schedule()
        scores = [_page_pitcher_match_score(games, api_df) for _, games in page_frames]
        if scores and max(scores) > 0:
            preferred_index = scores.index(max(scores))
            print(
                "  Active-slate pitcher match scores: "
                + ", ".join(str(score) for score in scores)
                + f" -> preferring page {preferred_index + 1}"
            )
    except Exception as exc:
        print(f"  WARNING: Rotowire page scoring skipped ({exc})")

    lineup_df, games_df = _merge_rotowire_pages(page_frames, preferred_index)
    print(f"  Merged Rotowire pages: {len(games_df)} games, {len(lineup_df)} player rows")
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
