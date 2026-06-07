#!/usr/bin/env python
"""Verify BOS@NYY matchup card has lineup rows."""
from __future__ import annotations

import sys

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8765/chase_analytics_mlb_oem_v7.html#section-matchups-hero"


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        page.evaluate(
            "() => { if (typeof syncDashboardView === 'function') syncDashboardView(); }"
        )
        page.wait_for_selector(".hero-matchup-card", timeout=30000)
        page.wait_for_function(
            """() => {
              const card = document.querySelector('.hero-matchup-card[data-away=\"BOS\"][data-home=\"NYY\"]');
              return card && card.querySelectorAll('.lineup-row').length >= 18;
            }""",
            timeout=30000,
        )
        data = page.evaluate(
            """() => {
              const card = document.querySelector('.hero-matchup-card[data-away=\"BOS\"][data-home=\"NYY\"]')
                || document.querySelector('.hero-matchup-card[data-away=\"BOS\"][data-home=\"NYY\"]');
              const gk = 'BOS@NYY';
              const lu = (LIVE_DATA.lineups || []).filter(r => r.game === gk);
              return {
                card: !!card,
                liveRows: lu.length,
                cardRows: card ? card.querySelectorAll('.lineup-row').length : 0,
                empty: card ? !!card.querySelector('.matchup-lineup-empty') : false,
                slateDate: LIVE_DATA._slateSheetDate || null
              };
            }"""
        )
        browser.close()

    print(data)
    if data.get("liveRows", 0) < 18:
        print("FAIL: LIVE_DATA missing BOS@NYY lineup rows")
        return 1
    if not data.get("card"):
        print("FAIL: BOS@NYY card not found")
        return 1
    if data.get("cardRows", 0) < 18:
        print("FAIL: BOS@NYY card has too few lineup rows")
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
