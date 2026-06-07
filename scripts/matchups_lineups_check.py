#!/usr/bin/env python
"""Verify matchup hero cards render projected lineup rows."""
from __future__ import annotations

import sys
import time

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8777/chase_analytics_mlb_oem_v7.html#section-matchups-hero"
BUDGET_S = 25.0


def main() -> int:
    issues: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        t0 = time.time()
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_function(
            "() => window.LIVE_DATA && LIVE_DATA.lineups && LIVE_DATA.lineups.length > 0",
            timeout=int(BUDGET_S * 1000),
        )
        page.evaluate(
            "() => { if (typeof syncDashboardView === 'function') syncDashboardView(); }"
        )
        page.wait_for_selector(".hero-matchup-card", timeout=15000)
        page.wait_for_function(
            "() => document.querySelectorAll('.hmc-lineups .lineup-row').length >= 18"
            " || document.querySelectorAll('.matchup-lineup-empty').length > 0",
            timeout=int(BUDGET_S * 1000),
        )
        elapsed = time.time() - t0
        data = page.evaluate(
            """() => ({
              lineups: (window.LIVE_DATA && LIVE_DATA.lineups) ? LIVE_DATA.lineups.length : 0,
              lineupRows: document.querySelectorAll('.hmc-lineups .lineup-row').length,
              labels: document.querySelectorAll('.hmc-lineups-label').length,
              cards: document.querySelectorAll('.hero-matchup-card').length,
              empty: document.querySelectorAll('.matchup-lineup-empty').length
            })"""
        )
        browser.close()

    print(f"lineups_ready_s={elapsed:.2f}")
    print("data", data)

    if data.get("cards", 0) < 1:
        issues.append("No matchup cards rendered")
    if data.get("lineupRows", 0) < 18 and data.get("lineups", 0) < 18:
        issues.append("Too few lineup rows in cards or LIVE_DATA")
    if data.get("labels", 0) < 1:
        issues.append("No projected lineups section labels")

    if issues:
        print("FAIL")
        for item in issues:
            print("-", item)
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
