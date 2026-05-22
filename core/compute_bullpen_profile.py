"""Compute team bullpen unit and individual reliever profiles from reliever_gamelog.csv."""

from __future__ import annotations

from typing import Dict, List, Optional

import pandas as pd

from core.config import DATA_DIR, FIP_CONSTANT
from core.metrics_utils import parse_ip

METRIC_FIELDS = [
    "ERA",
    "FIP",
    "WHIP",
    "K_pct",
    "BB_pct",
    "HR9",
    "inherited_runners_scored_pct",
    "ABQ_allowed",
    "RCV_allowed",
    "OBR_allowed",
    "OSI_allowed",
]


def _calc_fip(hr: float, bb: float, k: float, ip: float) -> Optional[float]:
    if ip <= 0:
        return None
    return round(((13 * hr) + (3 * bb) - (2 * k)) / ip + FIP_CONSTANT, 2)

SPLIT_PREFIXES = [
    ("overall", None),
    ("vs_high_osi", ("opponent_OSI_tier", "High")),
    ("vs_mid_osi", ("opponent_OSI_tier", "Mid")),
    ("vs_low_osi", ("opponent_OSI_tier", "Low")),
    ("vs_rhh", ("batter_hand_faced", "RHH")),
    ("vs_lhh", ("batter_hand_faced", "LHH")),
    ("home", ("home_away", "home")),
    ("away", ("home_away", "away")),
    ("high_leverage", ("leverage_situation", "high")),
    ("low_leverage", ("leverage_situation", "low")),
]


def _filter_split(df: pd.DataFrame, spec) -> pd.DataFrame:
    if spec is None:
        return df
    col, val = spec
    if col not in df.columns:
        return df.iloc[0:0]
    return df[df[col].astype(str) == val]


def _agg_block(df: pd.DataFrame) -> Dict[str, Optional[float]]:
    if df.empty:
        return {k: None for k in METRIC_FIELDS}

    ip_vals = df["IP"].apply(parse_ip)
    total_ip = ip_vals.sum()
    total_er = df["ER"].sum()
    total_h = df["H"].sum()
    total_bb = df["BB"].sum()
    total_bf = df["batters_faced"].sum() if "batters_faced" in df.columns else 0
    if total_bf <= 0:
        total_bf = (df["K"] + df["H"] + df["BB"]).sum()

    ir = df["inherited_runners"].sum() if "inherited_runners" in df.columns else 0
    irs = df["inherited_scored"].sum() if "inherited_scored" in df.columns else 0
    total_hr = df["HR"].sum()
    total_k = df["K"].sum()

    return {
        "ERA": round(total_er / total_ip * 9, 2) if total_ip > 0 else None,
        "FIP": _calc_fip(total_hr, total_bb, total_k, total_ip),
        "WHIP": round((total_h + total_bb) / total_ip, 2) if total_ip > 0 else None,
        "K_pct": round(df["K"].sum() / total_bf * 100, 1) if total_bf > 0 else None,
        "BB_pct": round(df["BB"].sum() / total_bf * 100, 1) if total_bf > 0 else None,
        "HR9": round(df["HR"].sum() / total_ip * 9, 2) if total_ip > 0 else None,
        "inherited_runners_scored_pct": round(irs / ir * 100, 1) if ir > 0 else None,
        "ABQ_allowed": round(df["opponent_ABQ"].mean(), 1) if "opponent_ABQ" in df.columns else None,
        "RCV_allowed": round(df["opponent_RCV"].mean(), 1) if "opponent_RCV" in df.columns else None,
        "OBR_allowed": round(df["opponent_OBR"].mean(), 1) if "opponent_OBR" in df.columns else None,
        "OSI_allowed": round(df["opponent_OSI"].mean(), 1) if "opponent_OSI" in df.columns else None,
    }


def _prefix_row(prefix: str, metrics: Dict[str, Optional[float]]) -> dict:
    return {f"{prefix}_{k}": v for k, v in metrics.items()}


def build_profile_row(
    entity_key: str,
    entity_label: str,
    df: pd.DataFrame,
    extra: Optional[dict] = None,
) -> dict:
    row = {entity_key: entity_label}
    if extra:
        row.update(extra)
    appearances = len(df)
    row["appearances"] = appearances
    for prefix, spec in SPLIT_PREFIXES:
        sub = _filter_split(df, spec)
        row.update(_prefix_row(prefix, _agg_block(sub)))
    return row


def build_team_unit(gamelog: pd.DataFrame) -> pd.DataFrame:
    rows: List[dict] = []
    for team, pdf in gamelog.groupby("pitcher_team", dropna=False):
        rows.append(build_profile_row("team", str(team).upper(), pdf))
    if not rows:
        return pd.DataFrame(columns=["team", "appearances"] + [
            f"{p}_{m}" for p, _ in SPLIT_PREFIXES for m in METRIC_FIELDS
        ])
    return pd.DataFrame(rows)


def build_individual(gamelog: pd.DataFrame) -> pd.DataFrame:
    rows: List[dict] = []
    group_cols = ["pitcher_id", "pitcher_name", "pitcher_team", "pitcher_hand"]
    for keys, pdf in gamelog.groupby(group_cols, dropna=False):
        pid, pname, pteam, phand = keys
        rows.append(
            build_profile_row(
                "pitcher_name",
                pname,
                pdf,
                extra={
                    "pitcher_id": pid,
                    "pitcher_team": pteam,
                    "pitcher_hand": phand,
                },
            )
        )
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    cols = ["pitcher_id", "pitcher_name", "pitcher_team", "pitcher_hand", "appearances"]
    cols += [f"{p}_{m}" for p, _ in SPLIT_PREFIXES for m in METRIC_FIELDS]
    cols = [c for c in cols if c in df.columns]
    return df[cols]


def run():
    path = DATA_DIR / "reliever_gamelog.csv"
    if not path.exists():
        print("  WARNING: reliever_gamelog.csv not found -- writing empty bullpen files")
        pd.DataFrame().to_csv(DATA_DIR / "bullpen_unit.csv", index=False)
        pd.DataFrame().to_csv(DATA_DIR / "bullpen_individual.csv", index=False)
        return

    print("Computing bullpen profiles...")
    gamelog = pd.read_csv(path)
    if gamelog.empty:
        print("  Empty reliever gamelog -- writing empty profile files")
        unit = pd.DataFrame()
        individual = pd.DataFrame()
    else:
        numeric_cols = [
            "ER", "R", "H", "BB", "K", "HR", "pitches",
            "inherited_runners", "inherited_scored", "batters_faced",
            "opponent_OSI", "opponent_ABQ", "opponent_RCV", "opponent_OBR",
        ]
        for col in numeric_cols:
            if col in gamelog.columns:
                gamelog[col] = pd.to_numeric(gamelog[col], errors="coerce")

        unit = build_team_unit(gamelog)
        individual = build_individual(gamelog)

    unit_path = DATA_DIR / "bullpen_unit.csv"
    ind_path = DATA_DIR / "bullpen_individual.csv"
    unit.to_csv(unit_path, index=False)
    individual.to_csv(ind_path, index=False)
    print(f"  Saved {len(unit)} team rows -> {unit_path}")
    print(f"  Saved {len(individual)} reliever rows -> {ind_path}")


if __name__ == "__main__":
    run()
