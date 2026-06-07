#!/usr/bin/env python
"""Verify Team Rankings loads table + dismisses overlay within budget."""
from __future__ import annotations

import sys
import time

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8766/team_rankings.html"
OVERLAY_BUDGET_S = 8.0
TABLE_BUDGET_S = 12.0


def main() -> int:
    issues: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        context.clear_cookies()
        page = context.new_page()
        console_errors: list[str] = []

        def on_console(msg):
            if msg.type == "error":
                text = msg.text
                if "429" in text or text.startswith("[LINEUPS]") or text.startswith("[MATCHUPS]"):
                    return
                if "fonts.gstatic.com" in text or "CORS policy" in text:
                    return
                console_errors.append(text)

        page.on("console", on_console)
        page.on("pageerror", lambda err: console_errors.append(str(err)))

        t0 = time.time()
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)

        try:
            page.wait_for_function(
                """() => {
                  const hub = document.getElementById('hubLoading');
                  const mlbma = document.getElementById('mlbmaLoading');
                  const hubHidden = !hub || hub.classList.contains('hide');
                  const mlbmaHidden = !mlbma || mlbma.classList.contains('hide');
                  return hubHidden && mlbmaHidden;
                }""",
                timeout=int(OVERLAY_BUDGET_S * 1000),
            )
            overlay_s = time.time() - t0
        except Exception:
            issues.append(f"Loading overlay still visible after {OVERLAY_BUDGET_S}s")
            overlay_s = time.time() - t0

        try:
            page.wait_for_selector(".lv-table tbody tr", timeout=int(TABLE_BUDGET_S * 1000))
            table_s = time.time() - t0
        except Exception:
            issues.append(f"No table rows after {TABLE_BUDGET_S}s")
            table_s = time.time() - t0

        data = page.evaluate(
            """() => ({
              ready: !!window.__lineupViewReady,
              rows: document.querySelectorAll('.lv-table tbody tr').length,
              family: (new URLSearchParams(location.search).get('family')) || 'surface',
              mlbmaHidden: (() => {
                const el = document.getElementById('mlbmaLoading');
                return !el || el.classList.contains('hide');
              })(),
              bodyText: (document.querySelector('.lv-body') || {}).textContent || ''
            })"""
        )

        browser.close()

    print(f"overlay_dismiss_s={overlay_s:.2f}")
    print(f"table_rows_s={table_s:.2f}")
    print(f"rows={data.get('rows')} ready={data.get('ready')}")

    if data.get("rows", 0) < 28:
        issues.append(f"Expected ~30 teams, got {data.get('rows')}")
    if not data.get("ready"):
        issues.append("__lineupViewReady never set")
    if not data.get("mlbmaHidden"):
        issues.append("mlbmaLoading overlay still visible")
    if "Render error" in str(data.get("bodyText", "")):
        issues.append("Render error shown in UI")
    if "Load timed out" in str(data.get("bodyText", "")):
        issues.append("20s timeout message shown")
    if console_errors:
        issues.append("Console errors: " + " | ".join(console_errors[:3]))

    if issues:
        print("FAIL")
        for item in issues:
            print("-", item)
        return 1

    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
