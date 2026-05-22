"""
Pitching Score -- IP-weighted team pitching composite from starter stats.

Pitching Score = 0.40 x K% + 0.35 x inv(BB%) + 0.25 x inv(HR/9)

Also provides L14 vs season staleness detection for SP profiles and terminal.
"""

from __future__ import annotations

import os
from typing import Any

import numpy as np
import pandas as pd

from core.config import (
    DATA_DIR,
    PITCHING_WEIGHTS,
    PITCHER_BB_DRIFT_THRESHOLD,
    PITCHER_DEFAULT_WINDOW,
    PITCHER_HR_DRIFT_THRESHOLD,
    PITCHER_K_DRIFT_THRESHOLD,
    PITCHER_MIN_L14_STARTS,
    park_factor_for_team,
)
from core.metrics_utils import clean_pct, invert, normalize

W_K = PITCHING_WEIGHTS["k_pct"]
W_BB = PITCHING_WEIGHTS["inv_bb_pct"]
W_HR9 = PITCHING_WEIGHTS["inv_hr9"]


def _pct_points(raw) -> float | None:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None
    if isinstance(raw, str):
        raw = raw.replace("%", "").strip()
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return None
    if v <= 1.5:
        v *= 100
    return v


def _l14_start_count(row: pd.Series) -> int:
    for col in ("GS", "G", "GSv2"):
        if col in row.index:
            v = pd.to_numeric(row.get(col), errors="coerce")
            if pd.notna(v):
                return int(v)
    return 0


def evaluate_pitcher_staleness(
    season_row: pd.Series | None,
    l14_row: pd.Series | None,
) -> dict[str, Any]:
    """
    Compare L14 K%, BB%, HR/9 to season. Returns stale flag, warning text, and source.
    """
    if season_row is None:
        return {
            "stale": False,
            "staleness_warning": "",
            "data_source": "unavailable",
            "l14_starts": 0,
            "k_pct": None,
            "bb_pct": None,
            "hr9": None,
            "k_pct_l14": None,
            "bb_pct_l14": None,
            "hr9_l14": None,
        }

    k_season = _pct_points(season_row.get("K%"))
    bb_season = _pct_points(season_row.get("BB%"))
    hr_season = pd.to_numeric(season_row.get("HR/9"), errors="coerce")
    if pd.isna(hr_season):
        hr_season = None
    else:
        hr_season = float(hr_season)

    l14_starts = _l14_start_count(l14_row) if l14_row is not None else 0

    if l14_row is None or l14_starts < PITCHER_MIN_L14_STARTS:
        note = (
            f"Fewer than {PITCHER_MIN_L14_STARTS} L14 starts ({l14_starts}) -- using season data."
            if l14_row is not None
            else "L14 file or pitcher row missing -- using season data."
        )
        return {
            "stale": False,
            "staleness_warning": note,
            "data_source": "season",
            "l14_starts": l14_starts,
            "k_pct": k_season,
            "bb_pct": bb_season,
            "hr9": hr_season,
            "k_pct_l14": None,
            "bb_pct_l14": None,
            "hr9_l14": None,
        }

    k_l14 = _pct_points(l14_row.get("K%"))
    bb_l14 = _pct_points(l14_row.get("BB%"))
    hr_l14 = pd.to_numeric(l14_row.get("HR/9"), errors="coerce")
    if pd.isna(hr_l14):
        hr_l14 = None
    else:
        hr_l14 = float(hr_l14)

    drifts: list[str] = []
    stale = False

    if k_season is not None and k_l14 is not None:
        dk = abs(k_l14 - k_season)
        if dk >= PITCHER_K_DRIFT_THRESHOLD:
            stale = True
            drifts.append(f"K% drift {dk:.1f} pts (season {k_season:.1f} -> L14 {k_l14:.1f})")

    if bb_season is not None and bb_l14 is not None:
        db = abs(bb_l14 - bb_season)
        if db >= PITCHER_BB_DRIFT_THRESHOLD:
            stale = True
            drifts.append(f"BB% drift {db:.1f} pts (season {bb_season:.1f} -> L14 {bb_l14:.1f})")

    if hr_season is not None and hr_l14 is not None:
        dh = abs(hr_l14 - hr_season)
        if dh >= PITCHER_HR_DRIFT_THRESHOLD:
            stale = True
            drifts.append(f"HR/9 drift {dh:.2f} (season {hr_season:.2f} -> L14 {hr_l14:.2f})")

    warning = "; ".join(drifts) if drifts else "L14 rates within drift thresholds."
    return {
        "stale": stale,
        "staleness_warning": warning,
        "data_source": PITCHER_DEFAULT_WINDOW,
        "l14_starts": l14_starts,
        "k_pct": k_season,
        "bb_pct": bb_season,
        "hr9": hr_season,
        "k_pct_l14": k_l14,
        "bb_pct_l14": bb_l14,
        "hr9_l14": hr_l14,
    }


