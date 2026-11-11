#!/usr/bin/env python3
"""Publish the NBA desk's season evidence built from every final's ESPN box:

* data/public/nba/predictability.json - every offense's predictability on the
  NBA curve (pipeline/predictability.py);
* data/public/nba/power.json - the adjusted power ranking (pipeline/power.py:
  offense, defense and net per 100 possessions on noise-adjusted points,
  schedule strength, record against the record the club's play supports) and
  every club's game log: final and noise-adjusted score, and the game's
  offense, defense and pace, each placed among every team-game that week.

Every regular-season final this season is read from ESPN's box score. Boxes
are cached by event id, so a run fetches only new finals. A file is kept when
fewer than every club can be scored or the season would shrink.
"""
from __future__ import annotations

import json
import sys
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from pipeline import power, predictability  # noqa: E402

OUT = ROOT / "data" / "public" / "nba" / "predictability.json"
POWER_OUT = ROOT / "data" / "public" / "nba" / "power.json"
CACHE = ROOT / ".cache" / "nba-boxes"
BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba"
HEADERS = {"User-Agent": "Mozilla/5.0 (chase-analytics publisher)", "Accept": "application/json"}
EASTERN = ZoneInfo("America/New_York")
FIELDS = ("pts", "poss", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "orb", "drb", "tov")
# Ridge pull, in games, toward each club's starting point: last season's
# offense and defense per 100 carried 0.8 of the way (pipeline/power.py; NBA
# 2023-2026 validated).
PENALTY = 8.0
CARRY = 0.8
EVIDENCE = ROOT / "data" / "public" / "nba" / "evidence.json"
# [key, higher is better (None: neutral)] for each game-log figure.
LOG_RATES = (("off_rtg", True), ("def_rtg", False), ("pace", None))


def fetch(url: str) -> dict:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def season_finals(season: int, today: date) -> list[dict]:
    """Completed regular-season events from October through yesterday."""
    finals, day = [], date(season - 1, 10, 1)
    days = []
    while day < today:
        days.append(day)
        day += timedelta(days=1)
    with ThreadPoolExecutor(max_workers=6) as pool:
        boards = pool.map(lambda d: fetch(f"{BASE}/scoreboard?dates={d:%Y%m%d}"), days)
        for board in boards:
            for event in board.get("events") or []:
                if (event.get("season") or {}).get("type") == 2 and \
                        ((event.get("status") or {}).get("type") or {}).get("completed"):
                    finals.append(event)
    return finals


def box(event_id: str) -> dict | None:
    """{"minutes": n, "teams": {abbreviation: {pts, poss, fgm, fga, ...}}}, cached."""
    cached = CACHE / f"{event_id}.json"
    if cached.exists():
        value = json.loads(cached.read_text(encoding="utf-8"))
        if isinstance(value, dict) and "teams" in value and all(set(FIELDS) <= set(s) for s in value["teams"].values()):
            return value
    try:
        payload = fetch(f"{BASE}/summary?event={event_id}")
        comp = payload["header"]["competitions"][0]
        scores = {str(c["team"]["id"]): int(c["score"]) for c in comp["competitors"]}
        periods = {len(c.get("linescores") or []) for c in comp["competitors"]}
        if len(periods) != 1 or not 4 <= next(iter(periods)) <= 12:
            return None
        teams = {}
        for team in payload["boxscore"]["teams"]:
            v = {s["name"]: s["displayValue"] for s in team["statistics"]}
            fgm, fga = map(int, v["fieldGoalsMade-fieldGoalsAttempted"].split("-"))
            tpm, tpa = map(int, v["threePointFieldGoalsMade-threePointFieldGoalsAttempted"].split("-"))
            ftm, fta = map(int, v["freeThrowsMade-freeThrowsAttempted"].split("-"))
            orb, drb = int(v["offensiveRebounds"]), int(v["defensiveRebounds"])
            tov = int(v.get("totalTurnovers") or v["turnovers"])
            poss = fga - orb + tov + 0.44 * fta
            points = scores[str(team["team"]["id"])]
            if not 70 <= poss <= 160 or 2 * fgm + tpm + ftm != points or not 0 <= tpm <= min(fgm, tpa) \
                    or not 0 <= ftm <= fta:
                return None
            teams[team["team"]["abbreviation"]] = {"pts": points, "poss": poss, "fgm": fgm, "fga": fga, "tpm": tpm,
                                                   "tpa": tpa, "ftm": ftm, "fta": fta, "orb": orb, "drb": drb,
                                                   "tov": tov}
        if len(teams) != 2:
            return None
        out = {"minutes": 48 + 5 * (next(iter(periods)) - 4), "teams": teams}
    except Exception:
        return None
    CACHE.mkdir(parents=True, exist_ok=True)
    cached.write_text(json.dumps(out), encoding="utf-8")
    return out


def week_of(day: str) -> str:
    d = date.fromisoformat(day)
    return (d - timedelta(days=d.weekday())).isoformat()


def read_finals(now: datetime) -> tuple[int, list[dict]]:
    season = now.year + 1 if now.month >= 9 else now.year
    finals = season_finals(season, now.date())
    with ThreadPoolExecutor(max_workers=6) as pool:
        boxes = list(pool.map(lambda e: box(str(e["id"])), finals))
    games = []
    for event, b in zip(finals, boxes):
        if not b:
            continue
        comp = event["competitions"][0]
        sides = {c["homeAway"]: c["team"]["abbreviation"] for c in comp["competitors"]}
        if set(sides.values()) != set(b["teams"]):
            continue
        start = datetime.fromisoformat(event["date"].replace("Z", "+00:00")).astimezone(EASTERN).date().isoformat()
        games.append({"id": str(event["id"]), "date": start, "home": sides["home"], "away": sides["away"],
                      "neutral": bool(comp.get("neutralSite")), "minutes": b["minutes"], "teams": b["teams"]})
    games.sort(key=lambda g: (g["date"], g["id"]))
    return season, games


