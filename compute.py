import pandas as pd
import numpy as np
import os

DATA_DIR = r"C:\Users\chase\mlbma_pipeline\data"

def clean_pct(series):
    if series.dtype == object:
        return series.str.replace("%", "").astype(float) / 100
    return series

def normalize(series):
    mn, mx = series.min(), series.max()
    if mx == mn:
        return pd.Series([50.0] * len(series), index=series.index)
    return ((series - mn) / (mx - mn)) * 100

def invert(series):
    return 100 - normalize(series)

def load(filename):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        print(f"  WARNING: {filename} not found")
        return None
    return pd.read_csv(path)

def load_all():
    print("Loading data...")
    data = {}
    files = [
        "vs_RHP_standard.csv",
        "vs_RHP_batted_ball.csv",
        "vs_LHP_standard.csv",
        "vs_LHP_batted_ball.csv",
        "savant_team_leaderboard.csv",
        "savant_vs_RHP.csv",
        "savant_vs_LHP.csv",
        "sp_standard.csv",
    ]
    for f in files:
        key = f.replace(".csv", "")
        df = load(f)
        if df is not None:
            data[key] = df
            print(f"  Loaded {f}: {len(df)} rows")
    return data

def calc_abq(std, savant):
    """
    ABQ = 0.30 x discipline + 0.35 x contact_quality + 0.20 x pitch_pressure + 0.15 x k_avoidance
    discipline      = BB%x0.55 + Chase%_inv x0.45
    contact_quality = ZCon%x0.55 + OCon%x0.45
    pitch_pressure  = P/PA proxy via SwStr% inv
    k_avoidance     = K% inv
    """
    df = std[["Tm", "K%", "BB%"]].copy()
    df["K%"] = clean_pct(df["K%"])
    df["BB%"] = clean_pct(df["BB%"])

    sav = savant[["Tm", "Chase%", "ZCon%", "OCon%", "SwStr%"]].copy()
    df = df.merge(sav, on="Tm", how="left")

    df["Chase%"] = pd.to_numeric(df["Chase%"], errors="coerce")
    df["ZCon%"]  = pd.to_numeric(df["ZCon%"],  errors="coerce")
    df["OCon%"]  = pd.to_numeric(df["OCon%"],  errors="coerce")
    df["SwStr%"] = pd.to_numeric(df["SwStr%"], errors="coerce")

    # Discipline = BB% weighted + Chase% inverted
    bb_norm    = normalize(df["BB%"])
    chase_inv  = invert(df["Chase%"].fillna(df["K%"] * 100))
    df["discipline"] = 0.55 * bb_norm + 0.45 * chase_inv

    # Contact quality = ZCon% + OCon%
    zcon_norm  = normalize(df["ZCon%"].fillna(80.0))
    ocon_norm  = normalize(df["OCon%"].fillna(60.0))
    df["contact_quality"] = 0.55 * zcon_norm + 0.45 * ocon_norm

    # Pitch pressure proxy = SwStr% inverted
    df["pitch_pressure"] = invert(df["SwStr%"].fillna(df["K%"] * 100))

    # K avoidance
    df["k_avoidance"] = invert(df["K%"])

    df["ABQ"] = (
        0.30 * df["discipline"] +
        0.35 * df["contact_quality"] +
        0.20 * df["pitch_pressure"] +
        0.15 * df["k_avoidance"]
    )
    return df[["Tm", "ABQ"]]

