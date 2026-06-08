import os
import pandas as pd, numpy as np
from scipy import stats
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "data")

def num(s):
    return pd.to_numeric(s.astype(str).str.replace("%", "", regex=False).str.strip(), errors="coerce")

def normalize(s):
    s = s.reset_index(drop=True)
    mn, mx = s.min(), s.max()
    return pd.Series([50.0]*len(s)) if mx == mn else (s - mn)/(mx - mn)*100

# team key normalization (savant abbrevs -> fangraphs abbrevs used in metrics files)
KEYMAP = {"KC": "KCR", "SF": "SFG", "TB": "TBR", "SD": "SDP", "WSH": "WSN", "CWS": "CHW", "AZ": "ARI"}
def norm_tm(s):
    return s.astype(str).str.upper().replace(KEYMAP)

sav = pd.read_csv(os.path.join(D, "savant_team_leaderboard.csv"))
savR = pd.read_csv(os.path.join(D, "savant_vs_RHP.csv"))
savL = pd.read_csv(os.path.join(D, "savant_vs_LHP.csv"))
rhp = pd.read_csv(os.path.join(D, "metrics_vs_RHP.csv"))
tr = pd.read_csv(os.path.join(D, "team_results.csv"))

for df in (sav, savR, savL):
    df["Tm"] = norm_tm(df["Tm"]); df["xwOBA"] = num(df["xwOBA"])
rhp["Tm"] = norm_tm(rhp["Tm"]); rhp["BB%"] = num(rhp["BB%"]); rhp["wOBA"] = num(rhp["wOBA"])
tr["team"] = norm_tm(tr["team"]); tr["rpg"] = num(tr["runs_per_game"])

# check key alignment now
print("After keymap: leaderboard teams not in savant_vs_RHP:",
      sorted(set(sav.Tm) - set(savR.Tm)))

base = sav[["Tm", "xwOBA"]].rename(columns={"xwOBA": "season"})
b = base.merge(savR[["Tm", "xwOBA"]].rename(columns={"xwOBA": "splitR"}), on="Tm", how="left")
b = b.merge(savL[["Tm", "xwOBA"]].rename(columns={"xwOBA": "splitL"}), on="Tm", how="left")
b = b.merge(rhp[["Tm", "BB%", "wOBA"]], on="Tm", how="left")
b = b.merge(tr[["team", "rpg"]].rename(columns={"team": "Tm"}), on="Tm", how="left").dropna(subset=["season", "rpg"])

print(f"\nteams with full data: {b.dropna().shape[0]}")
print(f"\n{'w(split)':>9}  {'blendR~runs':>12}  {'blendR~wOBA':>12}  {'OBR(blendR)~runs':>16}")
for w in [0.0, 0.15, 0.25, 0.35, 0.5, 0.75, 1.0]:
    splitR = b["splitR"].where(b["splitR"].notna(), b["season"])
    blend = (1 - w) * b["season"] + w * splitR
    d = pd.DataFrame({"x": blend, "bb": b["BB%"], "rpg": b["rpg"], "woba": b["wOBA"]}).dropna()
    r_runs = stats.pearsonr(d.x, d.rpg)[0]
    r_woba = stats.pearsonr(d.x, d.woba)[0]
    obr = 0.65 * normalize(d.x) + 0.35 * normalize(d.bb)
    r_obr = stats.pearsonr(obr.values, d.rpg.values)[0]
    print(f"{w:9.2f}  {r_runs:+12.2f}  {r_woba:+12.2f}  {r_obr:+16.2f}")

# platoon-delta model: season + (splitR - mean(splitR,splitL))
print("\nplatoon-delta model (season + team's vsR platoon lean):")
lean = b["splitR"] - (b[["splitR", "splitL"]].mean(axis=1))
xpd = b["season"] + lean.fillna(0)
d = pd.DataFrame({"x": xpd, "rpg": b["rpg"], "woba": b["wOBA"]}).dropna()
print(f"  ~runs r={stats.pearsonr(d.x,d.rpg)[0]:+.2f}  ~wOBA r={stats.pearsonr(d.x,d.woba)[0]:+.2f}")
