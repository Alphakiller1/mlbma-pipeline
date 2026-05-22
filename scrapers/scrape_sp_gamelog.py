"""Scrape starting-pitcher game logs from the MLB Stats API for the current season."""

from __future__ import annotations

import re
import time
from typing import Dict, Optional

import pandas as pd
import requests

from core.config import (
    CURRENT_SEASON,
    DATA_DIR,
    OPPONENT_TIER_HIGH_MIN,
    OPPONENT_TIER_MID_MIN,
    TEAM_MAP,
)
from core.metrics_utils import parse_ip

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
MLB_PLAYERS_URL = "https://statsapi.mlb.com/api/v1/sports/1/players"
MLB_STATS_URL = "https://statsapi.mlb.com/api/v1/people/{player_id}/stats"
MLB_GAME_FEED_URL = "https://statsapi.mlb.com/api/v1.1/game/{game_pk}/feed/live"

GAMELOG_COLUMNS = [
    "date",
    "pitcher_name",
    "pitcher_id",
    "pitcher_team",
    "pitcher_hand",
    "opponent_team",
    "home_away",
    "stadium",
    "IP",
    "ER",
    "R",
    "H",
    "BB",
    "K",
    "HR",
    "pitches",
    "strikes",
    "game_score",
    "batters_faced",
    "game_pk",
    "f5_er",
    "opponent_OSI",
    "opponent_ABQ",
    "opponent_RCV",
    "opponent_OBR",
    "opponent_OSI_tier",
    "opponent_ABQ_tier",
]

_feed_cache: Dict[int, dict] = {}


def _normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", str(name).lower()).strip()


def calc_game_score(ip: float, h: int, er: int, bb: int, hr: int, hbp: int = 0) -> float:
    return round(40 + 2.7 * ip - 3 * h - 2 * er - 2 * bb - 0.6 * hbp - hr, 1)


def opponent_tier(value) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    if value > OPPONENT_TIER_HIGH_MIN:
        return "High"
    if value >= OPPONENT_TIER_MID_MIN:
        return "Mid"
    return "Low"


def load_team_metrics(pitcher_hand: str) -> pd.DataFrame:
    split = "metrics_vs_RHP.csv" if pitcher_hand == "R" else "metrics_vs_LHP.csv"
    path = DATA_DIR / split
    if not path.exists():
        print(f"  WARNING: {split} not found — opponent metrics will be blank")
        return pd.DataFrame(columns=["Tm", "OSI", "ABQ", "RCV", "OBR"])
    return pd.read_csv(path)


def team_metrics_lookup(df: pd.DataFrame) -> Dict[str, dict]:
    lookup = {}
    for _, row in df.iterrows():
        tm = str(row.get("Tm", "")).strip().upper()
        if tm:
            lookup[tm] = row
    return lookup


def fetch_mlb_player_index(season: int) -> Dict[str, int]:
    print("Fetching MLB player index...")
    r = requests.get(
        MLB_PLAYERS_URL,
        params={"season": str(season), "gameType": "R"},
        headers=HEADERS,
        timeout=60,
    )
    r.raise_for_status()
    index: Dict[str, int] = {}
    for person in r.json().get("people", []):
        pid = person.get("id")
        full = person.get("fullName", "")
        if not pid or not full:
            continue
        index[_normalize_name(full)] = pid
        parts = full.split()
        if len(parts) >= 2:
            index[_normalize_name(f"{parts[-1]} {parts[0]}")] = pid
    print(f"  Indexed {len(index)} name keys")
    return index


def resolve_player_id(name: str, index: Dict[str, int]) -> Optional[int]:
    key = _normalize_name(name)
    if key in index:
        return index[key]
    parts = str(name).split()
    if len(parts) >= 2:
        last_first = _normalize_name(f"{parts[-1]} {parts[0]}")
        if last_first in index:
            return index[last_first]
        last = _normalize_name(parts[-1])
        matches = [pid for k, pid in index.items() if k.endswith(last) or last in k]
        if len(matches) == 1:
            return matches[0]
    return None


def load_sp_pitchers() -> pd.DataFrame:
    path = DATA_DIR / "sp_standard.csv"
    if not path.exists():
        raise FileNotFoundError("sp_standard.csv not found — run FanGraphs scrape first")
    df = pd.read_csv(path)
    df = df[~df["Tm"].astype(str).str.contains("Tms", na=False)]
    hand_col = next((c for c in ("Hand", "Throws", "hand") if c in df.columns), None)
    if hand_col:
        df["pitcher_hand"] = (
            df[hand_col].astype(str).str.upper().str[:1].replace({"S": "R", "L": "L"})
        )
    else:
        df["pitcher_hand"] = "R"
    gs_col = next((c for c in ("GS", "G") if c in df.columns), None)
    if gs_col:
        df = df[pd.to_numeric(df[gs_col], errors="coerce").fillna(0) > 0]
    return df