def build_pitcher_staleness_df(
    sp_std: pd.DataFrame | None = None,
    sp_l14: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """One row per pitcher with stale / staleness_warning columns."""
    std_path = os.path.join(DATA_DIR, "sp_standard.csv")
    l14_path = os.path.join(DATA_DIR, "sp_l14.csv")

    if sp_std is None and os.path.exists(std_path):
        sp_std = pd.read_csv(std_path)
    if sp_l14 is None and os.path.exists(l14_path):
        sp_l14 = pd.read_csv(l14_path)

    if sp_std is None or sp_std.empty:
        return pd.DataFrame(
            columns=["pitcher_name", "stale", "staleness_warning", "data_source", "l14_starts"]
        )

    l14_by_name: dict[str, pd.Series] = {}
    if sp_l14 is not None and "Name" in sp_l14.columns:
        for _, row in sp_l14.iterrows():
            l14_by_name[str(row["Name"])] = row

    rows = []
    for _, srow in sp_std.iterrows():
        name = str(srow.get("Name", "")).strip()
        if not name:
            continue
        ev = evaluate_pitcher_staleness(srow, l14_by_name.get(name))
        rows.append(
            {
                "pitcher_name": name,
                "stale": ev["stale"],
                "staleness_warning": ev["staleness_warning"],
                "data_source": ev["data_source"],
                "l14_starts": ev["l14_starts"],
            }
        )

    return pd.DataFrame(rows)


def park_adjust_allowed_value(value, pitcher_team: str, home_away: str) -> float | None:
    """Deflate opponent allowed metrics for home games in hitter-friendly parks."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return value
    if str(home_away).strip().lower() != "home":
        return float(value)
    pf = park_factor_for_team(pitcher_team)
    return float(value) / pf


def calc_pitching_score(sp_std):
    df = sp_std[["Tm", "K%", "BB%", "HR/9", "IP"]].copy()
    df = df[df["Tm"].notna()]
    df = df[~df["Tm"].str.contains("Tms", na=False)]
    df["K%"] = clean_pct(df["K%"])
    df["BB%"] = clean_pct(df["BB%"])
    df["HR/9"] = pd.to_numeric(df["HR/9"], errors="coerce")
    df["IP"] = pd.to_numeric(df["IP"], errors="coerce")
    df = df.dropna(subset=["K%", "BB%", "HR/9", "IP"])
    df = df[df["IP"] > 0]

    team = df.groupby("Tm").apply(
        lambda x: pd.Series({
            "K%": np.average(x["K%"], weights=x["IP"]),
            "BB%": np.average(x["BB%"], weights=x["IP"]),
            "HR/9": np.average(x["HR/9"], weights=x["IP"]),
        })
    ).reset_index()

    team["PitchScore"] = (
        W_K * normalize(team["K%"])
        + W_BB * invert(team["BB%"])
        + W_HR9 * invert(team["HR/9"])
    )

    ps_sorted = team[["Tm", "K%", "BB%", "HR/9", "PitchScore"]].sort_values(
        "PitchScore", ascending=False
    ).reset_index(drop=True)
    ps_sorted.index += 1
    ps_sorted["K%"] = (ps_sorted["K%"] * 100).round(1)
    ps_sorted["BB%"] = (ps_sorted["BB%"] * 100).round(1)
    ps_sorted["HR/9"] = ps_sorted["HR/9"].round(2)

    print()
    print("Pitching Score")
    print(ps_sorted.to_string())
    out = os.path.join(DATA_DIR, "metrics_pitching_score.csv")
    ps_sorted.to_csv(out, index=False)
    print("Saved:", out)
    return ps_sorted
