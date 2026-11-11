#!/usr/bin/env python3
"""Publish data/public/nba/predictability.json: every offense's predictability
on the NBA curve (pipeline/predictability.py).

Every regular-season final this season is read from ESPN's box score: each
side's possessions (FGA - ORB + TOV + 0.44 FTA), points, twos, threes and free
throws. Boxes are cached by event id, so a run fetches only new finals. The
file is kept when fewer than every club can be scored or the season would
shrink.
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
    """{abbreviation: [points, possessions, FGM, 3PM, FTM, FTA]} for both sides, cached."""
    cached = CACHE / f"{event_id}.json"
    if cached.exists():
        value = json.loads(cached.read_text(encoding="utf-8"))
        if all(len(side) == 6 for side in value.values()):
            return value
    try:
        payload = fetch(f"{BASE}/summary?event={event_id}")
        comp = payload["header"]["competitions"][0]
        scores = {str(c["team"]["id"]): int(c["score"]) for c in comp["competitors"]}
        out = {}
        for team in payload["boxscore"]["teams"]:
            v = {s["name"]: s["displayValue"] for s in team["statistics"]}
            fgm, fga = map(int, v["fieldGoalsMade-fieldGoalsAttempted"].split("-"))
            tpm = int(v["threePointFieldGoalsMade-threePointFieldGoalsAttempted"].split("-")[0])
            ftm, fta = map(int, v["freeThrowsMade-freeThrowsAttempted"].split("-"))
            poss = fga - int(v["offensiveRebounds"]) + int(v.get("totalTurnovers") or v["turnovers"]) + 0.44 * fta
            if not 70 <= poss <= 140:
                return None
            points = scores[str(team["team"]["id"])]
            if 2 * fgm + tpm + ftm != points:
                return None
            out[team["team"]["abbreviation"]] = [points, poss, fgm, tpm, ftm, fta]
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
    events: dict[str, list] = {}
    games = 0
    for event, b in zip(finals, boxes):
        if not b:
            continue
        sides = {c["team"]["abbreviation"] for c in event["competitions"][0]["competitors"]}
        if sides != set(b):
            continue
        games += 1
        for club, (points, poss, fgm, tpm, ftm, fta) in b.items():
            events.setdefault(club, []).append(predictability.basketball_game(fgm, tpm, ftm, fta, points, poss))
    clubs = predictability.score(events, predictability.NBA)
    if not clubs:
        return None
    return {"schema": "chase-public-nba-predictability/1", "sport": "nba", "season": season,
            "games": games, "teams": clubs}


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
