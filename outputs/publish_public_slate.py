#!/usr/bin/env python3
"""Build allowlisted public MLB/NFL slates from factual pipeline CSVs (and ESPN for NFL).

Fail closed: never write an empty slate over a known-good file; never copy model fields.
"""
from __future__ import annotations

import csv
import json
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from outputs import nfl_public_context, nfl_venues

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



MLB_SCHEDULE = (
    "https://statsapi.mlb.com/api/v1/schedule?sportId=1&date={date}"
    "&hydrate=probablePitcher,team,venue(location),weather,broadcasts,lineups"
)


def _mlb_state(game: dict) -> str:
    """The real game state, from the schedule's own status.

    The CSV producer wrote "scheduled" for every game unconditionally, so a
    final score could never be told from a first pitch.
    """
    status = game.get("status") or {}
    abstract = str(status.get("abstractGameState") or "").lower()
    detailed = str(status.get("detailedState") or "").lower()
    if "postpone" in detailed:
        return "postponed"
    if "delay" in detailed:
        return "delayed"
    if abstract == "final":
        return "final"
    if abstract == "live":
        return "live"
    return "scheduled"


def _broadcasts(game: dict) -> str | None:
    """Television only, national first, at most two.

    The schedule lists every radio affiliate alongside the TV feeds, so taking
    them all produced a broadcast line like "680 AM/93.7 FM The Fan, Rays.TV,
    BravesVision, WDAE 95.7 FM, La Mejor 1600/1460/1130 AM, WQBN/1300AM" - six
    entries where a card has room for the answer to "where can I watch this".
    """
    entries = [e for e in (game.get("broadcasts") or [])
               if str(e.get("type") or "").upper() == "TV"]
    entries.sort(key=lambda e: not e.get("isNational"))
    names = []
    for entry in entries:
        name = entry.get("name") or entry.get("callSign")
        if name and name not in names:
            names.append(str(name))
    return ", ".join(names[:2]) or None


def _batting_order(players) -> list[dict] | None:
    """Identity and slot only. The season line is fetched per person by the
    page; carrying it here would duplicate a source that already exists."""
    if not players:
        return None
    order = []
    for slot, player in enumerate(players, start=1):
        if not player.get("id"):
            continue
        order.append({
            "slot": slot,
            "person_id": player["id"],
            "name": player.get("fullName") or "",
            "position": ((player.get("primaryPosition") or {}).get("abbreviation")) or "",
        })
    return order or None


