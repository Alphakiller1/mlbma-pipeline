"""Aggregate starting-pitcher split profiles from sp_gamelog.csv."""

from __future__ import annotations

from typing import List, Optional

import pandas as pd

from core.config import DATA_DIR, OPPONENT_TIER_HIGH_MIN, OPPONENT_TIER_MID_MIN
from core.compute_pitching import build_pitcher_staleness_df, park_adjust_allowed_value
from core.metrics_utils import parse_ip

SPLIT_DIMENSIONS = (
    ("osi_tier", "opponent_OSI_tier"),
    ("abq_tier", "opponent_ABQ_tier"),
    ("rcv_tier", "opponent_RCV_tier"),
    ("obr_tier", "opponent_OBR_tier"),
    ("hand", "pitcher_hand"),
    ("location", "home_away"),
)


def _opp_tier(value) -> str:
    """High/Mid/Low bucket for an opponent composite (same thresholds as OSI/ABQ)."""
    v = pd.to_numeric(value, errors="coerce")
    if pd.isna(v):
        return ""
    if v > OPPONENT_TIER_HIGH_MIN:
        return "High"
    if v >= OPPONENT_TIER_MID_MIN:
        return "Mid"
    return "Low"

METRIC_SPLIT_COLUMNS = [
    "pitcher_id",
    "pitcher_name",
    "pitcher_team",
    "pitcher_hand",
    "split_dimension",
    "split_value",
    "starts",
    "avg_IP",
    "ERA",
    "K_pct",
    "BB_pct",
    "HR9",
    "avg_pitches",
    "ABQ_allowed",
    "RCV_allowed",
    "OBR_allowed",
    "OSI_allowed",
    "FIP",
    "F5_ERA",
]

PROFILE_COLUMNS = [
    "pitcher_id",
    "pitcher_name",
    "pitcher_team",
    "pitcher_hand",
    "starts",
    "avg_IP",
    "ERA",
    "K_pct",
    "BB_pct",
    "HR9",
    "avg_pitches",
    "ABQ_allowed",
    "RCV_allowed",
    "OBR_allowed",
    "OSI_allowed",
    "F5_ERA",
    "high_osi_ERA",
    "low_osi_ERA",
    "home_ERA",
    "away_ERA",
    "stale",
    "staleness_warning",
    "data_source",
    "l14_starts",
]


def _park_adjust_gamelog(df: pd.DataFrame) -> pd.DataFrame:
    """Apply home-park adjustment to opponent allowed metrics per start."""
    out = df.copy()
    for col in ("opponent_ABQ", "opponent_RCV", "opponent_OBR", "opponent_OSI"):
        if col not in out.columns:
            continue
        out[col] = out.apply(
            lambda r: park_adjust_allowed_value(
                r[col], r.get("pitcher_team", ""), r.get("home_away", "")
            ),
            axis=1,
        )
    return out


def _agg_block(df: pd.DataFrame) -> Optional[dict]:
    if df.empty:
        return None

    df = _park_adjust_gamelog(df)

    ip_vals = df["IP"].apply(parse_ip)
    total_ip = ip_vals.sum()
    total_er = df["ER"].sum()
    total_bf = df["batters_faced"].sum() if "batters_faced" in df.columns else 0
    if total_bf <= 0:
        total_bf = (df["K"] + df["H"] + df["BB"]).sum()

    f5_mask = df["f5_er"].notna() if "f5_er" in df.columns else pd.Series([False] * len(df))
    f5_er = df.loc[f5_mask, "f5_er"].sum() if f5_mask.any() else None
    f5_starts = int(f5_mask.sum()) if f5_mask.any() else 0

    return {
        "starts": len(df),
        "avg_IP": round(total_ip / len(df), 2) if len(df) else 0.0,
        "ERA": round(total_er / total_ip * 9, 2) if total_ip > 0 else None,
        "K_pct": round(df["K"].sum() / total_bf * 100, 1) if total_bf > 0 else None,
        "BB_pct": round(df["BB"].sum() / total_bf * 100, 1) if total_bf > 0 else None,
        "HR9": round(df["HR"].sum() / total_ip * 9, 2) if total_ip > 0 else None,
        "FIP": round((13 * df["HR"].sum() + 3 * df["BB"].sum() - 2 * df["K"].sum()) / total_ip + 3.10, 2)
        if total_ip > 0 else None,
        "avg_pitches": round(df["pitches"].mean(), 1) if "pitches" in df.columns else None,
        "ABQ_allowed": round(pd.to_numeric(df["opponent_ABQ"], errors="coerce").mean(), 1),
        "RCV_allowed": round(pd.to_numeric(df["opponent_RCV"], errors="coerce").mean(), 1),
        "OBR_allowed": round(pd.to_numeric(df["opponent_OBR"], errors="coerce").mean(), 1),
        "OSI_allowed": round(pd.to_numeric(df["opponent_OSI"], errors="coerce").mean(), 1),
        "F5_ERA": round(f5_er / f5_starts / 5 * 9, 2)
        if f5_er is not None and f5_starts > 0
        else None,
    }


