"""Derive the last-14-days starting-pitcher window from the local game log.

Replaces the FanGraphs window leaderboard that used to write `sp_l14.csv`. That scrape
died with the rest of the FanGraphs chain and the file froze on 2026-08-01, so on
2026-08-31 `core.compute_pitching.evaluate_pitcher_staleness` was still comparing every
pitcher's season line against a window that had closed a month earlier: 208 of 311
profiles carried `data_source=L14` off a mid-July sample, and the "L14 form drift
detected" badge on the matchup-compare card fired (or failed to fire) on numbers six
weeks out of date.

`sp_gamelog.csv` already holds one row per start with K, BB, HR, IP and batters faced,
which is everything the staleness comparison reads, so the window is rebuilt in-house
with no external dependency.

Output columns match what the consumer looks for - `Name` to key on, `GS`/`G` for
_l14_start_count, and K%/BB% as fractions for _pct_points - so nothing downstream
changes. The displayed K%/BB%/HR9 on a pitcher profile always come from the season line
regardless of this file; what this drives is the drift flag and its warning text.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Optional

import pandas as pd

from core.config import DATA_DIR, PITCHER_DEFAULT_WINDOW

WINDOW_DAYS = 14
OUTPUT_COLUMNS = ["Name", "Tm", "G", "GS", "IP", "TBF", "K", "BB", "HR", "K%", "BB%", "HR/9", "ERA"]


def _ratio(numerator: float, denominator: float) -> Optional[float]:
    return round(numerator / denominator, 4) if denominator else None


def build(gamelog: pd.DataFrame, as_of: Optional[datetime] = None) -> pd.DataFrame:
    as_of = as_of or datetime.now()
    cutoff = (as_of - timedelta(days=WINDOW_DAYS)).strftime("%Y-%m-%d")

    frame = gamelog.copy()
    frame["date"] = frame["date"].astype(str)
    frame = frame[frame["date"] >= cutoff]
    if frame.empty:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)

    for column in ("IP", "ER", "K", "BB", "HR", "batters_faced"):
        if column in frame.columns:
            frame[column] = pd.to_numeric(frame[column], errors="coerce")

    rows = []
    for (name, team), group in frame.groupby(["pitcher_name", "pitcher_team"], dropna=False):
        innings = float(group["IP"].sum())
        batters = float(group["batters_faced"].sum()) if "batters_faced" in group else 0.0
        if innings <= 0:
            continue
        strikeouts = float(group["K"].sum())
        walks = float(group["BB"].sum())
        homers = float(group["HR"].sum())
        starts = int(len(group))
        rows.append({
            "Name": name,
            "Tm": team,
            # Every row in sp_gamelog is a start, so games and games-started are the same
            # number here; both are written because _l14_start_count checks GS then G.
            "G": starts,
            "GS": starts,
            "IP": round(innings, 1),
            "TBF": int(batters),
            "K": int(strikeouts),
            "BB": int(walks),
            "HR": int(homers),
            # Fractions - _pct_points multiplies anything <= 1.5 by 100.
            "K%": _ratio(strikeouts, batters),
            "BB%": _ratio(walks, batters),
            "HR/9": round(9 * homers / innings, 2),
            "ERA": round(9 * float(group["ER"].sum()) / innings, 2) if "ER" in group else None,
        })

    return pd.DataFrame(rows, columns=OUTPUT_COLUMNS)


def run() -> None:
    path = os.path.join(DATA_DIR, "sp_gamelog.csv")
    if not os.path.exists(path):
        print("  WARNING: sp_gamelog.csv not found -- leaving sp_l14.csv alone")
        return

    print(f"Deriving the {PITCHER_DEFAULT_WINDOW} starter window from sp_gamelog.csv...")
    out = build(pd.read_csv(path))
    if out.empty:
        # Same contract as the other derived files: never replace real data with nothing.
        print("  no starts inside the window -- leaving sp_l14.csv alone")
        return

    target = os.path.join(DATA_DIR, "sp_l14.csv")
    out.to_csv(target, index=False)
    print(f"  Saved {len(out)} pitchers ({int(out['GS'].sum())} starts) -> {target}")


if __name__ == "__main__":
    run()
