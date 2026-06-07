#!/usr/bin/env python
"""Detailed Team Rankings load timing breakdown."""
from __future__ import annotations

import json
import sys
import time

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8765/team_rankings.html"


def run_once(clear_storage: bool) -> dict:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        if clear_storage:
            context.clear_cookies()
            context.add_init_script(
                "try { sessionStorage.clear(); localStorage.clear(); } catch (e) {}"
            )
        page = context.new_page()
        marks: list[dict] = []

        def on_console(msg):
            text = msg.text or ""
            if text.startswith("[PERF]") or "LineupView" in text or "LineupModel" in text:
                marks.append({"t": time.time(), "type": msg.type, "text": text})

        page.on("console", on_console)
        page.add_init_script(
            """
            window.__perfMarks = [];
            ['LineupView', 'LineupModel', 'fetchSheetTab'].forEach(function(k) {
              window.__perfMarks.push({ label: 'init', t: performance.now() });
            });
            """
        )

        t0 = time.time()
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        dom_s = time.time() - t0

        try:
            page.wait_for_function(
                "() => document.getElementById('hubLoading') && document.getElementById('hubLoading').classList.contains('hide')",
                timeout=20000,
            )
            overlay_s = time.time() - t0
        except Exception:
            overlay_s = None

        try:
            page.wait_for_function("() => window.__lineupViewReady === true", timeout=20000)
            ready_s = time.time() - t0
        except Exception:
            ready_s = None

        try:
            page.wait_for_selector(".lv-table tbody tr", timeout=20000)
            table_s = time.time() - t0
        except Exception:
            table_s = None

        data = page.evaluate(
            """async () => {
              const nav = performance.getEntriesByType('navigation')[0] || {};
              const resources = performance.getEntriesByType('resource')
                .filter(r => r.initiatorType === 'script' || r.initiatorType === 'fetch' || r.name.includes('.css'))
                .map(r => ({
                  name: r.name.split('/').pop().split('?')[0],
                  type: r.initiatorType,
                  dur: Math.round(r.duration),
                  start: Math.round(r.startTime)
                }))
                .sort((a, b) => b.dur - a.dur)
                .slice(0, 20);
              return {
                rows: document.querySelectorAll('.lv-table tbody tr').length,
                ready: !!window.__lineupViewReady,
                mounted: !!window.__lineupViewMounted,
                family: (new URLSearchParams(location.search).get('family')) || 'surface',
                prefetchKeys: Object.keys(window.__MLBMA_TAB_PREFETCH || {}),
                storeBuilt: !!(window.LineupModel && window.MLBMASharedMatchup),
                bodySnippet: ((document.querySelector('.lv-body') || {}).textContent || '').slice(0, 120),
                domInteractive: Math.round(nav.domInteractive || 0),
                loadEventEnd: Math.round(nav.loadEventEnd || 0),
                resources
              };
            }"""
        )
        browser.close()

    return {
        "cold": clear_storage,
        "dom_s": dom_s,
        "overlay_s": overlay_s,
        "ready_s": ready_s,
        "table_s": table_s,
        "data": data,
        "console_marks": marks[:15],
    }


def main() -> int:
    print("Team Rankings perf diagnostic")
    print("URL:", URL)
    results = [run_once(True), run_once(False)]
    for r in results:
        label = "COLD" if r["cold"] else "WARM"
        print(f"\n=== {label} ===")
        print(f"  domcontentloaded: {r['dom_s']:.2f}s")
        print(f"  overlay hidden:   {r['overlay_s']:.2f}s" if r["overlay_s"] else "  overlay hidden:   TIMEOUT")
        print(f"  __lineupViewReady:{r['ready_s']:.2f}s" if r["ready_s"] else "  __lineupViewReady:TIMEOUT")
        print(f"  table rows:       {r['table_s']:.2f}s" if r["table_s"] else "  table rows:       TIMEOUT")
        d = r["data"]
        print(f"  rows={d.get('rows')} family={d.get('family')} body={d.get('bodySnippet')!r}")
        print(f"  nav domInteractive={d.get('domInteractive')}ms loadEventEnd={d.get('loadEventEnd')}ms")
        print("  slowest resources:")
        for res in (d.get("resources") or [])[:10]:
            print(f"    {res['dur']:4d}ms start={res['start']:4d}ms [{res['type']}] {res['name']}")

    cold = results[0]
    warm = results[1]
    issues = []
    if cold.get("table_s") and cold["table_s"] > 5.0:
        issues.append(f"Cold table paint {cold['table_s']:.1f}s exceeds 5s budget")
    if warm.get("table_s") and warm["table_s"] > 3.0:
        issues.append(f"Warm table paint {warm['table_s']:.1f}s exceeds 3s budget")
    if cold["data"].get("rows", 0) < 28:
        issues.append(f"Cold run only {cold['data'].get('rows')} rows")

    if issues:
        print("\nFAIL")
        for item in issues:
            print("-", item)
        return 1
    print("\nPASS (diagnostic complete)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
