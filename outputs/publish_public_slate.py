#!/usr/bin/env python3
"""Build allowlisted public MLB/NFL slates from factual pipeline CSVs (and ESPN for NFL).

Fail closed: never write an empty slate over a known-good file; never copy model fields.
"""
from __future__ import annotations

import csv
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from outputs import nfl_public_context

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from project_public_slate import assert_clean, project_slate  # noqa: E402

from core.config import DATA_DIR  # noqa: E402

ET = ZoneInfo("America/New_York")
PUBLIC_DIR = ROOT / "data" / "public"


def _cell(row: dict, *names: str) -> str:
    lower = {str(k).lower(): k for k in row}
    for name in names:
        key = lower.get(name.lower())
        if key is None:
            continue
        val = row.get(key)
        if val is None:
            continue
        text = str(val).strip()
        if text and text not in {"--", "nan", "None"}:
            return text
    return ""


def _parse_kickoff(slate_date: str, time_label: str) -> str | None:
    if not slate_date or not time_label or time_label.upper() == "TBD":
        return None
    cleaned = time_label.replace(" ET", "").replace("ET", "").strip()
    for fmt in ("%I:%M %p", "%H:%M"):
        try:
            clock = datetime.strptime(cleaned, fmt).time()
            local = datetime.combine(datetime.fromisoformat(slate_date).date(), clock, tzinfo=ET)
            return local.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            continue
    return None


