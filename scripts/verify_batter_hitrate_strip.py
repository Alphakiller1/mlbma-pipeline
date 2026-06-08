"""Verify batter prop hit-rate strip values against raw game logs."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.config import DATA_DIR

CASES = [
    {
        "label": "STAR vs RHP (in lineup tonight)",
        "player_id": 572233,
        "prop": "hits",
        "line": 1.0,
        "platoon_hand": "R",
        "url_player": "Christian Walker",
    },
    {
        "label": "PLATOON L bat vs LHP split (J.P. Crawford, SEA lineup)",
        "player_id": 641487,
        "prop": "hits",
        "line": 1.0,
        "platoon_hand": "L",
        "url_player": "J.P. Crawford",
    },
    {
        "label": "NOT IN LINEUP tonight",
        "player_id": 608070,
        "prop": "hits",
        "line": 1.0,
        "platoon_hand": "R",
        "url_player": "Jose Ramirez",
    },
]


def cleared_series(gdf: pd.DataFrame, prop: str, line: float) -> pd.Series:
    if prop == "hits":
        return gdf["H"] >= line
    if prop == "total_bases":
        return gdf["TB"] >= line
    if prop == "strikeouts":
        return gdf["SO"] >= line
    raise ValueError(prop)


def hand_count(gdf: pd.DataFrame, prop: str, line: float, window: str) -> tuple[float | None, int]:
    cleared = cleared_series(gdf, prop, line)
    if window == "l5":
        sample = cleared.tail(5)
    elif window == "l10":
        sample = cleared.tail(10)
    elif window == "l20":
        sample = cleared.tail(20)
    elif window == "season":
        sample = cleared
    else:
        raise ValueError(window)
    if sample.empty:
        return None, 0
    return round(float(sample.mean()), 4), len(sample)


def last10_pipe(gdf: pd.DataFrame, prop: str, line: float) -> str:
    cleared = cleared_series(gdf, prop, line).tail(10)
    return "|".join("1" if bool(x) else "0" for x in cleared)


def active_streak(gdf: pd.DataFrame, prop: str, line: float) -> int:
    cleared = cleared_series(gdf, prop, line).tolist()
    streak = 0
    for hit in reversed(cleared):
        if hit:
            streak += 1
        else:
            break
    return streak


def verify_case(g: pd.DataFrame, h: pd.DataFrame, reg: pd.DataFrame, case: dict) -> dict:
    pid = int(case["player_id"])
    prop = case["prop"]
    line = float(case["line"])
    gdf = g[g["player_id"] == pid].sort_values(["date", "game_pk"]).reset_index(drop=True)
    sub = h[(h["player_id"] == pid) & (h["prop"] == prop) & (h["line"] == line)]
    name = (
        reg.loc[reg["player_id"] == pid, "full_name"].iloc[0]
        if len(reg.loc[reg["player_id"] == pid])
        else gdf.iloc[0]["player_name"]
    )

    result = {
        "label": case["label"],
        "name": name,
        "player_id": pid,
        "prop": prop,
        "line": line,
        "url": f"http://127.0.0.1:8765/batter_profile.html?player={case['url_player']}",
        "checks": [],
        "pass": True,
    }

    if sub.empty:
        result["pass"] = False
        result["error"] = "missing hit-rate row"
        return result

    row = sub.iloc[0]
    for window, col in [
        ("l5", "hit_l5"),
        ("l10", "hit_l10"),
        ("l20", "hit_l20"),
        ("season", "hit_season"),
    ]:
        manual, games = hand_count(gdf, prop, line, window)
        csv_val = round(float(row[col]), 4)
        ok = manual == csv_val
        result["checks"].append(
            {"field": window, "manual": manual, "csv": csv_val, "games": games, "ok": ok}
        )
        result["pass"] &= ok

    pipe_manual = last10_pipe(gdf, prop, line)
    pipe_csv = str(row["last10"])
    ok = pipe_manual == pipe_csv
    result["checks"].append(
        {"field": "last10", "manual": pipe_manual, "csv": pipe_csv, "ok": ok}
    )
    result["pass"] &= ok

    st_manual = active_streak(gdf, prop, line)
    st_csv = int(row["streak"])
    ok = st_manual == st_csv
    result["checks"].append(
        {"field": "streak", "manual": st_manual, "csv": st_csv, "ok": ok}
    )
    result["pass"] &= ok

    hand = case["platoon_hand"]
    plat_gdf = gdf[gdf["opp_starter_hand"] == hand]
    plat_manual = (
        round(float((plat_gdf["H"] >= line).mean()), 4) if len(plat_gdf) else None
    )
    plat_col = "hit_vs_lhp" if hand == "L" else "hit_vs_rhp"
    plat_csv = round(float(row[plat_col]), 4)
    ok = plat_manual == plat_csv
    result["checks"].append(
        {
            "field": plat_col,
            "manual": plat_manual,
            "csv": plat_csv,
            "platoon_games": len(plat_gdf),
            "ok": ok,
        }
    )
    result["pass"] &= ok

    return result


def main() -> None:
    g = pd.read_csv(DATA_DIR / "batter_gamelog.csv")
    h = pd.read_csv(DATA_DIR / "batter_prop_hitrates.csv")
    reg = pd.read_csv(DATA_DIR / "player_registry.csv")
    g["player_id"] = g["player_id"].astype(int)
    h["player_id"] = h["player_id"].astype(int)

    results = [verify_case(g, h, reg, case) for case in CASES]
    print(json.dumps(results, indent=2))
    failed = [r for r in results if not r["pass"]]
    if failed:
        raise SystemExit(1)
    print("\nAll verification cases passed.")


if __name__ == "__main__":
    main()
