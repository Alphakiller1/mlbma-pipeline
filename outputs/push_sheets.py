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


def get_client():
    creds = Credentials.from_service_account_file(str(CREDS_FILE), scopes=SCOPES)
    return gspread.authorize(creds)

def push_df(sheet, tab_name, df):
    try:
        worksheet = sheet.worksheet(tab_name)
        worksheet.clear()
    except gspread.exceptions.WorksheetNotFound:
        worksheet = sheet.add_worksheet(title=tab_name, rows=50, cols=20)

    df = df.round(2)
    data = [df.columns.tolist()] + df.values.tolist()
    worksheet.update(data)
    print(f"  Pushed {tab_name}: {len(df)} rows")

def run():
    if not check_google_credentials():
        print("  Skipping Google Sheets push (credentials unavailable).")
        return

    print("Connecting to Google Sheets...")
    client = get_client()
    sheet = client.open_by_key(SHEET_ID)
    print("Connected.\n")

    files = {
        SHEET_TABS["vs_rhp"]: "metrics_vs_RHP.csv",
        SHEET_TABS["vs_lhp"]: "metrics_vs_LHP.csv",
        SHEET_TABS["oor"]: "metrics_oor.csv",
        SHEET_TABS["pitching_score"]: "metrics_pitching_score.csv",
        SHEET_TABS["pals"]: "metrics_pals.csv",
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
    print("\nGoogle Sheets push complete.")

if __name__ == "__main__":
    run()