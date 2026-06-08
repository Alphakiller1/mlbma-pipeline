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
    sp = _read("sp_standard.csv")
    if sp is not None and "Tm" in sp.columns:
        sp = sp[~sp["Tm"].astype(str).str.contains("Tms", na=False)].copy()
        if "IP" in sp.columns:
            sp = sp[pd.to_numeric(sp["IP"], errors="coerce") >= 20]   # qualified arms only
        for ctx, col in PITCH_SP.items():
            if col in sp.columns:
                m = _ms(sp[col])
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