def build_predictability(season: int, games: list[dict]) -> dict | None:
    events: dict[str, list] = {}
    for g in games:
        for club, s in g["teams"].items():
            events.setdefault(club, []).append(
                predictability.basketball_game(s["fgm"], s["tpm"], s["ftm"], s["fta"], s["pts"], s["poss"]))
    clubs = predictability.score(events, predictability.NBA)
    if not clubs:
        return None
    return {"schema": "chase-public-nba-predictability/1", "sport": "nba", "season": season,
            "games": len(games), "teams": clubs}


def previous_ratings(season: int):
    """Last season's points scored and allowed per 100 from the published
    evidence file, as this season's starting point."""
    try:
        teams = json.loads(EVIDENCE.read_text(encoding="utf-8"))["seasons"][str(season - 1)]["teams"]
        rates = {c: t["form"]["rates"] for c, t in teams.items()}
        return power.season_prior({c: r["off_rtg"]["value"] for c, r in rates.items()},
                                  {c: r["def_rtg"]["value"] for c, r in rates.items()}, CARRY)
    except (OSError, KeyError, TypeError, ValueError):
        return None


def build_power(season: int, games: list[dict]) -> dict | None:
    if len(games) < 30:
        return None
    totals: dict[str, dict] = defaultdict(lambda: defaultdict(float))
    for g in games:
        for club, s in g["teams"].items():
            for k in ("tpm", "tpa", "ftm", "fta"):
                totals[club][k] += s[k]
    rates = power.shooting_rates(totals)
    rows, played, logs = [], [], defaultdict(list)
    for g in games:
        poss = (g["teams"][g["home"]]["poss"] + g["teams"][g["away"]]["poss"]) / 2
        adj = {c: power.basketball_points(s["pts"], s["tpm"], s["tpa"], s["ftm"], s["fta"], rates[c])
               for c, s in g["teams"].items()}
        for me, opp, loc in ((g["home"], g["away"], 0 if g["neutral"] else 1), (g["away"], g["home"], 0 if g["neutral"] else -1)):
            mine, theirs = g["teams"][me], g["teams"][opp]
            rows.append(power.Row(me, opp, loc, 100 * adj[me] / poss, poss))
            margin = mine["pts"] - theirs["pts"]
            played.append(power.Played(me, opp, loc, margin > 0 if margin else None, poss / 100, margin))
            logs[me].append({
                "id": g["id"], "date": g["date"], "week": week_of(g["date"]), "opp": opp,
                "home": loc > 0, "neutral": g["neutral"],
                "points": mine["pts"], "opp_points": theirs["pts"],
                "adj_points": round(adj[me], 1), "opp_adj_points": round(adj[opp], 1),
                "off_rtg": 100 * mine["pts"] / mine["poss"], "def_rtg": 100 * theirs["pts"] / theirs["poss"],
                "pace": poss * 48 / g["minutes"],
            })
    fit = power.ridge(rows, PENALTY, prior=previous_ratings(season))
    ranked = power.table(fit, played, set(logs))
    # Each game's figures placed among every team-game that week.
    weeks: dict[str, list[dict]] = defaultdict(list)
    for entries in logs.values():
        for e in entries:
            weeks[e["week"]].append(e)
    for pool in weeks.values():
        for key, higher in LOG_RATES:
            values = [e[key] for e in pool]
            for e in pool:
                v = e[key]
                ahead = sum(1 for x in values if (x < v - 1e-9 if higher is False else x > v + 1e-9))
                e[key] = {"value": round(v, 1), "rank": ahead + 1, "of": len(values)}
    for entries in logs.values():
        entries.sort(key=lambda e: (e["date"], e["id"]), reverse=True)
    return {"schema": "chase-public-nba-power/1", "sport": "nba", "season": season, "games": len(games),
            "through": games[-1]["date"], "units": "points per 100 possessions",
            "home_court": ranked["home_court"], "league_mean": ranked["league_mean"],
            "teams": ranked["teams"], "logs": dict(logs)}


def write(path: Path, value: dict, size_key: str, now: datetime) -> None:
    if path.exists():
        prev = json.loads(path.read_text(encoding="utf-8"))
        if prev.get("season") == value["season"] and prev.get(size_key, 0) > value[size_key]:
            print(f"::warning::{path.name} would shrink; keeping the published file")
            return
        if {k: v for k, v in prev.items() if k != "generated_at_utc"} == value:
            print(f"{path.name} unchanged")
            return
    value["generated_at_utc"] = now.replace(microsecond=0).isoformat()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT)}: {len(value['teams'])} clubs from {value['games']} finals")


def main() -> int:
    now = datetime.now(timezone.utc)
    try:
        season, games = read_finals(now)
    except Exception as exc:  # the slate still publishes without it
        print(f"::warning::NBA finals unavailable: {exc}")
        return 0
    value = build_predictability(season, games)
    if value:
        write(OUT, value, "games", now)
    else:
        print("NBA predictability: too few finals yet; keeping the published file")
    ranked = build_power(season, games)
    if ranked and len(ranked["teams"]) == 30:
        write(POWER_OUT, ranked, "games", now)
    else:
        print("NBA power: fewer than 30 clubs rated; keeping the published file")
    return 0


if __name__ == "__main__":
    sys.exit(main())
