#!/usr/bin/env python
"""375px mobile audit — horizontal overflow & tap-target check (design contract §8.8).

The dashboards are dense desktop layouts; the contract makes 375px a first-class
viewport (no horizontal overflow, tap targets >= 44px). A manual eyeball doesn't
scale and silently regresses. This harness loads each real page at an iPhone-class
375x812 viewport and measures, per page:

  * horizontal overflow: documentElement.scrollWidth vs innerWidth, plus the worst
    offending elements (the ones whose right edge spills past the viewport), so a
    fix has a concrete target instead of "something is wide".
  * undersized tap targets: interactive elements rendered smaller than 44px.

Two modes:
  --report  (default)  print findings, ALWAYS exit 0 — safe to run in CI without
                       blocking deploys on the current (pre-fix) state.
  --strict             exit 1 if any audited page overflows — flip to this once the
                       pages are verified clean so mobile can't silently regress.

Needs a running static server (same as the runtime smoke):
    python -m http.server 8765 &
    python scripts/mobile_overflow_audit.py --base-url http://127.0.0.1:8765
"""
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from typing import List

from playwright.sync_api import sync_playwright

# The real, standalone pages a phone user actually lands on. Fragments (chase_nav.html)
# and redirect stubs (matchup_sheet.html) are intentionally excluded.
DEFAULT_PAGES = [
    "dashboard/chase_analytics_mlb_oem_v7.html",
    "dashboard/team_rankings.html?scope=team&team=NYY&family=scoring&hand=r&window=L30&loc=home",
    "dashboard/matchup_compare.html",
    "dashboard/batter_profile.html",
    "dashboard/pitcher_profile.html",
    "dashboard/bullpen_report.html",
    "dashboard/team_profile.html",
    "dashboard/glossary.html",
    "dashboard/index.html",
]

VIEWPORT = {"width": 375, "height": 812}
TAP_MIN = 44
SETTLE_MS = 1800

_OVERFLOW_JS = """
() => {
  const vw = window.innerWidth;
  const docW = document.documentElement.scrollWidth;
  const offenders = [];
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 1) {
      const id = el.id ? '#' + el.id : '';
      const cls = (el.className && typeof el.className === 'string')
        ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
      offenders.push({ sel: el.tagName.toLowerCase() + id + cls, right: Math.round(r.right) });
    }
  }
  offenders.sort((a, b) => b.right - a.right);
  const seen = new Set();
  const top = [];
  for (const o of offenders) { if (!seen.has(o.sel)) { seen.add(o.sel); top.push(o); } if (top.length >= 6) break; }
  return { vw, docW, overflow: Math.max(0, docW - vw), offenders: top };
}
"""

_TAP_JS = """
(min) => {
  const sels = 'a,button,[role=button],input,select,.chase-nav-link';
  const small = [];
  for (const el of document.querySelectorAll(sels)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;       // hidden/collapsed
    if (r.height < min || r.width < min) {
      const id = el.id ? '#' + el.id : '';
      small.push({ sel: el.tagName.toLowerCase() + id, w: Math.round(r.width), h: Math.round(r.height) });
    }
  }
  return small.slice(0, 8);
}
"""


@dataclass
class PageAudit:
    path: str
    overflow: int = 0
    vw: int = 0
    doc_w: int = 0
    offenders: List[dict] = field(default_factory=list)
    small_taps: List[dict] = field(default_factory=list)
    error: str = ""


def audit(base_url: str, pages: List[str], timeout_ms: int) -> List[PageAudit]:
    results: List[PageAudit] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport=VIEWPORT, device_scale_factor=2, is_mobile=True)
        page = ctx.new_page()
        for path in pages:
            res = PageAudit(path=path)
            url = f"{base_url.rstrip('/')}/{path.lstrip('/')}"
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
                page.wait_for_timeout(SETTLE_MS)
                data = page.evaluate(_OVERFLOW_JS)
                res.vw, res.doc_w = data["vw"], data["docW"]
                res.overflow, res.offenders = data["overflow"], data["offenders"]
                res.small_taps = page.evaluate(_TAP_JS, TAP_MIN)
            except Exception as exc:  # a page that won't load is itself a finding
                res.error = str(exc).splitlines()[0][:200]
            results.append(res)
        browser.close()
    return results


def main() -> int:
    ap = argparse.ArgumentParser(description="375px horizontal-overflow / tap-target audit.")
    ap.add_argument("--base-url", default="http://127.0.0.1:8765")
    ap.add_argument("--timeout-ms", type=int, default=45000)
    ap.add_argument("--strict", action="store_true", help="exit 1 if any page overflows")
    ap.add_argument("--pages", nargs="*", default=DEFAULT_PAGES)
    args = ap.parse_args()

    results = audit(args.base_url, args.pages, args.timeout_ms)

    print("MOBILE_375_AUDIT")
    overflowing = 0
    for r in results:
        name = r.path.split("?", 1)[0].split("/")[-1]
        if r.error:
            print(f"ERROR | {name} | {r.error}")
            continue
        status = "OVERFLOW" if r.overflow > 0 else "ok"
        if r.overflow > 0:
            overflowing += 1
        print(f"{status:8} | {name} | scrollWidth={r.doc_w} vw={r.vw} overflow={r.overflow}px")
        for o in r.offenders:
            print(f"         └ spills to {o['right']}px: {o['sel']}")
        for t in r.small_taps:
            print(f"         └ tap<44: {t['sel']} {t['w']}x{t['h']}")
    print("---")
    print(f"PAGES {len(results)} | OVERFLOWING {overflowing}")

    if args.strict and overflowing:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