def fetch_mlb_schedule(date_iso: str) -> dict | None:
    try:
        with urllib.request.urlopen(MLB_SCHEDULE.format(date=date_iso), timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        print(f"  WARNING: MLB schedule fetch failed ({exc})")
        return None


# How far ahead an off day looks for the next slate. The longest gap in an
# MLB calendar is the All-Star break (four days); a postseason round can wait
# on its opponent a little longer.
MLB_LOOKAHEAD_DAYS = 7


def _schedule_games(schedule: dict | None) -> int:
    return sum(len(block.get("games") or []) for block in ((schedule or {}).get("dates") or []))


def next_mlb_slate(today: str) -> tuple[str, dict | None]:
    """The day the desk should show: today when anything is scheduled, else
    the next day with games.

    On an off day - the day between the regular season and the Wild Card
    Series, the gaps between postseason rounds, the All-Star break - today's
    schedule is empty and the publisher used to keep the last slate on
    screen, so the desk showed the regular-season finale on the eve of the
    playoffs.
    """
    schedule = fetch_mlb_schedule(today)
    if schedule is None or _schedule_games(schedule):
        return today, schedule
    start = datetime.fromisoformat(today).date()
    for ahead in range(1, MLB_LOOKAHEAD_DAYS + 1):
        day = (start + timedelta(days=ahead)).isoformat()
        found = fetch_mlb_schedule(day)
        if _schedule_games(found):
            print(f"  mlb: no games on {today}; publishing the next slate, {day}")
            return day, found
    return today, schedule


def _public_team_code(value: str) -> str:
    """Normalize Rotowire/model abbreviations to the codes MLB publishes."""
    return {
        "CHW": "CWS", "SDP": "SD", "WSN": "WSH", "KCR": "KC",
        "SFG": "SF", "TBR": "TB", "ARI": "AZ", "OAK": "ATH",
    }.get(str(value or "").upper(), str(value or "").upper())


# What RotoWire prints when it has no arm for a side. Publishing it would put
# "TBD" where the desk says no probable has been named.
_ROTOWIRE_NO_ARM = {"", "TBD", "UNDECIDED"}
_ROTOWIRE_BOX_DAY = re.compile(r"/box-score/.*-(\d{4}-\d{2}-\d{2})-\d+")


def _rotowire_arm(row, prefix: str) -> dict:
    name = str(row.get(f"{prefix}_SP") or "").strip()
    if name.upper() in _ROTOWIRE_NO_ARM:
        return {}
    return {
        "name": name,
        "hand": str(row.get(f"{prefix}_SP_Hand") or "").strip(),
        "role": str(row.get(f"{prefix}_SP_Role") or "").strip(),
    }


def _rotowire_card_days(html: str) -> dict[tuple[str, str], set[str]]:
    """Game days each RotoWire card's box-score link names, by club pair."""
    from bs4 import BeautifulSoup

    days: dict[tuple[str, str], set[str]] = {}
    for card in BeautifulSoup(html, "html.parser").select("div.lineup.is-mlb"):
        abbrs = [el.get_text(strip=True) for el in card.select(".lineup__abbr")]
        link = card.select_one("a.lineup__matchup[href]")
        match = _ROTOWIRE_BOX_DAY.search(link["href"]) if link else None
        if len(abbrs) >= 2 and match:
            key = (_public_team_code(abbrs[0]), _public_team_code(abbrs[1]))
            days.setdefault(key, set()).add(match.group(1))
    return days


def starter_role(official: dict, fallback: dict) -> str | None:
    """How a published arm was named when MLB has not posted a probable.

    None means the official probable. "primary" is RotoWire's PRIM listing:
    the arm expected to cover the bulk innings behind an opener, which is the
    pitcher the matchup should be read against. "projected" is any other arm
    RotoWire lists ahead of the official announcement.
    """
    if official.get("fullName") or not fallback.get("name"):
        return None
    return "primary" if fallback.get("role") == "primary" else "projected"


def fetch_rotowire_starters(slate_date: str, schedule: dict) -> dict[tuple[str, str], dict]:
    """Return Rotowire's listed arms for missing official probables.

    The official schedule remains authoritative for which games exist and any
    starter it has named. Rotowire only fills an otherwise empty side, including
    its ``PRIM`` bulk-pitcher listing.
    """
    try:
        import requests
        from bs4 import BeautifulSoup
        from scrapers.scrape_lineups import (
            HEADERS, _parse_lineup_cards, _rotowire_urls_for_slate,
        )
    except Exception as exc:
        print(f"  WARNING: Rotowire starter fallback unavailable ({exc})")
        return {}

    schedule_keys = {
        (
            _public_team_code(((game.get("teams") or {}).get("away") or {}).get("team", {}).get("abbreviation")),
            _public_team_code(((game.get("teams") or {}).get("home") or {}).get("team", {}).get("abbreviation")),
        )
        for block in schedule.get("dates") or []
        for game in block.get("games") or []
    }
    for url in _rotowire_urls_for_slate(slate_date):
        try:
            response = requests.get(url, headers=HEADERS, timeout=30)
            response.raise_for_status()
            _, games = _parse_lineup_cards(BeautifulSoup(response.text, "html.parser"), slate_date)
        except Exception as exc:
            print(f"  WARNING: Rotowire starter fallback fetch failed ({exc})")
            continue
        card_days = _rotowire_card_days(response.text)
        found = {}
        for _, row in games.iterrows():
            key = (_public_team_code(row.get("Away")), _public_team_code(row.get("Home")))
            if key not in schedule_keys:
                continue
            # Every game of a series shares this key. A card dated for another
            # day names that day's arm, not this one's.
            if card_days.get(key) and slate_date not in card_days[key]:
                continue
            found[key] = {
                side: _rotowire_arm(row, prefix)
                for side, prefix in (("away", "Away"), ("home", "Home"))
            }
        if found:
            print(f"  mlb: Rotowire supplied listed arms for {len(found)} matchup(s)")
            return found
    return {}


MLB_PEOPLE_SEARCH = "https://statsapi.mlb.com/api/v1/people/search?{query}"


def _person_name_key(value: str) -> str:
    """Fold accents and punctuation for an exact MLB/RotoWire name match."""
    plain = unicodedata.normalize("NFKD", str(value or ""))
    return "".join(char for char in plain if not unicodedata.combining(char)).casefold().strip()


def fetch_mlb_person_ids(names: list[str]) -> dict[str, int]:
    """Resolve RotoWire fallback names to the IDs used by MLB headshots.

    The people search can return similarly named players, so only a unique
    normalized full-name match is accepted. An unresolved name remains usable
    as text; it simply keeps the generic headshot rather than risking the wrong
    player's image.
    """
    resolved: dict[str, int] = {}
    for name in dict.fromkeys(str(value or "").strip() for value in names):
        if not name:
            continue
        url = MLB_PEOPLE_SEARCH.format(query=urllib.parse.urlencode({"names": name}))
        try:
            payload = _json(url)
        except Exception as exc:
            print(f"  WARNING: MLB player ID lookup failed for {name} ({exc})")
            continue
        key = _person_name_key(name)
        matches = [
            person for person in payload.get("people") or []
            if _person_name_key(person.get("fullName")) == key and person.get("id")
        ]
        if len(matches) == 1:
            resolved[name] = int(matches[0]["id"])
    return resolved


def add_rotowire_starter_ids(starters: dict[tuple[str, str], dict]) -> dict:
    """Attach MLB person IDs to RotoWire arms without changing provenance."""
    names = [
        side.get("name")
        for matchup in starters.values()
        for side in (matchup.get("away") or {}, matchup.get("home") or {})
        if side.get("name")
    ]
    person_ids = fetch_mlb_person_ids(names)
    for matchup in starters.values():
        for side in (matchup.get("away") or {}, matchup.get("home") or {}):
            if side.get("name") in person_ids:
                side["id"] = person_ids[side["name"]]
    return starters


def _for_day(curated: dict, day: str) -> dict:
    """Curated rows that belong to `day`. The CSVs behind them describe the
    pipeline's own run date; merged by club pair onto another day's fixtures
    they would paint one series game's starters and lineups onto the next."""
    games = [g for g in curated.get("games") or []
             if not str(g.get("id") or "").startswith("20") or str(g.get("id")).startswith(day)]
    return {**curated, "games": games}


MLB_PEOPLE = (
    "https://statsapi.mlb.com/api/v1/people?personIds={ids}"
    "&hydrate=stats(group=[pitching],type=[season],season={season})"
)


def fetch_mlb_arms(ids: list[int], season: int) -> dict:
    """Throwing hand and season line for every probable starter on the slate.

    probablePitcher hydrates to identity only on the schedule endpoint - it
    carries id, fullName and link, and nothing else - so the hand the page
    needs to say "versus RHP" has to come from somewhere. /api/v1/people takes
    a personIds list, so the whole slate costs one request rather than thirty.
    """
    unique = [i for i in dict.fromkeys(ids) if i]
    if not unique:
        return {}
    url = MLB_PEOPLE.format(ids=",".join(str(i) for i in unique), season=season)
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        print(f"  WARNING: MLB starter lines fetch failed ({exc})")
        return {}
    out: dict[int, dict] = {}
    for person in payload.get("people") or []:
        stat: dict = {}
        for block in person.get("stats") or []:
            splits = block.get("splits") or []
            if splits and splits[0].get("stat"):
                stat = splits[0]["stat"]
        out[person["id"]] = {
            "name": person.get("fullName") or None,
            "hand": ((person.get("pitchHand") or {}).get("code")) or None,
            "era": stat.get("era"),
            "whip": stat.get("whip"),
        }
    return out


MLB_TEAM_SCHEDULE = (
    "https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId={team}"
    "&startDate={start}&endDate={end}"
)
MLB_BOXSCORE = "https://statsapi.mlb.com/api/v1/game/{pk}/boxscore"


def _json(url: str, timeout: int = 30):
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _game_day(game: dict) -> str:
    """The calendar day the game is played on, as the schedule states it."""
    raw = str(game.get("officialDate") or game.get("gameDate") or "")[:10]
    return raw or datetime.now(timezone.utc).date().isoformat()


# A rotation arm who follows an opener is credited with a relief appearance by
# the box score, but his pitches are a start's worth of work on a starter's
# schedule, not bullpen load. Counting them is how the White Sox card read as a
# pen that had thrown hundreds of pitches: Burke 94 and Martin 71 behind
# openers, Castillo 61, Fedde 81 - four rotation arms, none of them bullpen
# availability for tonight. The test is the arm's own season line: at least
# five starts, and starts are at least 40% of his appearances. That keeps a
# reliever who has opened a handful of games (Taylor, 4 of 57) in the pen and
# puts a swingman who has started 14 of 31 (Fedde) with the rotation.
ROTATION_MIN_STARTS = 5
ROTATION_START_SHARE = 0.4


def is_rotation_arm(season: dict) -> bool:
    starts = int((season or {}).get("gamesStarted") or 0)
    games = int((season or {}).get("gamesPlayed") or 0)
    return (starts >= ROTATION_MIN_STARTS and games > 0
            and starts / games >= ROTATION_START_SHARE)


def bullpen_load(team_id: int, date_iso: str, cache: dict,
                 exclude: int | None = None) -> str | None:
    """How hard this pen has been worked in the three days before the game.

    The card carried a `Bullpen` cell that read "Workload Not Published" on
    every card of every slate, because nothing ever published `away_bullpen`.
    A cell that is always empty is worse than no cell: it teaches a reader that
    the card has nothing to say. This fills it from the same official box
    scores the matchup page reads - relief appearances only, a pitcher who
    started that game excluded by his own line - and states arms used and
    pitches thrown, which is what "how available is this pen tonight" means.

    Cached per team, because a club appears on the slate once but the cache is
    shared across a doubleheader and across the two sports' publish passes.

    `exclude` is tonight's probable starter: he is not in tonight's bullpen,
    whatever relief work he did earlier in the week. It is part of the cache key
    because the two games of a doubleheader have different starters.
    """
    if not team_id:
        return None
    key = (team_id, date_iso, exclude)
    if key in cache:
        return cache[key]
    start = (datetime.fromisoformat(date_iso) - timedelta(days=3)).date().isoformat()
    end = (datetime.fromisoformat(date_iso) - timedelta(days=1)).date().isoformat()
    try:
        schedule = _json(MLB_TEAM_SCHEDULE.format(team=team_id, start=start, end=end))
    except Exception:
        cache[key] = None
        return None

    arms: set[int] = set()
    pitches = 0
    games = 0
    for block in schedule.get("dates") or []:
        for game in block.get("games") or []:
            if ((game.get("status") or {}).get("abstractGameState") or "") != "Final":
                continue
            pk = game.get("gamePk")
            if not pk:
                continue
            try:
                box = _json(MLB_BOXSCORE.format(pk=pk))
            except Exception:
                continue
            games += 1
            for side in ("away", "home"):
                team = ((box.get("teams") or {}).get(side)) or {}
                if ((team.get("team") or {}).get("id")) != team_id:
                    continue
                for pid in team.get("pitchers") or []:
                    player = (team.get("players") or {}).get(f"ID{pid}") or {}
                    stat = ((player.get("stats") or {}).get("pitching")) or {}
                    if not stat or int(stat.get("gamesStarted") or 0) > 0:
                        continue
                    if exclude is not None and pid == exclude:
                        continue
                    season = ((player.get("seasonStats") or {}).get("pitching")) or {}
                    if is_rotation_arm(season):
                        continue
                    arms.add(pid)
                    pitches += int(stat.get("numberOfPitches") or 0)

    if not games:
        cache[key] = None
        return None
    # Compact, because the card cell it lands in truncates at about sixteen
    # characters and a sentence there reads as "Workload Not P...". Arms over
    # pitches, which the card labels, and the matchup page carries the same
    # three days as a full pitch-count-by-day matrix for anyone who wants it.
    summary = f"{len(arms)}/{pitches}"
    cache[key] = summary
    return summary


def mlb_producer_from_statsapi(
    payload: dict,
    arms: dict | None = None,
    rotowire_starters: dict[tuple[str, str], dict] | None = None,
) -> dict:
    """The published slate, built from the official schedule.

    The site used to fetch this endpoint itself and prefer it over the
    published file, which meant two provenances presented as one: the freshness
    strip described the file while the cards described the API, and on a normal
    day the file held one game and the API returned fifteen. Building the file
    from the same source removes the second reader.
    """
    arms = arms or {}
    rotowire_starters = rotowire_starters or {}
    games = []
    # One cache across the whole slate: a club appears once, but a doubleheader
    # would otherwise crawl the same three days of box scores twice.
    pen_cache: dict = {}
    for block in payload.get("dates") or []:
        for game in block.get("games") or []:
            teams = game.get("teams") or {}
            away_node, home_node = teams.get("away") or {}, teams.get("home") or {}
            away_team, home_team = away_node.get("team") or {}, home_node.get("team") or {}
            away = str(away_team.get("abbreviation") or "").strip()
            home = str(home_team.get("abbreviation") or "").strip()
            if not away or not home:
                continue
            away_sp = away_node.get("probablePitcher") or {}
            home_sp = home_node.get("probablePitcher") or {}
            fallback = rotowire_starters.get(
                (_public_team_code(away), _public_team_code(home)), {}
            )
            away_fallback = fallback.get("away") or {}
            home_fallback = fallback.get("home") or {}
            away_starter_id = away_sp.get("id") or away_fallback.get("id") or None
            home_starter_id = home_sp.get("id") or home_fallback.get("id") or None
            venue = game.get("venue") or {}
            location = venue.get("location") or {}
            weather = game.get("weather") or {}
            lineups = game.get("lineups") or {}
            state = _mlb_state(game)

            def record(node):
                league = node.get("leagueRecord") or {}
                if league.get("wins") is None or league.get("losses") is None:
                    return None
                return f"{league['wins']}-{league['losses']}"

            away_order = _batting_order(lineups.get("awayPlayers"))
            home_order = _batting_order(lineups.get("homePlayers"))
            temp = weather.get("temp")
            games.append({
                "id": str(game.get("gamePk")),
                "game_pk": game.get("gamePk"),
                "away": away, "home": home,
                "away_name": away_team.get("name") or None,
                "home_name": home_team.get("name") or None,
                "away_team_id": away_team.get("id") or None,
                "home_team_id": home_team.get("id") or None,
                "away_bullpen": bullpen_load(away_team.get("id"), _game_day(game), pen_cache,
                                             exclude=away_starter_id),
                "home_bullpen": bullpen_load(home_team.get("id"), _game_day(game), pen_cache,
                                             exclude=home_starter_id),
                "away_record": record(away_node), "home_record": record(home_node),
                # Scores only once there is a game to describe.
                "away_score": away_node.get("score") if state in {"live", "final"} else None,
                "home_score": home_node.get("score") if state in {"live", "final"} else None,
                "game_state": state,
                "kickoff_utc": game.get("gameDate") or None,
                "venue": venue.get("name") or None,
                "venue_id": venue.get("id") or None,
                "venue_city": ", ".join(x for x in (location.get("city"),
                                                    location.get("stateAbbrev")) if x) or None,
                "broadcast": _broadcasts(game),
                "conditions": " · ".join(x for x in (
                    f"{temp}°" if temp else "", weather.get("condition") or "",
                    weather.get("wind") or "") if x) or None,
                "weather_temp": temp or None,
                "weather_cond": weather.get("condition") or None,
                "weather_wind": weather.get("wind") or None,
                # Name and hand are separate fields. The CSV producer
                # concatenated them into "Zebby Matthews · RHP", which no
                # consumer could split back apart reliably.
                "away_starter": (
                    away_sp.get("fullName")
                    # MLB's spelling once the RotoWire name resolves to an ID:
                    # RotoWire's expansion title-cases "JR" to "Jr".
                    or (arms.get(away_starter_id) or {}).get("name")
                    or away_fallback.get("name") or None
                ),
                "home_starter": (
                    home_sp.get("fullName")
                    # MLB's spelling once the RotoWire name resolves to an ID:
                    # RotoWire's expansion title-cases "JR" to "Jr".
                    or (arms.get(home_starter_id) or {}).get("name")
                    or home_fallback.get("name") or None
                ),
                "away_starter_id": away_starter_id,
                "home_starter_id": home_starter_id,
                "away_starter_role": starter_role(away_sp, away_fallback),
                "home_starter_role": starter_role(home_sp, home_fallback),
                "away_hand": (
                    (arms.get(away_starter_id) or {}).get("hand")
                    or away_fallback.get("hand") or None
                ),
                "home_hand": (
                    (arms.get(home_starter_id) or {}).get("hand")
                    or home_fallback.get("hand") or None
                ),
                "away_era": (arms.get(away_starter_id) or {}).get("era"),
                "home_era": (arms.get(home_starter_id) or {}).get("era"),
                # The real batting order, not the single word the CSV producer
                # collapsed it to.
                "away_lineup": away_order,
                "home_lineup": home_order,
                "away_lineup_state": "Confirmed" if away_order else "Expected",
                "home_lineup_state": "Confirmed" if home_order else "Expected",
            })
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "generated_at_utc": now,
        "data_through_utc": _observed_through(games, now),
        "games": games,
    }


