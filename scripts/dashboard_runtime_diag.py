#!/usr/bin/env python
"""Runtime diagnostics for team_rankings dashboard.

Usage:
  python scripts/dashboard_runtime_diag.py --base-url http://127.0.0.1:8765/team_rankings.html
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from typing import List

from playwright.sync_api import TimeoutError as PWTimeout
from playwright.sync_api import sync_playwright


@dataclass
class CheckResult:
    name: str
    ok: bool
    note: str = ""


def run_diagnostic(base_url: str, timeout_ms: int) -> List[CheckResult]:
    results: List[CheckResult] = []

    def check(name: str, ok: bool, note: str = "") -> None:
        results.append(CheckResult(name=name, ok=bool(ok), note=note))

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        console_errors: List[str] = []
        page_errors: List[str] = []
        page.on(
            "console",
            lambda msg: console_errors.append(msg.text)
            if msg.type == "error"
            else None,
        )
        def _capture_page_error(err: BaseException) -> None:
            stack = getattr(err, "stack", "") or ""
            message = str(err)
            page_errors.append((message + (" :: " + stack if stack else "")).strip())

        page.on("pageerror", _capture_page_error)
        page.goto(base_url, wait_until="domcontentloaded", timeout=timeout_ms)

        def safe_click(selector: str) -> None:
            """Click robustly across transient overlays/animations."""
            loc = page.locator(selector).first
            loc.scroll_into_view_if_needed(timeout=timeout_ms)
            loc.click(timeout=timeout_ms, force=True)

        check("scope all control", page.locator('[data-hub-scope="all"]').count() == 1)
        check("scope team control", page.locator('[data-hub-scope="team"]').count() == 1)
        check("team input control", page.locator("#hubTeamSelect").count() == 1)
        check("family summary control", page.locator('[data-hub-family="summary"]').count() == 1)
        check("family scoring control", page.locator('[data-hub-family="scoring"]').count() == 1)

        try:
            page.wait_for_function(
                "() => !!window.HUB && !!window.HUB.filter && !!window.HUB.scope",
                timeout=timeout_ms,
            )
            check("HUB initialized", True)
        except PWTimeout:
            check("HUB initialized", False, "window.HUB state never initialized")

        try:
            page.wait_for_function("() => !!window.HUB && window.HUB.loaded === true", timeout=timeout_ms)
            check("HUB data load finished", True)
        except PWTimeout:
            issue = page.evaluate("() => (window.HUB && window.HUB.dataIssue) || ''")
            check("HUB data load finished", False, issue or "load did not complete in time")

        # Verify URL persistence: scope
        # Give UI a chance to dismiss loading mask before interactions.
        page.wait_for_timeout(400)
        safe_click('[data-hub-scope="team"]')
        page.wait_for_timeout(250)
        query = page.evaluate("location.search")
        check("scope=team persisted", "scope=team" in query, query)

        # Verify alias handling + team persistence
        page.fill("#hubTeamSelect", "SF")
        safe_click("button:has-text('Apply')")
        page.wait_for_timeout(300)
        query = page.evaluate("location.search")
        check("team alias persisted as SFG", "team=SFG" in query, query)

        # Verify family persistence
        safe_click('[data-hub-family="scoring"]')
        page.wait_for_timeout(250)
        query = page.evaluate("location.search")
        check("family=scoring persisted", "family=scoring" in query, query)

        # Verify filter persistence
        safe_click('[data-hub-key="hand"][data-val="r"]')
        page.wait_for_timeout(250)
        query = page.evaluate("location.search")
        check("hand=r persisted", "hand=r" in query, query)

        # Team-card branch in runtime
        in_team_scope = page.evaluate(
            "() => !!window.HUB && !!window.HUB.scope && window.HUB.scope.mode === 'team'"
        )
        cards_visible = page.evaluate(
            "() => {"
            "  const el = document.getElementById('hubTeamCards');"
            "  return !!el && el.classList.contains('show');"
            "}"
        )
        check("team scope active", in_team_scope)
        check("team cards visible", cards_visible)

        # Return to all scope and verify team param cleanup
        safe_click('[data-hub-scope="all"]')
        page.wait_for_timeout(250)
        query = page.evaluate("location.search")
        check("scope=all persisted", "scope=all" in query, query)
        check("team key removed in all scope", "team=" not in query, query)

        # Optional data sanity - if loaded, should have at least one rendered row or card
        data_ready = page.evaluate(
            "() => !!window.HUB && (window.HUB.loaded === true || window.HUB.rows?.length > 0)"
        )
        check("data loaded or rows present", data_ready)
        if page_errors:
            check("no uncaught page errors", False, " | ".join(page_errors[:3]))
        else:
            check("no uncaught page errors", True)
        if console_errors:
            check("no console errors", False, " | ".join(console_errors[:5]))
        else:
            check("no console errors", True)

        browser.close()

    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Run runtime diagnostics on team_rankings dashboard.")
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8765/dashboard/team_rankings.html?hubdebug=1",
        help="Full URL to the team_rankings page.",
    )
    parser.add_argument(
        "--timeout-ms",
        type=int,
        default=30000,
        help="Timeout in milliseconds for page operations.",
    )
    args = parser.parse_args()

    results = run_diagnostic(base_url=args.base_url, timeout_ms=args.timeout_ms)
    failures = [r for r in results if not r.ok]

    print("RUNTIME_DIAGNOSTIC")
    for result in results:
        status = "PASS" if result.ok else "FAIL"
        suffix = f" | {result.note}" if result.note else ""
        print(f"{status} | {result.name}{suffix}")
    print("---")
    print(f"TOTAL {len(results)} PASS {len(results) - len(failures)} FAIL {len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
