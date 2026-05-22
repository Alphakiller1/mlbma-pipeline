"""Compute batter-level ABQ, RCV, OBR, OSI from FanGraphs split exports."""

from __future__ import annotations

import os
from typing import Dict, List, Optional

import pandas as pd

from core.config import (
    ABQ_CONTACT_WEIGHTS,
    ABQ_DISCIPLINE_WEIGHTS,
    ABQ_WEIGHTS,
    BATTER_MIN_PA,
    BATTER_TREND_FALLING_MAX,
    BATTER_TREND_RISING_MIN,
    DATA_DIR,
    OBR_WEIGHTS,
    OSI_WEIGHTS,
    PARK_FACTORS,
    PROJ_OSI_REG_CLIP,
    PROJ_OSI_REG_SCALE,
    RCV_WEIGHTS,
)
from core.metrics_utils import clean_pct

PROFILE_COLUMNS = [
    "player_name",
    "team",
    "split_type",
    "PA",
    "ABQ",
    "RCV",
    "OBR",
    "OSI",
    "projOSI",
    "PP_Gap",
    "trend",
]

SPLIT_FILES = {
    "vs_RHP": "batter_splits_rhp.csv",
    "vs_LHP": "batter_splits_lhp.csv",
    "home": "batter_splits_home.csv",
    "away": "batter_splits_away.csv",
}


def normalize_pool(series: pd.Series) -> pd.Series:
    mn, mx = series.min(), series.max()
    if pd.isna(mn) or pd.isna(mx) or mx == mn:
        return pd.Series(50.0, index=series.index)
    return (series - mn) / (mx - mn) * 100


