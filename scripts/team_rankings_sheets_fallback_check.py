#!/usr/bin/env python
"""Simulate slow Sheets-only Team Rankings load (no Supabase prefetch hit)."""
from __future__ import annotations

import sys
import time

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8765/team_rankings.html"


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        context.clear_cookies()
        context.add_init_script(
            """
            window.__MLBMA_TAB_PREFETCH = {};
            try { sessionStorage.clear(); localStorage.clear(); } catch (e) {}
            """
        )
        page = context.new_page()
        page.route("**/supabase.co/**", lambda route: route.abort())
        t0 = time.time()
        page.goto(URL, wait_until="domcontentloaded", timeout=120000)
        try:
            page.wait_for_function("() => window.__lineupViewReady === true", timeout=60000)
            ready_s = time.time() - t0
        except Exception:
            ready_s = None
        data = page.evaluate(
            "() => ({ rows: document.querySelectorAll('.lv-table tbody tr').length, body: (document.querySelector('.lv-body')||{}).textContent||'' })"
        )
        browser.close()

    print(f"sheets_fallback_ready_s={ready_s}")
    print(f"rows={data.get('rows')}")
    if ready_s is None or ready_s > 15:
        print("FAIL slow sheets fallback")
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
