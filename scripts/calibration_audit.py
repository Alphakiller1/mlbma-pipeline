"""
One-off calibration + metric-validity audit for the MLBMA dashboard.

Answers two questions empirically from the live data files:
  (A) Color coding: are the grading baselines (mean/std the colors are anchored to)
      actually the real distribution across the 30 MLB teams?
  (B) Metrics: do OSI/projOSI/RCV/OBR/ABQ (and the pitching score) reflect objective
      reality -- i.e. do they track actual run scoring / results (construct + predictive
      validity)?

Read-only. Prints a report; writes nothing.
"""
from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd
from scipy import stats

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
DASH = os.path.join(ROOT, "dashboard")


def rd(name, folder=DATA):
    p = os.path.join(folder, name)
    return pd.read_csv(p) if os.path.exists(p) else None


def num(s):
    return pd.to_numeric(
        s.astype(str).str.replace("%", "", regex=False).str.strip(), errors="coerce"
    )


# Hardcoded fallback baselines from mlbma_assets.js CONTEXT_DEFAULTS (the colors use these
# until league_baselines.json overrides mean/std at runtime).
CONTEXT_DEFAULTS = {
    "osi": (50, 12), "abq": (50, 12), "rcv": (50, 12), "obr": (50, 12), "projosi": (50, 12),
    "pitching": (50, 12), "woba": (0.320, 0.035), "xwoba": (0.318, 0.030), "ops": (0.730, 0.070),
    "obp": (0.318, 0.030), "iso": (0.165, 0.055), "slg": (0.410, 0.050), "avg": (0.248, 0.022),
    "hr": (140, 45), "wrc": (100, 15), "barrel": (8.0, 2.0), "hardhit": (39.0, 3.0),
    "fip": (4.10, 0.55), "xfip": (4.05, 0.35), "whip": (1.28, 0.12), "hr9": (1.20, 0.28),
    "bb9": (3.20, 0.60), "k9": (8.70, 1.30),
}

# context -> (offense column name in metrics_vs_*; team-level)
OFFENSE_COLS = {
    "osi": "OSI", "abq": "ABQ", "rcv": "RCV", "obr": "OBR", "projosi": "projOSI",
    "woba": "wOBA", "xwoba": "xwOBA", "slg": "SLG", "avg": "AVG", "obp": "OBP",
    "ops": "OPS", "wrc": "wRC+", "hr": "HR", "barrel": "Barrel%", "hardhit": "HardHit%",
}


def msd(series):
    s = series.dropna()
    return float(s.mean()), float(s.std(ddof=0)), len(s)


def fmt_flag(cfg_mean, cfg_std, emp_mean, emp_std):
    """Flag if configured baseline misrepresents the real 30-team distribution."""
    if emp_std == 0 or cfg_std == 0:
        return "?"
    mean_off = abs(cfg_mean - emp_mean) / emp_std       # mean error in real-sigma units
    std_ratio = cfg_std / emp_std                        # >1 = colors too washed out
    bad = mean_off > 0.30 or std_ratio < 0.70 or std_ratio > 1.45
    return "*** MISCAL" if bad else "ok"


print("=" * 92)
print("PART A -- COLOR CALIBRATION: configured baseline vs TRUE 30-team distribution")
print("=" * 92)

rhp = rd("metrics_vs_RHP.csv")
lhp = rd("metrics_vs_LHP.csv")
live = {}
lb = rd("league_baselines.json", DASH)  # not csv; handle below
try:
    with open(os.path.join(DASH, "league_baselines.json")) as f:
        live = json.load(f).get("baselines", {})
except Exception as e:
    print("  (could not read league_baselines.json:", e, ")")

print(f"\n  metrics_vs_RHP rows={len(rhp)}  metrics_vs_LHP rows={len(lhp)}")
print("\n  OFFENSE (team-level). 'overall' = per-team mean of vs-RHP & vs-LHP, 30 teams.")
print("  Also shows the POOLED 60-row stat that compute_baselines.py actually writes.\n")
hdr = f"  {'ctx':9} {'cfg(mean/std)':>16} {'live(mean/std)':>16} {'TRUE30(mean/std)':>18} {'pooled60(mean/std)':>20} flag"
print(hdr)
print("  " + "-" * (len(hdr) - 2))

