"""
Fetch weather for today's MLB games via MLB Stats API (schedule/venue) and wttr.in.
"""

import os
import time
from datetime import datetime

import gspread
import pandas as pd
import requests
from google.oauth2.service_account import Credentials

from core.config import DATA_DIR, SHEET_ID, SHEET_TABS, TEAM_MAP, check_google_credentials

HEADERS = {
    "User-Agent": "curl/8.0 (compatible; MLBMA-Pipeline/1.0)",
}

# Fixed or primary indoor venues (schedule venue feed often lacks roofType)
DOME_STADIUM_KEYWORDS = (
    "tropicana field",
    "rogers centre",
    "rogers center",
)

WTTR_DELAY_SEC = 1.0


def normalize_conditions(desc: str) -> str:
    d = (desc or "").lower().strip()
    if any(x in d for x in ("thunder", "storm")):
        return "storm"
    if any(x in d for x in ("rain", "drizzle", "shower")):
        return "rain"
    if any(x in d for x in ("snow", "sleet", "flurr")):
        return "snow"
    if any(x in d for x in ("cloud", "overcast", "fog", "mist", "haze")):
        return "cloudy"
    if any(x in d for x in ("partly", "sunny", "clear")):
        return "clear" if "cloud" not in d else "cloudy"
    return "clear"


def is_dome_venue(venue: dict) -> bool:
    name = (venue.get("name") or "").lower()
    if any(k in name for k in DOME_STADIUM_KEYWORDS):
        return True
    roof = (venue.get("fieldInfo") or {}).get("roofType", "")
    return roof == "Dome"


def get_today_games():
    today = datetime.now().strftime("%Y-%m-%d")
    url = (
        f"https://statsapi.mlb.com/api/v1/schedule?sportId=1&date={today}"
        f"&hydrate=team,venue"
    )
    print(f"Fetching schedule for {today}...")
    try:
        r = requests.get(url, headers=HEADERS, timeout=30)
        r.raise_for_status()
        data = r.json()
    except requests.RequestException as e:
        print(f"  WARNING: schedule fetch failed: {e}")
        return []

    games = []
    for date_block in data.get("dates", []):
        for game in date_block.get("games", []):
            status = game.get("status", {}).get("abstractGameState", "")
            if status in ("Cancelled", "Postponed"):
                continue
            try:
                away_name = game["teams"]["away"]["team"]["name"]
                home_name = game["teams"]["home"]["team"]["name"]
                games.append({
                    "game_id": game["gamePk"],
                    "away_team": TEAM_MAP.get(away_name, away_name[:3].upper()),
                    "home_team": TEAM_MAP.get(home_name, home_name[:3].upper()),
                    "venue_id": game.get("venue", {}).get("id"),
                    "stadium_name": game.get("venue", {}).get("name", "Unknown"),
                })
            except (KeyError, TypeError) as e:
                print(f"  Error parsing game: {e}")
    print(f"  Found {len(games)} games")
    return games


def fetch_venue_detail(game_id: int, cache: dict) -> dict:
    if game_id in cache:
        return cache[game_id]
    url = f"https://statsapi.mlb.com/api/v1.1/game/{game_id}/feed/live"
    try:
        r = requests.get(url, headers=HEADERS, timeout=30)
        r.raise_for_status()
        venue = r.json().get("gameData", {}).get("venue", {}) or {}
    except requests.RequestException as e:
        print(f"  WARNING: venue feed failed for game {game_id}: {e}")
        venue = {}
    cache[game_id] = venue
    return venue


def venue_city_query(venue: dict) -> str:
    loc = venue.get("location") or {}
    city = loc.get("city") or ""
    state = loc.get("stateAbbrev") or loc.get("state") or ""
    if city and state:
        return f"{city},{state}"
    return city or venue.get("name", "Unknown")


