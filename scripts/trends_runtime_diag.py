#!/usr/bin/env python
"""Runtime diagnostics for Trends Heat Map behavior."""

from __future__ import annotations

import argparse
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

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_default_timeout(timeout_ms)
        console_errors: List[str] = []
        page_errors: List[str] = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda err: page_errors.append(str(err)))

        page.goto(base_url, wait_until="domcontentloaded", timeout=timeout_ms)
        try:
            # Open the research section where Trends Heat Map lives.
            page.goto(base_url + "#section-research-lab", wait_until="domcontentloaded", timeout=timeout_ms)
            trends_tab = page.locator(".ca-lab__tab[data-pane='trends']").first
            trends_tab.click(timeout=timeout_ms, force=True)
            check("trends subtab clickable", True)
        except PWTimeout:
            check("trends subtab clickable", False, "trends research tab not found/clickable")
            browser.close()
            return results

        try:
            page.wait_for_selector(".thm-wrap", timeout=timeout_ms)
            page.wait_for_selector(".thm-table", timeout=timeout_ms)
            check("trends heatmap renders", True)
        except PWTimeout:
            check("trends heatmap renders", False, "thm-wrap/thm-table did not render")
            browser.close()
            return results

        metric_keys = ["winPct", "f5WinPct", "pitchScoreFaced", "rcv", "obr"]
        for key in metric_keys:
            sel = f'.thm-pill[data-a="metric"][data-v="{key}"]'
            try:
                page.click(sel, timeout=timeout_ms)
                page.wait_for_timeout(300)
                check(f"metric {key} clickable", True)
            except PWTimeout:
                check(f"metric {key} clickable", False, "pill not clickable")
                continue

            stat = page.evaluate(
                """() => {
                    const cells = Array.from(document.querySelectorAll('.thm-cell'));
                    const dataCells = cells.filter(c => !c.classList.contains('no-data'));
                    const numeric = dataCells.filter(c => /-?\\d+(?:\\.\\d+)?/.test(c.textContent || ''));
                    return { total: cells.length, data: dataCells.length, numeric: numeric.length };
                }"""
            )
            ok = bool(stat["total"] > 0 and stat["data"] > 0 and stat["numeric"] > 0)
            check(f"metric {key} has populated cells", ok, f'total={stat["total"]}, data={stat["data"]}, numeric={stat["numeric"]}')

        hand_keys = ["rhp", "lhp", "both"]
        for key in hand_keys:
            sel = f'.thm-pill[data-a="hand"][data-v="{key}"]'
            try:
                page.click(sel, timeout=timeout_ms)
                page.wait_for_timeout(220)
                active = page.locator(f'{sel}.active').count() > 0
                check(f"hand {key} toggle works", active)
            except PWTimeout:
                check(f"hand {key} toggle works", False, "pill not clickable")

        loc_keys = ["home", "away", "both"]
        for key in loc_keys:
            sel = f'.thm-pill[data-a="loc"][data-v="{key}"]'
            try:
                page.click(sel, timeout=timeout_ms)
                page.wait_for_timeout(220)
                active = page.locator(f'{sel}.active').count() > 0
                check(f"location {key} toggle works", active)
            except PWTimeout:
                check(f"location {key} toggle works", False, "pill not clickable")

        if page_errors:
            check("no uncaught page errors", False, " | ".join(page_errors[:3]))
        else:
            check("no uncaught page errors", True)
        hard_console = [
            e for e in console_errors
            if not (
                e.startswith("[LINEUPS]")
                or e.startswith("[MATCHUPS]")
                or "429" in e
                or ("Failed to load resource" in e and "429" in e)
            )
        ]
        if hard_console:
            check("no console errors", False, " | ".join(hard_console[:4]))
        else:
            check("no console errors", True)

        browser.close()

    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Trends Heat Map runtime diagnostics.")
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8765/dashboard/chase_analytics_mlb_oem_v7.html",
        help="Full URL to OEM dashboard page.",
    )
    parser.add_argument("--timeout-ms", type=int, default=45000)
    args = parser.parse_args()

    results = run_diagnostic(args.base_url, args.timeout_ms)
    failures = [r for r in results if not r.ok]
    print("TRENDS_RUNTIME_DIAGNOSTIC")
    for r in results:
        print(("PASS" if r.ok else "FAIL") + " | " + r.name + ((" | " + r.note) if r.note else ""))
    print("---")
    print(f"TOTAL {len(results)} PASS {len(results) - len(failures)} FAIL {len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())

