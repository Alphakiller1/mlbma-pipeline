"""Push batter profile outputs and raw rate-stat split tabs to Google Sheets."""

import os
from typing import Optional

import pandas as pd

from core.config import DATA_DIR, SHEET_ID, SHEET_TABS, check_google_credentials
from outputs.push_sheets import get_client, push_df

RATE_STAT_COLUMNS = [
    "player_name",
    "team",
    "PA",
    "AVG",
    "OBP",
    "SLG",
    "OPS",
    "wOBA",
    "xwOBA",
    "wRC+",
    "BB%",
    "K%",
    "ISO",
    "BABIP",
    "Chase%",
    "ZCon%",
    "OCon%",
    "SwStr%",
    "Launch Angle",
    "Barrel%",
    "HardHit%",
]

SPLIT_RATE_FILES = {
    "batter_splits_overall": "batter_splits_overall.csv",
    "batter_splits_rhp": "batter_splits_rhp.csv",
    "batter_splits_lhp": "batter_splits_lhp.csv",
    "batter_splits_home": "batter_splits_home.csv",
    "batter_splits_away": "batter_splits_away.csv",
    "batter_splits_vs_sp": "batter_splits_vsSP.csv",
    "batter_splits_vs_rp": "batter_splits_vsRP.csv",
    "batter_splits_recent": "batter_splits_recent.csv",
}


def _num(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def _to_rate_stats_df(df: Optional[pd.DataFrame]) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame(columns=RATE_STAT_COLUMNS)

    out = df.copy()
    name_col = "Name" if "Name" in out.columns else out.columns[0]
    out["player_name"] = out[name_col].astype(str).str.strip()
    out["team"] = out.get("Tm", out.get("team_abbr", "")).astype(str).str.strip().str.upper()

    if "PA" in out.columns:
        out["PA"] = _num(out["PA"])

    if "OBP" in out.columns and "SLG" in out.columns:
        obp = _num(out["OBP"])
        slg = _num(out["SLG"])
        out["OPS"] = (obp + slg).round(3)
    elif "OPS" not in out.columns:
        out["OPS"] = None

    rows = []
    for _, row in out.iterrows():
        rec = {"player_name": row["player_name"], "team": row.get("team", "")}
        for col in RATE_STAT_COLUMNS:
            if col in ("player_name", "team"):
                continue
            rec[col] = row[col] if col in row.index else None
        if rec.get("OPS") is None or (isinstance(rec.get("OPS"), float) and pd.isna(rec["OPS"])):
            obp, slg = row.get("OBP"), row.get("SLG")
            try:
                if obp is not None and slg is not None and not pd.isna(obp) and not pd.isna(slg):
                    rec["OPS"] = round(float(obp) + float(slg), 3)
            except (TypeError, ValueError):
                pass
        rows.append(rec)

    return pd.DataFrame(rows, columns=RATE_STAT_COLUMNS)


def run():
    if not check_google_credentials():
        print("  Skipping Batter_Profiles Google Sheets push (credentials unavailable).")
        return

    print("Connecting to Google Sheets (batter profiles)...")
    try:
        client = get_client()
        sheet = client.open_by_key(SHEET_ID)

        profiles_path = os.path.join(DATA_DIR, "batter_profiles.csv")
        if os.path.exists(profiles_path):
            profiles = pd.read_csv(profiles_path)
            push_df(sheet, SHEET_TABS["batter_profiles"], profiles)
            print(f"  Pushed {len(profiles)} rows -> {SHEET_TABS['batter_profiles']}")
        else:
            print("  WARNING: batter_profiles.csv not found")

        for tab_key, filename in SPLIT_RATE_FILES.items():
            path = os.path.join(DATA_DIR, filename)
            tab_name = SHEET_TABS[tab_key]
            if os.path.exists(path):
                raw = pd.read_csv(path)
                rate_df = _to_rate_stats_df(raw)
                push_df(sheet, tab_name, rate_df)
                print(f"  Pushed {len(rate_df)} rows -> {tab_name}")
        else:
            print(f"  WARNING: {filename} not found -- skipping {tab_name}")

        savant_path = os.path.join(DATA_DIR, "batter_savant_rates.csv")
        savant_tab = SHEET_TABS.get("batter_savant_rates")
        if savant_tab and os.path.exists(savant_path):
            savant_df = pd.read_csv(savant_path)
            push_df(sheet, savant_tab, savant_df)
            print(f"  Pushed {len(savant_df)} rows -> {savant_tab}")
        elif savant_tab:
            print("  WARNING: batter_savant_rates.csv not found -- skipping Batter_Savant_Rates")

        print("\nBatter profiles Google Sheets push complete.")
    except Exception as exc:
        print(f"  WARNING: Batter_Profiles push failed ({exc})")


if __name__ == "__main__":
    run()