def fetch_weather(city_query: str) -> dict:
    loc = city_query.replace(",", " ").replace(" ", "+")
    url = f"https://wttr.in/{loc}?format=j1"
    try:
        r = requests.get(url, headers=HEADERS, timeout=20)
        r.raise_for_status()
    except requests.RequestException as e:
        raise RuntimeError(f"wttr.in request failed for {city_query}: {e}") from e
    data = r.json()
    current = (data.get("current_condition") or [{}])[0]
    desc = ""
    wdesc = current.get("weatherDesc")
    if wdesc and isinstance(wdesc, list):
        desc = wdesc[0].get("value", "")
    temp_f = current.get("temp_F", "")
    wind_mph = current.get("windspeedMiles", "")
    wind_dir = current.get("winddir16Point", "")
    return {
        "temperature_f": int(temp_f) if str(temp_f).isdigit() else temp_f,
        "wind_speed_mph": int(wind_mph) if str(wind_mph).isdigit() else wind_mph,
        "wind_direction": wind_dir,
        "conditions": normalize_conditions(desc),
        "conditions_raw": desc.strip(),
    }


def build_weather_rows(games: list) -> pd.DataFrame:
    venue_cache = {}
    weather_cache = {}
    rows = []

    for g in games:
        game_id = g["game_id"]
        try:
            venue = fetch_venue_detail(game_id, venue_cache)
        except Exception as e:
            print(f"  WARNING: skipping venue for {g['away_team']}@{g['home_team']}: {e}")
            venue = {}
        city = venue_city_query(venue) or g.get("stadium_name", "Unknown")
        stadium = venue.get("name") or g["stadium_name"]
        dome = is_dome_venue(venue) if venue else False

        row = {
            "game_id": game_id,
            "away_team": g["away_team"],
            "home_team": g["home_team"],
            "stadium_name": stadium,
            "city": city.split(",")[0] if city else "",
            "temperature_f": None,
            "wind_speed_mph": None,
            "wind_direction": None,
            "conditions": "dome" if dome else None,
            "is_dome": dome,
        }

        if dome:
            print(f"  {g['away_team']}@{g['home_team']}: {stadium} (dome -- skipping outdoor weather)")
            rows.append(row)
            continue

        if city not in weather_cache:
            try:
                print(f"  Fetching weather for {city}...")
                weather_cache[city] = fetch_weather(city)
                time.sleep(WTTR_DELAY_SEC)
            except Exception as e:
                print(f"  WARNING: weather failed for {city}: {e}")
                weather_cache[city] = {}

        w = weather_cache.get(city, {})
        row["temperature_f"] = w.get("temperature_f")
        row["wind_speed_mph"] = w.get("wind_speed_mph")
        row["wind_direction"] = w.get("wind_direction")
        row["conditions"] = w.get("conditions")
        rows.append(row)

    return pd.DataFrame(rows)


def push_to_sheets(df: pd.DataFrame):
    if df.empty:
        print("No weather data to push")
        return
    if not check_google_credentials():
        print("  Skipping Weather push (credentials unavailable).")
        return

    from core.config import CREDS_FILE, SCOPES
    from google.oauth2.service_account import Credentials

    creds = Credentials.from_service_account_file(str(CREDS_FILE), scopes=SCOPES)
    client = gspread.authorize(creds)
    sheet = client.open_by_key(SHEET_ID)

    tab = SHEET_TABS["weather"]
    try:
        ws = sheet.worksheet(tab)
        ws.clear()
    except gspread.exceptions.WorksheetNotFound:
        ws = sheet.add_worksheet(title=tab, rows=50, cols=15)

    df_out = df.fillna("--")
    data = [df_out.columns.tolist()] + df_out.values.tolist()
    ws.update(data)
    print(f"  Pushed {tab}: {len(df)} games")


def run():
    games = get_today_games()
    if not games:
        print("No games today -- skipping weather scrape")
        return

    print("Building weather data...")
    df = build_weather_rows(games)

    out = os.path.join(DATA_DIR, "today_weather.csv")
    df.to_csv(out, index=False)
    print(f"Saved: {out}")

    if not df.empty:
        print()
        print(df.to_string(index=False))

    push_to_sheets(df)
    print("\nWeather scrape complete.")


if __name__ == "__main__":
    run()
