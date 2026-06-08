"""Backfill vs-opposing-starter batting columns on existing game_results rows."""

from __future__ import annotations

import time

import pandas as pd
import requests

from core.config import DATA_DIR
from scrapers.scrape_results import (
    FEED_URL,
    REGISTRY_FILE,
    RESULT_COLUMNS,
    _load_throws_map,
    _request_json,
    _starter_hand,
    _vs_starter_batting_stats,
)

OUTPUT_FILE = DATA_DIR / "game_results.csv"


def _starter_ids_from_box(box: dict, side: str) -> tuple[int | None, int | None]:
    teams = box.get("teams", {}) or {}
    home = teams.get("home", {}) or {}
    away = teams.get("away", {}) or {}
    from scrapers.scrape_results import _starter_from_boxscore

    home_id, _, _ = _starter_from_boxscore(home)
    away_id, _, _ = _starter_from_boxscore(away)
    if side == "home":
        return home_id, away_id
    return away_id, home_id


def run(limit: int | None = 500, sleep_s: float = 0.12) -> None:
    if not OUTPUT_FILE.exists():
        print("  game_results.csv not found")
        return

    df = pd.read_csv(OUTPUT_FILE)
    for col in RESULT_COLUMNS:
        if col not in df.columns:
            df[col] = None

    throws_map = _load_throws_map()
    needs = df[
        df["vs_sp_ab"].isna()
        | (pd.to_numeric(df["vs_sp_ab"], errors="coerce").fillna(0) <= 0)
    ].copy()
    needs = needs.sort_values(["date", "game_pk"], ascending=[False, False])
    if limit:
        game_pks = needs["game_pk"].drop_duplicates().head(limit)
        needs = needs[needs["game_pk"].isin(game_pks)]

    if needs.empty:
        print("  No game_results rows need vs-SP backfill.")
        return

    print(f"  Backfilling vs-SP stats for {needs['game_pk'].nunique()} games...")
    updated = 0
    failures = 0
    for game_pk in needs["game_pk"].drop_duplicates():
        try:
            feed = _request_json(FEED_URL.format(game_pk=int(game_pk)))
            box = _request_json(
                f"https://statsapi.mlb.com/api/v1/game/{int(game_pk)}/boxscore"
            )
        except Exception as exc:
            failures += 1
            print(f"  WARNING: game {game_pk} fetch failed ({exc})")
            continue

        for side in ("home", "away"):
            team_starter_id, opp_starter_id = _starter_ids_from_box(box, side)
            mask = (df["game_pk"] == int(game_pk)) & (df["home_away"] == side)
            if not mask.any():
                continue
            vs_sp = _vs_starter_batting_stats(feed, side == "home", opp_starter_id)
            for key, val in vs_sp.items():
                df.loc[mask, key] = val
            opp_box = (box.get("teams", {}) or {}).get(
                "away" if side == "home" else "home", {}
            ) or {}
            df.loc[mask, "opp_starter_hand"] = _starter_hand(
                throws_map, opp_starter_id, opp_box
            )
            updated += int(mask.sum())

        time.sleep(sleep_s)

    df = df[RESULT_COLUMNS]
    df.to_csv(OUTPUT_FILE, index=False)
    print(f"  Updated {updated} team-game rows ({failures} game fetch failures).")


if __name__ == "__main__":
    run()
