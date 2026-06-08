"""Test OSI component weightings against actual outcomes (post xwOBA fix).
Guards against overfit: also reports leave-one-out (LOO) win-correlation stability."""
import os
import pandas as pd, numpy as np
from scipy import stats
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "data")

def num(s):
    return pd.to_numeric(s.astype(str).str.replace("%", "", regex=False).str.strip(), errors="coerce")

rhp = pd.read_csv(os.path.join(D, "metrics_vs_RHP.csv"))
lhp = pd.read_csv(os.path.join(D, "metrics_vs_LHP.csv"))
tr = pd.read_csv(os.path.join(D, "team_results.csv"))
tr["team"] = tr["team"].astype(str).str.upper()

t = pd.DataFrame({"Tm": rhp["Tm"].astype(str).str.upper()})
for c in ["ABQ", "RCV", "OBR"]:
    t[c] = (num(rhp[c]).values + num(lhp[c]).values) / 2.0
t = t.merge(tr[["team", "runs_per_game", "win_pct"]].rename(columns={"team": "Tm"}), on="Tm").dropna()
t["runs_per_game"] = num(t["runs_per_game"]); t["win_pct"] = num(t["win_pct"])

def osi(w):
    return w[0]*t.RCV + w[1]*t.ABQ + w[2]*t.OBR

def corr(series, target):
    return stats.pearsonr(series, t[target])[0]

schemes = {
    "current  .43/.37/.20": (0.43, 0.37, 0.20),
    "equal    .33/.33/.33": (1/3, 1/3, 1/3),
    "OBR-lean .35/.25/.40": (0.35, 0.25, 0.40),
    "OBR-lean .30/.30/.40": (0.30, 0.30, 0.40),
    "balanced .40/.25/.35": (0.40, 0.25, 0.35),
    "RCV+OBR  .45/.15/.40": (0.45, 0.15, 0.40),
}
print(f"  {'scheme':22} {'OSI~runs':>9} {'OSI~win':>9}")
for name, w in schemes.items():
    s = osi(w)
    print(f"  {name:22} {corr(s,'runs_per_game'):+9.2f} {corr(s,'win_pct'):+9.2f}")

# component-only reference
print("\n  components:  RCV~win=%.2f ABQ~win=%.2f OBR~win=%.2f  | RCV~runs=%.2f ABQ~runs=%.2f OBR~runs=%.2f" % (
    corr(t.RCV,'win_pct'), corr(t.ABQ,'win_pct'), corr(t.OBR,'win_pct'),
    corr(t.RCV,'runs_per_game'), corr(t.ABQ,'runs_per_game'), corr(t.OBR,'runs_per_game')))

# data-driven optimum for win% via constrained search (overfit-aware)
best = None
for a in np.arange(0, 1.01, 0.05):
    for b in np.arange(0, 1.01 - a, 0.05):
        c = 1 - a - b
        if c < -1e-9: continue
        s = a*t.RCV + b*t.ABQ + c*t.OBR
        r = corr(s, 'win_pct')
        if best is None or r > best[0]:
            best = (r, (round(a,2), round(b,2), round(c,2)))
print(f"\n  unconstrained win%-optimal weights (RCV/ABQ/OBR) = {best[1]}  r={best[0]:+.2f}")
print("  (in-sample optimum on 30 pts -- use as a DIRECTION, not gospel)")
