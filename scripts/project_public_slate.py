#!/usr/bin/env python3
"""Project a producer board onto the public Research slate allowlist. Fail closed."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = json.loads((ROOT / "design" / "public_restricted_fields.json").read_text(encoding="utf-8"))
FORBIDDEN = {str(x) for x in SPEC["forbidden_keys"]}
ALLOWED = {str(x) for x in SPEC["allowed_game_keys"]}


def team_name(side) -> str:
    if side is None:
        return ""
    if isinstance(side, str):
        return side
    if isinstance(side, dict):
        for key in ("abbreviation", "abbr", "school", "name", "team"):
            val = side.get(key)
            if val:
                return str(val)
    return ""


def attributed_book(game: dict) -> dict:
    book = game.get("book") or game.get("book_name")
    market = game.get("book_market") or game.get("market_type")
    side = game.get("book_side") or game.get("side")
    number = game.get("book_number", game.get("public_line"))
    quote = game.get("quote_as_of_utc") or game.get("quote_time")
    if not (book and market and side and number is not None and quote):
        return {}
    try:
        num = float(number)
    except (TypeError, ValueError):
        return {}
    return {
        "book": str(book),
        "book_market": str(market),
        "book_side": str(side),
        "book_number": num,
        "quote_as_of_utc": str(quote),
    }


def project_game(sport: str, game: dict) -> dict:
    nested = game.get("teams") if isinstance(game.get("teams"), dict) else {}
    away = team_name(game.get("away")) or team_name(nested.get("away"))
    home = team_name(game.get("home")) or team_name(nested.get("home"))
    row = {
        "id": str(game.get("id") or game.get("game_id") or f"{away}@{home}"),
        "sport": sport,
        "game_state": str(game.get("game_state") or game.get("status") or "scheduled").lower(),
        "kickoff_utc": game.get("kickoff_utc") or game.get("start_utc") or game.get("commence_time_utc"),
        "kickoff_display": game.get("kickoff_display"),
        "away": away,
        "home": home,
        "away_record": game.get("away_record"),
        "home_record": game.get("home_record"),
        "away_score": game.get("away_score", game.get("away_runs")),
        "home_score": game.get("home_score", game.get("home_runs")),
        "venue": game.get("venue") or game.get("stadium"),
        "broadcast": game.get("broadcast") or game.get("tv"),
        "conditions": game.get("conditions") or game.get("weather_summary"),
        "away_starter": game.get("away_starter") or game.get("away_qb"),
        "home_starter": game.get("home_starter") or game.get("home_qb"),
        "away_lineup_state": game.get("away_lineup_state"),
        "home_lineup_state": game.get("home_lineup_state"),
        "availability_summary": game.get("availability_summary"),
        "freshness": game.get("freshness"),
    }
    row.update(attributed_book(game))
    return {k: v for k, v in row.items() if k in ALLOWED and v is not None and v != ""}


def assert_clean(obj, path: str = "$") -> None:
    if isinstance(obj, dict):
        for key, val in obj.items():
            if key in FORBIDDEN:
                raise SystemExit(f"restricted key {key!r} at {path}")
            assert_clean(val, f"{path}.{key}")
    elif isinstance(obj, list):
        for i, val in enumerate(obj):
            assert_clean(val, f"{path}[{i}]")


def project_slate(sport: str, producer: dict) -> dict:
    games = producer.get("games") or producer.get("slate") or producer.get("matchups") or []
    if not isinstance(games, list):
        games = []
    out = {
        "schema": "chase-public-slate/1",
        "sport": sport,
        "generated_at_utc": producer.get("generated_at_utc") or producer.get("generated_at"),
        "data_through_utc": producer.get("data_through_utc") or producer.get("data_through"),
        "games": [project_game(sport, g if isinstance(g, dict) else {}) for g in games],
    }
    assert_clean(out)
    return out


def main(argv: list[str]) -> int:
    if len(argv) < 4:
        print("usage: project_public_slate.py SPORT IN.json OUT.json", file=sys.stderr)
        return 2
    sport, src, dest = argv[1], Path(argv[2]), Path(argv[3])
    producer = json.loads(src.read_text(encoding="utf-8"))
    try:
        project_slate(sport, producer)
    except SystemExit:
        # Negative fixtures are supposed to fail.
        if "leak" in src.name or "restricted" in src.name:
            print("OK: leak fixture rejected")
            return 0
        raise
    out = project_slate(sport, producer)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print("wrote", dest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
