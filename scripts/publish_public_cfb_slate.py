#!/usr/bin/env python3
"""Build the public CFB research slate with observed team rates.

Identity comes from the CFB model board (names, logos, kickoff). Season-to-date
rates come from ESPN's published team statistics and are ranked against that
same FBS pool. Nothing here is a projection or a priced edge.
"""
from __future__ import annotations

import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "public" / "cfb" / "slate.json"
BOARD_URL = "https://alphakiller1.github.io/cfb-model/board.json"
STATS_URL = (
    "https://site.web.api.espn.com/apis/common/v3/sports/football/"
    "college-football/statistics/byteam?region=us&lang=en&contentorigin=espn&limit=300"
)
SCOREBOARD_URL = "https://cdn.espn.com/core/college-football/scoreboard?xhr=1&limit=300"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Referer": "https://www.espn.com/college-football/scoreboard",
}

FORM_SPEC = (
    ("off_ppa", "own", "passing", "totalPointsPerGame",
     "Points per game", "high", "num"),
    ("def_ppa", "opp", "passing", "totalPointsPerGame",
     "Points allowed per game", "low", "num"),
    ("off_ypg", "own", "passing", "yardsPerGame",
     "Yards per game", "high", "num"),
    ("def_ypg", "opp", "passing", "yardsPerGame",
     "Yards allowed per game", "low", "num"),
    ("off_successRate", "own", "miscellaneous", "thirdDownConvPct",
     "Offense third-down rate", "high", "pct"),
    ("def_successRate", "opp", "miscellaneous", "thirdDownConvPct",
     "Third-down rate allowed", "low", "pct"),
    ("off_fourth", "own", "miscellaneous", "fourthDownConvPct",
     "Fourth-down rate", "high", "pct"),
    ("def_fourth", "opp", "miscellaneous", "fourthDownConvPct",
     "Fourth-down rate allowed", "low", "pct"),
    ("off_first_downs", "own", "miscellaneous", "firstDowns",
     "First downs per game", "high", "pg"),
    ("def_first_downs", "opp", "miscellaneous", "firstDowns",
     "First downs allowed per game", "low", "pg"),
    ("off_explosiveness", "own", "passing", "yardsPerPassAttempt",
     "Yards per pass attempt", "high", "num"),
    ("def_explosiveness", "opp", "passing", "yardsPerPassAttempt",
     "Yards per pass allowed", "low", "num"),
    ("off_pass_ypg", "own", "passing", "passingYardsPerGame",
     "Passing yards per game", "high", "num"),
    ("def_pass_ypg", "opp", "passing", "passingYardsPerGame",
     "Passing yards allowed per game", "low", "num"),
    ("off_comp", "own", "passing", "completionPct",
     "Completion rate", "high", "pct"),
    ("def_comp", "opp", "passing", "completionPct",
     "Completion rate allowed", "low", "pct"),
    ("off_qbr", "own", "passing", "QBRating",
     "Passer rating", "high", "num"),
    ("def_qbr", "opp", "passing", "QBRating",
     "Passer rating allowed", "low", "num"),
    ("off_pass_td", "own", "passing", "passingTouchdowns",
     "Passing TDs per game", "high", "pg"),
    ("def_pass_td", "opp", "passing", "passingTouchdowns",
     "Passing TDs allowed per game", "low", "pg"),
    ("off_int", "own", "passing", "interceptions",
     "INTs thrown per game", "low", "pg"),
    ("def_int", "opp", "passing", "interceptions",
     "INTs forced per game", "high", "pg"),
    ("off_sacks", "own", "passing", "sacks",
     "Sacks taken per game", "low", "pg"),
    ("def_sacks", "opp", "passing", "sacks",
     "Sacks per game", "high", "pg"),
    ("off_stuffRate", "own", "rushing", "yardsPerRushAttempt",
     "Yards per rush attempt", "high", "num"),
    ("def_stuffRate", "opp", "rushing", "yardsPerRushAttempt",
     "Yards per rush allowed", "low", "num"),
    ("off_rush_ypg", "own", "rushing", "rushingYardsPerGame",
     "Rushing yards per game", "high", "num"),
    ("def_rush_ypg", "opp", "rushing", "rushingYardsPerGame",
     "Rushing yards allowed per game", "low", "num"),
    ("off_rush_td", "own", "rushing", "rushingTouchdowns",
     "Rushing TDs per game", "high", "pg"),
    ("def_rush_td", "opp", "rushing", "rushingTouchdowns",
     "Rushing TDs allowed per game", "low", "pg"),
    ("off_fg", "own", "kicking", "fieldGoalPct",
     "Field-goal rate", "high", "pct"),
    ("off_punt", "own", "punting", "netAvgPuntYards",
     "Net punt average", "high", "num"),
    ("off_kr", "own", "returning", "yardsPerKickReturn",
     "Kick-return average", "high", "num"),
    ("off_pr", "own", "returning", "yardsPerPuntReturn",
     "Punt-return average", "high", "num"),
    ("off_pen", "own", "miscellaneous", "totalPenaltyYards",
     "Penalty yards per game", "low", "pg"),
)


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=45) as response:
        raw = response.read()
    if not raw:
        raise RuntimeError(f"empty response from {url}")
    return json.loads(raw)


