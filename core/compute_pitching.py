"""
Pitching Score — IP-weighted team pitching composite from starter stats.

Pitching Score = 0.40 x K% + 0.35 x inv(BB%) + 0.25 x inv(HR/9)
"""

import os

import numpy as np
import pandas as pd

from core.config import DATA_DIR, PITCHING_WEIGHTS
from core.metrics_utils import clean_pct, invert, normalize

W_K = PITCHING_WEIGHTS["k_pct"]
W_BB = PITCHING_WEIGHTS["inv_bb_pct"]
W_HR9 = PITCHING_WEIGHTS["inv_hr9"]


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
