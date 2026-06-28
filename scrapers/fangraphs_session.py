"""Shared FanGraphs Selenium login and CSV export helpers."""

from __future__ import annotations

import atexit
import contextlib
import io
import os
import sys
import threading
import time
from io import StringIO
from urllib.parse import unquote

from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


def _suppress_chrome_cleanup_errors():
    import ctypes

    try:
        if sys.platform == "win32":
            ctypes.windll.kernel32.SetErrorMode(0x8007)
    except Exception:
        pass
    try:
        sys.stderr = open(os.devnull, "w")
    except Exception:
        pass


atexit.register(_suppress_chrome_cleanup_errors)

uc = None
_uc_import_err: Exception | None = None
_import_stderr = io.StringIO()
try:
    with contextlib.redirect_stderr(_import_stderr):
        import undetected_chromedriver as uc
except Exception as exc:
    uc = None
    _uc_import_err = exc

import pandas as pd
from dotenv import load_dotenv
from selenium.common.exceptions import WebDriverException
from selenium.webdriver.common.by import By

from core.config import CHROME_PATH, CHROME_VERSION, ENV_FILE

load_dotenv(ENV_FILE)

EMAIL = os.getenv("FANGRAPHS_EMAIL")
PASSWORD = os.getenv("FANGRAPHS_PASSWORD")

LOGIN_URL = "https://blogs.fangraphs.com/wp-login.php"
LOGIN_FORM_TIMEOUT = 25
LOGIN_NAV_TIMEOUT = 20
DRIVER_QUIT_TIMEOUT = 12


def get_driver():
    if uc is None:
        raise ImportError(
            "undetected-chromedriver failed to import"
        ) from _uc_import_err
    if not os.path.isfile(CHROME_PATH):
        raise FileNotFoundError(
            f"Chrome not found at {CHROME_PATH}. "
            "Install Google Chrome or set CHROME_PATH in .env to your chrome.exe path."
        )
    print(f"  Starting Chrome (version_main={CHROME_VERSION})...", flush=True)
    options = uc.ChromeOptions()
    options.add_argument("--start-maximized")
    driver = uc.Chrome(
        options=options,
        browser_executable_path=CHROME_PATH,
        version_main=CHROME_VERSION,
    )
    driver.set_page_load_timeout(180)
    driver.set_script_timeout(120)
    print("  Chrome ready.", flush=True)
    return driver


def safe_quit_driver(driver, timeout: float = DRIVER_QUIT_TIMEOUT) -> None:
    """Quit Chrome without hanging on Windows undetected-chromedriver cleanup bugs."""
    if driver is None:
        return

    def _quit():
        try:
            driver.quit()
        except Exception:
            pass

    t = threading.Thread(target=_quit, daemon=True)
    t.start()
    t.join(timeout)
    if t.is_alive():
        try:
            proc = getattr(getattr(driver, "service", None), "process", None)
            if proc is not None:
                proc.kill()
        except Exception:
            pass


def _driver_alive(driver) -> bool:
    try:
        _ = driver.current_url
        return True
    except Exception:
        return False


def _login_error_text(driver) -> str:
    try:
        err = driver.find_element(By.ID, "login_error")
        return (err.text or "").strip()
    except Exception:
        return ""


def _try_login_once(driver) -> bool:
    print("Logging in to FanGraphs...", flush=True)
    try:
        driver.get(LOGIN_URL)
    except WebDriverException as exc:
        print(f"  Login navigation failed: {exc}", flush=True)
        return False
    wait = WebDriverWait(driver, LOGIN_FORM_TIMEOUT)
    try:
        user_el = wait.until(EC.presence_of_element_located((By.ID, "user_login")))
        pass_el = driver.find_element(By.ID, "user_pass")
        submit = driver.find_element(By.ID, "wp-submit")
    except Exception as exc:
        print(f"  Login form not found: {exc}", flush=True)
        return False

    user_el.clear()
    pass_el.clear()
    user_el.send_keys(EMAIL or "")
    pass_el.send_keys(PASSWORD or "")
    if not (user_el.get_attribute("value") or "").strip():
        driver.execute_script(
            """
            document.getElementById('user_login').value = arguments[0];
            document.getElementById('user_pass').value = arguments[1];
            document.getElementById('loginform').submit();
            """,
            EMAIL or "",
            PASSWORD or "",
        )
    else:
        submit.click()

    try:
        WebDriverWait(driver, LOGIN_NAV_TIMEOUT).until(
            lambda d: "wp-login.php" not in str(d.current_url or "")
        )
    except Exception:
        pass

    url = str(driver.current_url or "")
    print(f"  Login URL: {url}", flush=True)
    if "wp-login.php" in url:
        err = _login_error_text(driver)
        if err:
            print(f"  Login error: {err}", flush=True)
        return False
    return "wp-admin" in url or "fangraphs.com" in url


def login(driver, max_attempts: int = 3):
    if not EMAIL or not PASSWORD:
        print(
            "ERROR: FANGRAPHS_EMAIL / FANGRAPHS_PASSWORD not set in .env",
            flush=True,
        )
        return False, driver

    drv = driver
    for attempt in range(1, max_attempts + 1):
        if attempt > 1:
            print(f"  Login retry {attempt}/{max_attempts}...", flush=True)
        if not _driver_alive(drv):
            safe_quit_driver(drv)
            drv = get_driver()
        if _try_login_once(drv):
            return True, drv
        if _driver_alive(drv):
            try:
                drv.delete_all_cookies()
            except Exception:
                pass
        else:
            safe_quit_driver(drv)
            drv = get_driver()
        if attempt < max_attempts:
            time.sleep(5)
    return False, drv


def get_export_csv(driver) -> pd.DataFrame | None:
    try:
        links = driver.find_elements(
            By.XPATH,
            "//a[contains(text(),'Export Data') or contains(text(),'Data Export')]",
        )
        if not links:
            links = driver.find_elements(By.XPATH, "//a[starts-with(@href,'data:application/csv')]")
        if not links:
            return None
        href = links[0].get_attribute("href")
        if not href or not href.startswith("data:"):
            return None
        csv_text = unquote(href.replace("data:application/csv;charset=utf-8,", ""))
        return pd.read_csv(StringIO(csv_text))
    except Exception as exc:
        print(f"  Export error: {exc}", flush=True)
        return None