def merge_producers(official: dict, curated: dict) -> dict:
    """Official schedule first, curated pipeline context layered over it.

    The pipeline knows things the schedule does not - bullpen availability
    above all - so its rows are matched by matchup and merged in. A curated
    game with no official counterpart is dropped: the schedule decides which
    games exist.
    """
    by_matchup = {}
    for game in curated.get("games") or []:
        by_matchup[(str(game.get("away") or "").upper(),
                    str(game.get("home") or "").upper())] = game
    merged = []
    for game in official.get("games") or []:
        extra = by_matchup.get((game["away"].upper(), game["home"].upper()))
        row = dict(game)
        if extra:
            for key in ("away_bullpen", "home_bullpen", "kickoff_display"):
                if extra.get(key) not in (None, ""):
                    row[key] = extra[key]
        merged.append(row)
    now = official.get("generated_at_utc") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "generated_at_utc": now,
        "data_through_utc": _observed_through(merged, now),
        "games": merged,
    }


ESPN_NFL_INJURIES = (
    "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries"
)
FTN_DVOA = "https://ls.ftnfantasy.com/api/ftn/dvoa/rankings"
FTN_TEAM_ALIASES = {"WSH": "WAS"}

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


def _dvoa_value(raw) -> float | None:
    """Convert FTN's displayed percentage to the slate's fractional rate."""
    if raw in (None, ""):
        return None
    try:
        return round(float(str(raw).strip().removesuffix("%")) / 100, 6)
    except (TypeError, ValueError):
        return None


