#!/usr/bin/env python3
"""Capture content-engine artifact selectors (NOW shots). Port 8766. Screenshot twice."""
from __future__ import annotations

import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "artifact-parity"
BASE = "http://127.0.0.1:8766"
ANIM = "*{animation:none!important;transition:none!important}"
HIDE = ".chase-header,.chase-mobile-menu,.chase-mobile-overlay,.mlbma-loading,.dash-signup{display:none!important}"

# Registry keys from outputs/content_engine.py ARTIFACTS (local dashboard only).
TARGETS = [
    {"key": "team_rankings", "url": f"{BASE}/dashboard/render/team_rankings.html?family=scoring&window=L30",
     "selector": ".lv-table", "eval": None, "wait_ms": 25000},
        {"key": "starters_rankings", "url": f"{BASE}/dashboard/render/pitcher_intelligence.html?capture=1&hubdebug=1",
     "selector": ".pl-rank-table", "eval": "if (window.showResearchSubtab) window.showResearchSubtab('pitching');",
     "wait_ms": 40000},
    {"key": "starters_rankings_index", "url": f"{BASE}/dashboard/index.html#section-research-lab",
     "selector": ".pl-rank-table",
     "eval": "if (window.syncDashboardView) window.syncDashboardView(); if (window.showResearchSubtab) window.showResearchSubtab('pitching');",
     "wait_ms": 28000, "optional": True},
    {"key": "card", "url": f"{BASE}/dashboard/index.html#section-matchups-hero",
     "selector": ".hero-matchup-card", "eval": "if (window.syncDashboardView) window.syncDashboardView();",
     "wait_ms": 25000},
    {"key": "banner", "url": None, "selector": ".mc-header", "eval": None, "wait_ms": 40000},
    {"key": "radar", "url": None, "selector": ".mc-radar-duo", "eval": None, "wait_ms": 40000},
    {"key": "offense", "url": None, "selector": ".mc-os-duo", "eval": None, "wait_ms": 40000},
    {"key": "pitcher", "url": None, "selector": ".mc-lvp-section",
     "params": "compare=lvP&lvpLineup=away&lvpPitcher=home", "wait_ms": 40000},
    {"key": "bullpen", "url": None, "selector": ".mc-lvb-section",
     "params": "compare=lvB&lvbLineup=away&lvbBp=home", "wait_ms": 40000},
]


def shot(page, selector: str, dest: Path) -> dict:
    page.add_style_tag(content=ANIM)
    page.add_style_tag(content=HIDE)
    loc = page.locator(selector).first
    loc.scroll_into_view_if_needed(timeout=8000)
    page.wait_for_timeout(400)
    loc.screenshot(path=str(dest), type="png", timeout=20000)
    box = loc.bounding_box() or {}
    return {"w": box.get("width"), "h": box.get("height"), "bytes": dest.stat().st_size}


def first_game(page) -> tuple[str, str] | None:
    pair = page.evaluate(
        """() => {
          const el = document.querySelector('.hero-matchup-card[data-away][data-home]');
          if (el) return [el.getAttribute('data-away'), el.getAttribute('data-home')];
          return null;
        }"""
    )
    return (pair[0], pair[1]) if pair else None


def compare_url(page, away: str, home: str) -> str:
    url = f"{BASE}/dashboard/matchup_compare.html?away={away}&home={home}"
    page.goto(url, wait_until="domcontentloaded", timeout=45000)
    page.add_style_tag(content=ANIM)
    try:
        page.wait_for_selector(".mc-header, .mc-slate-pick", timeout=20000)
    except Exception:
        pass
    if page.locator(".mc-header").count():
        return url
    pick = page.locator(".mc-slate-pick").first
    if pick.count():
        href = pick.get_attribute("href") or ""
        if href:
            if href.startswith("http"):
                return href
            if href.startswith("/"):
                return BASE + href
            return f"{BASE}/dashboard/{href}"
    return url


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    notes = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1100}, device_scale_factor=2)
        page.goto(f"{BASE}/dashboard/index.html#section-matchups-hero", wait_until="domcontentloaded", timeout=45000)
        try:
            page.wait_for_selector(".hero-matchup-card", timeout=25000)
        except Exception as exc:
            notes.append(f"index matchup cards: {exc}")
        game = first_game(page)
        away, home = (game[0], game[1]) if game else ("NYY", "BOS")
        notes.append(f"hero card pair: {away}@{home}" + ("" if game else " (fallback)"))
        resolved = compare_url(page, away, home)
        if "hubdebug=" not in resolved:
            joiner = "&" if "?" in resolved else "?"
            resolved = resolved + joiner + "hubdebug=1&snapshot=1"
        notes.append(f"compare url: {resolved}")

        results = []
        for spec in TARGETS:
            url = spec["url"]
            if url is None:
                q = spec.get("params", "")
                joiner = "&" if "?" in resolved else "?"
                url = resolved + (joiner + q if q else "")
            rec = {"key": spec["key"], "url": url, "selector": spec["selector"], "ok": False, "error": ""}
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=45000)
                page.add_style_tag(content=ANIM)
                if spec.get("eval"):
                    page.evaluate(f"() => {{ {spec['eval']} }}")
                    page.wait_for_timeout(2500)
                try:
                    page.wait_for_selector(spec["selector"], timeout=min(spec["wait_ms"], 12000), state="attached")
                except Exception:
                    pick = page.locator(".mc-slate-pick").first
                    if pick.count():
                        href = pick.get_attribute("href") or ""
                        if href:
                            if href.startswith("/"):
                                href = BASE + href
                            elif not href.startswith("http"):
                                href = f"{BASE}/dashboard/{href}"
                            if "hubdebug=" not in href:
                                href += ("&" if "?" in href else "?") + "hubdebug=1"
                            page.goto(href, wait_until="domcontentloaded", timeout=45000)
                            page.add_style_tag(content=ANIM)
                            rec["url"] = href
                            notes.append(f"{spec['key']} followed slate pick {href}")
                    page.wait_for_selector(spec["selector"], timeout=spec["wait_ms"], state="attached")
                page.wait_for_timeout(800)
                a1 = OUT / f"{spec['key']}-a.png"
                a2 = OUT / f"{spec['key']}-b.png"
                rec["pass1"] = shot(page, spec["selector"], a1)
                page.wait_for_timeout(350)
                rec["pass2"] = shot(page, spec["selector"], a2)
                rec["ok"] = True
            except Exception as exc:
                rec["error"] = str(exc).split("\n")[0]
                if spec.get("optional"):
                    rec["optional"] = True
            results.append(rec)
        browser.close()

    (OUT / "capture-log.json").write_text(json.dumps({"notes": notes, "results": results}, indent=2), encoding="utf-8")
    print(json.dumps({"notes": notes, "results": results}, indent=2))
    failed = [r for r in results if not r["ok"] and not r.get("optional")]
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
