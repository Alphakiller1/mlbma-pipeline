"""Where every NFL fixture is played, and how far a club travelled to get there.

Rest and travel are the two scheduling facts the information architecture asks
for and no upstream artifact carries. Both fall out of a club's own schedule
once you know where its venues are: the gap to the previous kickoff, the
distance between the two stadiums, and the time-zone shift between them.

The coordinates below are public facts about buildings - the same class of
statement as a stadium's name or its capacity. They are keyed by the venue
name exactly as the schedule publishes it, so a fixture at a venue not listed
here reports its distance as unavailable rather than guessing.

Distances are great-circle: the shortest path between two points on the globe,
which is what a chartered team flight approximates and what "how far did they
travel" means. It is not a road distance and is not presented as one.
"""
from __future__ import annotations

import math
from datetime import datetime
from zoneinfo import ZoneInfo

# name: (latitude, longitude, IANA time zone)
VENUES: dict[str, tuple[float, float, str]] = {
    # Home stadiums
    "AT&T Stadium": (32.7473, -97.0945, "America/Chicago"),
    "Acrisure Stadium": (40.4468, -80.0158, "America/New_York"),
    "Allegiant Stadium": (36.0909, -115.1833, "America/Los_Angeles"),
    "Arrowhead Stadium": (39.0489, -94.4839, "America/Chicago"),
    "Bank of America Stadium": (35.2258, -80.8528, "America/New_York"),
    "Caesars Superdome": (29.9511, -90.0812, "America/Chicago"),
    "Empower Field at Mile High": (39.7439, -105.0201, "America/Denver"),
    "EverBank Stadium": (30.3239, -81.6373, "America/New_York"),
    "Ford Field": (42.3400, -83.0456, "America/Detroit"),
    "Gillette Stadium": (42.0909, -71.2643, "America/New_York"),
    "Hard Rock Stadium": (25.9580, -80.2389, "America/New_York"),
    "Highmark Stadium": (42.7738, -78.7870, "America/New_York"),
    "Huntington Bank Field": (41.5061, -81.6995, "America/New_York"),
    "Lambeau Field": (44.5013, -88.0622, "America/Chicago"),
    "Levi's Stadium": (37.4033, -121.9694, "America/Los_Angeles"),
    "Lincoln Financial Field": (39.9008, -75.1675, "America/New_York"),
    "Lucas Oil Stadium": (39.7601, -86.1639, "America/Indiana/Indianapolis"),
    "Lumen Field": (47.5952, -122.3316, "America/Los_Angeles"),
    "M&T Bank Stadium": (39.2780, -76.6227, "America/New_York"),
    "Mercedes-Benz Stadium": (33.7554, -84.4008, "America/New_York"),
    "MetLife Stadium": (40.8135, -74.0745, "America/New_York"),
    "Nissan Stadium": (36.1665, -86.7713, "America/Chicago"),
    "Northwest Stadium": (38.9077, -76.8645, "America/New_York"),
    "Paycor Stadium": (39.0955, -84.5161, "America/New_York"),
    "Raymond James Stadium": (27.9759, -82.5033, "America/New_York"),
    "Reliant Stadium": (29.6847, -95.4107, "America/Chicago"),
    "SoFi Stadium": (33.9535, -118.3392, "America/Los_Angeles"),
    "Soldier Field": (41.8623, -87.6167, "America/Chicago"),
    "State Farm Stadium": (33.5276, -112.2626, "America/Phoenix"),
    "U.S. Bank Stadium": (44.9738, -93.2578, "America/Chicago"),
    # International and neutral sites
    "Estadio Banorte": (19.3029, -99.1505, "America/Mexico_City"),
    "FC Bayern Munich Stadium": (48.2188, 11.6247, "Europe/Berlin"),
    "Maracanã Stadium": (-22.9121, -43.2302, "America/Sao_Paulo"),
    "Melbourne Cricket Ground": (-37.8200, 144.9834, "Australia/Melbourne"),
    "Santiago Bernabéu": (40.4531, -3.6883, "Europe/Madrid"),
    "Stade de France": (48.9245, 2.3601, "Europe/Paris"),
    "Tottenham Hotspur Stadium": (51.6043, -0.0665, "Europe/London"),
    "Wembley Stadium": (51.5560, -0.2796, "Europe/London"),
}

