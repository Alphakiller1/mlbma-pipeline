"""Metric coordinator -- loads data and runs all team-level computations."""

import os

import pandas as pd

from core.compute_abq import calc_abq
from core.compute_obr import calc_obr
from core.compute_oor import calc_oor
from core.compute_osi import calc_osi
from core.compute_pitching import calc_pitching_score
from core.compute_rcv import calc_rcv
from core.config import DATA_DIR, SAVANT_TEAM_ALIASES, XWOBA_SPLIT_WEIGHT
from core.metrics_utils import load, load_all


def compute_split(std, bb, savant, label, traditional=None):
    abq = calc_abq(std, savant)
    rcv = calc_rcv(std, bb, savant)
    obr = calc_obr(std, savant)
    osi = calc_osi(abq, rcv, obr)
    rate_cols = ["Tm", "wRC+", "SLG", "ISO", "AVG"]
    for col in rate_cols:
        if col in std.columns and col not in osi.columns:
            osi = osi.merge(std[["Tm", col]], on="Tm", how="left")
    for col in ("K%", "BB%", "AVG", "OBP", "OPS", "ISO"):
        if col in std.columns and col not in osi.columns:
            osi = osi.merge(std[["Tm", col]], on="Tm", how="left")
    if "wOBA" in rcv.columns:
        osi = osi.merge(rcv[["Tm", "wOBA", "xwOBA"]], on="Tm", how="left")
    for col in ("Barrel%", "HardHit%"):
        if col in savant.columns and col not in osi.columns:
            osi = osi.merge(savant[["Tm", col]], on="Tm", how="left")
    if traditional is not None and "HR" in traditional.columns and "HR" not in osi.columns:
        osi = osi.merge(traditional[["Tm", "HR"]], on="Tm", how="left")
    export_cols = [
        "Tm", "ABQ", "RCV", "OBR", "OSI", "projOSI", "reg_signal",
        "wRC+", "wOBA", "xwOBA", "SLG", "AVG", "OBP", "OPS", "ISO", "HR",
        "K%", "BB%", "Barrel%", "HardHit%",
    ]
    export_cols = [c for c in export_cols if c in osi.columns]
    osi_sorted = osi[export_cols].sort_values("OSI", ascending=False).reset_index(drop=True)
    osi_sorted.index += 1
    print()
    print(f"Results {label}")
    print(osi_sorted.round(1).to_string())
    out = os.path.join(DATA_DIR, f"metrics_{label.replace(' ', '_')}.csv")
    osi_sorted.to_csv(out, index=False)
    print("Saved:", out)
    return osi_sorted


def _with_split_xwoba(base, split):
    """Blend the season-level Savant xwOBA toward the handedness-specific xwOBA so OBR/RCV
    can reflect how a lineup hits vs RHP vs LHP -- WITHOUT letting thin split samples
    corrupt the signal.

    Season xwOBA tracks team run-scoring strongly (r=+0.61); the raw split xwOBA is noise
    at current sample sizes (r=-0.12, see scripts/calibration_audit.py). So we regress the
    split toward season by XWOBA_SPLIT_WEIGHT (default 0.0 = season only). The team-key
    aliases ensure all 30 teams join; before this, KC/SF/etc. silently dropped out.
    """
    w = XWOBA_SPLIT_WEIGHT
    if w <= 0 or split is None or "Tm" not in getattr(split, "columns", []) or "xwOBA" not in split.columns:
        return base
    split = split.copy()
    split["Tm"] = split["Tm"].astype(str).str.upper().replace(SAVANT_TEAM_ALIASES)
    m = base.merge(split[["Tm", "xwOBA"]].rename(columns={"xwOBA": "_xsplit"}), on="Tm", how="left")
    season = pd.to_numeric(m["xwOBA"], errors="coerce")
    sp = pd.to_numeric(m["_xsplit"], errors="coerce")
    blended = (1 - w) * season + w * sp
    m["xwOBA"] = blended.where(sp.notna(), season)   # fall back to season where no split
    return m.drop(columns=["_xsplit"])


def run():
    data = load_all()
    std_rhp = data.get("vs_RHP_standard")
    bb_rhp = data.get("vs_RHP_batted_ball")
    std_lhp = data.get("vs_LHP_standard")
    bb_lhp = data.get("vs_LHP_batted_ball")
    savant = data.get("savant_team_leaderboard")
    sp_std = data.get("sp_standard")

    missing = []
    if std_rhp is None:
        missing.append("vs_RHP_standard (FanGraphs)")
    if bb_rhp is None:
        missing.append("vs_RHP_batted_ball (FanGraphs)")
    if std_lhp is None:
        missing.append("vs_LHP_standard (FanGraphs)")
    if bb_lhp is None:
        missing.append("vs_LHP_batted_ball (FanGraphs)")
    if savant is None:
        missing.append("savant_team_leaderboard (Savant)")

    if missing:
        print("WARNING: Missing inputs -- skipping team offense metrics:")
        for name in missing:
            print(f"  - {name}")
        print("  Run scrapers.scrape_savant and scrapers.scrape_fangraphs for full metrics.")
        return

    trad_rhp = load("vs_RHP_traditional.csv")
    trad_lhp = load("vs_LHP_traditional.csv")

    # Use handedness-specific xwOBA where available (now that split keys are normalized).
    sav_rhp = _with_split_xwoba(savant, load("savant_vs_RHP.csv"))
    sav_lhp = _with_split_xwoba(savant, load("savant_vs_LHP.csv"))

    osi_rhp = compute_split(std_rhp, bb_rhp, sav_rhp, "vs_RHP", trad_rhp)
    osi_lhp = compute_split(std_lhp, bb_lhp, sav_lhp, "vs_LHP", trad_lhp)

    if sp_std is not None:
        calc_pitching_score(sp_std)
    else:
        print("  WARNING: sp_standard.csv missing -- skipping Pitching Score")

    calc_oor(osi_rhp, osi_lhp)

    # Refresh the dashboard's league-average color baselines from the fresh metrics.
    try:
        from core.compute_baselines import run as run_baselines
        run_baselines()
    except Exception as exc:
        print(f"  WARNING: league baselines not refreshed: {exc}")

    print()
    print("All metrics computed.")


if __name__ == "__main__":
    run()
