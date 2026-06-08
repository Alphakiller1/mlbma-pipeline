"""
OSI (Offensive Strength Index) -- overall offensive composite with regression projection.

OSI = 0.40 x OBR + 0.35 x RCV + 0.25 x ABQ   (weights in config.OSI_WEIGHTS)
projOSI = OSI + clip((xwOBA - wOBA) x 450, -8, +8)
"""

import pandas as pd

from core.config import OSI_WEIGHTS, PROJ_OSI_REG_CLIP, PROJ_OSI_REG_SCALE

W_RCV = OSI_WEIGHTS["rcv"]
W_ABQ = OSI_WEIGHTS["abq"]
W_OBR = OSI_WEIGHTS["obr"]
REG_CLIP = PROJ_OSI_REG_CLIP
REG_SCALE = PROJ_OSI_REG_SCALE


def calc_osi(abq, rcv, obr):
    df = abq.merge(rcv, on="Tm").merge(obr, on="Tm")
    df["OSI"] = W_RCV * df["RCV"] + W_ABQ * df["ABQ"] + W_OBR * df["OBR"]
    df["wOBA"] = pd.to_numeric(df["wOBA"], errors="coerce")
    df["xwOBA"] = pd.to_numeric(df["xwOBA"], errors="coerce")
    df["reg_signal"] = (df["xwOBA"] - df["wOBA"]) * REG_SCALE
    df["reg_signal"] = df["reg_signal"].clip(-REG_CLIP, REG_CLIP)
    df["projOSI"] = df["OSI"] + df["reg_signal"]
    return df[["Tm", "ABQ", "RCV", "OBR", "OSI", "projOSI", "reg_signal"]]