def calc_rcv(std, bb, savant):
    """
    RCV = 0.35 x wRC+ + 0.32 x Barrel% + 0.20 x ISO + 0.13 x HardHit%
    All damage inputs park-adjusted (placeholder park factor = 1.0 until we add park data)
    """
    df = std[["Tm", "wRC+", "ISO", "wOBA"]].copy()
    df["wRC+"] = pd.to_numeric(df["wRC+"], errors="coerce")
    df["ISO"]  = pd.to_numeric(df["ISO"],  errors="coerce")
    df["wOBA"] = pd.to_numeric(df["wOBA"], errors="coerce")

    sav = savant[["Tm", "Barrel%", "HardHit%", "xwOBA"]].copy()
    df = df.merge(sav, on="Tm", how="left")

    # Park factor placeholder = 1.0 (neutral)
    df["park"] = 1.0

    df["barrel_adj"] = pd.to_numeric(df["Barrel%"], errors="coerce").fillna(8.0) / df["park"]
    df["iso_adj"]    = df["ISO"] / df["park"]
    df["hard_adj"]   = pd.to_numeric(df["HardHit%"], errors="coerce").fillna(38.0) / df["park"]

    df["wrc_norm"]    = normalize(df["wRC+"])
    df["barrel_norm"] = normalize(df["barrel_adj"])
    df["iso_norm"]    = normalize(df["iso_adj"])
    df["hard_norm"]   = normalize(df["hard_adj"])

    df["RCV"] = (
        0.35 * df["wrc_norm"] +
        0.32 * df["barrel_norm"] +
        0.20 * df["iso_norm"] +
        0.13 * df["hard_norm"]
    )
    return df[["Tm", "RCV", "wOBA", "xwOBA"]]

def calc_obr(std, savant):
    """
    OBR = 0.65 x xwOBA + 0.35 x BB%
    """
    df = std[["Tm", "BB%"]].copy()
    df["BB%"] = clean_pct(df["BB%"])
    sav = savant[["Tm", "xwOBA"]].copy()
    df = df.merge(sav, on="Tm", how="left")
    df["xwOBA"] = pd.to_numeric(df["xwOBA"], errors="coerce")
    df["OBR"] = (
        0.65 * normalize(df["xwOBA"]) +
        0.35 * normalize(df["BB%"])
    )
    return df[["Tm", "OBR"]]

def calc_osi(abq, rcv, obr):
    """
    OSI = 0.43 x RCV + 0.37 x ABQ + 0.20 x OBR
    projOSI = OSI + clip((xwOBA - wOBA) x 450, -8, +8)
    """
    df = abq.merge(rcv, on="Tm").merge(obr, on="Tm")
    df["OSI"] = (
        0.43 * df["RCV"] +
        0.37 * df["ABQ"] +
        0.20 * df["OBR"]
    )
    # Regression signal
    df["wOBA"]  = pd.to_numeric(df["wOBA"],  errors="coerce")
    df["xwOBA"] = pd.to_numeric(df["xwOBA"], errors="coerce")
    df["reg_signal"] = (df["xwOBA"] - df["wOBA"]) * 450
    df["reg_signal"] = df["reg_signal"].clip(-8, 8)
    df["projOSI"] = df["OSI"] + df["reg_signal"]
    return df[["Tm", "ABQ", "RCV", "OBR", "OSI", "projOSI", "reg_signal"]]

def calc_pitching_score(sp_std):
    """
    Pitching Score = 0.40 x K% + 0.35 x inv(BB%) + 0.25 x inv(HR/9)
    IP-weighted team aggregation
    """
    df = sp_std[["Tm", "K%", "BB%", "HR/9", "IP"]].copy()
    df = df[df["Tm"].notna()]
    df = df[~df["Tm"].str.contains("Tms", na=False)]
    df["K%"]  = clean_pct(df["K%"])
    df["BB%"] = clean_pct(df["BB%"])
    df["HR/9"] = pd.to_numeric(df["HR/9"], errors="coerce")
    df["IP"]   = pd.to_numeric(df["IP"],   errors="coerce")
    df = df.dropna(subset=["K%", "BB%", "HR/9", "IP"])
    df = df[df["IP"] > 0]

    team = df.groupby("Tm").apply(
        lambda x: pd.Series({
            "K%":   np.average(x["K%"],   weights=x["IP"]),
            "BB%":  np.average(x["BB%"],  weights=x["IP"]),
            "HR/9": np.average(x["HR/9"], weights=x["IP"]),
        })
    ).reset_index()

    team["PitchScore"] = (
        0.40 * normalize(team["K%"]) +
        0.35 * invert(team["BB%"]) +
        0.25 * invert(team["HR/9"])
    )

    ps_sorted = team[["Tm", "K%", "BB%", "HR/9", "PitchScore"]].sort_values(
        "PitchScore", ascending=False
    ).reset_index(drop=True)
    ps_sorted.index += 1
    ps_sorted["K%"]   = (ps_sorted["K%"] * 100).round(1)
    ps_sorted["BB%"]  = (ps_sorted["BB%"] * 100).round(1)
    ps_sorted["HR/9"] = ps_sorted["HR/9"].round(2)

    print()
    print("Pitching Score")
    print(ps_sorted.to_string())
    out = os.path.join(DATA_DIR, "metrics_pitching_score.csv")
    ps_sorted.to_csv(out, index=False)
    print("Saved:", out)
    return ps_sorted

