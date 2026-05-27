#!/usr/bin/env python3
"""Verify batter window CSVs and team_profiles before pushing to Google Sheets."""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

WINDOW_FILES = {
    "L30": "batter_splits_recent.csv",
    "L14": "batter_splits_l14.csv",
    "L7": "batter_splits_l7.csv",
}

MIN_BATTER_ROWS = 50
MIN_DISTINCT_TEAMS = 10
FLAT_TOLERANCE = 0.05


def row_count(path: Path) -> int:
    if not path.exists():
        return -1
    try:
        df = pd.read_csv(path)
        return len(df)
    except Exception:
        return -1


def check_window_csvs_differ() -> list[str]:
    """Detect FanGraphs date params broken (identical PA/wOBA across windows)."""
    issues: list[str] = []
    paths = {k: DATA / f for k, f in WINDOW_FILES.items()}
    if not all(p.exists() and row_count(p) >= MIN_BATTER_ROWS for p in paths.values()):
        return issues
    import pandas as pd

    def team_pa_woba(path: Path, team: str = "LAD") -> tuple[float, float] | None:
        df = pd.read_csv(path)
        if "Tm" not in df.columns:
            return None
        sub = df[df["Tm"].astype(str).str.upper() == team]
        if sub.empty:
            return None
        pa = pd.to_numeric(sub["PA"], errors="coerce").sum()
        woba = (pd.to_numeric(sub["wOBA"], errors="coerce") * pd.to_numeric(sub["PA"], errors="coerce")).sum()
        woba = woba / pa if pa else 0
        return float(pa), float(woba)

    lad = {k: team_pa_woba(p) for k, p in paths.items()}
    if lad.get("L30") and lad.get("L7"):
        pa30, _ = lad["L30"]
        pa7, _ = lad["L7"]
        if pa30 > 0 and abs(pa30 - pa7) < 5:
            issues.append(
                f"LAD total PA nearly identical across L30 ({pa30:.0f}) and L7 ({pa7:.0f}) "
                "— FanGraphs export may still be season-long; re-scrape with fixed startDate/endDate URLs"
            )
    return issues


def check_profiles() -> list[str]:
    issues: list[str] = []
    path = DATA / "team_profiles.csv"
    if not path.exists():
        return ["team_profiles.csv missing — run core.compute_team_profile"]
    df = pd.read_csv(path)
    if "osi_l30" not in df.columns:
        issues.append("team_profiles.csv missing osi_l30/l14/l7 columns")
        return issues
    flat = 0
    with_data = 0
    for _, row in df.iterrows():
        l30, l14, l7 = row.get("osi_l30"), row.get("osi_l14"), row.get("osi_l7")
        if pd.isna(l30):
            continue
        with_data += 1
        if not pd.isna(l14) and not pd.isna(l7):
            if abs(float(l30) - float(l14)) < FLAT_TOLERANCE and abs(float(l30) - float(l7)) < FLAT_TOLERANCE:
                flat += 1
    if with_data and flat / with_data >= 0.85:
        issues.append(
            f"team_profiles: {flat}/{with_data} teams have identical osi_l30/l14/l7 "
            "(re-run scrape_batter_splits + compute_team_profile)"
        )
    return issues


def main() -> int:
    print("MLBMA window data verification\n")
    ok = True
    for label, fname in WINDOW_FILES.items():
        n = row_count(DATA / fname)
        status = "OK" if n >= MIN_BATTER_ROWS else "FAIL"
        if n < 0:
            print(f"  [{status}] {fname}: missing")
            ok = False
        elif n < MIN_BATTER_ROWS:
            print(f"  [{status}] {fname}: {n} rows (need >={MIN_BATTER_ROWS})")
            ok = False
        else:
            print(f"  [{status}] {fname}: {n} rows")

    for msg in check_window_csvs_differ():
        print(f"  [FAIL] {msg}")
        ok = False

    for msg in check_profiles():
        print(f"  [FAIL] {msg}")
        ok = False

    if ok:
        print("\nAll checks passed — safe to push Team_Profiles.")
        return 0
    print("\nFix failures before push_team_profiles (see docs/ECOSYSTEM.md §4.3).")
    return 1


if __name__ == "__main__":
    sys.exit(main())
