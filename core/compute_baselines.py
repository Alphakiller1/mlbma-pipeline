"""
Compute live league-average baselines for the dashboard color grading.

The dashboard grades every stat on a red->green scale anchored to the LEAGUE AVERAGE
(mlbma_assets.js CONTEXT_DEFAULTS). This writes those anchors from the current season's
data so the colors track reality instead of hardcoded constants. Full-league means
(all teams / all qualified pitchers), so they're stable within a day — not the
per-view pool that the grading used to drift with.

    python -m core.compute_baselines
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import pandas as pd

from core.config import DATA_DIR

OUT = os.path.join(os.path.dirname(DATA_DIR), "dashboard", "league_baselines.json")

# registry context -> source column (offense from metrics_vs_*; pitching from sp_standard)
OFFENSE = {"osi": "OSI", "abq": "ABQ", "rcv": "RCV", "obr": "OBR", "projosi": "projOSI",
           "woba": "wOBA", "xwoba": "xwOBA", "slg": "SLG", "avg": "AVG", "obp": "OBP",
           "ops": "OPS", "wrc": "wRC+", "hr": "HR", "barrel": "Barrel%", "hardhit": "HardHit%"}
PITCH_SP = {"fip": "FIP", "xfip": "xFIP", "whip": "WHIP", "hr9": "HR/9", "bb9": "BB/9", "k9": "K/9"}


def _num(series) -> pd.Series:
    return pd.to_numeric(
        series.astype(str).str.replace("%", "", regex=False).str.strip(), errors="coerce"
    ).dropna()


def _ms(series) -> dict | None:
    s = _num(series)
    if len(s) < 3:
        return None
    std = float(s.std(ddof=0))
    if std < 1e-9:
        return None
    return {"mean": round(float(s.mean()), 4), "std": round(std, 4)}


def _read(name: str) -> pd.DataFrame | None:
    p = os.path.join(DATA_DIR, name)
    return pd.read_csv(p) if os.path.exists(p) else None


def run():
    print("Computing league baselines for dashboard grading...")
    baselines: dict = {}

    off = [d for d in (_read("metrics_vs_RHP.csv"), _read("metrics_vs_LHP.csv")) if d is not None]
    if off:
        o = pd.concat(off, ignore_index=True)
        for ctx, col in OFFENSE.items():
            if col in o.columns:
                m = _ms(o[col])
                if m:
                    baselines[ctx] = m

    ps = _read("metrics_pitching_score.csv")
    if ps is not None and "PitchScore" in ps.columns:
        m = _ms(ps["PitchScore"])
        if m:
            baselines["pitching"] = m

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
