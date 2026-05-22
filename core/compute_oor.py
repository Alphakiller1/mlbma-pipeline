"""
OOR (Opponent Offensive Rating) -- split offensive strength vs RHP/LHP.

OOR = 0.55 x HvR + 0.45 x HvL
HvP = average of OSI vs RHP and OSI vs LHP
"""

import os

import pandas as pd

from core.config import DATA_DIR, OOR_WEIGHTS
from core.metrics_utils import normalize

W_HVR = OOR_WEIGHTS["hvr"]
W_HVL = OOR_WEIGHTS["hvl"]


def calc_oor(osi_rhp, osi_lhp):
    rhp = osi_rhp[["Tm", "OSI"]].copy()
    rhp.columns = ["Tm", "HvR"]
    lhp = osi_lhp[["Tm", "OSI"]].copy()
    lhp.columns = ["Tm", "HvL"]
    df = rhp.merge(lhp, on="Tm", how="inner")
    df["HvP"] = ((df["HvR"] + df["HvL"]) / 2).round(2)
    league_avg = df["HvP"].mean()
    if league_avg and league_avg != 0:
        df["vP_pct"] = ((df["HvP"] - league_avg) / league_avg * 100).round(2).astype(str) + "%"
    else:
        df["vP_pct"] = "0%"
    df["vP_Rank"] = df["HvP"].rank(ascending=False).astype(int)
    df["vL_Rank"] = df["HvL"].rank(ascending=False).astype(int)
    df["vR_Rank"] = df["HvR"].rank(ascending=False).astype(int)
    df["OOR"] = W_HVR * normalize(df["HvR"]) + W_HVL * normalize(df["HvL"])

    oor_sorted = df.sort_values("HvP", ascending=False).reset_index(drop=True)
    oor_sorted.index += 1
    print()
    print("OOR - Opponent Offensive Rating")
    print(oor_sorted[["Tm", "HvP", "HvL", "HvR", "vP_pct", "vP_Rank", "vL_Rank", "vR_Rank"]].to_string())
    out = os.path.join(DATA_DIR, "metrics_oor.csv")
    oor_sorted.to_csv(out, index=False)
    print("Saved:", out)
    return oor_sorted