for ctx, col in OFFENSE_COLS.items():
    if col not in rhp.columns:
        continue
    per_team = (num(rhp[col]).values + num(lhp[col]).values) / 2.0  # overall per team
    em, es, n = msd(pd.Series(per_team))
    pooled = pd.concat([num(rhp[col]), num(lhp[col])], ignore_index=True)
    pm, ps, pn = msd(pooled)
    cfg = CONTEXT_DEFAULTS.get(ctx, (np.nan, np.nan))
    lv = live.get(ctx, {})
    lvm, lvs = lv.get("mean", np.nan), lv.get("std", np.nan)
    # flag the LIVE baseline (what actually colors) against the TRUE 30-team overall
    flag = fmt_flag(lvm if not np.isnan(lvm) else cfg[0],
                    lvs if not np.isnan(lvs) else cfg[1], em, es)
    print(f"  {ctx:9} {cfg[0]:7.3f}/{cfg[1]:<7.3f} {lvm:7.3f}/{lvs:<7.3f} "
          f"{em:8.3f}/{es:<8.3f} {pm:9.3f}/{ps:<9.3f} {flag}")

# Team pitching: metrics_pitching_score.csv is team-level (PitchScore, K%, BB%, HR/9)
print("\n  TEAM PITCHING (metrics_pitching_score.csv, team-level, 30 teams):")
ps_df = rd("metrics_pitching_score.csv")
if ps_df is not None:
    ps_df = ps_df[~ps_df["Tm"].astype(str).str.contains("Tm", na=False) | (ps_df["Tm"].astype(str).str.len() <= 3)]
    for ctx, col in [("pitching", "PitchScore"), ("hr9", "HR/9")]:
        if col in ps_df.columns:
            em, es, n = msd(num(ps_df[col]))
            cfg = CONTEXT_DEFAULTS.get(ctx, (np.nan, np.nan))
            lv = live.get(ctx, {})
            lvm, lvs = lv.get("mean", np.nan), lv.get("std", np.nan)
            flag = fmt_flag(lvm if not np.isnan(lvm) else cfg[0], lvs if not np.isnan(lvs) else cfg[1], em, es)
            print(f"    {ctx:9} cfg {cfg[0]:.2f}/{cfg[1]:.2f}  live {lvm}/{lvs}  TEAM30 {em:.3f}/{es:.3f}  n={n}  {flag}")

# Pitching rate stats: baseline is STARTER pool (sp_standard IP>=20). Show starter-pool dist
# vs the team-staff (IP-weighted) dist -- the granularity question.
print("\n  PITCHING RATES -- baseline source is INDIVIDUAL STARTERS (sp_standard, IP>=20).")
print("  Compare that spread to the TEAM-STAFF spread (what a team-level cell should grade vs):")
sp = rd("sp_standard.csv")
if sp is not None and "Tm" in sp.columns:
    sp = sp[~sp["Tm"].astype(str).str.contains("Tms", na=False)].copy()
    sp["IP"] = num(sp["IP"])
    spq = sp[sp["IP"] >= 20]
    for ctx, col in [("fip", "FIP"), ("xfip", "xFIP"), ("whip", "WHIP"), ("hr9", "HR/9"), ("bb9", "BB/9"), ("k9", "K/9")]:
        if col not in sp.columns:
            continue
        em, es, n = msd(num(spq[col]))                 # individual-starter spread
        # team-staff IP-weighted aggregate -> 30 team values
        g = sp.dropna(subset=[col]).copy()
        g[col + "_n"] = num(g[col])
        def wavg(x):
            w = x["IP"]
            return np.average(x[col + "_n"], weights=w) if w.sum() > 0 else np.nan
        team_vals = g.groupby("Tm").apply(wavg, include_groups=False) if "include_groups" in pd.core.groupby.DataFrameGroupBy.apply.__doc__ else g.groupby("Tm").apply(wavg)
        tm_m, tm_s, tn = msd(team_vals)
        cfg = CONTEXT_DEFAULTS.get(ctx, (np.nan, np.nan))
        lv = live.get(ctx, {})
        lvm, lvs = lv.get("mean", np.nan), lv.get("std", np.nan)
        ratio = (lvs / tm_s) if (not np.isnan(lvs) and tm_s) else float("nan")
        note = "<-- baseline std ~%.1fx the team spread" % ratio if ratio and ratio > 1.4 else ""
        print(f"    {ctx:5} live {lvm}/{lvs}  STARTERpool {em:.3f}/{es:.3f}(n={n})  "
              f"TEAMstaff {tm_m:.3f}/{tm_s:.3f}(n={tn})  {note}")

print("\n" + "=" * 92)
print("PART B -- DISTRIBUTION SHAPE: do the z-score color buckets carve the 30 teams sensibly?")
print("=" * 92)
print("""  Buckets (gradeKeyFromZ, n=30 tuned): z<=-1.5 veryWeak | <=-0.85 weak | <=-0.30 belowAvg
  | <=0.30 average | <=0.85 aboveAvg | <=1.5 strong | >1.5 elite   (assumes ~normal)""")

