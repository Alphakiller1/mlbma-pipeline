#!/usr/bin/env python
"""Verify matchup cards show projected lineups within budget."""
from __future__ import annotations

import sys
import time

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8766/chase_analytics_mlb_oem_v7.html#section-matchups-hero"
CARDS_BUDGET_S = 8.0
LINEUPS_BUDGET_S = 12.0


def main() -> int:
    issues: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        context.clear_cookies()
        page = context.new_page()

        t0 = time.time()
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)

        try:
            page.wait_for_function(
                """() => document.querySelectorAll('.hero-matchup-card').length >= 5""",
                timeout=int(CARDS_BUDGET_S * 1000),
            )
            cards_s = time.time() - t0
        except Exception:
            issues.append(f"Fewer than 5 matchup cards after {CARDS_BUDGET_S}s")
            cards_s = time.time() - t0

        lineup_samples: list[tuple[float, int]] = []
        deadline = t0 + LINEUPS_BUDGET_S
        while time.time() < deadline:
            with_lineups = page.evaluate(
                """() => Array.from(document.querySelectorAll('.hero-matchup-card'))
                  .filter(c => c.querySelector('.lineup-row')).length"""
            )
            lineup_samples.append((time.time() - t0, with_lineups))
            if with_lineups >= 10:
                break
            page.wait_for_timeout(200)

        data = page.evaluate(
            """() => ({
              matchups: (window.LIVE_DATA && window.LIVE_DATA.matchups) ? window.LIVE_DATA.matchups.length : 0,
              lineups: (window.LIVE_DATA && window.LIVE_DATA.lineups) ? window.LIVE_DATA.lineups.length : 0,
              rawRows: (window.LIVE_DATA && window.LIVE_DATA._rawLineupSheetRows) ? window.LIVE_DATA._rawLineupSheetRows.length : 0,
              cards: document.querySelectorAll('.hero-matchup-card').length,
              withLineups: Array.from(document.querySelectorAll('.hero-matchup-card'))
                .filter(c => c.querySelector('.lineup-row')).length,
              emptyPanels: Array.from(document.querySelectorAll('.hero-matchup-card'))
                .filter(c => c.querySelector('.matchup-lineup-empty')).length
            })"""
        )
        lineups_s = lineup_samples[-1][0] if lineup_samples else time.time() - t0
        browser.close()

    print(f"cards_s={cards_s:.2f}")
    print(f"lineups_populated_s={lineups_s:.2f}")
    print(
        f"cards={data.get('cards')} withLineups={data.get('withLineups')} "
        f"emptyPanels={data.get('emptyPanels')} lineups={data.get('lineups')}"
    )

    if data.get("cards", 0) < 5:
        issues.append(f"Expected >=5 cards, got {data.get('cards')}")
    if data.get("withLineups", 0) < 10:
        issues.append(f"Expected >=10 cards with lineups, got {data.get('withLineups')}")
    if data.get("lineups", 0) < 100:
        issues.append(f"Expected parsed lineup rows, got {data.get('lineups')}")

    if issues:
        print("FAIL")
        for issue in issues:
            print(f"  - {issue}")
        return 1

    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
