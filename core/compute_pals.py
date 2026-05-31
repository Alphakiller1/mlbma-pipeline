"""
PALS (Pitcher-Adjusted Lineup Strength) -- offensive strength adjusted for SP quality faced.

PALS = (BA+ + PTF+) / 2
  BA+  = normalized OSI
  PTF+ = normalized avg opposing SP xFIP (inverted -- easier schedule scores higher)
"""

import os

import pandas as pd

from core.config import DATA_DIR, PALS_WEIGHTS
from core.metrics_utils import load


def normalize_optional(series, invert=False):
    """Normalize to 0-100; invert when lower raw values should score higher."""
    mn, mx = series.min(), series.max()
    if mx == mn:
        return pd.Series([50.0] * len(series), index=series.index)
    norm = (series - mn) / (mx - mn) * 100
    return 100 - norm if invert else norm


def match_sp(sp_name, sp_df):
    if sp_name == "TBD" or not sp_name:
        return None
    last = sp_name.split()[-1].lower()
    match = sp_df[sp_df["last_name"] == last]
    if match.empty:
        return None
    return match.iloc[0]["xFIP"]


def load_sp_xfip():
    df = load("sp_standard.csv")
    if df is None:
        raise FileNotFoundError("sp_standard.csv not found -- run FanGraphs scrape first")
    df = df[df["IP"].apply(pd.to_numeric, errors="coerce") >= 10]
    df["xFIP"] = pd.to_numeric(df["xFIP"], errors="coerce")
    df = df.dropna(subset=["xFIP"])
    df["last_name"] = df["Name"].str.split().str[-1].str.lower()
    print(f"  Loaded {len(df)} qualified SPs with xFIP")
    return df


def load_osi_for_pals():
    path = os.path.join(DATA_DIR, "metrics_vs_RHP.csv")
    if not os.path.exists(path):
        raise FileNotFoundError("metrics_vs_RHP.csv not found -- run compute first")
    return pd.read_csv(path)[["Tm", "OSI"]]


def load_team_pitch_scores() -> dict:
    path = DATA_DIR / "metrics_pitching_score.csv"
    if not path.exists():
        return {}
    df = pd.read_csv(path)
    out = {}
    for _, row in df.iterrows():
        tm = str(row.get("Tm", "")).strip().upper()
        ps = row.get("PitchScore")
        if tm and pd.notna(ps):
            out[tm] = float(ps)
    return out


def calc_pals(games, sp_df, osi_df):
    games = games.copy()
    games["opp_xfip"] = games["opp_sp"].apply(lambda x: match_sp(x, sp_df))
    matched = games.dropna(subset=["opp_xfip"])
    print(f"  Matched {len(matched)} of {len(games)} games to SP xFIP")

    ptf = matched.groupby("team")["opp_xfip"].mean().reset_index()
    ptf.columns = ["Tm", "avg_xFIP_faced"]

    pitch_map = load_team_pitch_scores()
    ps_faced = None
    if pitch_map and "opp" in games.columns:
        games["opp_pitch_score"] = games["opp"].astype(str).str.strip().str.upper().map(pitch_map)
        ps_matched = games.dropna(subset=["opp_pitch_score"])
        if not ps_matched.empty:
            ps_faced = (
                ps_matched.groupby("team")["opp_pitch_score"].mean().reset_index()
            )
            ps_faced.columns = ["Tm", "avg_pitch_score_faced"]

    df = osi_df.merge(ptf, on="Tm", how="left")
    if ps_faced is not None:
        df = df.merge(ps_faced, on="Tm", how="left")
    df = df.dropna(subset=["avg_xFIP_faced"])

    df["BA_plus"] = normalize_optional(df["OSI"])
    df["PTF_plus"] = normalize_optional(df["avg_xFIP_faced"], invert=True)
    df["PALS"] = (
        PALS_WEIGHTS["ba_plus"] * df["BA_plus"]
        + PALS_WEIGHTS["ptf_plus"] * df["PTF_plus"]
    )

    df = df.sort_values("PALS", ascending=False).reset_index(drop=True)
    df.index += 1
    df["avg_xFIP_faced"] = df["avg_xFIP_faced"].round(2)
    if "avg_pitch_score_faced" in df.columns:
        df["avg_pitch_score_faced"] = df["avg_pitch_score_faced"].round(1)
    df["BA_plus"] = df["BA_plus"].round(1)
    df["PTF_plus"] = df["PTF_plus"].round(1)
    df["PALS"] = df["PALS"].round(1)

    print("\n── PALS Results ──")
    print(df[["Tm", "OSI", "avg_xFIP_faced", "BA_plus", "PTF_plus", "PALS"]].to_string())
    return df
