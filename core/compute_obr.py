"""
OBR (On-Base Rating) — on-base profile floor.

OBR = 0.65 x xwOBA + 0.35 x BB%
"""

import pandas as pd

from core.metrics_utils import clean_pct, normalize

W_XWOBA = 0.65
W_BB = 0.35


def calc_obr(std, savant):
    df = std[["Tm", "BB%"]].copy()
    df["BB%"] = clean_pct(df["BB%"])
    sav = savant[["Tm", "xwOBA"]].copy()
    df = df.merge(sav, on="Tm", how="left")
    df["xwOBA"] = pd.to_numeric(df["xwOBA"], errors="coerce")
    df["OBR"] = W_XWOBA * normalize(df["xwOBA"]) + W_BB * normalize(df["BB%"])
    return df[["Tm", "OBR"]]
