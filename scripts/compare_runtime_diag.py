#!/usr/bin/env python
"""Runtime diagnostics for Research Lab Compare shell."""

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

        page.goto(base_url + "#section-research-lab", wait_until="domcontentloaded", timeout=timeout_ms)
        try:
            page.locator(".ca-lab__tab[data-pane='compare']").first.click(timeout=timeout_ms, force=True)
            page.evaluate("() => { if (window.showResearchSubtab) window.showResearchSubtab('compare'); }")
            check("compare subtab clickable", True)
        except PWTimeout:
            check("compare subtab clickable", False, "compare tab not clickable")
            browser.close()
            return results

        try:
            page.wait_for_selector("#rlCompareRoot .rl-compare-h2h", timeout=timeout_ms)
            check("compare shell renders", True)
        except PWTimeout:
            check("compare shell renders", False, "compare shell not rendered")
            browser.close()
            return results

        mode_chips = page.locator("#rlCompareRoot .rl-compare-mode-btn").count()
        check("mode chips present", mode_chips >= 2, f"chips={mode_chips}")

        empty_text = page.locator("#rlCompareOutput .rl-empty").first.text_content() or ""
        check("safe empty state present", "Select entities" in empty_text, empty_text.strip()[:80])

        # Try a real compare run with lineup vs lineup defaults.
        sel_a = page.locator("#rlCmpAKey")
        sel_b = page.locator("#rlCmpBKey")
        if sel_a.count() and sel_b.count():
            try:
                page.wait_for_timeout(400)
                options_a = sel_a.locator("option").count()
                options_b = sel_b.locator("option").count()
                if options_a > 2 and options_b > 3:
                    va = sel_a.locator("option").nth(1).get_attribute("value")
                    vb = sel_b.locator("option").nth(2).get_attribute("value")
                    if va and vb:
                        sel_a.select_option(value=va)
                        sel_b.select_option(value=vb)
                        page.locator("#rlCmpRun").first.click(timeout=timeout_ms)
                        page.wait_for_selector("#rlCompareOutput .rl-compare-output", timeout=timeout_ms)
                        check("compare run renders output", True)
                    else:
                        check("compare run renders output", False, "empty option values")
                else:
                    check("compare run renders output", False, f"insufficient options: A={options_a},B={options_b}")
            except Exception as exc:  # noqa: BLE001
                check("compare run renders output", False, str(exc))
        else:
            check("compare run renders output", False, "compare selectors not found")

        if page_errors:
            check("no uncaught page errors", False, " | ".join(page_errors[:3]))
        else:
            check("no uncaught page errors", True)
        if console_errors:
            noisy = [
                e for e in console_errors
                if not (
                    e.startswith("[LINEUPS]")
                    or e.startswith("[MATCHUPS]")
                    or "429" in e
                    or ("Failed to load resource" in e and "429" in e)
                )
            ]
            if noisy:
                check("no console errors", False, " | ".join(noisy[:4]))
            else:
                check("no console errors", True)
        else:
            check("no console errors", True)

        browser.close()

    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Compare shell runtime diagnostics.")
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8765/dashboard/chase_analytics_mlb_oem_v7.html",
    )
    parser.add_argument("--timeout-ms", type=int, default=45000)
    args = parser.parse_args()

    results = run_diagnostic(args.base_url, args.timeout_ms)
    failures = [r for r in results if not r.ok]
    print("COMPARE_RUNTIME_DIAGNOSTIC")
    for r in results:
        print(("PASS" if r.ok else "FAIL") + " | " + r.name + ((" | " + r.note) if r.note else ""))
    print("---")
    print(f"TOTAL {len(results)} PASS {len(results) - len(failures)} FAIL {len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())

