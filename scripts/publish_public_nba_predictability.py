#!/usr/bin/env python3
"""Publish data/public/nba/predictability.json: every club's predictability on
the NBA curve (pipeline/predictability.py).

Every regular-season final this season is read from ESPN's box score; each
side's outcome is points per 100 box possessions (FGA - ORB + TOV + 0.44 FTA).
Boxes are cached by event id, so a run fetches only new finals. The file is
kept when fewer than every club can be scored or the season would shrink.
"""
from __future__ import annotations

import json
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from pipeline import predictability  # noqa: E402

OUT = ROOT / "data" / "public" / "nba" / "predictability.json"
CACHE = ROOT / ".cache" / "nba-boxes"
BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba"
HEADERS = {"User-Agent": "Mozilla/5.0 (chase-analytics publisher)", "Accept": "application/json"}


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
    """{abbreviation: (points, possessions)} for both sides, cached."""
    cached = CACHE / f"{event_id}.json"
    if cached.exists():
        return json.loads(cached.read_text(encoding="utf-8"))
    try:
        payload = fetch(f"{BASE}/summary?event={event_id}")
        comp = payload["header"]["competitions"][0]
        scores = {str(c["team"]["id"]): int(c["score"]) for c in comp["competitors"]}
        out = {}
        for team in payload["boxscore"]["teams"]:
            v = {s["name"]: s["displayValue"] for s in team["statistics"]}
            fga = int(v["fieldGoalsMade-fieldGoalsAttempted"].split("-")[1])
            fta = int(v["freeThrowsMade-freeThrowsAttempted"].split("-")[1])
            poss = fga - int(v["offensiveRebounds"]) + int(v.get("totalTurnovers") or v["turnovers"]) + 0.44 * fta
            if not 70 <= poss <= 140:
                return None
            out[team["team"]["abbreviation"]] = [scores[str(team["team"]["id"])], poss]
        if len(out) != 2:
            return None
    except Exception:
        return None
    CACHE.mkdir(parents=True, exist_ok=True)
    cached.write_text(json.dumps(out), encoding="utf-8")
    return out


def build(now: datetime) -> dict | None:
    season = now.year + 1 if now.month >= 9 else now.year
    finals = season_finals(season, now.date())
    with ThreadPoolExecutor(max_workers=6) as pool:
        boxes = list(pool.map(lambda e: box(str(e["id"])), finals))
    games = []
    for event, b in zip(finals, boxes):
        if not b:
            continue
        sides = {c["homeAway"]: c["team"]["abbreviation"] for c in event["competitions"][0]["competitors"]}
        if set(sides.values()) != set(b):
            continue
        games.append({"home": sides["home"], "away": sides["away"],
                      "home_off": 100 * b[sides["home"]][0] / b[sides["home"]][1],
                      "away_off": 100 * b[sides["away"]][0] / b[sides["away"]][1]})
    clubs = predictability.score(games, predictability.NBA)
    if not clubs:
        return None
    return {"schema": "chase-public-nba-predictability/1", "sport": "nba", "season": season,
            "games": len(games), "teams": clubs}


def main() -> int:
    now = datetime.now(timezone.utc)
    try:
        value = build(now)
    except Exception as exc:  # the slate still publishes without it
        print(f"::warning::NBA predictability unavailable: {exc}")
        return 0
    if not value:
        print("NBA predictability: too few finals yet; keeping the published file")
        return 0
    if OUT.exists():
        prev = json.loads(OUT.read_text(encoding="utf-8"))
        if prev.get("season") == value["season"] and prev.get("games", 0) > value["games"]:
            print("::warning::NBA predictability would shrink; keeping the published file")
            return 0
        if {k: v for k, v in prev.items() if k != "generated_at_utc"} == value:
            print("NBA predictability unchanged")
            return 0
    value["generated_at_utc"] = now.replace(microsecond=0).isoformat()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(value, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(value['teams'])} clubs from {value['games']} finals")
    return 0


if __name__ == "__main__":
    sys.exit(main())
