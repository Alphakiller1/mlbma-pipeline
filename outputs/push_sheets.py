import gspread
from google.oauth2.service_account import Credentials
import pandas as pd
import os
from datetime import datetime

from core.config import (
    CREDS_FILE,
    CURRENT_SEASON,
    DATA_DIR,
    SCOPES,
    SHEET_ID,
    SHEET_TABS,
    check_google_credentials,
)
from core.slate_date import eastern_slate_date_iso

# Tabs whose push was skipped because the upstream stage produced nothing. Collected
# so run() can end loudly instead of reporting success over a degraded sync.
PUSH_FAILURES: list[str] = []


def get_client():
    creds = Credentials.from_service_account_file(str(CREDS_FILE), scopes=SCOPES)
    return gspread.authorize(creds)


def sanitize_df_for_sheets(df: pd.DataFrame) -> pd.DataFrame:
    """Replace NaN with empty strings so gspread JSON serialization succeeds."""
    if df.empty:
        return df
    out = df.copy()
    out = out.where(pd.notnull(out), None)
    return out.fillna("")


def touch_last_updated(source: str = "MLBMA pipeline") -> None:
    """Bump Last_Updated so dashboard cache busts after slate-only pushes."""
    if not check_google_credentials():
        print("  Skipping Last_Updated touch (credentials unavailable).")
        return
    sheet = get_client().open_by_key(SHEET_ID)
    tab_ts = SHEET_TABS["last_updated"]
    try:
        ts_sheet = sheet.worksheet(tab_ts)
        ts_sheet.clear()
    except gspread.exceptions.WorksheetNotFound:
        ts_sheet = sheet.add_worksheet(title=tab_ts, rows=5, cols=2)
    ts_sheet.update([
        ["Last Updated", datetime.now().strftime("%Y-%m-%d %H:%M:%S")],
        ["Slate_Date_ET", eastern_slate_date_iso()],
        ["Season", str(CURRENT_SEASON)],
        ["Source", source],
    ])
    print("  Touched Last_Updated timestamp")


def _existing_row_count(worksheet) -> int:
    """Data rows currently in the tab (column A is enough, and far cheaper than
    get_all_values on a 25k-row tab)."""
    try:
        return max(0, len(worksheet.col_values(1)) - 1)
    except Exception:
        return 0


def push_df(sheet, tab_name, df):
    """Replace a tab's contents.

    Refuses to publish an empty frame over a tab that currently has data. The push
    is a clear() followed by an update(), so an upstream scrape that returns nothing
    used to blank the live tab - that is exactly how the batter-split tabs went to
    header-only and took the site's Stat Comparison, Recent Form and lineup-vs-pitcher
    boards down with them. A stale number is recoverable; a wiped tab is an outage.
    """
    nrows = max(int(len(df)) + 10, 50)
    ncols = max(int(len(df.columns)) + 2, 20)
    created = False
    try:
        worksheet = sheet.worksheet(tab_name)
    except gspread.exceptions.WorksheetNotFound:
        worksheet = sheet.add_worksheet(title=tab_name, rows=nrows, cols=ncols)
        created = True

    if df.empty and not created:
        held = _existing_row_count(worksheet)
        if held > 0:
            print(f"  SKIPPED {tab_name}: refusing to overwrite {held} live rows with an "
                  f"empty frame (upstream produced nothing - tab left intact)")
            PUSH_FAILURES.append(tab_name)
            return
    if not created:
        worksheet.clear()

    df = df.round(2)
    df = sanitize_df_for_sheets(df)
    data = [df.columns.tolist()] + df.values.tolist()
    worksheet.update(data)
    print(f"  Pushed {tab_name}: {len(df)} rows")

def verify_sheet_tabs(sheet) -> None:
    """Pre-flight: warn if expected SHEET_TABS worksheets are missing."""
    existing = {ws.title for ws in sheet.worksheets()}
    expected = sorted(set(SHEET_TABS.values()))
    missing = [tab for tab in expected if tab not in existing]
    print(f"  Sheet tabs present: {len(existing)} | expected from config: {len(expected)}")
    if missing:
        print("  WARNING: Expected tabs missing (will be created on first push):")
        for tab in missing:
            print(f"    - {tab}")
    else:
        print("  All expected SHEET_TABS are present.")


def run():
    if not check_google_credentials():
        print("  Skipping Google Sheets push (credentials unavailable).")
        return

    print("Connecting to Google Sheets...")
    client = get_client()
    sheet = client.open_by_key(SHEET_ID)
    print("Connected.\n")
    print("Pre-flight: verifying Google Sheet tabs...")
    verify_sheet_tabs(sheet)
    print()

    # PALS is pushed by scrapers/scrape_pals.py after computing the metric - do not add here.
    files = {
        SHEET_TABS["vs_rhp"]: "metrics_vs_RHP.csv",
        SHEET_TABS["vs_lhp"]: "metrics_vs_LHP.csv",
        SHEET_TABS["oor"]: "metrics_oor.csv",
        SHEET_TABS["pitching_score"]: "metrics_pitching_score.csv",
    }

    for tab_name, filename in files.items():
        path = os.path.join(DATA_DIR, filename)
        if os.path.exists(path):
            df = pd.read_csv(path)
            push_df(sheet, tab_name, df)
        else:
            print(f"  WARNING: {filename} not found")

    # Add last updated timestamp tab
    tab_ts = SHEET_TABS["last_updated"]
    try:
        ts_sheet = sheet.worksheet(tab_ts)
        ts_sheet.clear()
    except gspread.exceptions.WorksheetNotFound:
        ts_sheet = sheet.add_worksheet(title=tab_ts, rows=5, cols=2)

    ts_sheet.update([
        ["Last Updated", datetime.now().strftime("%Y-%m-%d %H:%M:%S")],
        ["Season", str(CURRENT_SEASON)],
        ["Source", "FanGraphs + Baseball Savant"],
    ])
    print("  Pushed Last_Updated timestamp")
    if PUSH_FAILURES:
        print(f"\nGoogle Sheets push DEGRADED: {len(PUSH_FAILURES)} tab(s) kept their "
              f"previous contents because this run produced no rows for them:")
        for tab in PUSH_FAILURES:
            print(f"    - {tab}")
        print("  The site is serving the last good data for those tabs. Fix the "
              "upstream scrape, then re-run.")
    else:
        print("\nGoogle Sheets push complete.")

if __name__ == "__main__":
    run()