def fetch_ftn_dvoa(season: int | None = None) -> dict[str, dict]:
    """Read the free Team Total DVOA dataset used by FTN's public table.

    The public endpoint exposes total, offense, defense and special-teams DVOA.
    Pass/run splits remain subscriber-only and are deliberately not inferred.
    """
    try:
        request = urllib.request.Request(
            FTN_DVOA,
            headers={"User-Agent": "ChaseAnalytics/1.0 (+https://chase-analytics.com)"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        print(f"  WARNING: FTN DVOA fetch failed ({exc})")
        return {}

    years = [int(year) for year, rows in payload.items() if str(year).isdigit() and rows]
    selected = season if season in years else (max(years) if years else None)
    rows = payload.get(str(selected), {}) if selected is not None else {}
    if not isinstance(rows, dict) or len(rows) < 32:
        print(f"  WARNING: FTN DVOA returned {len(rows) if isinstance(rows, dict) else 0} teams")
        return {}

    spec = (
        ("total_dvoa", "total_dvoa_rank"),
        ("offense_dvoa", "offense_rank"),
        ("defense_dvoa", "defense_rank"),
        ("special_teams_dvoa", "special_teams_rank"),
    )
    out: dict[str, dict] = {}
    for club, row in rows.items():
        metrics: dict[str, object] = {
            "source": "FTN public Team Total DVOA",
            "season": int(row.get("year") or selected),
            "week": int(row.get("week") or 0),
        }
        for metric, rank_key in spec:
            value = _dvoa_value(row.get(metric))
            rank = row.get(rank_key)
            if value is None or rank is None:
                continue
            metrics[metric] = {"value": value, "rank": int(rank), "of": len(rows)}
        if all(metric in metrics for metric, _rank in spec):
            out[str(club).upper()] = metrics
    return out


def attach_nfl_dvoa(payload: dict, rankings: dict[str, dict]) -> int:
    """Attach one current FTN DVOA profile to each team on the NFL slate."""
    attached = 0
    for game in payload.get("games") or []:
        for side in ("away", "home"):
            club = FTN_TEAM_ALIASES.get(str(game.get(side) or "").upper(),
                                        str(game.get(side) or "").upper())
            profile = rankings.get(club)
            if profile:
                game[f"{side}_dvoa"] = profile
                attached += 1
    return attached


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
    """Each club's played games this season, newest first, with where they were.

    Rest and travel are the two scheduling facts the information architecture
    asks for and no upstream artifact carries. Both fall out of the club's own
    schedule: the gap to the previous kickoff, and the distance from where that
    game was played to where this one is.
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
            if not ((comp.get("status") or {}).get("type") or {}).get("completed"):
                continue
            venue = comp.get("venue") or {}
            address = venue.get("address") or {}
            played.append({
                "kickoff_utc": event.get("date"),
                "venue": venue.get("fullName"),
                "venue_city": ", ".join(x for x in (
                    address.get("city"), address.get("state") or address.get("country"),
                ) if x) or None,
            })
        played.sort(key=lambda row: str(row["kickoff_utc"]), reverse=True)
        out[team] = played
    return out


def rest_context(history: list[dict] | None, kickoff: str | None, team: str,
                 venue: str | None) -> dict:
    """Days of rest, and the journey to this fixture.

    Where there is no previous game - a season opener - rest is genuinely
    undefined and says so, but the journey is still measurable: it is stated
    from the club's own stadium, and labelled as such, rather than left blank.
    """
    out: dict = {"rest_days": None, "travel": None, "short_week": None,
                 "travel_km": None, "tz_shift": None}
    try:
        now = datetime.fromisoformat(str(kickoff or "").replace("Z", "+00:00"))
    except ValueError:
        return out

    previous = None
    for row in history or []:
        try:
            then = datetime.fromisoformat(str(row["kickoff_utc"]).replace("Z", "+00:00"))
        except (ValueError, KeyError, TypeError):
            continue
        if then < now:
            previous = (then, row)
            break

    if previous:
        then, row = previous
        out["rest_days"] = (now - then).days
        # Six days is the ordinary week between Sunday fixtures; anything
        # shorter is the short week the schedule makes a story of.
        out["short_week"] = out["rest_days"] <= 5
        origin, origin_label = row.get("venue"), row.get("venue_city")
    else:
        origin = nfl_venues.HOME_VENUE.get(team)
        origin_label = "home"

    if venue and origin:
        out["travel_km"] = nfl_venues.great_circle_km(origin, venue)
        out["tz_shift"] = nfl_venues.tz_shift_hours(origin, venue, now)

    if out["travel_km"] == 0:
        out["travel"] = "No travel, at home" if not previous else "No travel since the last game"
    elif out["travel_km"] is not None:
        miles = round(out["travel_km"] * 0.621371)
        where = "home" if origin_label == "home" else f"from {origin_label}"
        shift = out["tz_shift"]
        clock = ""
        if shift:
            clock = f", {abs(shift):.0f}h {'ahead' if shift > 0 else 'back'}"
        out["travel"] = f"{miles:,} miles {where}{clock}"
    elif origin_label and origin_label != "home":
        out["travel"] = f"From {origin_label}"

    return out


def nfl_producer_from_espn(payload: dict, injuries: dict | None = None,
                          context: dict | None = None,
                          rest_history: dict | None = None) -> dict:
    # Observed team form and charted scheme profiles, projected field by
    # field out of the model board rather than passed through it.
    context = context if context is not None else nfl_public_context.build()
    form = context.get("form") or {}
    scheme = context.get("scheme") or {}
    players = context.get("players") or {}
    lineups = context.get("lineups") or {}
    player_coverage = context.get("player_coverage") or {}
    player_scheme = context.get("player_scheme") or {}
    team_stats = context.get("team_stats") or {}
    player_stats = context.get("player_stats") or {}
    team_stats_prior = context.get("team_stats_prior") or {}
    scheme_current = context.get("scheme_current") or {}
    defenders_current = context.get("defenders_current") or {}
    run_game = context.get("run_game") or {}
    red_zone = context.get("red_zone") or {}

    def red_zone_for(club: str) -> dict | None:
        windows = {window: clubs.get(club) for window, clubs in red_zone.items() if clubs.get(club)}
        return windows or None
    # Prior lines are matched by player, across every club: a receiver who
    # changed teams keeps his 2025 season.
    prior_by_id = {
        str(row.get("player_id")): row
        for rows in (context.get("player_stats_prior") or {}).values() for row in rows
        if row.get("player_id")
    }
    team_line = context.get("team_line") or {}
    rest = rest_history if rest_history is not None else {}

    def player_key(value: object) -> str:
        return re.sub(r"(?:jr|sr|ii|iii|iv)$", "",
                      re.sub(r"[^a-z0-9]", "", str(value or "").lower()))

    def starter_coverage(team: str) -> list[dict]:
        """Keep coverage history for the published RB/WR/TE starters only."""
        lineup = lineups.get(team) or {}
        names = {
            re.sub(r"[^a-z0-9]", "", str(player.get("name") or "").lower())
            for player in ((lineup.get("offense") or {}).get("players") or [])
            if str(player.get("position") or "").upper() in {"RB", "WR", "TE"}
        }
        return [
            profile for profile in player_coverage.get(team, [])
            if re.sub(r"[^a-z0-9]", "", str(profile.get("player_name") or "").lower())
            in names
        ]

    def starter_scheme(team: str) -> list[dict]:
        """Keep observed QB/RB scheme history for the published starters only."""
        lineup = lineups.get(team) or {}
        names = {
            player_key(player.get("name"))
            for player in ((lineup.get("offense") or {}).get("players") or [])
            if str(player.get("position") or "").upper() in {"QB", "RB"}
        }
        ids = {
            str(player.get("player_id")) for player in players.get(team, [])
            if player.get("player_id") and player_key(player.get("name")) in names
        }
        return [
            profile for profile in player_scheme.get(team, [])
            if (player_key(profile.get("player_name")) in names or
                str(profile.get("player_id") or "") in ids)
        ]

    def starter_stats(team: str) -> list[dict]:
        """Observed season lines for the skill players named on this board."""
        lineup = lineups.get(team) or {}
        named = {
            player_key(player.get("name"))
            for player in ((lineup.get("offense") or {}).get("players") or [])
            if str(player.get("position") or "").upper() in {"QB", "RB", "WR", "TE"}
        }
        if not named:
            named.update(
                player_key(player.get("name")) for player in players.get(team, [])
                if str(player.get("position") or "").upper() in {"QB", "RB", "WR", "TE"}
                and int(player.get("depth_rank") or 99) == 1
            )
        ids = {
            str(player.get("player_id")) for player in players.get(team, [])
            if player.get("player_id") and player_key(player.get("name")) in named
        }
        return [
            row for row in player_stats.get(team, [])
            if str(row.get("player_id") or "") in ids or
            player_key(row.get("player_name")) in named
        ]
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

        away_ctx = rest_context(rest.get(away_abbr), kickoff, away_abbr, venue)
        home_ctx = rest_context(rest.get(home_abbr), kickoff, home_abbr, venue)
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
            "venue_country": (venue_data.get("address") or {}).get("country") or None,
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
            "away_lineups": lineups.get(away_abbr),
            "home_lineups": lineups.get(home_abbr),
            "away_player_coverage": starter_coverage(away_abbr),
            "home_player_coverage": starter_coverage(home_abbr),
            "away_player_scheme": starter_scheme(away_abbr),
            "home_player_scheme": starter_scheme(home_abbr),
            "away_team_stats": team_stats.get(away_abbr),
            "home_team_stats": team_stats.get(home_abbr),
            "away_line_stats": team_line.get(away_abbr),
            "home_line_stats": team_line.get(home_abbr),
            "away_player_stats": starter_stats(away_abbr),
            "home_player_stats": starter_stats(home_abbr),
            "away_red_zone": red_zone_for(away_abbr),
            "home_red_zone": red_zone_for(home_abbr),
            "away_run_game": run_game.get(away_abbr),
            "home_run_game": run_game.get(home_abbr),
            "away_defenders_current": defenders_current.get(away_abbr),
            "home_defenders_current": defenders_current.get(home_abbr),
            "away_scheme_current": scheme_current.get(away_abbr),
            "home_scheme_current": scheme_current.get(home_abbr),
            "away_team_stats_prior": team_stats_prior.get(away_abbr),
            "home_team_stats_prior": team_stats_prior.get(home_abbr),
            "away_player_stats_prior": [
                prior_by_id[str(row.get("player_id"))] for row in starter_stats(away_abbr)
                if str(row.get("player_id") or "") in prior_by_id],
            "home_player_stats_prior": [
                prior_by_id[str(row.get("player_id"))] for row in starter_stats(home_abbr)
                if str(row.get("player_id") or "") in prior_by_id],
            "away_rest_days": away_ctx["rest_days"],
            "home_rest_days": home_ctx["rest_days"],
            "away_travel": away_ctx["travel"],
            "home_travel": home_ctx["travel"],
            "away_short_week": away_ctx["short_week"],
            "home_short_week": home_ctx["short_week"],
            "away_travel_km": away_ctx["travel_km"],
            "home_travel_km": home_ctx["travel_km"],
            "away_tz_shift": away_ctx["tz_shift"],
            "home_tz_shift": home_ctx["tz_shift"],
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


def write_nfl_league_context(context: dict, rest: dict) -> None:
    """All 32 clubs' observed rates and recent results, as one public artifact.

    The slate carries each fixture's own two clubs. This is the league they are
    ranked inside, so the page can show the board without asking for it a team
    at a time - the same shape the MLB side publishes.
    """
    form = context.get("form") or {}
    if not form:
        print("  skip nfl league context: no form on the board")
        return
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    recent: dict[str, dict] = {}
    for team, games in (rest or {}).items():
        played = [g for g in games if g.get("kickoff_utc")]
        if not played:
            continue
        played.sort(key=lambda g: str(g["kickoff_utc"]))
        recent[team] = {"games": len(played), "through": played[-1]["kickoff_utc"][:10]}

    out = {
        "schema": "chase-public-nfl-context/1",
        "sport": "nfl",
        "generated_at_utc": now,
        "data_through_utc": (context.get("source") or {}).get("observed_at_utc") or now,
        "season": (context.get("source") or {}).get("season"),
        "week": (context.get("source") or {}).get("week"),
        "note": "Ten observed rates per club with ranks recomputed from each rate "
                "against the 32-team pool. No power rating, projected win total "
                "or playoff probability is present.",
        "teams": form,
        "recent": recent,
    }
    dest = PUBLIC_DIR / "nfl" / "team_context.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    assert_clean(out)
    dest.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(f"  wrote {dest} ({len(form)} clubs)")


# Evidence that comes from the model board rather than from the schedule. When
# the board is unreachable `nfl_public_context.build()` fails soft to empty
# dicts, so a slate can be produced with every fixture listed and no scheme or
# form behind any of them. Game counts cannot catch that - a new day has a
# different number of fixtures for honest reasons - so the guard is per-kind and
# only fires on a total loss. Lineups and probable starters are deliberately NOT
# guarded: they are published late in the day and their absence in the morning is
# the truth, not a failure.
GUARDED_EVIDENCE = ("scheme", "form", "dvoa", "run_game", "red_zone")


def _evidence(payload: dict) -> dict[str, int]:
    """How many games actually carry each kind of evidence on either side."""
    games = payload.get("games") or []
    counts = {kind: sum(1 for g in games
                        if (g.get(f"away_{kind}") or g.get(f"home_{kind}")))
              for kind in GUARDED_EVIDENCE}
    counts["games"] = len(games)
    return counts


def _lost_evidence(fresh: dict, published: Path) -> str | None:
    if not published.is_file():
        return None
    try:
        previous = json.loads(published.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    old, new = _evidence(previous), _evidence(fresh)
    if not old["games"]:
        return None
    for kind in GUARDED_EVIDENCE:
        had = old[kind]
        if had >= max(2, old["games"] // 2) and new[kind] == 0:
            return (f"the published slate carries {kind} on {had} of {old['games']} "
                    f"games and this one on none")
    return None


# Club-level NFL evidence. A club missing one of these while nearly every other
# club on the same slate has it lost it to an upstream hiccup (on 2026-09-28 the
# Jets alone published with no player profiles and no lineups), not to a fact
# about the club.
NFL_CLUB_FIELDS = (
    "player_scheme", "player_coverage", "player_stats", "lineups", "scheme",
    "scheme_current", "line_stats", "run_game", "defenders_current", "red_zone",
    "team_stats", "form", "dvoa",
)


def _present(value) -> bool:
    return value not in (None, "", [], {})


def patch_club_gaps(fresh: dict, published: Path) -> list[str]:
    """Carry a club's field forward from the published slate when this run lost it.

    Only a field at least 90% of the fresh slate's clubs carry is treated as a
    gap; only the same club's value from the published slate is used. Returns
    what was patched and what could not be, so a run never passes silently.
    """
    games = fresh.get("games") or []
    sides = [(g, side) for g in games for side in ("away", "home") if g.get(side)]
    if not sides:
        return []
    previous: dict[tuple[str, str], object] = {}
    if published.is_file():
        try:
            old = json.loads(published.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            old = {}
        for g in old.get("games") or []:
            for side in ("away", "home"):
                club = g.get(side)
                for field in NFL_CLUB_FIELDS:
                    value = g.get(f"{side}_{field}")
                    if club and _present(value):
                        previous[(club, field)] = value
    notes: list[str] = []
    for field in NFL_CLUB_FIELDS:
        have = sum(1 for g, side in sides if _present(g.get(f"{side}_{field}")))
        # A field nobody has this run, while the published slate has it for
        # most of these clubs, is a board-wide source outage (2026-10-03: no
        # Parquet engine on the runner emptied every nflverse family). Carrying
        # it forward keeps the rest of the slate - injuries, starters, scores -
        # publishing instead of the guard freezing the whole slate for days.
        outage = have == 0 and sum(1 for g, side in sides
                                   if _present(previous.get((g[side], field)))) >= 0.9 * len(sides)
        if have == len(sides) or (have < 0.9 * len(sides) and not outage):
            continue
        if outage:
            notes.append(f"{field} absent from every club this run; carried from the published slate")
        for g, side in sides:
            key = f"{side}_{field}"
            if _present(g.get(key)):
                continue
            club = g[side]
            carried = previous.get((club, field))
            if _present(carried):
                g[key] = carried
                notes.append(f"{club} {field} carried from the published slate")
            else:
                notes.append(f"{club} {field} MISSING (no published value to carry)")
    return notes


def write_if_better(sport: str, producer: dict, dest: Path) -> bool:
    if not producer.get("games"):
        print(f"  skip {sport}: empty producer; keeping {dest}")
        return False
    out = project_slate(sport, producer)
    assert_clean(out)
    if sport == "nfl":
        for note in patch_club_gaps(out, dest):
            print(f"  WARNING nfl: {note}")
    lost = _lost_evidence(out, dest)
    if lost:
        print(f"  skip {sport}: {lost}; keeping the published slate")
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(f"  wrote {dest} ({len(out['games'])} games)")
    return True


def publish_nfl() -> bool:
    """Rebuild and publish the NFL slate (injuries, depth charts, starters,
    scores and the scheme context). True when the public slate was written."""
    ok = False
    espn = fetch_nfl_scoreboard()
    if espn:
        codes = {
            (c.get("team") or {}).get("abbreviation")
            for event in (espn.get("events") or [])
            for comp in (event.get("competitions") or [])
            for c in (comp.get("competitors") or [])
        }
        context = nfl_public_context.build()
        rest = fetch_nfl_rest({c for c in codes if c})
        nfl = nfl_producer_from_espn(espn, fetch_nfl_injuries(), context, rest)
        dvoa = fetch_ftn_dvoa(datetime.now(ET).year)
        attached = attach_nfl_dvoa(nfl, dvoa)
        expected = len(nfl.get("games") or []) * 2
        if attached != expected:
            print(f"  WARNING nfl DVOA: attached {attached} of {expected} team profiles")
        else:
            print(f"  nfl DVOA: attached all {attached} team profiles")
        # The whole league, once, so the matchup page can show every club
        # against the two in front of the reader. Each game already carries its
        # own two clubs; this is the board behind them.
        write_nfl_league_context(context, rest)
        ok = write_if_better("nfl", nfl, PUBLIC_DIR / "nfl" / "slate.json") or ok
    else:
        print("  skip nfl: scoreboard unreachable; keeping existing public slate")
    return ok


def run(data_dir: Path | None = None, mlb_only: bool = False) -> int:
    data_dir = Path(data_dir or DATA_DIR)
    ok = False
    slate_date, schedule = next_mlb_slate(datetime.now(ET).strftime("%Y-%m-%d"))
    curated = _for_day(mlb_producer(data_dir), slate_date)
    if schedule:
        rotowire_starters = add_rotowire_starter_ids(
            fetch_rotowire_starters(slate_date, schedule)
        )
        starter_ids = [
            ((node.get("probablePitcher") or {}).get("id"))
            for block in (schedule.get("dates") or [])
            for game in (block.get("games") or [])
            for node in ((game.get("teams") or {}).get("away"),
                         (game.get("teams") or {}).get("home"))
            if node
        ]
        starter_ids.extend(
            side.get("id")
            for matchup in rotowire_starters.values()
            for side in (matchup.get("away") or {}, matchup.get("home") or {})
            if side.get("id")
        )
        official = mlb_producer_from_statsapi(
            schedule,
            fetch_mlb_arms(starter_ids, int(slate_date[:4])),
            rotowire_starters,
        )
        mlb = merge_producers(official, curated)
        print(f"  mlb: {len(official['games'])} on the official schedule for {slate_date}, "
              f"{len(curated['games'])} curated rows merged in")
    else:
        mlb = curated
        print("  mlb: schedule unreachable; falling back to the curated rows only")
    ok = write_if_better("mlb", mlb, PUBLIC_DIR / "mlb" / "slate.json") or ok
    if mlb_only:
        return 0 if (PUBLIC_DIR / "mlb" / "slate.json").is_file() else 1
    ok = publish_nfl() or ok
    return 0 if (PUBLIC_DIR / "mlb" / "slate.json").is_file() else 1


if __name__ == "__main__":
    if "--nfl-only" in sys.argv[1:]:
        # The NFL desk's own refresh (publish-nfl-slate.yml): injury reports
        # move through the week and inactives post 90 minutes before kickoff.
        raise SystemExit(0 if publish_nfl() or (PUBLIC_DIR / "nfl" / "slate.json").is_file() else 1)
    raise SystemExit(run(mlb_only="--mlb-only" in sys.argv[1:]))
