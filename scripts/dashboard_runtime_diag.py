#!/usr/bin/env python
"""Runtime diagnostics for unified lineup view."""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from typing import List, Optional

from playwright.sync_api import TimeoutError as PWTimeout
from playwright.sync_api import sync_playwright


@dataclass
class CheckResult:
    name: str
    ok: bool
    note: str = ""


def _parse_num(text: str) -> Optional[float]:
    m = re.search(r"-?\d+(?:\.\d+)?", text or "")
    return float(m.group(0)) if m else None


def run_diagnostic(base_url: str, timeout_ms: int) -> List[CheckResult]:
    results: List[CheckResult] = []

    def check(name: str, ok: bool, note: str = "") -> None:
        results.append(CheckResult(name=name, ok=bool(ok), note=note))

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        console_errors: List[str] = []
        page_errors: List[str] = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda err: page_errors.append(str(err)))
        page.goto(base_url, wait_until="domcontentloaded", timeout=timeout_ms)

        def click(sel: str) -> None:
            loc = page.locator(sel).first
            loc.scroll_into_view_if_needed(timeout=timeout_ms)
            loc.click(timeout=timeout_ms, force=True)

        def card_value(label: str) -> Optional[float]:
            js = """
            (lab) => {
              const cards = [...document.querySelectorAll('.lv-card')];
              const hit = cards.find(c => (c.querySelector('.lv-card-lab')?.textContent || '').trim().toLowerCase() === lab.toLowerCase());
              if (!hit) return null;
              return hit.querySelector('.lv-card-val')?.textContent || null;
            }
            """
            raw = page.evaluate(js, label)
            return _parse_num(raw or "")

        # Basic controls and model boot.
        # The lineup view renders its family cards only after its async data load
        # resolves, so wait for them before asserting their presence (otherwise these
        # checks race ahead of render and fail spuriously).
        try:
            page.wait_for_selector('[data-a="family"]', state="attached", timeout=timeout_ms)
        except PWTimeout:
            pass
        check("family scoring control", page.locator('[data-a="family"][data-v="scoring"]').count() == 1)
        check("family difficulty control", page.locator('[data-a="family"][data-v="difficulty"]').count() == 1)
        check("family status control", page.locator('[data-a="family"][data-v="status"]').count() == 1)
        check("scope controls removed", page.locator('[data-a="scope"]').count() == 0)

        try:
            page.wait_for_function("() => !!window.LineupModel && !!window.LineupView", timeout=timeout_ms)
            check("LineupModel initialized", True)
        except PWTimeout:
            check("LineupModel initialized", False, "model did not initialize")

        try:
            page.wait_for_function(
                "() => !!document.querySelector('.lv-table tbody tr.lv-row-team')",
                timeout=timeout_ms,
            )
            check("table loaded", True)
        except PWTimeout:
            check("table loaded", False, "no lineup table rows rendered")

        # Context-driven value changes (model-level assertions)
        click('[data-a="family"][data-v="scoring"]')
        page.wait_for_timeout(250)
        click('[data-a="f"][data-k="window"][data-v="YTD"]')
        page.wait_for_timeout(250)

        hand_diff_count = page.evaluate(
            """async () => {
                const base = {location:'all', pitcher:'both', batSide:'both', segment:'full', window:'YTD'};
                const r = await window.LineupModel.rankAll({...base, hand:'r'}, 'scoring');
                const l = await window.LineupModel.rankAll({...base, hand:'l'}, 'scoring');
                const lm = {};
                (l || []).forEach(x => { lm[x.t] = x; });
                let diff = 0;
                (r || []).forEach(x => {
                  const y = lm[x.t];
                  if (!y) return;
                  const a = Number(x.wrc), b = Number(y.wrc);
                  if (!isNaN(a) && !isNaN(b) && Math.abs(a - b) > 0.01) diff += 1;
                });
                return diff;
            }"""
        )
        check("hand changes model values", hand_diff_count > 0, f"teams changed={hand_diff_count}")

        window_diff_count = page.evaluate(
            """async () => {
                const base = {hand:'both', location:'all', pitcher:'both', batSide:'both', segment:'full'};
                const ytd = await window.LineupModel.rankAll({...base, window:'YTD'}, 'scoring');
                const l7 = await window.LineupModel.rankAll({...base, window:'L7'}, 'scoring');
                let diff = 0;
                (ytd || []).forEach(x => {
                  const y = (l7 || []).find(z => z.t === x.t);
                  if (!y) return;
                  const a = Number(x.osi), b = Number(y.osi);
                  if (!isNaN(a) && !isNaN(b) && Math.abs(a - b) > 0.01) diff += 1;
                });
                return diff;
            }"""
        )
        check("window changes model values", window_diff_count > 0, f"teams changed={window_diff_count}")

        location_diff_count = page.evaluate(
            """async () => {
                const base = {hand:'both', pitcher:'both', batSide:'both', segment:'full', window:'YTD'};
                const home = await window.LineupModel.rankAll({...base, location:'home'}, 'scoring');
                const away = await window.LineupModel.rankAll({...base, location:'away'}, 'scoring');
                let diff = 0;
                (home || []).forEach(x => {
                  const y = (away || []).find(z => z.t === x.t);
                  if (!y) return;
                  const a = Number(x.woba), b = Number(y.woba);
                  if (!isNaN(a) && !isNaN(b) && Math.abs(a - b) > 0.0001) diff += 1;
                });
                return diff;
            }"""
        )
        check("location changes model values", location_diff_count > 0, f"teams changed={location_diff_count}")

        pitch_diff_count = page.evaluate(
            """async () => {
                const base = {hand:'both', location:'all', batSide:'both', segment:'full', window:'YTD'};
                const sp = await window.LineupModel.rankAll({...base, pitcher:'sp'}, 'scoring');
                const rp = await window.LineupModel.rankAll({...base, pitcher:'rp'}, 'scoring');
                const rm = {};
                (rp || []).forEach(x => { rm[x.t] = x; });
                let diff = 0;
                (sp || []).forEach(x => {
                  const y = rm[x.t];
                  if (!y) return;
                  const a = Number(x.rcv), b = Number(y.rcv);
                  if (!isNaN(a) && !isNaN(b) && Math.abs(a - b) > 0.01) diff += 1;
                });
                return diff;
            }"""
        )
        check("pitch changes model values", pitch_diff_count > 0, f"teams changed={pitch_diff_count}")

        q = page.evaluate("location.search")
        check("scope param not in url", "scope=" not in q, q)
        check("team param not in url", "team=" not in q, q)

        if page_errors:
            check("no uncaught page errors", False, " | ".join(page_errors[:3]))
        else:
            check("no uncaught page errors", True)
        noisy = [
            e for e in console_errors
            if not ("429" in e or "Today_Games HTTP 429" in e or "Failed to load resource" in e and "429" in e)
        ]
        if noisy:
            check("no console errors", False, " | ".join(noisy[:5]))
        else:
            check("no console errors", True)

        browser.close()

    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Run runtime diagnostics on team_rankings lineup view.")
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8765/dashboard/team_rankings.html?hubdebug=1",
        help="Full URL to the team_rankings page.",
    )
    parser.add_argument("--timeout-ms", type=int, default=45000)
    args = parser.parse_args()

    results = run_diagnostic(args.base_url, args.timeout_ms)
    failures = [r for r in results if not r.ok]
    print("RUNTIME_DIAGNOSTIC")
    for r in results:
        print(("PASS" if r.ok else "FAIL") + " | " + r.name + ((" | " + r.note) if r.note else ""))
    print("---")
    print(f"TOTAL {len(results)} PASS {len(results) - len(failures)} FAIL {len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