def bucket_counts(vals, mean, std, hi=True, sens=1.0):
    z = (np.asarray(vals) - mean) / std * sens
    if not hi:
        z = -z
    edges = [-np.inf, -1.5, -0.85, -0.30, 0.30, 0.85, 1.5, np.inf]
    labels = ["veryWeak", "weak", "belowAvg", "average", "aboveAvg", "strong", "elite"]
    idx = np.digitize(z, edges[1:-1])
    return {labels[i]: int((idx == i).sum()) for i in range(len(labels))}

for ctx, col in [("osi", "OSI"), ("abq", "ABQ"), ("rcv", "RCV"), ("obr", "OBR")]:
    per_team = (num(rhp[col]).values + num(lhp[col]).values) / 2.0
    vals = pd.Series(per_team).dropna().values
    sk = stats.skew(vals)
    ku = stats.kurtosis(vals)
    sw_p = stats.shapiro(vals).pvalue
    lv = live.get(ctx, {})
    mean = lv.get("mean", CONTEXT_DEFAULTS[ctx][0])
    std = lv.get("std", CONTEXT_DEFAULTS[ctx][1])
    sens = 1.0  # ABQ sens widener removed now that its baseline std is correct
    bc = bucket_counts(vals, mean, std, hi=True, sens=sens)
    print(f"\n  {ctx.upper():4} range [{vals.min():.1f},{vals.max():.1f}] skew={sk:+.2f} "
          f"kurt={ku:+.2f} shapiroP={sw_p:.3f}{'  (non-normal)' if sw_p < 0.05 else ''}")
    print(f"       anchored mean/std={mean:.2f}/{std:.2f} sens={sens}  -> 30 teams land:")
    print("       " + "  ".join(f"{k}:{v}" for k, v in bc.items()))

print("\n" + "=" * 92)
print("PART C -- METRIC VALIDITY: do the metrics track real outcomes? (construct/predictive)")
print("=" * 92)
tr = rd("team_results.csv")
print(f"  team_results.csv cols (first 25): {list(tr.columns)[:25]}")

# overall per-team offense table
off = pd.DataFrame({"Tm": rhp["Tm"]})
for ctx, col in OFFENSE_COLS.items():
    off[col] = (num(rhp[col]).values + num(lhp[col]).values) / 2.0

# outcome columns
tr = tr.copy()
tr["team"] = tr["team"].astype(str).str.upper()
out_cols = {}
for cand in ["runs_per_game", "runs_scored", "win_pct", "runs_allowed", "runs_per_game_l30"]:
    if cand in tr.columns:
        out_cols[cand] = num(tr[cand])
outcome = pd.DataFrame({"Tm": tr["team"], **out_cols})

merged = off.merge(outcome, on="Tm", how="inner")
print(f"\n  merged teams = {len(merged)}")
print("  Correlation of each offense metric with actual outcomes (Pearson r / Spearman rho):")
print("  NOTE: metrics are built from the SAME season's box stats, so this is concurrent")
print("  construct validity (does it describe reality?), not out-of-sample forecasting.\n")

targets = [c for c in ["runs_per_game", "runs_scored", "win_pct"] if c in merged.columns]
print(f"  {'metric':9}" + "".join(f"{t:>22}" for t in targets))
for ctx, col in OFFENSE_COLS.items():
    if col not in merged.columns:
        continue
    cells = []
    for t in targets:
        d = merged[[col, t]].dropna()
        if len(d) < 5:
            cells.append("n/a")
            continue
        r = stats.pearsonr(d[col], d[t])[0]
        rho = stats.spearmanr(d[col], d[t])[0]
        cells.append(f"{r:+.2f}/{rho:+.2f}")
    print(f"  {ctx:9}" + "".join(f"{c:>22}" for c in cells))

# Pitching score vs runs allowed
if "runs_allowed" in merged.columns and ps_df is not None:
    pdf = ps_df[["Tm", "PitchScore"]].copy()
    pdf["PitchScore"] = num(pdf["PitchScore"])
    pdf["Tm"] = pdf["Tm"].astype(str).str.upper()
    pm = pdf.merge(merged[["Tm", "runs_allowed", "win_pct"]], on="Tm", how="inner").dropna()
    if len(pm) >= 5:
        r_ra = stats.pearsonr(pm["PitchScore"], pm["runs_allowed"])[0]
        r_w = stats.pearsonr(pm["PitchScore"], pm["win_pct"])[0]
        print(f"\n  PitchScore vs runs_allowed r={r_ra:+.2f} (want NEGATIVE), vs win_pct r={r_w:+.2f}")

print("\n  Done.")
