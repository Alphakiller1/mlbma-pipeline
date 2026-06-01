from selenium.webdriver.common.by import By
from urllib.parse import unquote
from io import StringIO
import pandas as pd
import time
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv

from core.config import CHROME_VERSION, DATA_DIR, ENV_FILE, SEASON_END, SEASON_START
from scrapers.fangraphs_session import get_driver, safe_quit_driver

load_dotenv(ENV_FILE)

EMAIL = os.getenv("FANGRAPHS_EMAIL")
PASSWORD = os.getenv("FANGRAPHS_PASSWORD")

STAT_GROUPS = {
    "traditional": 1,
    "standard":    2,
    "batted_ball": 3,
}

SPLITS = {
    "vs_RHP": "2",
    "vs_LHP": "1",
}

L14_START = (datetime.now() - timedelta(days=14)).strftime("%Y-%m-%d")
L14_END = datetime.now().strftime("%Y-%m-%d")


def login(driver):
    print("Logging in...")
    driver.get("https://blogs.fangraphs.com/wp-login.php")
    time.sleep(8)
    driver.find_element(By.ID, "user_login").send_keys(EMAIL)
    driver.find_element(By.ID, "user_pass").send_keys(PASSWORD)
    driver.find_element(By.ID, "wp-submit").click()
    time.sleep(10)
    print(f"Login URL: {driver.current_url}")
    return "wp-admin" in driver.current_url or "fangraphs.com" in driver.current_url


def get_export_csv(driver):
    try:
        links = driver.find_elements(By.XPATH, "//a[contains(text(),'Export Data')]")
        if not links:
            return None
        href = links[0].get_attribute("href")
        if not href or not href.startswith("data:"):
            return None
        csv_text = unquote(href.replace("data:application/csv;charset=utf-8,", ""))
        return pd.read_csv(StringIO(csv_text))
    except Exception as e:
        print(f"  Export error: {e}")
        return None


def scrape_one(driver, split_label, split_code, sg_name, sg_num):
    url = (
        f"https://www.fangraphs.com/leaders/splits-leaderboards?splitArr={split_code}"
        f"&splitArrPitcher=&position=B&autoPt=false&byTeam=true"
        f"&start={SEASON_START}&end={SEASON_END}&statType=team&statgroup={sg_num}"
        f"&minPAf=0&pageSize=30"
    )
    print(f"  Loading {split_label} {sg_name}...")
    driver.get(url)
    time.sleep(20)
    df = get_export_csv(driver)
    if df is not None:
        print(f"  OK {len(df)} rows | Cols: {list(df.columns)}")
        fname = os.path.join(DATA_DIR, f"{split_label}_{sg_name}.csv")
        df.to_csv(fname, index=False)
        print(f"  Saved: {fname}")
    else:
        print("  FAIL No data found")
    time.sleep(15)
    return df


def _merge_sp_standard_advanced(standard_df: pd.DataFrame, advanced_df: pd.DataFrame | None) -> pd.DataFrame:
    if advanced_df is None or advanced_df.empty:
        return standard_df
    key = "Name" if "Name" in standard_df.columns else standard_df.columns[0]
    adv_cols = [c for c in advanced_df.columns if c not in standard_df.columns or c == key]
    if key not in advanced_df.columns:
        return standard_df
    return standard_df.merge(advanced_df[adv_cols], on=key, how="left", suffixes=("", "_adv"))


def scrape_sp(driver, sg_name, sg_num, start_date: str, end_date: str, out_basename: str):
    url = (
        f"https://www.fangraphs.com/leaders/splits-leaderboards?splitArr=&splitArrPitcher="
        f"&position=P&autoPt=false&byTeam=false"
        f"&start={start_date}&end={end_date}"
        f"&statType=player&statgroup={sg_num}&minPAf=&pageSize=100"
    )
    print(f"  Loading SP {sg_name} ({start_date} to {end_date})...")
    driver.get(url)
    time.sleep(20)
    df = get_export_csv(driver)
    if df is not None:
        print(f"  OK {len(df)} pitchers | Cols: {list(df.columns)}")
        fname = os.path.join(DATA_DIR, f"{out_basename}_{sg_name}.csv")
        df.to_csv(fname, index=False)
        print(f"  Saved: {fname}")
    else:
        print("  No data found")
    time.sleep(15)
    return df


def scrape_sp_window(driver, start_date: str, end_date: str, out_basename: str, label: str):
    """Scrape SP standard + advanced for a date window; write merged {out_basename}.csv."""
    print(f"=== SP Leaderboard ({label}: {start_date} to {end_date}) ===")
    std = scrape_sp(driver, "standard", 2, start_date, end_date, out_basename)
    adv = scrape_sp(driver, "advanced", 3, start_date, end_date, out_basename)
    if std is not None:
        merged = _merge_sp_standard_advanced(std, adv)
        out_path = os.path.join(DATA_DIR, f"{out_basename}.csv")
        merged.to_csv(out_path, index=False)
        print(f"  Merged -> {out_path} ({len(merged)} rows)")
    return std


def run():
    print(f"FanGraphs scrape (Chrome version_main={CHROME_VERSION})")
    driver = get_driver()
    try:
        if not login(driver):
            print("Login failed")
            return
        print("Login successful!")

        for split_label, split_code in SPLITS.items():
            print(f"=== {split_label} ===")
            for sg_name, sg_num in STAT_GROUPS.items():
                scrape_one(driver, split_label, split_code, sg_name, sg_num)
            print("Cooling down 45s...")
            time.sleep(45)

        scrape_sp_window(driver, SEASON_START, SEASON_END, "sp_standard", "season")
        print("Cooling down 45s...")
        time.sleep(45)
        scrape_sp_window(driver, L14_START, L14_END, "sp_l14", "L14")
    finally:
        safe_quit_driver(driver)
    print("All done.")


if __name__ == "__main__":
    run()
