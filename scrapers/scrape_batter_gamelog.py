"""Scrape per-batter hitting game logs from the MLB Stats API for the current season."""

from __future__ import annotations

import time
from typing import Dict, Optional, Tuple

import pandas as pd
import requests

from core.config import CURRENT_SEASON, DATA_DIR, TEAM_MAP, TEAM_MAP_BY_ID
from core.name_utils import normalize_player_name
from scrapers.scrape_results import (
    _load_throws_map,
    _starter_from_boxscore,
    _starter_hand,
)
from scrapers.scrape_sp_gamelog import (
    fetch_game_feed,
    fetch_mlb_player_index,
    resolve_player_id,
)

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
MLB_STATS_URL = "https://statsapi.mlb.com/api/v1/people/{player_id}/stats"
MLB_BOXSCORE_URL = "https://statsapi.mlb.com/api/v1/game/{game_pk}/boxscore"

GAMELOG_COLUMNS = [
    "date",
    "player_name",
    "player_id",
    "team",
    "opponent_team",
    "opp_starter_id",
    "opp_starter_hand",
    "home_away",
    "stadium",
    "game_pk",
    "batting_order",
    "PA",
    "AB",
    "H",
    "1B",
    "2B",
    "3B",
    "HR",
    "TB",
    "R",
    "RBI",
    "BB",
    "SO",
    "SB",
    "HBP",
]

_boxscore_cache: Dict[int, dict] = {}
_batting_order_cache: Dict[Tuple[int, int], Optional[int]] = {}


def _team_abbr_from_opponent_name(opp_name: str) -> str:
    opp_name = str(opp_name or "").strip()
    if not opp_name:
        return ""
    return TEAM_MAP.get(opp_name, opp_name[:3].upper())


def _team_abbr_from_id(team_id: Optional[int]) -> str:
    if not team_id:
        return ""
    return TEAM_MAP_BY_ID.get(int(team_id), "")


def load_qualified_batters() -> pd.DataFrame:
    """Rostered position players with ≥1 PA in overall splits."""
    splits_path = DATA_DIR / "batter_splits_overall.csv"
    if not splits_path.exists():
        raise FileNotFoundError("batter_splits_overall.csv not found -- run scrape_batter_splits first")

    splits = pd.read_csv(splits_path)
    splits = splits[~splits["Tm"].astype(str).str.contains("Tms", na=False)]
    pa = pd.to_numeric(splits.get("PA"), errors="coerce").fillna(0)
    splits = splits[pa >= 1].copy()

    name_col = "Name" if "Name" in splits.columns else splits.columns[0]
    splits["player_name"] = splits[name_col].astype(str).str.strip()
    splits["team"] = splits.get("Tm", "").astype(str).str.strip().str.upper()

    registry_path = DATA_DIR / "player_registry.csv"
    if registry_path.exists():
        reg = pd.read_csv(registry_path)
        reg = reg[~reg["position_type"].isin(["SP", "RP"])].copy()
        reg["norm_name"] = reg["full_name"].map(normalize_player_name)
        name_to_id = {
            row.norm_name: int(row.player_id)
            for row in reg.dropna(subset=["player_id"]).itertuples(index=False)
        }
        name_to_bats = {
            row.norm_name: str(row.bats or "R").upper()[:1]
            for row in reg.itertuples(index=False)
        }
    else:
        name_to_id = {}
        name_to_bats = {}

    splits["norm_name"] = splits["player_name"].map(normalize_player_name)
    splits["player_id"] = splits["norm_name"].map(name_to_id)
    splits["bats"] = splits["norm_name"].map(name_to_bats).fillna("R")

    missing = splits["player_id"].isna()
    if missing.any():
        print(f"  WARNING: {int(missing.sum())} batters missing player_id (will resolve via MLB index)")

    return splits[["player_name", "player_id", "team", "bats", "norm_name", "PA"]].drop_duplicates(
        subset=["norm_name", "team"]
    )


