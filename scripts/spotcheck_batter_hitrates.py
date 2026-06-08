"""Spot-check batter prop hit-rates against raw game logs."""

from __future__ import annotations

import pandas as pd

from core.config import DATA_DIR


def check(g: pd.DataFrame, h: pd.DataFrame, pid: int, name: str, prop: str, line: float) -> None:
    gdf = g[g["player_id"] == pid].sort_values(["date", "game_pk"]).reset_index(drop=True)
    if prop == "total_bases":
        cleared = gdf["TB"] >= line
    elif prop == "hits":
        cleared = gdf["H"] >= line
    elif prop == "strikeouts":
        cleared = gdf["SO"] >= line
    else:
        return
    l10 = cleared.tail(10)
    manual = round(float(l10.mean()), 4) if len(l10) else None
    sub = h[(h["player_id"] == pid) & (h["prop"] == prop) & (h["line"] == line)]
    if sub.empty:
        print(f"MISSING {name} {prop}>={line}")
        return
    row = sub.iloc[0]
    tag = "OK" if manual == row["hit_l10"] else "MISMATCH"
    print(
        f"{name} {prop}>={line}: L10 manual={manual} computed={row['hit_l10']} "
        f"streak={int(row['streak'])} games_l10={int(row['games_l10'])} {tag}"
    )


def main() -> None:
    g = pd.read_csv(DATA_DIR / "batter_gamelog.csv")
    h = pd.read_csv(DATA_DIR / "batter_prop_hitrates.csv")
    g["player_id"] = g["player_id"].astype(int)
    h["player_id"] = h["player_id"].astype(int)

    # Use players present in the gamelog (scope = batter_splits_overall qualified)
    check(g, h, 500743, "Ramirez", "total_bases", 2.0)
    check(g, h, 500743, "Ramirez", "hits", 1.0)

    walker = g[g["player_name"].str.contains("Walker", case=False, na=False)].iloc[0]
    check(g, h, int(walker["player_id"]), "Walker", "hits", 1.0)

    reg = pd.read_csv(DATA_DIR / "player_registry.csv")
    for pid in g["player_id"].unique():
        row = reg[reg["player_id"] == pid]
        if len(row) and str(row.iloc[0]["bats"]).upper() == "L":
            check(g, h, int(pid), str(row.iloc[0]["full_name"]), "hits", 1.0)
            break

    print(f"hitrates rows={len(h)} players={h['player_id'].nunique()}")


if __name__ == "__main__":
    main()