def fetch_game_feed(game_pk: int) -> dict:
    if game_pk in _feed_cache:
        return _feed_cache[game_pk]
    r = requests.get(
        MLB_GAME_FEED_URL.format(game_pk=game_pk),
        headers=HEADERS,
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    _feed_cache[game_pk] = data
    return data


def f5_runs_allowed(game_pk: int, pitcher_is_home: bool) -> Optional[int]:
    try:
        feed = fetch_game_feed(game_pk)
        innings = feed.get("liveData", {}).get("linescore", {}).get("innings", [])
        opp_side = "away" if pitcher_is_home else "home"
        total = 0
        played = 0
        for inn in innings:
            num = inn.get("num", 0)
            if num > 5:
                continue
            played += 1
            total += inn.get(opp_side, {}).get("runs", 0) or 0
        if played < 5:
            return None
        return int(total)
    except Exception:
        return None


def fetch_pitcher_gamelog(player_id: int, season: int) -> list:
    r = requests.get(
        MLB_STATS_URL.format(player_id=player_id),
        params={
            "stats": "gameLog",
            "group": "pitching",
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


def parse_start(
    split: dict,
    pitcher_name: str,
    pitcher_id: int,
    pitcher_team: str,
    pitcher_hand: str,
    metrics_lookup: Dict[str, dict],
) -> Optional[dict]:
    stat = split.get("stat", {})
    if stat.get("gamesStarted", 0) != 1:
        return None

    opp_name = split.get("opponent", {}).get("name", "")
    opponent = TEAM_MAP.get(opp_name, opp_name[:3].upper() if opp_name else "")
    is_home = bool(split.get("isHome"))
    home_away = "home" if is_home else "away"

    game_pk = split.get("game", {}).get("gamePk")
    stadium = ""
    f5_er = None
    if game_pk:
        try:
            feed = fetch_game_feed(game_pk)
            stadium = feed.get("gameData", {}).get("venue", {}).get("name", "") or ""
            f5_er = f5_runs_allowed(game_pk, is_home)
        except Exception:
            pass

    ip = parse_ip(stat.get("inningsPitched"))
    h = int(stat.get("hits", 0) or 0)
    er = int(stat.get("earnedRuns", 0) or 0)
    bb = int(stat.get("baseOnBalls", 0) or 0)
    hr = int(stat.get("homeRuns", 0) or 0)
    hbp = int(stat.get("hitByPitch", 0) or 0)
    k = int(stat.get("strikeOuts", 0) or 0)
    bf = int(stat.get("battersFaced", 0) or 0)

    opp_row = metrics_lookup.get(opponent.upper(), {})
    opp_osi = opp_row.get("OSI")
    opp_abq = opp_row.get("ABQ")
    opp_rcv = opp_row.get("RCV")
    opp_obr = opp_row.get("OBR")

    return {
        "date": split.get("date", ""),
        "pitcher_name": pitcher_name,
        "pitcher_id": pitcher_id,
        "pitcher_team": pitcher_team,
        "pitcher_hand": pitcher_hand,
        "opponent_team": opponent,
        "home_away": home_away,
        "stadium": stadium,
        "IP": stat.get("inningsPitched", "0"),
        "ER": er,
        "R": int(stat.get("runs", er) or 0),
        "H": h,
        "BB": bb,
        "K": k,
        "HR": hr,
        "pitches": int(stat.get("numberOfPitches", 0) or 0),
        "strikes": int(stat.get("strikes", 0) or 0),
        "game_score": calc_game_score(ip, h, er, bb, hr, hbp),
        "batters_faced": bf,
        "game_pk": game_pk,
        "f5_er": f5_er,
        "opponent_OSI": round(float(opp_osi), 1) if pd.notna(opp_osi) else None,
        "opponent_ABQ": round(float(opp_abq), 1) if pd.notna(opp_abq) else None,
        "opponent_RCV": round(float(opp_rcv), 1) if pd.notna(opp_rcv) else None,
        "opponent_OBR": round(float(opp_obr), 1) if pd.notna(opp_obr) else None,
        "opponent_OSI_tier": opponent_tier(opp_osi),
        "opponent_ABQ_tier": opponent_tier(opp_abq),
    }


def run():
    print(f"Scraping SP game logs for {CURRENT_SEASON}...")
    sp_df = load_sp_pitchers()
    player_index = fetch_mlb_player_index(CURRENT_SEASON)

    metrics_r = team_metrics_lookup(load_team_metrics("R"))
    metrics_l = team_metrics_lookup(load_team_metrics("L"))

    rows = []
    missing_ids = []

    for _, prow in sp_df.iterrows():
        name = str(prow.get("Name", "")).strip()
        if not name:
            continue
        pid = resolve_player_id(name, player_index)
        if not pid:
            missing_ids.append(name)
            continue

        hand = str(prow.get("pitcher_hand", "R")).upper()[:1] or "R"
        team = str(prow.get("Tm", "")).strip().upper()
        metrics_lookup = metrics_r if hand == "R" else metrics_l

        try:
            splits = fetch_pitcher_gamelog(pid, CURRENT_SEASON)
        except Exception as exc:
            print(f"  WARNING: game log failed for {name}: {exc}")
            continue

        for split in splits:
            row = parse_start(split, name, pid, team, hand, metrics_lookup)
            if row:
                rows.append(row)

        time.sleep(0.15)

    if missing_ids:
        print(f"  WARNING: no MLB id for {len(missing_ids)} pitchers (first 5: {missing_ids[:5]})")

    out_path = DATA_DIR / "sp_gamelog.csv"
    df = pd.DataFrame(rows)
    if df.empty:
        print("  No starts found — writing empty gamelog")
        df = pd.DataFrame(columns=GAMELOG_COLUMNS)
    else:
        public_cols = [c for c in GAMELOG_COLUMNS if c in df.columns]
        df = df[public_cols]

    df.to_csv(out_path, index=False)
    print(f"  Saved {len(df)} starts -> {out_path}")


if __name__ == "__main__":
    run()
