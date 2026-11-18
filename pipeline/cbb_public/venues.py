"""Where each CBB game is played, and what the trip into it looked like.

The 2026-11-18 audit found CBB the one desk with no rest, travel or venue
context. Each schedule row names its venue's city and state; a city is
geocoded once (Open-Meteo's free geocoder: latitude, longitude, elevation,
time zone) and kept in pipeline/cbb_public/venue_geo.json, so a run asks only
for places it has never seen. From the schedule and those places, each side
of a game gets the same schedule-load facts the NBA desk shows: rest, games
in the last seven days, miles into tonight and over the week, time zones
crossed, and whether the visitor plays at altitude.
"""
from __future__ import annotations

import json
import math
import time
import urllib.parse
import urllib.request
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

CACHE = Path(__file__).resolve().parent / "venue_geo.json"
GEOCODER = "https://geocoding-api.open-meteo.com/v1/search"
HEADERS = {"User-Agent": "ChaseAnalytics/1.0 (+https://chase-analytics.com)"}
ALTITUDE_FT = 4000  # Denver, Salt Lake, Laramie, Albuquerque, Boulder, Provo, Bozeman, Reno...
STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado",
    "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts",
    "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana",
    "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico",
    "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota",
    "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming", "PR": "Puerto Rico",
}
# Canadian provinces as the schedule writes them; matched by region name.
PROVINCES = {"PQ": "Quebec", "QC": "Quebec", "ON": "Ontario", "BC": "British Columbia"}
# A neighbourhood the geocoder files under its borough.
PLACE_NAMES = {("Riverdale", "NY"): "Bronx"}
# Early-season tournament sites the geocoder does not resolve.
KNOWN_PLACES = {
    "Charlotte Amalie, Virgin Islands": {"lat": 18.3419, "lon": -64.9307, "elevation_ft": 30, "timezone": "America/St_Thomas"},
    "Saint Thomas, Virgin Islands": {"lat": 18.3419, "lon": -64.9307, "elevation_ft": 30, "timezone": "America/St_Thomas"},
    "George Town, Cayman Islands": {"lat": 19.2869, "lon": -81.3674, "elevation_ft": 10, "timezone": "America/Cayman"},
}


def place_key(city: str | None, state: str | None) -> str | None:
    if not city:
        return None
    return f"{city.strip()}, {(state or '').strip()}".strip(", ")


def geocode(city: str, state: str, fetch=None) -> dict | None:
    """{lat, lon, elevation_ft, timezone} for a venue city, or None.

    A US state code must match the result's region; a non-US place (the
    schedule writes "Italy", "Bahamas") is matched by country name."""
    params = {"name": PLACE_NAMES.get((city, state), city), "count": 100, "language": "en", "format": "json"}
    region = STATES.get(state.upper()) if state else None
    province = PROVINCES.get(state.upper()) if state else None
    if region:
        params["countryCode"] = "US"
    url = GEOCODER + "?" + urllib.parse.urlencode(params)
    if fetch is None:
        with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=30) as r:
            payload = json.loads(r.read().decode("utf-8"))
    else:
        payload = fetch(url)
    for hit in payload.get("results") or []:
        if region and hit.get("admin1") != region:
            continue
        if province and hit.get("admin1") != province:
            continue
        if not region and not province and state and not any(
                state.lower() in str(hit.get(k) or "").lower() for k in ("country", "admin1")):
            continue
        return {"lat": hit["latitude"], "lon": hit["longitude"],
                "elevation_ft": round(float(hit.get("elevation") or 0) * 3.28084),
                "timezone": hit.get("timezone")}
    return None


