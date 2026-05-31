#!/usr/bin/env python
"""Verify Matchups hero day/sort/filter controls on opening dashboard."""

from __future__ import annotations

import argparse
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent


def _start_server(port: int) -> ThreadingHTTPServer:
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT), **kwargs)

    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--timeout-ms", type=int, default=90000)
    args = parser.parse_args()

    httpd = _start_server(args.port)
    base = f"http://127.0.0.1:{args.port}/dashboard/chase_analytics_mlb_oem_v7.html#section-matchups-hero"
    failures: list[str] = []

    def fail(msg: str) -> None:
        failures.append(msg)
        print("FAIL |", msg)

    def ok(msg: str) -> None:
        print("PASS |", msg)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page_errors: list[str] = []
        page.on("pageerror", lambda e: page_errors.append(str(e)))

        page.goto(base, wait_until="domcontentloaded", timeout=args.timeout_ms)
        page.wait_for_function(
            "() => document.documentElement.classList.contains('view-matchups')",
            timeout=args.timeout_ms,
        )

        try:
            page.wait_for_function(
                "() => document.querySelectorAll('#matchupsHeroGrid .hero-matchup-card').length > 0",
                timeout=args.timeout_ms,
            )
            ok("live matchups loaded")
        except Exception:
            fail("live matchups did not load in time")

        grid = page.locator("#matchupsHeroGrid")
        card_count = grid.locator(".hero-matchup-card").count()
        if card_count == 0:
            fail("no hero matchup cards rendered")
        else:
            ok(f"hero cards rendered ({card_count})")

        def card_keys() -> list[str]:
            return page.evaluate(
                """() => [...document.querySelectorAll('#matchupsHeroGrid .hero-matchup-card')]
                .map(c => (c.getAttribute('data-away') || '') + '@' + (c.getAttribute('data-home') || ''))"""
            )

        before = card_keys()

        page.locator('[data-match-sort="time"]').click(timeout=10000)
        page.wait_for_timeout(400)
        after_time = card_keys()
        if after_time == before and len(before) > 1:
            fail("sort by time did not change card order")
        else:
            ok("sort by time button works")

        page.locator('[data-match-filter="edge"]').click(timeout=10000)
        page.wait_for_timeout(400)
        edge_count = grid.locator(".hero-matchup-card").count()
        if edge_count == 0 and len(before) > 0:
            fail("edge filter removed all cards unexpectedly")
        else:
            ok(f"edge filter button works ({edge_count} cards)")

        page.locator('.matchup-day-tab[data-day="tomorrow"]').click(timeout=10000)
        page.wait_for_timeout(1500)
        tomorrow_cards = grid.locator(".hero-matchup-card--tomorrow").count()
        if tomorrow_cards == 0:
            empty = page.locator("#matchupsHeroGrid .empty-msg").count()
            if empty:
                ok("tomorrow tab works (no games scheduled message)")
            else:
                fail("tomorrow tab did not render cards or empty state")
        else:
            ok(f"tomorrow tab works ({tomorrow_cards} cards)")

        page.locator('.matchup-day-tab[data-day="today"]').click(timeout=10000)
        page.wait_for_timeout(800)
        if grid.locator(".hero-matchup-card").count() == 0 and len(before) > 0:
            fail("today tab did not restore cards")
        else:
            ok("today tab button works")

        yama = page.evaluate(
            """() => {
              const el = [...document.querySelectorAll('#matchupsHeroGrid .mc-sp-name strong')]
                .find(n => /yamamoto/i.test(n.textContent || ''));
              if (!el) return { found: false };
              const img = el.closest('.mc-sp-block')?.querySelector('.ca-pitcher-avatar-img');
              return { found: true, hasImg: !!img, src: img ? img.getAttribute('src') : null };
            }"""
        )
        if yama.get("found") and yama.get("hasImg") and "808967" in (yama.get("src") or ""):
            ok("Yamamoto headshot resolves to MLB ID 808967")
        elif not yama.get("found"):
            ok("Yamamoto not on current slate (skipped headshot check)")
        else:
            fail(f"Yamamoto headshot missing or wrong id: {yama}")

        if page_errors:
            fail("page errors: " + " | ".join(page_errors[:3]))
        else:
            ok("no uncaught page errors")

        browser.close()

    httpd.shutdown()
    print("---")
    print(f"TOTAL FAIL {len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
