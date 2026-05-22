"""
OSI (Offensive Strength Index) — overall offensive composite with regression projection.

OSI = 0.43 x RCV + 0.37 x ABQ + 0.20 x OBR
projOSI = OSI + clip((xwOBA - wOBA) x 450, -8, +8)
"""

import pandas as pd

W_RCV = 0.43
W_ABQ = 0.37
W_OBR = 0.20
REG_CLIP = 8
REG_SCALE = 450


def calc_osi(abq, rcv, obr):
    df = abq.merge(rcv, on="Tm").merge(obr, on="Tm")
    df["OSI"] = W_RCV * df["RCV"] + W_ABQ * df["ABQ"] + W_OBR * df["OBR"]
    df["wOBA"] = pd.to_numeric(df["wOBA"], errors="coerce")
    df["xwOBA"] = pd.to_numeric(df["xwOBA"], errors="coerce")
    df["reg_signal"] = (df["xwOBA"] - df["wOBA"]) * REG_SCALE
    df["reg_signal"] = df["reg_signal"].clip(-REG_CLIP, REG_CLIP)
    df["projOSI"] = df["OSI"] + df["reg_signal"]
    return df[["Tm", "ABQ", "RCV", "OBR", "OSI", "projOSI", "reg_signal"]]
