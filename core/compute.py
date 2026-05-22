"""Metric coordinator -- loads data and runs all team-level computations."""

import os

from core.compute_abq import calc_abq
from core.compute_obr import calc_obr
from core.compute_oor import calc_oor
from core.compute_osi import calc_osi
from core.compute_pitching import calc_pitching_score
from core.compute_rcv import calc_rcv
from core.config import DATA_DIR
from core.metrics_utils import load_all


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

    osi_rhp = compute_split(std_rhp, bb_rhp, savant, "vs_RHP")
    osi_lhp = compute_split(std_lhp, bb_lhp, savant, "vs_LHP")

    if sp_std is not None:
        calc_pitching_score(sp_std)
    else:
        print("  WARNING: sp_standard.csv missing -- skipping Pitching Score")

    calc_oor(osi_rhp, osi_lhp)

    print()
    print("All metrics computed.")


if __name__ == "__main__":
    run()
