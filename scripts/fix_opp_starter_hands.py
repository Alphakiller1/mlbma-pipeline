"""Repair opp_starter_hand on game_results using MLB boxscore pitchHand."""

from __future__ import annotations

import time

import pandas as pd
import requests

from core.config import DATA_DIR
from scrapers.scrape_results import (
    REGISTRY_FILE,
    RESULT_COLUMNS,
    _load_throws_map,
    _starter_hand,
    _starter_throws_from_boxscore,
    _starter_from_boxscore,
)

OUTPUT_FILE = DATA_DIR / "game_results.csv"
BOX_URL = "https://statsapi.mlb.com/api/v1/game/{game_pk}/boxscore"
PEOPLE_URL = "https://statsapi.mlb.com/api/v1/people/{player_id}"


def _fetch_json(url: str) -> dict:
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _people_hand_map(ids: set[int]) -> dict[int, str]:
    out: dict[int, str] = {}
    for pid in sorted(ids):
        try:
            data = _fetch_json(PEOPLE_URL.format(player_id=int(pid)))
            person = (data.get("people") or [{}])[0]
            code = ((person.get("pitchHand") or {}).get("code") or "").strip().upper()
            if code in ("R", "L"):
                out[int(pid)] = code
        except Exception as exc:
            print(f"  WARNING: people lookup failed for {pid} ({exc})")
        time.sleep(0.08)
    return out


def _starter_ids_from_box(box: dict, side: str) -> tuple[int | None, int | None]:
    teams = box.get("teams", {}) or {}
    home = teams.get("home", {}) or {}
    away = teams.get("away", {}) or {}
    home_id, _, _ = _starter_from_boxscore(home)
    away_id, _, _ = _starter_from_boxscore(away)
    if side == "home":
        return home_id, away_id
    return away_id, home_id


def run(limit: int | None = None, sleep_s: float = 0.12) -> None:
    if not OUTPUT_FILE.exists():
        print("  game_results.csv not found")
        return

    df = pd.read_csv(OUTPUT_FILE)
    for col in RESULT_COLUMNS:
        if col not in df.columns:
            df[col] = None

    throws_map = _load_throws_map()
    ids = {
        int(pid)
        for pid in pd.to_numeric(df.get("opp_starter_id"), errors="coerce").dropna().unique()
    }
    print(f"  Refreshing MLB pitchHand for {len(ids)} opposing starters...")
    people_hands = _people_hand_map(ids)
    throws_map.update(people_hands)

    if people_hands and REGISTRY_FILE.exists():
        reg = pd.read_csv(REGISTRY_FILE)
        if "throws" in reg.columns and "player_id" in reg.columns:
            for pid, hand in people_hands.items():
                mask = pd.to_numeric(reg["player_id"], errors="coerce") == int(pid)
                if mask.any():
                    reg.loc[mask, "throws"] = hand
            reg.to_csv(REGISTRY_FILE, index=False)
            print(f"  Updated {len(people_hands)} registry throws from MLB API.")

    game_pks = df["game_pk"].dropna().astype(int).drop_duplicates().sort_values(ascending=False)
    if limit:
        game_pks = game_pks.head(limit)
    print(f"  Re-tagging starter hands from boxscore for {len(game_pks)} games...")

    updated = 0
    failures = 0
    for game_pk in game_pks:
        try:
            box = _fetch_json(BOX_URL.format(game_pk=int(game_pk)))
        except Exception as exc:
            failures += 1
            print(f"  WARNING: boxscore fetch failed for {game_pk} ({exc})")
            continue

        teams = box.get("teams", {}) or {}
        for side in ("home", "away"):
            team_box = teams.get(side, {}) or {}
            _, opp_starter_id = _starter_ids_from_box(box, side)
            mask = (df["game_pk"] == int(game_pk)) & (df["home_away"] == side)
            if not mask.any():
                continue
            hand = _starter_hand(throws_map, opp_starter_id, team_box)
            if not hand and opp_starter_id:
                opp_side = "away" if side == "home" else "home"
                opp_box = teams.get(opp_side, {}) or {}
                hand = _starter_throws_from_boxscore(opp_box, opp_starter_id)
            if hand:
                df.loc[mask, "opp_starter_hand"] = hand
                updated += int(mask.sum())
        time.sleep(sleep_s)

    df = df[RESULT_COLUMNS]
    df.to_csv(OUTPUT_FILE, index=False)
    print(f"  Updated {updated} team-game rows ({failures} boxscore failures).")


if __name__ == "__main__":
    run()
