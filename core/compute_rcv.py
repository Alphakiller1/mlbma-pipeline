"""
RCV (Run Creation Value) — damage and scoring pressure composite.

RCV = 0.35 x wRC+ + 0.32 x Barrel% + 0.20 x ISO + 0.13 x HardHit%
Barrel%, ISO, and HardHit% are park-adjusted via PARK_FACTORS (wRC+ is already park-adjusted).
"""

import pandas as pd

from core.config import PARK_FACTORS, RCV_WEIGHTS
from core.metrics_utils import normalize

W_WRC = RCV_WEIGHTS["wrc_plus"]
W_BARREL = RCV_WEIGHTS["barrel_pct"]
W_ISO = RCV_WEIGHTS["iso"]
W_HARD_HIT = RCV_WEIGHTS["hard_hit"]

_warned_teams: set[str] = set()


def _team_park_factor(tm: str) -> float:
    key = str(tm).strip().upper()
    if key in PARK_FACTORS:
        return PARK_FACTORS[key]
    if key not in _warned_teams:
        print(f"WARNING: Park factor not found for {key}, using 1.0")
        _warned_teams.add(key)
    return 1.0


def calc_rcv(std, bb, savant):
    df = std[["Tm", "wRC+", "ISO", "wOBA"]].copy()
    df["wRC+"] = pd.to_numeric(df["wRC+"], errors="coerce")
    df["ISO"] = pd.to_numeric(df["ISO"], errors="coerce")
    df["wOBA"] = pd.to_numeric(df["wOBA"], errors="coerce")

    sav = savant[["Tm", "Barrel%", "HardHit%", "xwOBA"]].copy()
    df = df.merge(sav, on="Tm", how="left")

    df["park"] = df["Tm"].map(_team_park_factor)

    df["barrel_adj"] = pd.to_numeric(df["Barrel%"], errors="coerce").fillna(8.0) / df["park"]
    df["iso_adj"] = df["ISO"] / df["park"]
    df["hard_adj"] = pd.to_numeric(df["HardHit%"], errors="coerce").fillna(38.0) / df["park"]

    df["wrc_norm"] = normalize(df["wRC+"])
    df["barrel_norm"] = normalize(df["barrel_adj"])
    df["iso_norm"] = normalize(df["iso_adj"])
    df["hard_norm"] = normalize(df["hard_adj"])

    df["RCV"] = (
        W_WRC * df["wrc_norm"]
        + W_BARREL * df["barrel_norm"]
        + W_ISO * df["iso_norm"]
        + W_HARD_HIT * df["hard_norm"]
    )
    return df[["Tm", "RCV", "wOBA", "xwOBA"]]