def as_rate(value, fmt: str, games: float | None = None):
    if value is None:
        return None
    number = float(value)
    if fmt == "pct" and number > 1.5:
        number = number / 100.0
    if fmt == "pg":
        if not games or games <= 0:
            return None
        number = number / games
    return number


def rank(pool: list[float], value: float, better: str) -> int:
    if better == "high":
        return 1 + sum(1 for other in pool if other > value + 1e-12)
    return 1 + sum(1 for other in pool if other < value - 1e-12)


def category_map(block: dict, names: list[str]) -> dict[str, float]:
    values = block.get("values") or []
    out: dict[str, float] = {}
    for name, raw in zip(names, values):
        try:
            if raw is None or raw == "":
                continue
            out[name] = float(raw)
        except (TypeError, ValueError):
            continue
    return out


def load_espn_stats(season: int) -> dict[str, dict]:
    """Load one explicitly requested regular season and fail closed on drift."""
    payload = fetch_json(f"{STATS_URL}&season={season}&seasontype=2")
    requested = payload.get("requestedSeason") or {}
    requested_type = requested.get("type") or {}
    if int(requested.get("year") or 0) != season or int(requested_type.get("type") or 0) != 2:
        raise RuntimeError(
            "ESPN CFB statistics season mismatch: "
            f"requested {season} regular season, received {requested!r}"
        )
    names_by_cat = {
        cat["name"]: list(cat.get("names") or [])
        for cat in payload.get("categories") or []
    }
    teams: dict[str, dict] = {}
    for row in payload.get("teams") or []:
        meta = row.get("team") or {}
        own: dict[str, dict] = {}
        opp: dict[str, dict] = {}
        for block in row.get("categories") or []:
            split = "opp" if str(block.get("splitId")) == "900" else "own"
            bucket = opp if split == "opp" else own
            cat = block.get("name")
            bucket[cat] = category_map(block, names_by_cat.get(cat) or [])
        games = ((own.get("general") or {}).get("gamesPlayed"))
        entry = {
            "id": str(meta.get("id") or ""),
            "season": season,
            "abbreviation": str(meta.get("abbreviation") or "").upper(),
            "school": meta.get("nickname") or meta.get("shortDisplayName") or meta.get("displayName"),
            "display": meta.get("displayName") or "",
            "own": own,
            "opp": opp,
            "plays": games,
        }
        for key in filter(None, (
            entry["abbreviation"],
            str(entry["school"] or "").lower(),
            str(meta.get("shortDisplayName") or "").lower(),
            str(meta.get("displayName") or "").lower(),
        )):
            teams.setdefault(key, entry)
    return teams


