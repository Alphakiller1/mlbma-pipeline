#!/usr/bin/env python3
"""Publish data/public/nfl/game_logs.json: every team's games, final and
noise-adjusted score, with surface and advanced numbers (outputs/nfl_game_log.py).

Validate before writing: the log must cover every club and its finals must
add up, or the published file is kept."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from outputs import nfl_game_log  # noqa: E402

OUT = ROOT / "data" / "public" / "nfl" / "game_logs.json"
CLUBS = 32


def validate(log: dict) -> str | None:
    teams = log.get("teams") or {}
    if len(teams) < CLUBS:
        return f"{len(teams)} clubs, expected {CLUBS}"
    for team, games in teams.items():
        for game in games:
            mirror = next((g for g in teams.get(game["opp"], []) if g["game_id"] == game["game_id"]), None)
            if not mirror or mirror["points"] != game["opp_points"]:
                return f"{team} {game['game_id']} does not mirror its opponent's line"
            if abs(game["adj_points"] - game["points"]) > 25:
                return f"{team} {game['game_id']} adjusted score moved {game['adj_points'] - game['points']:+.1f}"
    ranked = (log.get("adjusted") or {}).get("teams") or {}
    if set(ranked) != set(teams):
        return f"power ranking covers {len(ranked)} of {len(teams)} clubs"
    places = [r["net"]["rank"] for r in ranked.values()]
    if min(places) != 1 or max(places) > len(ranked):
        return "power ranking places do not run 1 to 32"
    for team, row in ranked.items():
        rec, exp = row["record"], row["expected_record"]
        if rec["games"] != len(teams[team]) or abs(exp["wins"] + exp["losses"] - rec["games"]) > 0.2:
            return f"{team} power record does not reconcile with its game log"
        if not -30 <= row["net"]["value"] <= 30:
            return f"{team} power net {row['net']['value']} outside range"
    return None


def main() -> int:
    now = datetime.now(timezone.utc)
    season = now.year if now.month >= 8 else now.year - 1
    log = nfl_game_log.build(season)
    if not log:
        print("  skip nfl game logs: no current play-by-play")
        return 1
    problem = validate(log)
    if problem:
        print(f"  refusing to write {OUT.name}: {problem}; keeping the published file")
        return 1
    if OUT.exists():
        previous = json.loads(OUT.read_text(encoding="utf-8"))
        old_season = previous.get("season", 0)
        if old_season == season:
            for club, games in previous["teams"].items():
                current_ids = {game["game_id"] for game in log["teams"].get(club, [])}
                if any(game["game_id"] not in current_ids for game in games):
                    print(f"  refusing to remove completed games for {club}")
                    return 1
        if old_season > season:
            print("  refusing to replace a newer NFL season")
            return 1
        if all(previous.get(key) == value for key, value in log.items()):
            print("  NFL game logs are already current")
            return 0
    stamp = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"schema": "chase-public-nfl-game-logs/1", "sport": "nfl",
                               "generated_at_utc": stamp, **log}, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    print(f"  wrote {OUT.relative_to(ROOT)} ({len(log['teams'])} clubs, {log['team_games']} "
          f"team-games through week {log['through_week']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
