#!/usr/bin/env python
"""Platform-wide UI/runtime smoke diagnostics."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from typing import List

from playwright.sync_api import TimeoutError as PWTimeout
from playwright.sync_api import sync_playwright


@dataclass
class Check:
    page: str
    name: str
    ok: bool
    note: str = ""


PAGES = [
    "dashboard/chase_analytics_mlb_oem_v7.html",
    "dashboard/team_rankings.html?hubdebug=1",
    "dashboard/matchup_compare.html",
    "dashboard/team_profile.html",
    "dashboard/pitcher_profile.html",
    "dashboard/batter_profile.html",
    "dashboard/bullpen_report.html",
    "dashboard/glossary.html",
]

OPTIONAL_LOCAL_CSVS = (
    "/data/sp_vs_LHH.csv",
    "/data/sp_vs_RHH.csv",
    "/data/sp_standard.csv",
    "/data/sp_gamelog.csv",
)


def run(base_url: str, timeout_ms: int, channel: str = "") -> List[Check]:
    results: List[Check] = []

    def add(page: str, name: str, ok: bool, note: str = "") -> None:
        results.append(Check(page=page, name=name, ok=bool(ok), note=note))

    with sync_playwright() as p:
        launch_kwargs = {"headless": True}
        if channel:
            launch_kwargs["channel"] = channel
        browser = p.chromium.launch(**launch_kwargs)
        for rel in PAGES:
            page = browser.new_page()
            page.set_default_timeout(timeout_ms)
            url = f"{base_url.rstrip('/')}/{rel.lstrip('/')}"
            page_name = rel.split("?")[0]
            console_errors: List[str] = []
            page_errors: List[str] = []

            def capture_console(msg) -> None:
                if msg.type != "error":
                    return
                location = msg.location or {}
                source = location.get("url", "")
                console_errors.append(f"{msg.text} [{source}]" if source else msg.text)

            page.on("console", capture_console)
            page.on("pageerror", lambda err: page_errors.append(str(err)))

            try:
                page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
                add(page_name, "loads", True)
            except PWTimeout:
                add(page_name, "loads", False, "timeout on domcontentloaded")
                continue

            # Rule: no grid overlays on body pseudo elements
            grid_present = page.evaluate(
                """() => {
                    const b = document.body;
                    if (!b) return false;
                    const bef = getComputedStyle(b, '::before');
                    const aft = getComputedStyle(b, '::after');
                    const sig = (s) => String(s || '').toLowerCase();
                    const hasGrid = (cs) => {
                      const bg = sig(cs.backgroundImage);
                      const content = sig(cs.content);
                      return content !== 'none' && (
                        bg.includes('repeating-linear-gradient') ||
                        (bg.includes('linear-gradient') && bg.includes('1px'))
                      );
                    };
                    return hasGrid(bef) || hasGrid(aft);
                }"""
            )
            add(page_name, "no grid overlay", not grid_present, "grid-like pseudo background detected" if grid_present else "")

            # Rule: no black-looking text in major headings (skip gradient-clip titles)
            dark_heading = page.evaluate(
                r"""() => {
                    const nodes = Array.from(document.querySelectorAll('h1, .title, .platform-title, .thm-title, .lv-family-name'));
                    const luminance = (rgb) => {
                      const s = String(rgb || '').trim().toLowerCase();
                      if (!s || s === 'transparent') return 255;
                      const nums = s.replace(/[^\d.,]/g, ' ').trim().split(/\s+/).filter(Boolean).map(Number);
                      if (nums.length === 4 && nums[3] === 0) return 255;
                      if (nums.length < 3) return 255;
                      const r = nums[0], g = nums[1], b = nums[2];
                      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
                    };
                    for (const n of nodes) {
                      const cs = getComputedStyle(n);
                      const clip = cs.backgroundClip || cs.webkitBackgroundClip || '';
                      if (clip === 'text') continue;
                      const color = cs.color || '';
                      const fill = cs.webkitTextFillColor || '';
                      const fillIsVisible = !!fill && fill !== 'transparent' && !/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/i.test(fill);
                      if (luminance(color) < 40 || (fillIsVisible && luminance(fill) < 40)) {
                        return `${n.tagName}.${n.className || ''}`.trim();
                      }
                    }
                    return '';
                }"""
            )
            add(page_name, "no black heading text", dark_heading == "", dark_heading)

            # Trends-specific logo shape check
            if "chase_analytics_mlb_oem_v7.html" in page_name:
                try:
                    page.wait_for_selector("#subtab-trends, [data-subtab='trends']", timeout=4000)
                    page.click("#subtab-trends, [data-subtab='trends']")
                    page.wait_for_timeout(900)
                except Exception:
                    pass
                thm_logo_radius = page.evaluate(
                    """() => {
                        const logo = document.querySelector('.thm-team-logo');
                        if (!logo) return 'missing';
                        return getComputedStyle(logo).borderRadius || '';
                    }"""
                )
                logo_ok = thm_logo_radius in ("0px", "0", "")
                if thm_logo_radius == "missing":
                    logo_ok = True
                add(page_name, "trends logos unframed", logo_ok, f"borderRadius={thm_logo_radius}")

            add(page_name, "no page errors", len(page_errors) == 0, " | ".join(page_errors[:3]))
            hard_console = [
                e for e in console_errors
                if any(sig in e for sig in ("ReferenceError", "SyntaxError", "TypeError", "Failed to load resource"))
                and not ("404" in e and any(path in e for path in OPTIONAL_LOCAL_CSVS))
            ]
            add(page_name, "no console errors", len(hard_console) == 0, " | ".join(hard_console[:4]))
            page.close()

        browser.close()

    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Run platform-wide UI diagnostics.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8765")
    parser.add_argument("--timeout-ms", type=int, default=30000)
    parser.add_argument(
        "--channel",
        default="",
        help='browser channel, e.g. "chrome" for a locally installed Google Chrome',
    )
    args = parser.parse_args()

    checks = run(args.base_url, args.timeout_ms, args.channel)
    fail = [c for c in checks if not c.ok]
    print("PLATFORM_UI_DIAGNOSTIC")
    for c in checks:
        line = ("PASS" if c.ok else "FAIL") + f" | {c.page} | {c.name}"
        if c.note:
            line += f" | {c.note}"
        print(line)
    print("---")
    print(f"TOTAL {len(checks)} PASS {len(checks) - len(fail)} FAIL {len(fail)}")
    return 1 if fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
