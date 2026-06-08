"""Compute rolling batter prop hit-rates from per-game logs.

Output: data/batter_prop_hitrates.csv (tidy long format)

Schema (one row per player × prop × line threshold):
    player_id, player_name, team, bats, prop, line,
    hit_l5, hit_l10, hit_l20, hit_season,
    games_l5, games_l10, games_l20, games_season,
    streak, last10,
    hit_vs_rhp, hit_vs_lhp, hit_home, hit_away,
    last_game_date, updated

Rates are in [0, 1]. Windows are last N games played (not calendar days).
"Cleared the line" means the game stat >= line for that prop.
"""

from __future__ import annotations

from datetime import datetime
from typing import Callable, Dict, List, Optional, Tuple

import pandas as pd

from core.config import DATA_DIR

INPUT_FILE = DATA_DIR / "batter_gamelog.csv"
OUTPUT_FILE = DATA_DIR / "batter_prop_hitrates.csv"
REGISTRY_FILE = DATA_DIR / "player_registry.csv"

OUTPUT_COLUMNS = [
    "player_id",
    "player_name",
    "team",
    "bats",
    "prop",
    "line",
    "hit_l5",
    "hit_l10",
    "hit_l20",
    "hit_season",
    "games_l5",
    "games_l10",
    "games_l20",
    "games_season",
    "streak",
    "last10",
    "hit_vs_rhp",
    "hit_vs_lhp",
    "hit_home",
    "hit_away",
    "last_game_date",
    "updated",
]

# (prop_key, line_threshold, stat_fn)
PropDef = Tuple[str, float, Callable[[pd.Series], float]]

PROP_DEFINITIONS: List[PropDef] = [
    ("hits", 1.0, lambda r: float(r["H"])),
    ("hits", 2.0, lambda r: float(r["H"])),
    ("total_bases", 1.0, lambda r: float(r["TB"])),
    ("total_bases", 2.0, lambda r: float(r["TB"])),
    ("total_bases", 3.0, lambda r: float(r["TB"])),
    ("home_runs", 1.0, lambda r: float(r["HR"])),
    ("rbi", 1.0, lambda r: float(r["RBI"])),
    ("runs", 1.0, lambda r: float(r["R"])),
    ("walks", 1.0, lambda r: float(r["BB"])),
    ("strikeouts", 1.0, lambda r: float(r["SO"])),
    ("strikeouts", 2.0, lambda r: float(r["SO"])),
    ("stolen_bases", 1.0, lambda r: float(r["SB"])),
    ("hits_runs_rbi", 1.0, lambda r: float(r["H"] + r["R"] + r["RBI"])),
    ("hits_runs_rbi", 2.0, lambda r: float(r["H"] + r["R"] + r["RBI"])),
]


def _rate(cleared: pd.Series) -> Optional[float]:
    if cleared.empty:
        return None
    return round(float(cleared.mean()), 4)


def _window_rate(cleared: pd.Series, n: int) -> Tuple[Optional[float], int]:
    tail = cleared.tail(n)
    if tail.empty:
        return None, 0
    return _rate(tail), int(len(tail))


def _streak(cleared: pd.Series) -> int:
    streak = 0
    for val in reversed(cleared.tolist()):
        if val:
            streak += 1
        else:
            break
    return streak


def _last10_pipe(cleared: pd.Series) -> str:
    tail = cleared.tail(10)
    return "|".join("1" if bool(v) else "0" for v in tail.tolist())


def _split_rate(gdf: pd.DataFrame, mask: pd.Series) -> Optional[float]:
    sub = gdf.loc[mask, "cleared"]
    if sub.empty:
        return None
    return _rate(sub)


def _load_registry_bats() -> Dict[int, str]:
    if not REGISTRY_FILE.exists():
        return {}
    try:
        reg = pd.read_csv(REGISTRY_FILE, usecols=["player_id", "bats"])
    except Exception:
        return {}
    out: Dict[int, str] = {}
    for row in reg.dropna(subset=["player_id"]).itertuples(index=False):
        hand = str(row.bats or "R").strip().upper()[:1]
        out[int(row.player_id)] = hand if hand in ("L", "R", "S") else "R"
    return out


