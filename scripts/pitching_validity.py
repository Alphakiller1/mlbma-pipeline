"""Re-evaluate PitchScore: construct, calibration, and predictive validity vs alternatives."""
import os
import numpy as np, pandas as pd
from scipy import stats
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "data")

def num(s):
    return pd.to_numeric(s.astype(str).str.replace("%", "", regex=False).str.strip(), errors="coerce")

ps = pd.read_csv(os.path.join(D, "metrics_pitching_score.csv"))
ps["Tm"] = ps["Tm"].astype(str).str.upper()
tr = pd.read_csv(os.path.join(D, "team_results.csv"))
tr["team"] = tr["team"].astype(str).str.upper()
for c in ["runs_allowed", "win_pct", "games", "runs_per_game"]:
    tr[c] = num(tr[c])
tr["ra_pg"] = tr["runs_allowed"] / tr["games"]

# Team-level pitching from sp_standard (IP-weighted). NOTE includes relievers present in file.
sp = pd.read_csv(os.path.join(D, "sp_standard.csv"))
sp = sp[sp["Tm"].notna() & ~sp["Tm"].astype(str).str.contains("Tms", na=False)].copy()
sp["IP"] = num(sp["IP"])
sp = sp[sp["IP"] > 0]
print("sp_standard: %d pitcher-rows, %d teams, IP/team mean=%.0f (full-season team IP ~ 1400+ if full staff, ~700-900 if SP only)"
      % (len(sp), sp["Tm"].nunique(), sp.groupby("Tm")["IP"].sum().mean()))
def wavg(df, col):
    d = df.dropna(subset=[col, "IP"])
    return np.average(num(d[col]), weights=d["IP"]) if len(d) else np.nan
rows = []
for tm, g in sp.groupby("Tm"):
    rows.append({"Tm": str(tm).upper(), **{c: wavg(g, c) for c in ["FIP", "xFIP", "WHIP", "ERA", "K%", "BB%", "HR/9"]}})
team_pitch = pd.DataFrame(rows)

m = ps.merge(team_pitch, on="Tm", how="left", suffixes=("", "_sp")).merge(
    tr[["team", "ra_pg", "win_pct"]].rename(columns={"team": "Tm"}), on="Tm").dropna(subset=["ra_pg"])
for c in m.columns:
    if c != "Tm":
        m[c] = num(m[c])

def rr(col, target="ra_pg"):
    d = m[[col, target]].dropna()
    if len(d) < 5: return None
    return stats.pearsonr(d[col], d[target])[0]

print("\n=== Correlation with runs allowed/game (want NEGATIVE = better pitching) and win% (want POSITIVE) ===")
print(f"  {'metric':14}{'~RA/g':>9}{'~win%':>9}")
for col in ["PitchScore", "K%", "BB%", "HR/9", "FIP", "xFIP", "WHIP", "ERA"]:
    if col in m.columns:
        print(f"  {col:14}{rr(col):+9.2f}{rr(col,'win_pct'):+9.2f}")

# PitchScore components vs RA/g
print("\n=== PitchScore component corr with RA/g ===")
print("  K%% ~RA r={:+.2f} | BB%% ~RA r={:+.2f} | HR/9 ~RA r={:+.2f}".format(rr("K%"), rr("BB%"), rr("HR/9")))

# Weight-scheme test (min-max normalize within the 30 teams, like production)
def norm(s):
    s = s.reset_index(drop=True); mn, mx = s.min(), s.max()
    return (s - mn) / (mx - mn) * 100 if mx > mn else pd.Series([50.0] * len(s))
def inv(s):
    return 100 - norm(s)
K, B, H = norm(m["K%"]), inv(m["BB%"]), inv(m["HR/9"])
W = inv(m["WHIP"])
print("\n=== Current 3-stat PitchScore weight schemes (K/BB/HR) vs RA/g and win% ===")
print("  {:24}{:>9}{:>9}".format("scheme", "~RA/g", "~win%"))
for name, w in {"current .40/.35/.25": (.40, .35, .25), "equal .33/.33/.33": (1/3, 1/3, 1/3),
                "K-lean .50/.30/.20": (.50, .30, .20), "HR-up .35/.30/.35": (.35, .30, .35)}.items():
    sc = w[0] * K + w[1] * B + w[2] * H
    print("  {:24}{:+9.2f}{:+9.2f}".format(name, stats.pearsonr(sc, m['ra_pg'])[0], stats.pearsonr(sc, m['win_pct'])[0]))

print("\n=== WHIP-inclusive variants (K/BB/HR/WHIP) -- does adding contact/baserunner signal help? ===")
print("  {:30}{:>9}{:>9}".format("scheme", "~RA/g", "~win%"))
for name, w in {"4-stat .30/.20/.20/.30": (.30, .20, .20, .30),
                "4-stat .25/.20/.15/.40": (.25, .20, .15, .40),
                "4-stat .35/.25/.20/.20": (.35, .25, .20, .20),
                "WHIP only          ": (0, 0, 0, 1.0)}.items():
    sc = w[0] * K + w[1] * B + w[2] * H + w[3] * W
    print("  {:30}{:+9.2f}{:+9.2f}".format(name, stats.pearsonr(sc, m['ra_pg'])[0], stats.pearsonr(sc, m['win_pct'])[0]))

# unconstrained RA-optimal over 4 stats
best = None
for a in np.arange(0, 1.01, 0.1):
    for b in np.arange(0, 1.01 - a, 0.1):
        for c in np.arange(0, 1.01 - a - b, 0.1):
            d = 1 - a - b - c
            if d < -1e-9: continue
            sc = a * K + b * B + c * H + d * W
            r = stats.pearsonr(sc, m["ra_pg"])[0]
            if best is None or r < best[0]:
                best = (r, (round(a, 2), round(b, 2), round(c, 2), round(d, 2)))
print("  RA-optimal (K/BB/HR/WHIP) = {} r={:+.2f}  (in-sample, 30 pts)".format(best[1], best[0]))
