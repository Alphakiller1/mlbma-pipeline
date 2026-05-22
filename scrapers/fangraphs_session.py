"""Shared FanGraphs Selenium login and CSV export helpers."""

from __future__ import annotations

import os
import time
from io import StringIO
from urllib.parse import unquote

import pandas as pd
import undetected_chromedriver as uc
from dotenv import load_dotenv
from selenium.webdriver.common.by import By

from core.config import CHROME_PATH, ENV_FILE

load_dotenv(ENV_FILE)

EMAIL = os.getenv("FANGRAPHS_EMAIL")
PASSWORD = os.getenv("FANGRAPHS_PASSWORD")


def get_driver():
    if not os.path.isfile(CHROME_PATH):
        raise FileNotFoundError(
            f"Chrome not found at {CHROME_PATH}. "
            "Install Google Chrome or set CHROME_PATH in .env to your chrome.exe path."
        )
    options = uc.ChromeOptions()
    options.add_argument("--start-maximized")
    return uc.Chrome(options=options, browser_executable_path=CHROME_PATH)


def login(driver) -> bool:
    print("Logging in to FanGraphs...")
    driver.get("https://blogs.fangraphs.com/wp-login.php")
    time.sleep(8)
    driver.find_element(By.ID, "user_login").send_keys(EMAIL)
    driver.find_element(By.ID, "user_pass").send_keys(PASSWORD)
    driver.find_element(By.ID, "wp-submit").click()
    time.sleep(10)
    print(f"  Login URL: {driver.current_url}")
    return "wp-admin" in driver.current_url or "fangraphs.com" in driver.current_url


def get_export_csv(driver) -> pd.DataFrame | None:
    try:
        links = driver.find_elements(By.XPATH, "//a[contains(text(),'Export Data')]")
        if not links:
            return None
        href = links[0].get_attribute("href")
        if not href or not href.startswith("data:"):
            return None
        csv_text = unquote(href.replace("data:application/csv;charset=utf-8,", ""))
        return pd.read_csv(StringIO(csv_text))
    except Exception as exc:
        print(f"  Export error: {exc}")
        return None
