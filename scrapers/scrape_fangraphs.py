import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from urllib.parse import unquote
from io import StringIO
import pandas as pd
import time
import os
from dotenv import load_dotenv

from core.config import CHROME_PATH, DATA_DIR, ENV_FILE, SEASON_END, SEASON_START

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

def get_driver():
    if not os.path.isfile(CHROME_PATH):
        raise FileNotFoundError(
            f"Chrome not found at {CHROME_PATH}. "
            "Install Google Chrome or set CHROME_PATH in .env to your chrome.exe path."
        )
    options = uc.ChromeOptions()
    options.add_argument("--start-maximized")
    return uc.Chrome(options=options, browser_executable_path=CHROME_PATH)

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
    url = f"https://www.fangraphs.com/leaders/splits-leaderboards?splitArr={split_code}&splitArrPitcher=&position=B&autoPt=false&byTeam=true&start={SEASON_START}&end={SEASON_END}&statType=team&statgroup={sg_num}&minPAf=0&pageSize=30"
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
        print(f"  FAIL No data found")
    time.sleep(15)
    return df

def scrape_sp(driver, sg_name, sg_num):
    url = f"https://www.fangraphs.com/leaders/splits-leaderboards?splitArr=&splitArrPitcher=&position=P&autoPt=false&byTeam=false&start={SEASON_START}&end={SEASON_END}&statType=player&statgroup={sg_num}&minPAf=&pageSize=100"
    print(f"  Loading SP {sg_name}...")
    driver.get(url)
    time.sleep(20)
    df = get_export_csv(driver)
    if df is not None:
        print(f"  OK {len(df)} pitchers | Cols: {list(df.columns)}")
        fname = os.path.join(DATA_DIR, f'sp_{sg_name}.csv')
        df.to_csv(fname, index=False)
        print(f'  Saved: {fname}')
    else:
        print(f'  No data found')
    time.sleep(15)
    return df

def run():
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

        print("=== SP Leaderboard ===")
        for sg_name, sg_num in [("standard", 2), ("advanced", 3)]:
            scrape_sp(driver, sg_name, sg_num)
    finally:
        try:
            driver.quit()
        except Exception:
            pass
    print("All done.")


if __name__ == "__main__":
    run()
