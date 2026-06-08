#!/usr/bin/env python3
"""Browser smoke test for production dashboard pages."""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("playwright not installed — skip browser smoke")
    sys.exit(0)

ROOT = Path(__file__).resolve().parents[1]
DASH = ROOT / "dashboard"

PAGES = [
    ("chase_analytics_mlb_oem_v7.html", "#opening-dashboard, .opening-layer"),
    ("team_rankings.html", ".container, .lv-body, .hub-table, .lv-note"),
    ("matchup_compare.html", ".compare-page, .mc-header"),
    ("team_profile.html", "#profileHeroMount, .profile-shell"),
    ("pitcher_profile.html", "#profileContent"),
    ("batter_profile.html", "#profileContent"),
    ("bullpen_report.html", "#profilePageHeader, .profile-shell"),
    ("glossary.html", ".glossary-page, .container"),
    ("index.html", ".index-wrap"),
]

TIMEOUT_MS = 90000


def main() -> int:
    failures = []
    base = DASH.as_uri() + "/"

    with sync_playwright() as p:
        browser = p.chromium.launch()
        for page_name, selector in PAGES:
            url = base + page_name
            page = browser.new_page(viewport={"width": 1280, "height": 900})
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=TIMEOUT_MS)
                page.wait_for_timeout(6000)
                if not page.query_selector(selector):
                    failures.append((page_name, f"selector missing: {selector}"))
                overflow = page.evaluate(
                    "() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2"
                )
                if overflow:
                    failures.append((page_name, "horizontal overflow at 1280px"))
                if errors:
                    # file:// fetch failures for live data are expected offline
                    real = [e for e in errors if "Failed to fetch" not in e and "fetch" not in e.lower()]
                    if real:
                        failures.append((page_name, f"JS errors: {real[:2]}"))
                else:
                    print(f"OK  {page_name}")
            except Exception as exc:
                failures.append((page_name, str(exc)))
            finally:
                page.close()
        browser.close()

    print("=" * 50)
    if failures:
        print(f"FAILURES ({len(failures)}):")
        for name, msg in failures:
            print(f"  {name}: {msg}")
        return 1
    print("All smoke tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