def _prep_gamelog(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["date"] = pd.to_datetime(out["date"], errors="coerce")
    out = out.dropna(subset=["date", "player_id"])
    out["player_id"] = pd.to_numeric(out["player_id"], errors="coerce").astype(int)
    out["team"] = out["team"].astype(str).str.strip().str.upper()
    out["home_away"] = out["home_away"].astype(str).str.strip().str.lower()
    out["opp_starter_hand"] = out["opp_starter_hand"].astype(str).str.strip().str.upper()
    for col in ("H", "TB", "HR", "R", "RBI", "BB", "SO", "SB"):
        out[col] = pd.to_numeric(out.get(col), errors="coerce").fillna(0)
    out["HRR"] = out["H"] + out["R"] + out["RBI"]
    return out.sort_values(["player_id", "date", "game_pk"])


def compute_player_prop_rows(
    gdf: pd.DataFrame,
    prop_key: str,
    line: float,
    stat_fn: Callable[[pd.Series], float],
    bats_lookup: Dict[int, str],
    updated: str,
) -> Optional[dict]:
    if gdf.empty:
        return None

    pid = int(gdf["player_id"].iloc[0])
    name = str(gdf["player_name"].iloc[-1])
    team = str(gdf["team"].iloc[-1])
    bats = bats_lookup.get(pid, "R")

    try:
        stat_vals = gdf.apply(stat_fn, axis=1)
    except Exception:
        return None

    cleared = stat_vals >= line
    if cleared.sum() == 0 and stat_vals.max() < line:
        # still emit row with zero rates when player has games but never cleared
        pass

    hit_l5, games_l5 = _window_rate(cleared, 5)
    hit_l10, games_l10 = _window_rate(cleared, 10)
    hit_l20, games_l20 = _window_rate(cleared, 20)
    hit_season = _rate(cleared)
    games_season = int(len(cleared))

    work = gdf.copy()
    work["cleared"] = cleared.values
    hand = work["opp_starter_hand"]
    return {
        "player_id": pid,
        "player_name": name,
        "team": team,
        "bats": bats,
        "prop": prop_key,
        "line": line,
        "hit_l5": hit_l5,
        "hit_l10": hit_l10,
        "hit_l20": hit_l20,
        "hit_season": hit_season,
        "games_l5": games_l5,
        "games_l10": games_l10,
        "games_l20": games_l20,
        "games_season": games_season,
        "streak": _streak(cleared),
        "last10": _last10_pipe(cleared),
        "hit_vs_rhp": _split_rate(work, hand == "R"),
        "hit_vs_lhp": _split_rate(work, hand == "L"),
        "hit_home": _split_rate(work, work["home_away"] == "home"),
        "hit_away": _split_rate(work, work["home_away"] == "away"),
        "last_game_date": gdf["date"].iloc[-1].strftime("%Y-%m-%d"),
        "updated": updated,
    }


def run():
    print("Computing batter prop hit-rates...")
    updated = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if not INPUT_FILE.exists():
        print(f"  WARNING: {INPUT_FILE.name} not found -- writing header-only output")
        pd.DataFrame(columns=OUTPUT_COLUMNS).to_csv(OUTPUT_FILE, index=False)
        return

    try:
        raw = pd.read_csv(INPUT_FILE)
    except Exception as exc:
        print(f"  WARNING: could not read gamelog ({exc}) -- writing header-only output")
        pd.DataFrame(columns=OUTPUT_COLUMNS).to_csv(OUTPUT_FILE, index=False)
        return

    if raw.empty:
        print("  Empty gamelog -- writing header-only output")
        pd.DataFrame(columns=OUTPUT_COLUMNS).to_csv(OUTPUT_FILE, index=False)
        return

    games = _prep_gamelog(raw)
    bats_lookup = _load_registry_bats()
    rows: List[dict] = []

    for pid, gdf in games.groupby("player_id", sort=True):
        gdf = gdf.reset_index(drop=True)
        for prop_key, line, stat_fn in PROP_DEFINITIONS:
            rec = compute_player_prop_rows(gdf, prop_key, line, stat_fn, bats_lookup, updated)
            if rec and rec["games_season"] > 0:
                rows.append(rec)

    out = pd.DataFrame(rows, columns=OUTPUT_COLUMNS) if rows else pd.DataFrame(columns=OUTPUT_COLUMNS)
    out.to_csv(OUTPUT_FILE, index=False)
    print(f"  Saved {len(out)} prop hit-rate rows -> {OUTPUT_FILE}")


if __name__ == "__main__":
    run()