def load_espn_events() -> list[dict]:
    try:
        payload = fetch_json(SCOREBOARD_URL)
    except (RuntimeError, OSError):
        return []
    return (((payload.get("content") or {}).get("sbData") or {}).get("events")) or []


def event_index(events: list[dict]) -> dict[tuple[str, str], dict]:
    out: dict[tuple[str, str], dict] = {}
    for event in events:
        comps = event.get("competitions") or []
        if not comps:
            continue
        comp = comps[0]
        sides = {}
        for competitor in comp.get("competitors") or []:
            team = competitor.get("team") or {}
            sides[competitor.get("homeAway")] = {
                "abbr": str(team.get("abbreviation") or "").upper(),
                "school": team.get("nickname") or team.get("shortDisplayName") or team.get("displayName"),
                "record": ((competitor.get("records") or [{}])[0] or {}).get("summary"),
                "score": competitor.get("score"),
            }
        away, home = sides.get("away") or {}, sides.get("home") or {}
        if not away.get("abbr") or not home.get("abbr"):
            continue
        venue = comp.get("venue") or {}
        address = venue.get("address") or {}
        city = ", ".join(part for part in (address.get("city"), address.get("state")) if part)
        broadcasts = []
        for item in comp.get("broadcasts") or []:
            broadcasts.extend(item.get("names") or [])
        state = str(((comp.get("status") or {}).get("type") or {}).get("state") or "pre").lower()
        game_state = "live" if state == "in" else ("final" if state == "post" else "scheduled")
        qbs = {}
        for leader in event.get("competitions", [{}])[0].get("leaders") or event.get("leaders") or []:
            if str(leader.get("name") or "").lower() not in {"passingyards", "passing yards", "qb"}:
                continue
            for item in leader.get("leaders") or []:
                athlete = item.get("athlete") or {}
                team = (item.get("team") or {}).get("abbreviation") or ""
                if athlete.get("displayName") and team:
                    qbs[str(team).upper()] = athlete.get("displayName")
        payload = {
            "kickoff_utc": event.get("date") or comp.get("date"),
            "venue": venue.get("fullName"),
            "venue_city": city or None,
            "roof": "Indoor" if venue.get("indoor") else "Outdoor",
            "surface": "Indoor" if venue.get("indoor") else None,
            "broadcast": ", ".join(broadcasts[:2]) or None,
            "neutral": True if comp.get("neutralSite") else None,
            "game_state": game_state,
            "away": away,
            "home": home,
            "qbs": qbs,
        }
        out[(away["abbr"], home["abbr"])] = payload
        if away.get("school") and home.get("school"):
            out[(str(away["school"]).lower(), str(home["school"]).lower())] = payload
    return out


def lookup_team(stats: dict[str, dict], abbr: str, school: str) -> dict | None:
    return (
        stats.get(str(abbr or "").upper())
        or stats.get(str(school or "").lower())
        or stats.get(re.sub(r"\s+", " ", str(school or "").lower()))
    )


def form_for(team: dict | None, pools: dict[str, list[float]], season: int) -> dict | None:
    if not team or int(team.get("season") or 0) != season:
        return None
    games = team.get("plays")
    rates = {}
    for key, split, cat, field, label, better, fmt in FORM_SPEC:
        bucket = team[split].get(cat) or {}
        value = as_rate(bucket.get(field), fmt, games)
        pool = pools.get(key) or []
        if value is None or not pool:
            continue
        rates[key] = {
            "label": label,
            "value": round(value, 4),
            "better": better,
            "rank": rank(pool, value, better),
            "of": len(pool),
            "format": "num" if fmt == "pg" else fmt,
        }
    if not rates:
        return None
    out = {"rates": rates, "source": "espn", "season": season}
    if games:
        out["plays"] = games
    return out


def load_board_games() -> tuple[list[dict], dict]:
    board = fetch_json(BOARD_URL)
    return board.get("games") or [], board


