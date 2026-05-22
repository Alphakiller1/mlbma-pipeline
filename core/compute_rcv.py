"""
RCV (Run Creation Value) — damage and scoring pressure composite.

RCV = 0.35 x wRC+ + 0.32 x Barrel% + 0.20 x ISO + 0.13 x HardHit%
Park factor placeholder = 1.0 until park data is added.
"""

import pandas as pd

from core.config import PARK_FACTOR_DEFAULT, RCV_WEIGHTS
from core.metrics_utils import normalize

W_WRC = RCV_WEIGHTS["wrc_plus"]
W_BARREL = RCV_WEIGHTS["barrel_pct"]
W_ISO = RCV_WEIGHTS["iso"]
W_HARD_HIT = RCV_WEIGHTS["hard_hit"]


def calc_rcv(std, bb, savant):
    df = std[["Tm", "wRC+", "ISO", "wOBA"]].copy()
    df["wRC+"] = pd.to_numeric(df["wRC+"], errors="coerce")
    df["ISO"] = pd.to_numeric(df["ISO"], errors="coerce")
    df["wOBA"] = pd.to_numeric(df["wOBA"], errors="coerce")

    sav = savant[["Tm", "Barrel%", "HardHit%", "xwOBA"]].copy()
    df = df.merge(sav, on="Tm", how="left")

    df["park"] = PARK_FACTOR_DEFAULT

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
