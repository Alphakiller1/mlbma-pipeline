"""Compare local metrics vs Google Sheets for Team Rankings hub toggles."""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from core.config import DATA_DIR, SHEET_ID, SHEET_TABS  # noqa: E402

SHEET_ID = SHEET_ID or "1D28pC1lqMbsCcTBP67WhJPzYHn2UdtveMEv6RsUSczk"


def team_col(df: pd.DataFrame) -> str:
    for c in ("Tm", "Team", "team"):
        if c in df.columns:
            return c
    raise ValueError(f"No team column in {list(df.columns)}")


def load_local_metrics(name: str) -> pd.DataFrame:
    path = DATA_DIR / name
    if not path.is_file():
        raise FileNotFoundError(path)
    return pd.read_csv(path)


def fetch_gviz_tab(tab: str) -> pd.DataFrame:
    url = (
        f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq"
        f"?tqx=out:csv&sheet={requests.utils.quote(tab)}"
    )
    r = requests.get(url, headers={"User-Agent": "MLBMA-diagnose/1.0"}, timeout=30)
    r.raise_for_status()
    from io import StringIO

    return pd.read_csv(StringIO(r.text))


def compare_hand(rhp: pd.DataFrame, lhp: pd.DataFrame, label: str) -> None:
    tc = team_col(rhp)
    r = rhp.set_index(rhp[tc].astype(str).str.strip().str.upper())
    l = lhp.set_index(lhp[tc].astype(str).str.strip().str.upper())
    common = sorted(set(r.index) & set(l.index))
    osi_col = "OSI" if "OSI" in r.columns else "osi"
    abq_col = "ABQ" if "ABQ" in r.columns else "abq"
    osi_same = abq_same = 0
    for t in common:
        if abs(float(r.loc[t, osi_col]) - float(l.loc[t, osi_col])) < 0.05:
            osi_same += 1
        if abs(float(r.loc[t, abq_col]) - float(l.loc[t, abq_col])) < 0.05:
            abq_same += 1
    print(f"\n=== HANDEDNESS ({label}) ===")
    print(f"  Teams: {len(common)} | OSI flat: {osi_same}/{len(common)} | ABQ flat: {abq_same}/{len(common)}")
    if osi_same >= len(common) * 0.85:
        print("  PROBLEM: vs_RHP and vs_LHP are nearly identical — handedness pills cannot change the table.")
    else:
        print("  OK: Platoon splits differ — handedness should work if the dashboard loads this data.")
    if common:
        t = common[0]
        print(
            f"  Sample {t}: RHP OSI={float(r.loc[t, osi_col]):.1f} ABQ={float(r.loc[t, abq_col]):.1f}"
            f" | LHP OSI={float(l.loc[t, osi_col]):.1f} ABQ={float(l.loc[t, abq_col]):.1f}"
        )


def compare_location(prof: pd.DataFrame, label: str) -> None:
    print(f"\n=== LOCATION ({label}) ===")
    need = ["home_osi", "away_osi", "home_abq", "away_abq", "osi", "osi_l30", "osi_l14", "osi_l7"]
    for c in need:
        if c not in prof.columns:
            print(f"  MISSING column: {c}")
        else:
            print(f"  {c}: {prof[c].notna().sum()} teams")
    if "home_osi" in prof.columns and "osi" in prof.columns:
        diff = (prof["home_osi"] - prof["osi"]).abs()
        n = prof["home_osi"].notna().sum()
        print(f"  home_osi vs osi: mean |diff|={diff.mean():.2f}, same within 0.05: {(diff < 0.05).sum()}/{n}")
    if all(c in prof.columns for c in ("osi_l30", "osi_l14", "osi_l7")):
        w = prof["osi_l30"].notna()
        flat = w & (prof["osi_l30"] - prof["osi_l14"]).abs().lt(0.05) & (prof["osi_l30"] - prof["osi_l7"]).abs().lt(0.05)
        print(f"  flat L30=L14=L7: {flat.sum()}/{w.sum()} teams with L30")


def main() -> None:
    print("Sheet ID:", SHEET_ID)
    rhp_local = load_local_metrics("metrics_vs_RHP.csv")
    lhp_local = load_local_metrics("metrics_vs_LHP.csv")
    prof_local = load_local_metrics("team_profiles.csv")
    compare_hand(rhp_local, lhp_local, "local data/")
    compare_location(prof_local, "local data/team_profiles.csv")

    try:
        rhp_sheet = fetch_gviz_tab(SHEET_TABS["vs_rhp"])
        lhp_sheet = fetch_gviz_tab(SHEET_TABS["vs_lhp"])
        prof_sheet = fetch_gviz_tab(SHEET_TABS["team_profiles"])
        compare_hand(rhp_sheet, lhp_sheet, "Google Sheets (live gviz)")
        compare_location(prof_sheet, "Google Sheets Team_Profiles")
    except Exception as exc:
        print("\nCould not fetch live Google Sheets:", exc)
        print("Run: python -m outputs.push_sheets && python -m outputs.push_team_profiles")


if __name__ == "__main__":
    main()
