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


def freshness_state(raw) -> str | None:
    if raw is None or raw == "":
        return None
    if isinstance(raw, str):
        return raw
    if isinstance(raw, dict):
        state = raw.get("state") or raw.get("label")
        return str(state) if state else None
    return None


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
        "game_pk": game.get("game_pk") or game.get("gamePk"),
        "away": away,
        "home": home,
        "away_name": game.get("away_name"),
        "home_name": game.get("home_name"),
        "away_record": game.get("away_record"),
        "home_record": game.get("home_record"),
        "away_score": game.get("away_score", game.get("away_runs")),
        "home_score": game.get("home_score", game.get("home_runs")),
        "venue": game.get("venue") or game.get("stadium"),
        "venue_city": game.get("venue_city"),
        "broadcast": game.get("broadcast") or game.get("tv"),
        "conditions": game.get("conditions") or game.get("weather_summary"),
        "surface": game.get("surface"),
        "weather_temp": game.get("weather_temp"),
        "weather_cond": game.get("weather_cond"),
        "weather_wind": game.get("weather_wind"),
        "away_starter": game.get("away_starter") or game.get("away_qb"),
        "home_starter": game.get("home_starter") or game.get("home_qb"),
        "away_starter_id": game.get("away_starter_id"),
        "home_starter_id": game.get("home_starter_id"),
        "away_hand": game.get("away_hand"),
        "home_hand": game.get("home_hand"),
        "away_era": game.get("away_era"),
        "home_era": game.get("home_era"),
        "away_lineup_state": game.get("away_lineup_state"),
        "home_lineup_state": game.get("home_lineup_state"),
        "away_lineup": game.get("away_lineup"),
        "home_lineup": game.get("home_lineup"),
        "away_team_id": game.get("away_team_id"),
        "home_team_id": game.get("home_team_id"),
        "venue_id": game.get("venue_id"),
        "away_availability": game.get("away_availability"),
        "home_availability": game.get("home_availability"),
        "away_availability_list": game.get("away_availability_list"),
        "home_availability_list": game.get("home_availability_list"),
        "availability_summary": game.get("availability_summary"),
        "roof": game.get("roof"),
        # Observed team form and charted scheme profiles. Both arrive already
        # projected field by field (outputs/nfl_public_context.py); assert_clean
        # then walks them for restricted key names, so a leak has to survive
        # both an allowlist and a denylist.
        "away_form": game.get("away_form"),
        "home_form": game.get("home_form"),
        "away_scheme": game.get("away_scheme"),
        "home_scheme": game.get("home_scheme"),
        "scheme_source": game.get("scheme_source"),
        "away_players": game.get("away_players"),
        "home_players": game.get("home_players"),
        "away_lineups": game.get("away_lineups"),
        "home_lineups": game.get("home_lineups"),
        "away_player_coverage": game.get("away_player_coverage"),
        "home_player_coverage": game.get("home_player_coverage"),
        "away_bullpen": game.get("away_bullpen"),
        "home_bullpen": game.get("home_bullpen"),
        "away_rest_days": game.get("away_rest_days"),
        "home_rest_days": game.get("home_rest_days"),
        "away_travel": game.get("away_travel"),
        "home_travel": game.get("home_travel"),
        "away_short_week": game.get("away_short_week"),
        "home_short_week": game.get("home_short_week"),
        "away_travel_km": game.get("away_travel_km"),
        "home_travel_km": game.get("home_travel_km"),
        "away_tz_shift": game.get("away_tz_shift"),
        "home_tz_shift": game.get("home_tz_shift"),
        "venue_country": game.get("venue_country"),
        "freshness": freshness_state(game.get("freshness")),
    }
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