def _read_csv(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def _lineup_state(rows: list[dict], away: str, home: str) -> tuple[str, str]:
    away_state = home_state = ""
    for row in rows:
        game = _cell(row, "Game", "matchup")
        team = _cell(row, "Team", "Tm")
        status = _cell(row, "Status", "Lineup_Status", "state")
        if not status:
            status = "Projected" if _cell(row, "Batter", "Name") else ""
        key = f"{away}@{home}"
        if game and key not in game.replace(" ", "") and f"{away} @ {home}" not in game:
            continue
        if team == away and status:
            away_state = status
        if team == home and status:
            home_state = status
    if rows and not away_state and not home_state:
        # Rotowire export present for the slate — treat as projected until confirmed tags exist.
        return "Projected", "Projected"
    return away_state, home_state



def _observed_through(games: list[dict], now: str) -> str:
    """Newest observation in the file, never a future time.

    A slate lists games that have not happened yet, so the latest kickoff is not
    evidence of anything. Only games already under way or finished have been
    observed; with none started, the freshest fact is the fetch itself.
    """
    started = [
        g.get("kickoff_utc")
        for g in games
        if g.get("kickoff_utc")
        and str(g.get("game_state") or "").lower() in {"live", "final"}
    ]
    newest = max(started) if started else now
    return min(newest, now)


def mlb_producer(data_dir: Path) -> dict:
    matchups = _read_csv(data_dir / "today_matchups.csv")
    weather = _read_csv(data_dir / "today_weather.csv")
    lineups = _read_csv(data_dir / "today_lineups.csv")
    wx = {}
    for row in weather:
        wx[f"{_cell(row, 'away_team')}@{_cell(row, 'home_team')}"] = row
    games = []
    for row in matchups:
        away = _cell(row, "Away", "Away_Team")
        home = _cell(row, "Home", "Home_Team")
        if not away or not home:
            continue
        key = f"{away}@{home}"
        w = wx.get(key, {})
        temp = _cell(w, "temperature_f")
        cond = _cell(w, "conditions", "conditions_raw")
        conditions = " ".join(x for x in (f"{temp}F" if temp else "", cond) if x)
        away_lu, home_lu = _lineup_state(lineups, away, home)
        slate_date = _cell(row, "Slate_Date")
        time_label = _cell(row, "Time", "Game_Time")
        away_hand = _cell(row, "Away_Hand", "Away_SP_Hand")
        home_hand = _cell(row, "Home_Hand", "Home_SP_Hand")
        away_sp = _cell(row, "Away_SP")
        home_sp = _cell(row, "Home_SP")
        games.append({
            "id": f"{slate_date or 'mlb'}-{away}-{home}".lower(),
            "game_pk": _cell(row, "gamePk", "GamePk", "game_pk") or None,
            "away": away,
            "home": home,
            "away_name": _cell(row, "Away_Name", "Away Team Name") or None,
            "home_name": _cell(row, "Home_Name", "Home Team Name") or None,
            "away_record": _cell(row, "Away_Record", "Away Record") or None,
            "home_record": _cell(row, "Home_Record", "Home Record") or None,
            "kickoff_utc": _parse_kickoff(slate_date, time_label),
            "kickoff_display": time_label or None,
            "venue": _cell(w, "stadium_name") or None,
            "venue_city": _cell(w, "venue_city", "city") or None,
            "conditions": conditions or None,
            "weather_temp": temp or None,
            "weather_cond": cond or None,
            "weather_wind": _cell(w, "wind", "wind_summary", "wind_direction") or None,
            "away_starter": " · ".join(x for x in (away_sp, f"{away_hand}HP" if away_hand else "") if x) or None,
            "home_starter": " · ".join(x for x in (home_sp, f"{home_hand}HP" if home_hand else "") if x) or None,
            "away_lineup_state": away_lu or None,
            "home_lineup_state": home_lu or None,
            "away_bullpen": _cell(row, "Away_Bullpen_Availability", "Away Bullpen") or None,
            "home_bullpen": _cell(row, "Home_Bullpen_Availability", "Home Bullpen") or None,
            "game_state": "scheduled",
        })
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    # See the note in nfl_producer_from_espn: these are two different facts.
    return {
        "generated_at_utc": now,
        "data_through_utc": _observed_through(games, now),
        "games": games,
    }



ESPN_NFL_INJURIES = (
    "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries"
)

# Designations that change how a reader should treat availability. "Active" is
# the default state and is not worth reporting.
NFL_NOTABLE_STATUS = {
    "out", "doubtful", "questionable",
    "injured reserve", "ir", "pup", "suspension", "suspended",
}


def fetch_nfl_injuries() -> dict:
    """Official injury designations, keyed by team abbreviation.

    nfl-model/board.json reports injury_status as null on every player row, so
    the designations come from the official feed instead. The block node
    carries only id and displayName - the abbreviation is on each athlete's
    team - and the body part is reported inside the comment text rather than a
    field of its own.
    """
    try:
        with urllib.request.urlopen(ESPN_NFL_INJURIES, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return {}

    by_team: dict[str, list[dict]] = {}
    for block in payload.get("injuries") or []:
        team = ""
        notable: list[dict] = []
        for item in block.get("injuries") or []:
            athlete = item.get("athlete") or {}
            if not team:
                team = str(((athlete.get("team") or {}).get("abbreviation")) or "").upper()
            status = str(item.get("status") or "").strip()
            if status.lower() not in NFL_NOTABLE_STATUS:
                continue
            detail = ""
            match = re.search(r"\(([^)]{2,24})\)", str(item.get("shortComment") or ""))
            if match:
                detail = match.group(1)
            notable.append({
                "name": athlete.get("displayName") or "",
                "position": ((athlete.get("position") or {}).get("abbreviation")) or "",
                "status": status,
                "detail": detail,
            })
        if not team:
            continue
        rank = {"Out": 0, "Doubtful": 1, "Questionable": 2}
        notable.sort(key=lambda p: rank.get(p["status"], 3))
        by_team[team] = notable
    return by_team


def availability_summary(entries: list[dict] | None) -> str:
    if entries is None:
        return "Injury report pending"
    if not entries:
        return "No designations reported"
    counts: dict[str, int] = {}
    for entry in entries:
        counts[entry["status"]] = counts.get(entry["status"], 0) + 1
    parts = [
        f"{counts[s]} {s.lower()}"
        for s in ("Out", "Doubtful", "Questionable")
        if counts.get(s)
    ]
    return " · ".join(parts) or f"{len(entries)} designated"


ESPN_NFL_SCHEDULE = (
    "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{team}/schedule"
)


def fetch_nfl_rest(teams: set[str]) -> dict[str, list[dict]]:
    """Each club's completed games this season, newest first.

    Rest and travel are the two scheduling facts the IA asks for and the model
    board does not carry. Both fall out of the club's own schedule: the gap to
    the previous kickoff, and where that previous game was played. In week one
    there is no previous game, so both stay explicitly unavailable rather than
    being filled in with a default.
    """
    out: dict[str, list[dict]] = {}
    for team in sorted(teams):
        url = ESPN_NFL_SCHEDULE.format(team=team.lower())
        try:
            with urllib.request.urlopen(url, timeout=20) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except Exception:
            continue
        played = []
        for event in payload.get("events") or []:
            comp = (event.get("competitions") or [{}])[0]
            status = ((comp.get("status") or {}).get("type") or {}).get("completed")
            if not status:
                continue
            venue = comp.get("venue") or {}
            played.append({
                "kickoff_utc": event.get("date"),
                "venue_city": ", ".join(x for x in (
                    (venue.get("address") or {}).get("city"),
                    (venue.get("address") or {}).get("state"),
                ) if x) or None,
            })
        played.sort(key=lambda row: str(row["kickoff_utc"]), reverse=True)
        out[team] = played
    return out


def rest_context(history: list[dict] | None, kickoff: str | None) -> tuple[int | None, str | None]:
    """Days since the club last played, and where it played."""
    if not history or not kickoff:
        return None, None
    try:
        now = datetime.fromisoformat(str(kickoff).replace("Z", "+00:00"))
    except ValueError:
        return None, None
    for row in history:
        try:
            then = datetime.fromisoformat(str(row["kickoff_utc"]).replace("Z", "+00:00"))
        except (ValueError, KeyError, TypeError):
            continue
        if then >= now:
            continue
        days = (now - then).days
        where = row.get("venue_city")
        return days, (f"Last played at {where}" if where else None)
    return None, None


def nfl_producer_from_espn(payload: dict, injuries: dict | None = None,
                          context: dict | None = None,
                          rest_history: dict | None = None) -> dict:
    # Observed team form and charted scheme profiles, projected field by
    # field out of the model board rather than passed through it.
    context = context if context is not None else nfl_public_context.build()
    form = context.get("form") or {}
    scheme = context.get("scheme") or {}
    players = context.get("players") or {}
    rest = rest_history if rest_history is not None else {}
    games = []
    for event in payload.get("events") or []:
        comps = event.get("competitions") or []
        if not comps:
            continue
        comp = comps[0]
        teams = {c.get("homeAway"): c for c in (comp.get("competitors") or [])}
        away = teams.get("away") or {}
        home = teams.get("home") or {}
        away_abbr = (away.get("team") or {}).get("abbreviation") or ""
        home_abbr = (home.get("team") or {}).get("abbreviation") or ""
        if not away_abbr or not home_abbr:
            continue
        status = ((comp.get("status") or {}).get("type") or {}).get("name") or "scheduled"
        state = "final" if status.lower() in {"status_final", "final"} else (
            "live" if "in" in status.lower() or status.lower() == "status_in_progress" else "scheduled"
        )
        kickoff = event.get("date") or comp.get("date")
        venue = ((comp.get("venue") or {}).get("fullName")) or None
        venue_data = comp.get("venue") or {}
        broadcast = None
        broadcasts = comp.get("broadcasts") or event.get("competitions", [{}])[0].get("geoBroadcasts") or []
        if broadcasts:
            broadcast = broadcasts[0].get("names", [None])[0] if isinstance(broadcasts[0], dict) else None
            if not broadcast and isinstance(broadcasts[0], dict):
                broadcast = (broadcasts[0].get("media") or {}).get("shortName")
        qbs = {}
        for side, block in (("away", away), ("home", home)):
            for athlete in (block.get("leaders") or []):
                if str(athlete.get("name") or "").lower() in {"passingleader", "passing yards"}:
                    leaders = athlete.get("leaders") or []
                    if leaders:
                        qbs[side] = (leaders[0].get("athlete") or {}).get("shortName")
        def record(block: dict) -> str | None:
            rows = block.get("records") or []
            return str(rows[0].get("summary")) if rows and rows[0].get("summary") else None

        away_rest, away_travel = rest_context(rest.get(away_abbr), kickoff)
        home_rest, home_travel = rest_context(rest.get(home_abbr), kickoff)
        weather = comp.get("weather") or {}
        condition = weather.get("displayValue") or weather.get("conditionId")
        temperature = weather.get("temperature")
        games.append({
            "id": str(event.get("id") or f"{away_abbr}@{home_abbr}"),
            "away": away_abbr,
            "home": home_abbr,
            "away_name": (away.get("team") or {}).get("displayName"),
            "home_name": (home.get("team") or {}).get("displayName"),
            "away_record": record(away),
            "home_record": record(home),
            "kickoff_utc": kickoff,
            "venue": venue,
            "venue_city": ", ".join(x for x in (
                (venue_data.get("address") or {}).get("city"),
                (venue_data.get("address") or {}).get("state"),
            ) if x) or None,
            "broadcast": broadcast,
            "conditions": " · ".join(x for x in (
                f"{temperature}°" if temperature is not None else "",
                str(condition) if condition else "",
            ) if x) or None,
            "surface": (
                "Grass" if venue_data.get("grass") is True
                else ("Turf" if venue_data.get("grass") is False else None)
            ),
            "roof": (
                "Indoor" if venue_data.get("indoor") is True
                else ("Outdoor" if venue_data.get("indoor") is False else None)
            ),
            "away_starter": qbs.get("away"),
            "home_starter": qbs.get("home"),
            "away_availability": availability_summary((injuries or {}).get(away_abbr)),
            "home_availability": availability_summary((injuries or {}).get(home_abbr)),
            "away_availability_list": (injuries or {}).get(away_abbr),
            "home_availability_list": (injuries or {}).get(home_abbr),
            "away_score": away.get("score"),
            "home_score": home.get("score"),
            "game_state": state,
            "away_form": form.get(away_abbr),
            "home_form": form.get(home_abbr),
            # The confrontation is directional: one side's offence against the
            # other side's defence, published as two separate pairings so the
            # page never has to work out which half faces which.
            "away_scheme": scheme.get(away_abbr),
            "home_scheme": scheme.get(home_abbr),
            "scheme_source": context.get("source"),
            "away_players": players.get(away_abbr),
            "home_players": players.get(home_abbr),
            "away_rest_days": away_rest,
            "home_rest_days": home_rest,
            "away_travel": away_travel,
            "home_travel": home_travel,
        })
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    # Publication time and data age are different facts (IA section 6.7): the
    # first is when this file was written, the second is the newest OBSERVATION
    # inside it. Both were now(), which made them impossible to tell apart.
    #
    # A schedule carries future kickoffs, so max(kickoff) would put data_through
    # days ahead of publication - a worse claim than the duplicate. Only games
    # already under way or complete are observations; if none have started, the
    # newest thing known is the fetch itself.
    return {
        "generated_at_utc": now,
        "data_through_utc": _observed_through(games, now),
        "games": games,
    }


def fetch_nfl_scoreboard() -> dict | None:
    import urllib.request

    url = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
    try:
        with urllib.request.urlopen(url, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        print(f"  WARNING: NFL scoreboard fetch failed ({exc})")
        return None


def write_if_better(sport: str, producer: dict, dest: Path) -> bool:
    if not producer.get("games"):
        print(f"  skip {sport}: empty producer; keeping {dest}")
        return False
    out = project_slate(sport, producer)
    assert_clean(out)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(f"  wrote {dest} ({len(out['games'])} games)")
    return True


def run(data_dir: Path | None = None) -> int:
    data_dir = Path(data_dir or DATA_DIR)
    ok = False
    mlb = mlb_producer(data_dir)
    ok = write_if_better("mlb", mlb, PUBLIC_DIR / "mlb" / "slate.json") or ok
    espn = fetch_nfl_scoreboard()
    if espn:
        codes = {
            (c.get("team") or {}).get("abbreviation")
            for event in (espn.get("events") or [])
            for comp in (event.get("competitions") or [])
            for c in (comp.get("competitors") or [])
        }
        nfl = nfl_producer_from_espn(espn, fetch_nfl_injuries(),
                                     nfl_public_context.build(),
                                     fetch_nfl_rest({c for c in codes if c}))
        ok = write_if_better("nfl", nfl, PUBLIC_DIR / "nfl" / "slate.json") or ok
    else:
        print("  skip nfl: scoreboard unreachable; keeping existing public slate")
    return 0 if (PUBLIC_DIR / "mlb" / "slate.json").is_file() else 1


if __name__ == "__main__":
    raise SystemExit(run())