def load_game_context() -> Dict[Tuple[int, str], dict]:
    """(game_pk, team_abbr) -> opponent + starter metadata from game_results.csv."""
    path = DATA_DIR / "game_results.csv"
    lookup: Dict[Tuple[int, str], dict] = {}
    if not path.exists():
        print("  WARNING: game_results.csv not found -- opp starter fields may be blank")
        return lookup
    try:
        df = pd.read_csv(path)
    except Exception as exc:
        print(f"  WARNING: could not read game_results.csv ({exc})")
        return lookup

    for row in df.itertuples(index=False):
        pk = getattr(row, "game_pk", None)
        team = str(getattr(row, "team", "") or "").strip().upper()
        if pd.isna(pk) or not team:
            continue
        lookup[(int(pk), team)] = {
            "opponent_team": str(getattr(row, "opp", "") or "").strip().upper(),
            "opp_starter_id": getattr(row, "opp_starter_id", None),
            "opp_starter_hand": str(getattr(row, "opp_starter_hand", "") or "").strip().upper(),
            "home_away": str(getattr(row, "home_away", "") or "").strip().lower(),
        }
    print(f"  Loaded game context for {len(lookup)} team-games")
    return lookup


def fetch_boxscore(game_pk: int) -> dict:
    if game_pk in _boxscore_cache:
        return _boxscore_cache[game_pk]
    r = requests.get(
        MLB_BOXSCORE_URL.format(game_pk=game_pk),
        headers=HEADERS,
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    _boxscore_cache[game_pk] = data
    return data


def batting_order_for_game(game_pk: int, player_id: int, is_home: bool) -> Optional[int]:
    key = (game_pk, player_id)
    if key in _batting_order_cache:
        return _batting_order_cache[key]
    order = None
    try:
        box = fetch_boxscore(game_pk)
        side = "home" if is_home else "away"
        players = (box.get("teams", {}) or {}).get(side, {}).get("players", {}) or {}
        pdata = players.get(f"ID{int(player_id)}", {}) or {}
        raw = pdata.get("battingOrder")
        if raw is not None:
            order = int(int(raw) // 100)
            if order < 1 or order > 9:
                order = None
    except Exception:
        order = None
    _batting_order_cache[key] = order
    return order


def starter_info_for_game(
    game_pk: int,
    is_home: bool,
    throws_map: Dict[int, str],
    game_ctx: Dict[Tuple[int, str], dict],
    team_abbr: str,
) -> Tuple[Optional[int], str]:
    ctx = game_ctx.get((game_pk, team_abbr.upper()), {})
    opp_id = ctx.get("opp_starter_id")
    opp_hand = str(ctx.get("opp_starter_hand") or "").strip().upper()
    if pd.notna(opp_id) and opp_id and opp_hand in ("R", "L"):
        return int(opp_id), opp_hand

    try:
        box = fetch_boxscore(game_pk)
        teams = box.get("teams", {}) or {}
        opp_box = teams.get("away" if is_home else "home", {}) or {}
        opp_starter_id, _, _ = _starter_from_boxscore(opp_box)
        hand = _starter_hand(throws_map, opp_starter_id, opp_box)
        return opp_starter_id, hand
    except Exception:
        return None, ""


def fetch_batter_gamelog(player_id: int, season: int) -> list:
    r = requests.get(
        MLB_STATS_URL.format(player_id=player_id),
        params={
            "stats": "gameLog",
            "group": "hitting",
            "season": str(season),
            "gameType": "R",
        },
        headers=HEADERS,
        timeout=30,
    )
    r.raise_for_status()
    stats = r.json().get("stats", [])
    if not stats:
        return []
    return stats[0].get("splits", [])


def parse_batter_game(
    split: dict,
    player_name: str,
    player_id: int,
    team_abbr: str,
    game_ctx: Dict[Tuple[int, str], dict],
    throws_map: Dict[int, str],
) -> Optional[dict]:
    stat = split.get("stat", {}) or {}
    pa = int(stat.get("plateAppearances", 0) or 0)
    if pa <= 0:
        return None

    game_pk = (split.get("game") or {}).get("gamePk")
    if not game_pk:
        return None
    game_pk = int(game_pk)

    is_home = bool(split.get("isHome"))
    home_away = "home" if is_home else "away"

    ctx = game_ctx.get((game_pk, team_abbr.upper()), {})
    opponent = ctx.get("opponent_team") or _team_abbr_from_opponent_name(
        (split.get("opponent") or {}).get("name", "")
    )

    opp_starter_id, opp_starter_hand = starter_info_for_game(
        game_pk, is_home, throws_map, game_ctx, team_abbr
    )

    stadium = ""
    try:
        feed = fetch_game_feed(game_pk)
        stadium = feed.get("gameData", {}).get("venue", {}).get("name", "") or ""
    except Exception:
        pass

    h = int(stat.get("hits", 0) or 0)
    d2 = int(stat.get("doubles", 0) or 0)
    d3 = int(stat.get("triples", 0) or 0)
    hr = int(stat.get("homeRuns", 0) or 0)
    singles = max(h - d2 - d3 - hr, 0)
    tb = stat.get("totalBases")
    if tb is None or (isinstance(tb, float) and pd.isna(tb)):
        tb = singles + 2 * d2 + 3 * d3 + 4 * hr
    else:
        tb = int(tb)

    batting_order = batting_order_for_game(game_pk, player_id, is_home)

    return {
        "date": split.get("date", ""),
        "player_name": player_name,
        "player_id": player_id,
        "team": team_abbr.upper(),
        "opponent_team": opponent,
        "opp_starter_id": int(opp_starter_id) if opp_starter_id else None,
        "opp_starter_hand": opp_starter_hand if opp_starter_hand in ("R", "L") else "",
        "home_away": home_away,
        "stadium": stadium,
        "game_pk": game_pk,
        "batting_order": batting_order,
        "PA": pa,
        "AB": int(stat.get("atBats", 0) or 0),
        "H": h,
        "1B": singles,
        "2B": d2,
        "3B": d3,
        "HR": hr,
        "TB": int(tb),
        "R": int(stat.get("runs", 0) or 0),
        "RBI": int(stat.get("rbi", 0) or 0),
        "BB": int(stat.get("baseOnBalls", 0) or 0),
        "SO": int(stat.get("strikeOuts", 0) or 0),
        "SB": int(stat.get("stolenBases", 0) or 0),
        "HBP": int(stat.get("hitByPitch", 0) or 0),
    }


def run():
    print(f"Scraping batter game logs for {CURRENT_SEASON}...")
    batters = load_qualified_batters()
    game_ctx = load_game_context()
    throws_map = _load_throws_map()
    player_index = fetch_mlb_player_index(CURRENT_SEASON)

    rows = []
    missing_ids = []
    failed = []

    for i, brow in enumerate(batters.itertuples(index=False), start=1):
        name = str(brow.player_name).strip()
        team = str(brow.team).strip().upper()
        pid = brow.player_id
        if pd.isna(pid) or not pid:
            pid = resolve_player_id(name, player_index)
        if not pid:
            missing_ids.append(name)
            continue
        pid = int(pid)

        if i % 25 == 0:
            print(f"  ... {i}/{len(batters)} batters")

        try:
            splits = fetch_batter_gamelog(pid, CURRENT_SEASON)
        except Exception as exc:
            failed.append(name)
            print(f"  WARNING: game log failed for {name}: {exc}")
            continue

        for split in splits:
            row = parse_batter_game(split, name, pid, team, game_ctx, throws_map)
            if row:
                rows.append(row)

        time.sleep(0.12)

    if missing_ids:
        print(f"  WARNING: no MLB id for {len(missing_ids)} batters (first 5: {missing_ids[:5]})")
    if failed:
        print(f"  WARNING: fetch failed for {len(failed)} batters (first 5: {failed[:5]})")

    out_path = DATA_DIR / "batter_gamelog.csv"
    df = pd.DataFrame(rows)
    if df.empty:
        print("  No batter games found -- writing empty gamelog")
        df = pd.DataFrame(columns=GAMELOG_COLUMNS)
    else:
        df = df.drop_duplicates(subset=["player_id", "game_pk"], keep="last")
        df = df.sort_values(["player_id", "date", "game_pk"])
        df = df[[c for c in GAMELOG_COLUMNS if c in df.columns]]

    df.to_csv(out_path, index=False)
    print(f"  Saved {len(df)} batter-games -> {out_path}")


if __name__ == "__main__":
    run()