def _num(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def _prep_frame(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    name_col = "Name" if "Name" in out.columns else out.columns[0]
    out["player_name"] = out[name_col].astype(str).str.strip()
    out["team"] = out.get("Tm", out.get("team_abbr", "")).astype(str).str.strip().str.upper()
    out["PA"] = _num(out["PA"]) if "PA" in out.columns else 0

    for col in ("K%", "BB%"):
        if col in out.columns:
            out[col] = clean_pct(out[col])

    for col in (
        "Chase%", "ZCon%", "OCon%", "SwStr%", "Barrel%", "HardHit%",
        "wOBA", "xwOBA", "wRC+", "ISO", "BABIP",
    ):
        if col in out.columns:
            out[col] = _num(out[col])

    return out[out["PA"] >= BATTER_MIN_PA].copy()


def compute_metrics_pool(df: pd.DataFrame) -> pd.DataFrame:
    """Apply ABQ / RCV / OBR / OSI formulas normalized within this batter pool."""
    if df.empty:
        return df

    d = _prep_frame(df)
    if d.empty:
        return d

    k = d["K%"] if "K%" in d.columns else pd.Series(0.25, index=d.index)
    bb = d["BB%"] if "BB%" in d.columns else pd.Series(0.08, index=d.index)
    chase = d["Chase%"].fillna(k * 100) if "Chase%" in d.columns else k * 100
    zcon = d["ZCon%"].fillna(80.0) if "ZCon%" in d.columns else 80.0
    ocon = d["OCon%"].fillna(60.0) if "OCon%" in d.columns else 60.0
    swstr = d["SwStr%"].fillna(k * 100) if "SwStr%" in d.columns else k * 100

    bb_norm = normalize_pool(bb)
    chase_inv = 100 - normalize_pool(chase)
    zcon_norm = normalize_pool(zcon)
    ocon_norm = normalize_pool(ocon)
    d["discipline"] = (
        ABQ_DISCIPLINE_WEIGHTS["bb_pct"] * bb_norm
        + ABQ_DISCIPLINE_WEIGHTS["chase_inv"] * chase_inv
    )
    d["contact_quality"] = (
        ABQ_CONTACT_WEIGHTS["zcon"] * zcon_norm
        + ABQ_CONTACT_WEIGHTS["ocon"] * ocon_norm
    )
    d["pitch_pressure"] = 100 - normalize_pool(swstr)
    d["k_avoidance"] = 100 - normalize_pool(k)
    d["ABQ"] = (
        ABQ_WEIGHTS["discipline"] * d["discipline"]
        + ABQ_WEIGHTS["contact_quality"] * d["contact_quality"]
        + ABQ_WEIGHTS["pitch_pressure"] * d["pitch_pressure"]
        + ABQ_WEIGHTS["k_avoidance"] * d["k_avoidance"]
    )

    wrc = d["wRC+"].fillna(100.0) if "wRC+" in d.columns else pd.Series(100.0, index=d.index)
    iso = d["ISO"].fillna(0.14) if "ISO" in d.columns else pd.Series(0.14, index=d.index)
    barrel = d["Barrel%"].fillna(8.0) if "Barrel%" in d.columns else pd.Series(8.0, index=d.index)
    hard = d["HardHit%"].fillna(38.0) if "HardHit%" in d.columns else pd.Series(38.0, index=d.index)

    park = d["team"].map(lambda t: PARK_FACTORS.get(str(t).upper(), 1.0))
    d["barrel_adj"] = barrel / park
    d["iso_adj"] = iso / park
    d["hard_adj"] = hard / park

    d["RCV"] = (
        RCV_WEIGHTS["wrc_plus"] * normalize_pool(wrc)
        + RCV_WEIGHTS["barrel_pct"] * normalize_pool(d["barrel_adj"])
        + RCV_WEIGHTS["iso"] * normalize_pool(d["iso_adj"])
        + RCV_WEIGHTS["hard_hit"] * normalize_pool(d["hard_adj"])
    )

    xwoba = d["xwOBA"].fillna(d["wOBA"]) if "xwOBA" in d.columns else d.get("wOBA", 0.32)
    woba = d["wOBA"].fillna(0.32) if "wOBA" in d.columns else pd.Series(0.32, index=d.index)
    d["OBR"] = (
        OBR_WEIGHTS["xwoba"] * normalize_pool(xwoba)
        + OBR_WEIGHTS["bb_pct"] * normalize_pool(bb)
    )

    d["OSI"] = (
        OSI_WEIGHTS["rcv"] * d["RCV"]
        + OSI_WEIGHTS["abq"] * d["ABQ"]
        + OSI_WEIGHTS["obr"] * d["OBR"]
    )
    reg = (xwoba - woba) * PROJ_OSI_REG_SCALE
    reg = reg.clip(-PROJ_OSI_REG_CLIP, PROJ_OSI_REG_CLIP)
    d["projOSI"] = d["OSI"] + reg
    d["PP_Gap"] = d["projOSI"] - d["OSI"]

    for col in ("ABQ", "RCV", "OBR", "OSI", "projOSI", "PP_Gap"):
        d[col] = d[col].round(1)

    return d


def classify_trend(osi_overall: Optional[float], osi_recent: Optional[float]) -> str:
    if osi_overall is None or osi_recent is None:
        return "stable"
    delta = osi_recent - osi_overall
    if delta >= BATTER_TREND_RISING_MIN:
        return "rising"
    if delta <= BATTER_TREND_FALLING_MAX:
        return "falling"
    return "stable"


def load_split_file(filename: str) -> pd.DataFrame:
    path = DATA_DIR / filename
    if not path.exists():
        print(f"  WARNING: {filename} not found")
        return pd.DataFrame()
    return pd.read_csv(path)


def build_trend_lookup() -> Dict[str, str]:
    overall = load_split_file("batter_splits_overall.csv")
    recent = load_split_file("batter_splits_recent.csv")
    if overall.empty or recent.empty:
        return {}

    o_pool = compute_metrics_pool(overall)
    r_pool = compute_metrics_pool(recent)
    if o_pool.empty or r_pool.empty:
        return {}

    o_map = o_pool.set_index("player_name")["OSI"].to_dict()
    r_map = r_pool.set_index("player_name")["OSI"].to_dict()
    trends = {}
    for name in o_map:
        trends[name] = classify_trend(o_map.get(name), r_map.get(name))
    return trends


def run():
    print("Computing batter profiles...")
    trend_lookup = build_trend_lookup()
    all_rows: List[dict] = []

    for split_type, filename in SPLIT_FILES.items():
        raw = load_split_file(filename)
        if raw.empty:
            continue
        scored = compute_metrics_pool(raw)
        if scored.empty:
            continue
        for _, row in scored.iterrows():
            pname = row["player_name"]
            all_rows.append(
                {
                    "player_name": pname,
                    "team": row.get("team", ""),
                    "split_type": split_type,
                    "PA": int(row["PA"]) if pd.notna(row["PA"]) else 0,
                    "ABQ": row["ABQ"],
                    "RCV": row["RCV"],
                    "OBR": row["OBR"],
                    "OSI": row["OSI"],
                    "projOSI": row["projOSI"],
                    "PP_Gap": row["PP_Gap"],
                    "trend": trend_lookup.get(pname, "stable"),
                }
            )

    out_path = DATA_DIR / "batter_profiles.csv"
    if not all_rows:
        pd.DataFrame(columns=PROFILE_COLUMNS).to_csv(out_path, index=False)
        print(f"  No batter profiles computed — empty file at {out_path}")
        return

    profiles = pd.DataFrame(all_rows)[PROFILE_COLUMNS]
    profiles.to_csv(out_path, index=False)
    print(f"  Saved {len(profiles)} profile rows -> {out_path}")
    print(f"  Players: {profiles['player_name'].nunique()} | Splits: {profiles['split_type'].nunique()}")


if __name__ == "__main__":
    run()
