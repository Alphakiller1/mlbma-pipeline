#!/usr/bin/env python
"""Console/terminal-state smoke for the generated sport routes.

Every generated route ships a placeholder such as
`<div id="slate" class="ca-async">Loading NFL board...</div>`. A route whose
bootstrap throws never replaces it, so the page sits on "Loading" forever and
the only outward symptom is a console error nobody is watching. That is exactly
how `window.CHASE_SPORT_GEMS_LABEL = None` shipped: tests were green, the page
was dead.

This asserts two things per route, which the static tests cannot:
  1. no uncaught page error and no non-ignorable console error;
  2. the async region reaches a terminal state - `data-state` set to something
     other than `loading`, or the placeholder text replaced by real content.

A route that legitimately has nothing to show is expected to render `empty` or
`stale`; those are terminal and pass. Only "still loading" fails.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from typing import List

from playwright.sync_api import TimeoutError as PWTimeout
from playwright.sync_api import sync_playwright

try:
    from scripts.diag_console import is_ignorable_console
except ModuleNotFoundError:
    from diag_console import is_ignorable_console

SPORTS = ("mlb", "nfl", "wnba", "cfb")
ASYNC_SELECTOR = "#slate, .ca-async"
NAV_TIMEOUT_MS = 20000
VIEWS = ("index", "matchups", "results")
TERMINAL_STATES = {"ready", "empty", "stale", "error", "unsupported", "partial"}


@dataclass
class RouteResult:
    route: str
    ok: bool
    state: str = ""
    errors: List[str] = field(default_factory=list)


def _check_route(browser, base_url: str, route: str, settle_ms: int) -> RouteResult:
    page = browser.new_page()
    errors: List[str] = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on(
        "console",
        lambda m: errors.append(f"console.{m.type}: {m.text}")
        if m.type == "error" and not is_ignorable_console(m.text)
        else None,
    )
    try:
        # Navigation gets its own budget; settle_ms is for the bootstrap, not the fetch.
        page.goto(f"{base_url}/{route}", wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
        # The bootstrap is async; give it the full budget to reach a terminal state.
        try:
            page.wait_for_function(
                r"""(sel) => {
                    const el = document.querySelector(sel);
                    if (!el) return true;                       // no async region on this route
                    const s = el.getAttribute('data-state');
                    if (s) return s !== 'loading';              // an explicit state is authoritative
                    return !/^\s*Loading/i.test(el.textContent || '');
                }""",
                arg=ASYNC_SELECTOR,
                timeout=settle_ms,
            )
        except PWTimeout:
            errors.append("never left the loading placeholder")
        el = page.query_selector(ASYNC_SELECTOR)
        state = (el.get_attribute("data-state") if el else None) or "no-async-region"
    except PWTimeout as exc:
        errors.append(f"navigation timeout: {exc}")
        state = "timeout"
    finally:
        page.close()
    return RouteResult(route=route, ok=not errors, state=state, errors=errors)


def run(base_url: str, settle_ms: int) -> List[RouteResult]:
    routes = [f"{s}/{v}.html" for s in SPORTS for v in VIEWS]
    results: List[RouteResult] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            for route in routes:
                results.append(_check_route(browser, base_url.rstrip("/"), route, settle_ms))
        finally:
            browser.close()
    return results


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="http://127.0.0.1:8766")
    ap.add_argument("--settle-ms", type=int, default=8000,
                    help="budget for a route to reach a terminal state")
    args = ap.parse_args()

    results = run(args.base_url, args.settle_ms)
    print("SPORT_ROUTES_SMOKE")
    for r in results:
        print(f"{'PASS' if r.ok else 'FAIL'} | {r.route:<22} | state={r.state}")
        for e in r.errors:
            print(f"       {e}")
    failed = [r for r in results if not r.ok]
    print("---")
    print(f"TOTAL {len(results)} PASS {len(results) - len(failed)} FAIL {len(failed)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
