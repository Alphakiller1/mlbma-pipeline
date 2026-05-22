"""
RCV (Run Creation Value) — damage and scoring pressure composite.

RCV = 0.35 x wRC+ + 0.32 x Barrel% + 0.20 x ISO + 0.13 x HardHit%
Park factor placeholder = 1.0 until park data is added.
"""

import pandas as pd

from core.metrics_utils import normalize

W_WRC = 0.35
W_BARREL = 0.32
W_ISO = 0.20
W_HARD_HIT = 0.13


def calc_rcv(std, bb, savant):
    df = std[["Tm", "wRC+", "ISO", "wOBA"]].copy()
    df["wRC+"] = pd.to_numeric(df["wRC+"], errors="coerce")
    df["ISO"] = pd.to_numeric(df["ISO"], errors="coerce")
    df["wOBA"] = pd.to_numeric(df["wOBA"], errors="coerce")

    sav = savant[["Tm", "Barrel%", "HardHit%", "xwOBA"]].copy()
    df = df.merge(sav, on="Tm", how="left")

    df["park"] = 1.0

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