def public_game(raw: dict, stats: dict, events: dict, pools: dict, season: int) -> dict:
    away_meta, home_meta = raw.get("away") or {}, raw.get("home") or {}
    away_abbr = away_meta.get("abbreviation") or away_meta.get("school")
    home_abbr = home_meta.get("abbreviation") or home_meta.get("school")
    away_school = away_meta.get("school")
    home_school = home_meta.get("school")
    event = events.get((str(away_abbr).upper(), str(home_abbr).upper())) or events.get(
        (str(away_school).lower(), str(home_school).lower())
    ) or {}
    away_side = (event.get("away") or {})
    home_side = (event.get("home") or {})
    row = {
        "id": f"{away_abbr}@{home_abbr}",
        "sport": "cfb",
        "season": season,
        "game_state": event.get("game_state") or "scheduled",
        "kickoff_utc": event.get("kickoff_utc") or raw.get("kickoff"),
        "away": away_abbr,
        "home": home_abbr,
        "away_name": away_school,
        "home_name": home_school,
        "away_conference": away_meta.get("conference"),
        "home_conference": home_meta.get("conference"),
        "away_logo": away_meta.get("logo"),
        "home_logo": home_meta.get("logo"),
        "away_color": away_meta.get("color"),
        "home_color": home_meta.get("color"),
        "away_record": away_side.get("record"),
        "home_record": home_side.get("record"),
        "away_score": away_side.get("score"),
        "home_score": home_side.get("score"),
        "venue": event.get("venue"),
        "venue_city": event.get("venue_city"),
        "roof": event.get("roof"),
        "surface": event.get("surface"),
        "broadcast": event.get("broadcast"),
        "neutral": event.get("neutral") or (True if raw.get("neutral") else None),
        "away_starter": (event.get("qbs") or {}).get(str(away_abbr).upper()),
        "home_starter": (event.get("qbs") or {}).get(str(home_abbr).upper()),
        "away_form": form_for(lookup_team(stats, away_abbr, away_school), pools, season),
        "home_form": form_for(lookup_team(stats, home_abbr, home_school), pools, season),
        "home_travel": None if (event.get("neutral") or raw.get("neutral")) else "Home",
    }
    return {key: value for key, value in row.items() if value not in (None, "")}


def main() -> int:
    games_in, board = load_board_games()
    season = int(board.get("season") or 0)
    current_year = datetime.now(timezone.utc).year
    if season != current_year:
        raise RuntimeError(
            f"CFB board season {season or 'missing'} is not the current year {current_year}; "
            "refusing to publish a mixed-season matchup slate"
        )
    stats = load_espn_stats(season)
    unique = []
    seen = set()
    for entry in stats.values():
        ident = entry["id"]
        if ident in seen:
            continue
        seen.add(ident)
        unique.append(entry)
    pools: dict[str, list[float]] = {spec[0]: [] for spec in FORM_SPEC}
    for team in unique:
        for key, split, cat, field, _label, _better, fmt in FORM_SPEC:
            value = as_rate((team[split].get(cat) or {}).get(field), fmt, team.get("plays"))
            if value is not None:
                pools[key].append(value)
    events = event_index(load_espn_events())
    games = [public_game(raw, stats, events, pools, season) for raw in games_in]
    games.sort(key=lambda row: (row.get("kickoff_utc") or "9999", row.get("id") or ""))
    stamp = datetime.now(timezone.utc).replace(microsecond=0)
    payload = {
        "schema": "chase-public-slate/1",
        "sport": "cfb",
        "season": season,
        "week": board.get("week"),
        "generated_at_utc": stamp.isoformat().replace("+00:00", "Z"),
        "data_through_utc": board.get("generated_at"),
        "games": games,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    with_form = sum(1 for game in games if game.get("away_form") and game.get("home_form"))
    print(f"wrote {OUT} ({len(games)} games, {with_form} with both unit profiles)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
