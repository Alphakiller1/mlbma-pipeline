import gspread
from google.oauth2.service_account import Credentials
import pandas as pd
import os
from datetime import datetime

DATA_DIR = r"C:\Users\chase\mlbma_pipeline\data"
SHEET_ID = "1D28pC1lqMbsCcTBP67WhJPzYHn2UdtveMEv6RsUSczk"
CREDS_FILE = r"C:\Users\chase\mlbma_pipeline\google_credentials.json"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

def get_client():
    creds = Credentials.from_service_account_file(CREDS_FILE, scopes=SCOPES)
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
    print("Connecting to Google Sheets...")
    client = get_client()
    sheet = client.open_by_key(SHEET_ID)
    print("Connected.\n")

    files = {
        "vs_RHP":         "metrics_vs_RHP.csv",
        "vs_LHP":         "metrics_vs_LHP.csv",
        "OOR":            "metrics_oor.csv",
        "Pitching_Score": "metrics_pitching_score.csv",
    }

    for tab_name, filename in files.items():
        path = os.path.join(DATA_DIR, filename)
        if os.path.exists(path):
            df = pd.read_csv(path)
            push_df(sheet, tab_name, df)
        else:
            print(f"  WARNING: {filename} not found")

    # Add last updated timestamp tab
    try:
        ts_sheet = sheet.worksheet("Last_Updated")
        ts_sheet.clear()
    except gspread.exceptions.WorksheetNotFound:
        ts_sheet = sheet.add_worksheet(title="Last_Updated", rows=5, cols=2)

    ts_sheet.update([
        ["Last Updated", datetime.now().strftime("%Y-%m-%d %H:%M:%S")],
        ["Season", "2025"],
        ["Source", "FanGraphs + Baseball Savant"],
    ])
    print("  Pushed Last_Updated timestamp")
    print("\nGoogle Sheets push complete.")

if __name__ == "__main__":
    run()