def calc_oor(osi_rhp, osi_lhp):
    """
    OOR = Opponent Offensive Rating
    HvR = OSI vs RHP, HvL = OSI vs LHP, HvP = average
    """
    rhp = osi_rhp[["Tm", "OSI"]].copy()
    rhp.columns = ["Tm", "HvR"]
    lhp = osi_lhp[["Tm", "OSI"]].copy()
    lhp.columns = ["Tm", "HvL"]
    df = rhp.merge(lhp, on="Tm", how="inner")
    df["HvP"] = ((df["HvR"] + df["HvL"]) / 2).round(2)
    league_avg = df["HvP"].mean()
    df["vP_pct"]  = ((df["HvP"] - league_avg) / league_avg * 100).round(2).astype(str) + "%"
    df["vP_Rank"] = df["HvP"].rank(ascending=False).astype(int)
    df["vL_Rank"] = df["HvL"].rank(ascending=False).astype(int)
    df["vR_Rank"] = df["HvR"].rank(ascending=False).astype(int)
    df["OOR"] = 0.55 * normalize(df["HvR"]) + 0.45 * normalize(df["HvL"])

    oor_sorted = df.sort_values("HvP", ascending=False).reset_index(drop=True)
    oor_sorted.index += 1
    print()
    print("OOR - Opponent Offensive Rating")
    print(oor_sorted[["Tm", "HvP", "HvL", "HvR", "vP_pct", "vP_Rank", "vL_Rank", "vR_Rank"]].to_string())
    out = os.path.join(DATA_DIR, "metrics_oor.csv")
    oor_sorted.to_csv(out, index=False)
    print("Saved:", out)
    return oor_sorted

def compute_split(std, bb, savant, label):
    abq = calc_abq(std, savant)
    rcv = calc_rcv(std, bb, savant)
    obr = calc_obr(std, savant)
    osi = calc_osi(abq, rcv, obr)
    osi_sorted = osi.sort_values("OSI", ascending=False).reset_index(drop=True)
    osi_sorted.index += 1
    print()
    print(f"Results {label}")
    print(osi_sorted[["Tm", "ABQ", "RCV", "OBR", "OSI", "projOSI", "reg_signal"]].round(1).to_string())
    out = os.path.join(DATA_DIR, f"metrics_{label.replace(' ', '_')}.csv")
    osi_sorted.to_csv(out, index=False)
    print("Saved:", out)
    return osi_sorted

def run():
    data = load_all()
    std_rhp = data.get("vs_RHP_standard")
    bb_rhp  = data.get("vs_RHP_batted_ball")
    std_lhp = data.get("vs_LHP_standard")
    bb_lhp  = data.get("vs_LHP_batted_ball")
    savant  = data.get("savant_team_leaderboard")
    sp_std  = data.get("sp_standard")

    if any(d is None for d in [std_rhp, bb_rhp, std_lhp, bb_lhp, savant]):
        print("Missing required data files")
        return

    osi_rhp = compute_split(std_rhp, bb_rhp, savant, "vs_RHP")
    osi_lhp = compute_split(std_lhp, bb_lhp, savant, "vs_LHP")

    if sp_std is not None:
        calc_pitching_score(sp_std)

    calc_oor(osi_rhp, osi_lhp)

    print()
    print("All metrics computed.")

if __name__ == "__main__":
    run()