def build_metric_splits(gamelog: pd.DataFrame) -> pd.DataFrame:
    rows: List[dict] = []

    gamelog = gamelog.copy()
    # Derive RCV/OBR tier buckets from the per-start opponent composites so the
    # profile can split by all four created offense metrics, not just OSI/ABQ.
    if "opponent_RCV" in gamelog.columns:
        gamelog["opponent_RCV_tier"] = gamelog["opponent_RCV"].map(_opp_tier)
    if "opponent_OBR" in gamelog.columns:
        gamelog["opponent_OBR_tier"] = gamelog["opponent_OBR"].map(_opp_tier)

    for (pid, pname, pteam, phand), pdf in gamelog.groupby(
        ["pitcher_id", "pitcher_name", "pitcher_team", "pitcher_hand"], dropna=False
    ):
        for dim_name, col in SPLIT_DIMENSIONS:
            for split_val, sdf in pdf.groupby(col, dropna=False):
                if not split_val or (isinstance(split_val, float) and pd.isna(split_val)):
                    continue
                block = _agg_block(sdf)
                if not block:
                    continue
                rows.append(
                    {
                        "pitcher_id": pid,
                        "pitcher_name": pname,
                        "pitcher_team": pteam,
                        "pitcher_hand": phand,
                        "split_dimension": dim_name,
                        "split_value": str(split_val),
                        **block,
                    }
                )

    if not rows:
        return pd.DataFrame(columns=METRIC_SPLIT_COLUMNS)
    return pd.DataFrame(rows)[METRIC_SPLIT_COLUMNS]


def _split_era(pdf: pd.DataFrame, col: str, value: str) -> Optional[float]:
    sub = pdf[pdf[col] == value]
    block = _agg_block(sub)
    return block["ERA"] if block else None


def build_profiles(gamelog: pd.DataFrame, splits: pd.DataFrame) -> pd.DataFrame:
    rows: List[dict] = []
    staleness_df = build_pitcher_staleness_df()
    stale_lookup = (
        staleness_df.set_index("pitcher_name").to_dict("index")
        if not staleness_df.empty and "pitcher_name" in staleness_df.columns
        else {}
    )

    for (pid, pname, pteam, phand), pdf in gamelog.groupby(
        ["pitcher_id", "pitcher_name", "pitcher_team", "pitcher_hand"], dropna=False
    ):
        block = _agg_block(pdf)
        if not block:
            continue
        st = stale_lookup.get(str(pname), {})
        rows.append(
            {
                "pitcher_id": pid,
                "pitcher_name": pname,
                "pitcher_team": pteam,
                "pitcher_hand": phand,
                **block,
                "high_osi_ERA": _split_era(pdf, "opponent_OSI_tier", "High"),
                "low_osi_ERA": _split_era(pdf, "opponent_OSI_tier", "Low"),
                "home_ERA": _split_era(pdf, "home_away", "home"),
                "away_ERA": _split_era(pdf, "home_away", "away"),
                "stale": st.get("stale", False),
                "staleness_warning": st.get("staleness_warning", ""),
                "data_source": st.get("data_source", "season"),
                "l14_starts": st.get("l14_starts", 0),
            }
        )

    if not rows:
        return pd.DataFrame(columns=PROFILE_COLUMNS)
    return pd.DataFrame(rows)[PROFILE_COLUMNS]


def run():
    path = DATA_DIR / "sp_gamelog.csv"
    if not path.exists():
        print("  WARNING: sp_gamelog.csv not found -- writing empty split files")
        splits = pd.DataFrame(columns=METRIC_SPLIT_COLUMNS)
        profiles = pd.DataFrame(columns=PROFILE_COLUMNS)
        splits.to_csv(DATA_DIR / "sp_metric_splits.csv", index=False)
        profiles.to_csv(DATA_DIR / "sp_profiles.csv", index=False)
        return

    print("Computing SP split profiles...")
    gamelog = pd.read_csv(path)
    if gamelog.empty:
        print("  Empty gamelog -- writing empty split files")
        splits = pd.DataFrame(columns=METRIC_SPLIT_COLUMNS)
        profiles = pd.DataFrame(columns=PROFILE_COLUMNS)
    else:
        for col in ("ER", "R", "H", "BB", "K", "HR", "pitches", "batters_faced", "f5_er"):
            if col in gamelog.columns:
                gamelog[col] = pd.to_numeric(gamelog[col], errors="coerce")
        splits = build_metric_splits(gamelog)
        profiles = build_profiles(gamelog, splits)

    splits_path = DATA_DIR / "sp_metric_splits.csv"
    profiles_path = DATA_DIR / "sp_profiles.csv"
    splits.to_csv(splits_path, index=False)
    profiles.to_csv(profiles_path, index=False)
    print(f"  Saved {len(splits)} split rows -> {splits_path}")
    print(f"  Saved {len(profiles)} pitcher profiles -> {profiles_path}")


if __name__ == "__main__":
    run()