# Each club's own building, so a season opener can still state how far the club
# travelled even though there is no previous fixture to measure from.
HOME_VENUE: dict[str, str] = {
    "ARI": "State Farm Stadium", "ATL": "Mercedes-Benz Stadium",
    "BAL": "M&T Bank Stadium", "BUF": "Highmark Stadium",
    "CAR": "Bank of America Stadium", "CHI": "Soldier Field",
    "CIN": "Paycor Stadium", "CLE": "Huntington Bank Field",
    "DAL": "AT&T Stadium", "DEN": "Empower Field at Mile High",
    "DET": "Ford Field", "GB": "Lambeau Field",
    "HOU": "Reliant Stadium", "IND": "Lucas Oil Stadium",
    "JAX": "EverBank Stadium", "KC": "Arrowhead Stadium",
    "LAC": "SoFi Stadium", "LAR": "SoFi Stadium",
    "LV": "Allegiant Stadium", "MIA": "Hard Rock Stadium",
    "MIN": "U.S. Bank Stadium", "NE": "Gillette Stadium",
    "NO": "Caesars Superdome", "NYG": "MetLife Stadium",
    "NYJ": "MetLife Stadium", "PHI": "Lincoln Financial Field",
    "PIT": "Acrisure Stadium", "SEA": "Lumen Field",
    "SF": "Levi's Stadium", "TB": "Raymond James Stadium",
    "TEN": "Nissan Stadium", "WSH": "Northwest Stadium",
}

EARTH_RADIUS_KM = 6371.0088


def great_circle_km(a: str, b: str) -> int | None:
    """Kilometres between two named venues, or None if either is unknown."""
    if a == b:
        return 0
    first, second = VENUES.get(a), VENUES.get(b)
    if not first or not second:
        return None
    lat1, lon1 = math.radians(first[0]), math.radians(first[1])
    lat2, lon2 = math.radians(second[0]), math.radians(second[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return round(2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h)))


def tz_shift_hours(origin: str, destination: str, when: datetime) -> float | None:
    """How many hours the clock moves between two venues at a given instant.

    Computed at the kickoff instant rather than from a fixed offset, so a
    fixture either side of a daylight-saving change reports the shift the
    travelling club actually experiences.
    """
    first, second = VENUES.get(origin), VENUES.get(destination)
    if not first or not second:
        return None
    try:
        start = when.astimezone(ZoneInfo(first[2])).utcoffset()
        end = when.astimezone(ZoneInfo(second[2])).utcoffset()
    except Exception:
        return None
    if start is None or end is None:
        return None
    return round((end - start).total_seconds() / 3600, 1)


FORECAST = "https://api.open-meteo.com/v1/forecast"
FORECAST_HEADERS = {"User-Agent": "ChaseAnalytics/1.0 (+https://chase-analytics.com)"}


def kickoff_forecast(venue: str | None, kickoff_utc: str | None, fetch=None) -> dict | None:
    """Temperature, wind, gusts and chance of precipitation at an outdoor
    venue in the kickoff hour (2026-11-18 audit: ESPN's forecast has no wind,
    which is what moves passing and kicking). Open-Meteo's free forecast runs
    sixteen days out; outside it, or at an unknown venue, None."""
    import json
    import urllib.parse
    import urllib.request

    if not venue or venue not in VENUES or not kickoff_utc:
        return None
    try:
        when = datetime.fromisoformat(str(kickoff_utc).replace("Z", "+00:00"))
    except ValueError:
        return None
    lat, lon, _ = VENUES[venue]
    day = when.strftime("%Y-%m-%d")
    query = urllib.parse.urlencode({
        "latitude": lat, "longitude": lon, "start_date": day, "end_date": day, "timezone": "UTC",
        "hourly": "temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation_probability",
        "temperature_unit": "fahrenheit", "wind_speed_unit": "mph",
    })
    try:
        if fetch is None:
            request = urllib.request.Request(f"{FORECAST}?{query}", headers=FORECAST_HEADERS)
            with urllib.request.urlopen(request, timeout=20) as response:
                payload = json.loads(response.read().decode("utf-8"))
        else:
            payload = fetch(f"{FORECAST}?{query}")
    except Exception:  # noqa: BLE001 - no forecast is published as none
        return None
    hourly = payload.get("hourly") or {}
    stamp = when.strftime("%Y-%m-%dT%H:00")
    times = hourly.get("time") or []
    if stamp not in times:
        return None
    i = times.index(stamp)

    def at(key):
        values = hourly.get(key) or []
        return values[i] if i < len(values) and values[i] is not None else None
    out = {"temp_f": at("temperature_2m"), "wind_mph": at("wind_speed_10m"), "gust_mph": at("wind_gusts_10m"),
           "precip_pct": at("precipitation_probability")}
    return {k: int(round(v)) for k, v in out.items() if v is not None} or None