def load_places(schedule: list[dict], path: Path = CACHE, fetch=None, pause: float = 0.2) -> dict:
    """Every schedule venue city's place, geocoding only the new ones."""
    places = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    wanted = {place_key(g.get("venue_address_city"), g.get("venue_address_state")):
              (g.get("venue_address_city"), g.get("venue_address_state")) for g in schedule}
    asked = 0
    for key, place in KNOWN_PLACES.items():
        if key in wanted and not places.get(key):
            places[key] = place
            asked += 1
    # A place the geocoder could not resolve is asked again on a later run.
    for key, (city, state) in sorted((k, v) for k, v in wanted.items() if k and not places.get(k)):
        try:
            places[key] = geocode(city, state or "", fetch)
        except Exception as error:  # noqa: BLE001 - an unreachable geocoder leaves the place unknown
            print(f"  venue {key}: geocoder unavailable ({error})")
            continue
        asked += 1
        if fetch is None:
            time.sleep(pause)
    if asked:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(dict(sorted(places.items())), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"  venues: {asked} new places geocoded, {len(places)} known")
    return places


def miles(a: dict | None, b: dict | None) -> float | None:
    if not a or not b:
        return None
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    dp, dl = p2 - p1, math.radians(b["lon"] - a["lon"])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 3958.8 * 2 * math.asin(math.sqrt(h))


def utc_hours(place: dict | None, day: str) -> float | None:
    if not place or not place.get("timezone"):
        return None
    try:
        offset = datetime.combine(date.fromisoformat(day), datetime.min.time(),
                                  ZoneInfo(place["timezone"])).utcoffset()
    except Exception:  # noqa: BLE001 - an unknown zone name leaves the shift unknown
        return None
    return offset.total_seconds() / 3600 if offset is not None else None


def team_finals(schedule: list[dict]) -> dict[int, list[dict]]:
    """{team id: its finals, oldest first}, built once for every game's load."""
    index: dict[int, list[dict]] = {}
    for g in schedule:
        if g.get("status_type_name") != "STATUS_FINAL":
            continue
        for side in ("home_id", "away_id"):
            if g.get(side) is not None:
                index.setdefault(g[side], []).append(g)
    for games in index.values():
        games.sort(key=lambda g: g["game_date"])
    return index


def schedule_load(index: dict[int, list[dict]], places: dict, team: int, game: dict) -> dict:
    """The NBA desk's schedule-load facts for one side of one game."""
    day = game["game_date"]
    here = places.get(place_key(game.get("venue_address_city"), game.get("venue_address_state")))
    before = [g for g in index.get(team, []) if g["game_date"] < day]
    out: dict = {"games_last_7": sum(1 for g in before
                                     if (date.fromisoformat(day) - date.fromisoformat(g["game_date"])).days <= 7)}
    if before:
        last = before[-1]
        out["rest_days"] = (date.fromisoformat(day) - date.fromisoformat(last["game_date"])).days - 1
        there = places.get(place_key(last.get("venue_address_city"), last.get("venue_address_state")))
        trip = miles(there, here)
        out["travel_miles"] = round(trip) if trip is not None else None
        week = [g for g in before if (date.fromisoformat(day) - date.fromisoformat(g["game_date"])).days <= 7]
        legs = [places.get(place_key(g.get("venue_address_city"), g.get("venue_address_state"))) for g in week] + [here]
        hops = [miles(a, b) for a, b in zip(legs, legs[1:])]
        out["miles_last_7"] = round(sum(h for h in hops if h is not None)) if hops and all(
            h is not None for h in hops) else None
        then, now = utc_hours(there, last["game_date"]), utc_hours(here, day)
        out["tz_shift"] = int(round(now - then)) if then is not None and now is not None else None
    home_side = game.get("home_id") == team and not game.get("neutral_site")
    out["altitude"] = bool(here and here.get("elevation_ft", 0) >= ALTITUDE_FT and not home_side)
    if here:
        out["venue_elevation_ft"] = here.get("elevation_ft")
    return out


def rest_label(load: dict) -> str:
    rest = load.get("rest_days")
    if rest is None:
        return "First Game"
    if rest <= 0:
        return "Back-To-Back"
    return f"{rest} Day{'s' if rest != 1 else ''} Rest"


__all__ = ["load_places", "schedule_load", "rest_label", "geocode", "miles", "place_key"]
