"""
Compute live league baselines for the dashboard color grading.

The dashboard grades every value on a red->green scale anchored to a league baseline
(mean/std in mlbma_assets.js CONTEXT_DEFAULTS, overwritten at runtime by this file's JSON).
A value's color is its z-score vs that baseline, so the anchor MUST be the true distribution
of the thing being colored.

Two reference populations, on purpose:
  * OFFENSE (team metrics): the 30 MLB teams. We measure each handedness split's 30-team
    spread and AVERAGE them. We do NOT pool vs-RHP + vs-LHP into one 60-row stack -- that
    injects the platoon mean-gap into the std and inflates it (e.g. HR std 17.7 pooled vs
    ~5 real, xwOBA 0.034 vs 0.022), washing every team toward amber.
  * PITCHING (rate stats): the population of qualified pitchers, because these contexts
    grade INDIVIDUAL arms (opposing SP, relievers) on the dashboard -- "30 team averages"
    is the wrong yardstick for one pitcher. PitchScore is the exception: it's a team metric,
    so it's anchored team-level.

    python -m core.compute_baselines
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import pandas as pd

from core.config import DATA_DIR

OUT = os.path.join(os.path.dirname(DATA_DIR), "dashboard", "league_baselines.json")

# context -> column. Offense comes from the team-level metrics_vs_{RHP,LHP}.csv outputs.
OFFENSE = {"osi": "OSI", "abq": "ABQ", "rcv": "RCV", "obr": "OBR", "projosi": "projOSI",
           "woba": "wOBA", "xwoba": "xwOBA", "slg": "SLG", "avg": "AVG", "obp": "OBP",
           "ops": "OPS", "iso": "ISO", "wrc": "wRC+", "hr": "HR",
           "barrel": "Barrel%", "hardhit": "HardHit%"}
# Pitching rate stats graded per-pitcher -> qualified-pitcher pool from sp_standard.
PITCH_SP = {"fip": "FIP", "xfip": "xFIP", "whip": "WHIP", "hr9": "HR/9", "bb9": "BB/9",
            "k9": "K/9", "era": "ERA", "kpct": "K%", "bbpct": "BB%"}
PITCH_SP_ALLOWED = {
    "sp_osi_allowed": "OSI_allowed",
    "sp_abq_allowed": "ABQ_allowed",
    "sp_oor_faced": "OOR_faced",
}

# Aggregate cells must grade against their OWN population, not individual starters --
# a team/bullpen aggregate clusters ~2.5-3x tighter than individual arms, so reusing the
# per-pitcher spread washes every aggregate toward amber. Three extra populations:
#   team_*  : 30 team pitching staffs (sp_standard, IP-weighted per team)
#   bp_*    : 30 team BULLPEN units (bullpen_unit.csv overall_*)
#   rp_*    : individual relievers (bullpen_individual.csv overall_*, qualified by apps)
# raw-rate contexts (ERA/FIP/WHIP/HR9). K%/BB% live as percentage points (matching the
# pctNorm'd values the bullpen views pass), so bp_/rp_ K%/BB% fix a scale bug too.
TEAM_STAFF = {"team_era": "ERA", "team_fip": "FIP", "team_whip": "WHIP", "team_hr9": "HR/9"}
BP_UNIT = {"bp_era": "overall_ERA", "bp_fip": "overall_FIP", "bp_whip": "overall_WHIP",
           "bp_hr9": "overall_HR9", "bp_kpct": "overall_K_pct", "bp_bbpct": "overall_BB_pct"}
RP_IND = {"rp_era": "overall_ERA", "rp_fip": "overall_FIP", "rp_whip": "overall_WHIP",
          "rp_hr9": "overall_HR9", "rp_kpct": "overall_K_pct", "rp_bbpct": "overall_BB_pct"}


def _num(series) -> pd.Series:
    return pd.to_numeric(
        series.astype(str).str.replace("%", "", regex=False).str.strip(), errors="coerce"
    ).dropna()


def _ms(series) -> dict | None:
    """mean/std of a single distribution (population std)."""
    s = _num(series)
    if len(s) < 3:
        return None
    std = float(s.std(ddof=0))
    if std < 1e-9:
        return None
    return {"mean": round(float(s.mean()), 4), "std": round(std, 4)}


def _ms_within_split(rhp: pd.DataFrame, lhp: pd.DataFrame, col: str) -> dict | None:
    """Average the two single-split 30-team distributions instead of pooling them.

    Each split cell on the dashboard should be graded against the 30-team spread WITHIN
    that split; averaging the two split anchors gives one stable mean/std that matches
    that spread without the platoon mean-gap that pooling would bake into the std.
    """
    parts = []
    for df in (rhp, lhp):
        if df is not None and col in df.columns:
            m = _ms(df[col])
            if m:
                parts.append(m)
    if not parts:
        return None
    mean = sum(p["mean"] for p in parts) / len(parts)
    std = sum(p["std"] for p in parts) / len(parts)
    if std < 1e-9:
        return None
    return {"mean": round(mean, 4), "std": round(std, 4)}


def _team_staff_ms(sp: pd.DataFrame, col: str) -> dict | None:
    """30-team distribution of an IP-weighted staff rate (mirrors calc_pitching_score)."""
    if col not in sp.columns or "IP" not in sp.columns or "Tm" not in sp.columns:
        return None
    d = sp.copy()
    d["_v"] = _num(d[col]).reindex(d.index)
    d["_ip"] = pd.to_numeric(d["IP"], errors="coerce")
    d = d.dropna(subset=["_v", "_ip"])
    d = d[d["_ip"] > 0]
    if d.empty:
        return None
    team = d.groupby("Tm").apply(
        lambda x: (x["_v"] * x["_ip"]).sum() / x["_ip"].sum(), include_groups=False
    )
    return _ms(team)


def _pct_points(series) -> pd.Series:
    """Force K%/BB% to percentage points (×100 if stored as a fraction)."""
    s = _num(series)
    if len(s) and s.dropna().median() <= 1.5:
        s = s * 100
    return s


def _read(name: str) -> pd.DataFrame | None:
    p = os.path.join(DATA_DIR, name)
    return pd.read_csv(p) if os.path.exists(p) else None


def run():
    print("Computing league baselines for dashboard grading...")
    baselines: dict = {}

    rhp = _read("metrics_vs_RHP.csv")
    lhp = _read("metrics_vs_LHP.csv")
    if rhp is not None or lhp is not None:
        for ctx, col in OFFENSE.items():
            m = _ms_within_split(rhp, lhp, col)
            if m:
                baselines[ctx] = m

    # PitchScore is a TEAM metric -> team-level anchor.
    ps = _read("metrics_pitching_score.csv")
    if ps is not None and "PitchScore" in ps.columns:
        m = _ms(ps["PitchScore"])
        if m:
            baselines["pitching"] = m

    # Pitching rate stats grade individual arms -> qualified-pitcher pool.
    sp_raw = _read("sp_standard.csv")
    if sp_raw is not None and "Tm" in sp_raw.columns:
        sp = sp_raw[~sp_raw["Tm"].astype(str).str.contains("Tms", na=False)].copy()
        spq = sp[pd.to_numeric(sp["IP"], errors="coerce") >= 20] if "IP" in sp.columns else sp
        for ctx, col in PITCH_SP.items():
            if col in spq.columns:
                # Ranking/profile views display K% and BB% in percentage points.
                # Grade against the same scale even when FanGraphs stores rates as
                # fractions (0.229 / 0.091) in sp_standard.csv.
                series = _pct_points(spq[col]) if ctx in ("kpct", "bbpct") else _num(spq[col])
                m = _ms(series)
                if m:
                    baselines[ctx] = m
        # team_* : whole-staff IP-weighted aggregate across the 30 teams (not the per-arm pool)
        for ctx, col in TEAM_STAFF.items():
            m = _team_staff_ms(sp, col)
            if m:
                baselines[ctx] = m

    # Starter allowed metrics grade against other qualified starters, not the
    # 30-team offensive distributions. Approximate 20+ IP from starts * avg IP.
    spp = _read("sp_profiles.csv")
    if spp is not None:
        if "starts" in spp.columns and "avg_IP" in spp.columns:
            estimated_ip = pd.to_numeric(spp["starts"], errors="coerce") * pd.to_numeric(
                spp["avg_IP"], errors="coerce"
            )
            spp = spp[estimated_ip >= 20]
        for ctx, col in PITCH_SP_ALLOWED.items():
            if col in spp.columns:
                m = _ms(spp[col])
                if m:
                    baselines[ctx] = m

    # bp_* : 30 team bullpen units (their own, much tighter distribution).
    bpu = _read("bullpen_unit.csv")
    if bpu is not None:
        for ctx, col in BP_UNIT.items():
            if col in bpu.columns:
                series = _pct_points(bpu[col]) if ctx.endswith(("kpct", "bbpct")) else _num(bpu[col])
                m = _ms(series)
                if m:
                    baselines[ctx] = m
        if "overall_OSI_allowed" in bpu.columns:
            m = _ms(100 - _num(bpu["overall_OSI_allowed"]))
            if m:
                baselines["bp_score"] = m

    # rp_* : individual relievers (wide like starters but different mean/scale).
    bpi = _read("bullpen_individual.csv")
    if bpi is not None:
        if "appearances" in bpi.columns:
            bpi = bpi[pd.to_numeric(bpi["appearances"], errors="coerce") >= 10]   # qualified arms
        for ctx, col in RP_IND.items():
            if col in bpi.columns:
                series = _pct_points(bpi[col]) if ctx.endswith(("kpct", "bbpct")) else _num(bpi[col])
                m = _ms(series)
                if m:
                    baselines[ctx] = m

    out = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "baselines": baselines}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print(f"  Wrote {len(baselines)} baselines -> {OUT}")
    for k, v in baselines.items():
        print(f"    {k:10} mean={v['mean']:<8} std={v['std']}")


if __name__ == "__main__":
    run()
