#!/usr/bin/env python
"""Check whether mlbmaLoading overlay blocks Team Rankings after table is ready."""
from __future__ import annotations

import sys
import time

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8765/team_rankings.html"


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        t0 = time.time()
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_function("() => window.__lineupViewReady === true", timeout=20000)
        ready_s = time.time() - t0
        data = page.evaluate(
            """() => {
              const m = document.getElementById('mlbmaLoading');
              const h = document.getElementById('hubLoading');
              const vis = (el) => {
                if (!el) return { exists: false, hidden: true };
                const st = getComputedStyle(el);
                return {
                  exists: true,
                  hidden: el.classList.contains('hide') || st.display === 'none' || st.visibility === 'hidden',
                  display: st.display,
                  opacity: st.opacity
                };
              };
              return {
                rows: document.querySelectorAll('.lv-table tbody tr').length,
                mlbma: vis(m),
                hub: vis(h),
                bodyLoading: document.body.classList.contains('mlbma-page-loading')
              };
            }"""
        )
        browser.close()

    print(f"ready_s={ready_s:.2f}")
    print(data)
    if data.get("rows", 0) >= 28 and data.get("mlbma", {}).get("hidden") is False:
        print("FAIL: table ready but mlbmaLoading still visible")
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
