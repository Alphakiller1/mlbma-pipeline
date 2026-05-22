"""
ABQ (At-Bat Quality) — plate discipline and contact quality composite.

ABQ = 0.30 x discipline + 0.35 x contact_quality + 0.20 x pitch_pressure + 0.15 x k_avoidance
  discipline      = BB% x 0.55 + Chase%_inv x 0.45
  contact_quality = ZCon% x 0.55 + OCon% x 0.45
  pitch_pressure  = SwStr% inverted (P/PA proxy)
  k_avoidance     = K% inverted
"""

import pandas as pd

from core.metrics_utils import clean_pct, invert, normalize

# Component weights (top-level ABQ blend)
W_DISCIPLINE = 0.30
W_CONTACT = 0.35
W_PITCH_PRESSURE = 0.20
W_K_AVOIDANCE = 0.15

# Sub-component weights within discipline / contact_quality
W_BB_DISCIPLINE = 0.55
W_CHASE_DISCIPLINE = 0.45
W_ZCON_CONTACT = 0.55
W_OCON_CONTACT = 0.45


def calc_abq(std, savant):
    df = std[["Tm", "K%", "BB%"]].copy()
    df["K%"] = clean_pct(df["K%"])
    df["BB%"] = clean_pct(df["BB%"])

    sav = savant[["Tm", "Chase%", "ZCon%", "OCon%", "SwStr%"]].copy()
    df = df.merge(sav, on="Tm", how="left")

    df["Chase%"] = pd.to_numeric(df["Chase%"], errors="coerce")
    df["ZCon%"] = pd.to_numeric(df["ZCon%"], errors="coerce")
    df["OCon%"] = pd.to_numeric(df["OCon%"], errors="coerce")
    df["SwStr%"] = pd.to_numeric(df["SwStr%"], errors="coerce")

    bb_norm = normalize(df["BB%"])
    chase_inv = invert(df["Chase%"].fillna(df["K%"] * 100))
    df["discipline"] = W_BB_DISCIPLINE * bb_norm + W_CHASE_DISCIPLINE * chase_inv

    zcon_norm = normalize(df["ZCon%"].fillna(80.0))
    ocon_norm = normalize(df["OCon%"].fillna(60.0))
    df["contact_quality"] = W_ZCON_CONTACT * zcon_norm + W_OCON_CONTACT * ocon_norm

    df["pitch_pressure"] = invert(df["SwStr%"].fillna(df["K%"] * 100))
    df["k_avoidance"] = invert(df["K%"])

    df["ABQ"] = (
        W_DISCIPLINE * df["discipline"]
        + W_CONTACT * df["contact_quality"]
        + W_PITCH_PRESSURE * df["pitch_pressure"]
        + W_K_AVOIDANCE * df["k_avoidance"]
    )
    return df[["Tm", "ABQ"]]
