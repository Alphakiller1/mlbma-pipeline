#!/usr/bin/env python3
"""End-to-end browser contract for the public matchup experience."""
from __future__ import annotations

import argparse
import re
from dataclasses import dataclass

from playwright.sync_api import sync_playwright


@dataclass
class Result:
    name: str
    ok: bool
    note: str = ""


PROHIBITED = re.compile(
    r"model\s+(?:projection|projected|edge)|projected\s+(?:score|runs|points)|"
    r"win probability|betting edge|confidence score|recommended pick",
    re.I,
)


def run(base_url: str, timeout_ms: int, channel: str = "") -> list[Result]:
    results: list[Result] = []

    def check(name: str, condition: bool, note: str = "") -> None:
        results.append(Result(name, bool(condition), note))

    with sync_playwright() as p:
        kwargs = {"headless": True}
        if channel:
            kwargs["channel"] = channel
        browser = p.chromium.launch(**kwargs)
        for width, expected_columns in ((1440, 3), (1024, 2), (768, 2), (720, 2), (390, 1), (360, 1)):
            context = browser.new_context(viewport={"width": width, "height": 900}, reduced_motion="reduce")
            page = context.new_page()
            page_errors: list[str] = []
            console_errors: list[str] = []
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
            page.goto(base_url.rstrip("/") + "/", wait_until="domcontentloaded", timeout=timeout_ms)
            page.wait_for_selector("#openingMlbSlate .ca-matchup-card", timeout=timeout_ms)
            page.wait_for_selector("#openingNflSlate .ca-matchup-card", timeout=timeout_ms)
            page.wait_for_timeout(300)

            metrics = page.evaluate("""() => {
              const cards = [...document.querySelectorAll('#openingMlbSlate .ca-matchup-card')];
              const grid = document.querySelector('#openingMlbSlate .ca-slate-grid');
              const columns = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
              return {
                overflow: document.documentElement.scrollWidth - innerWidth,
                columns,
                minHeight: cards.length ? Math.min(...cards.map(x => Math.round(x.getBoundingClientRect().height))) : 0,
                maxHeight: cards.length ? Math.max(...cards.map(x => Math.round(x.getBoundingClientRect().height))) : 0,
                crests: document.querySelectorAll('#openingMlbSlate .ca-matchup-card__club img').length,
                brokenCrests: [...document.querySelectorAll('#openingMlbSlate .ca-matchup-card__club img')]
                  .filter(i => i.complete && i.naturalWidth === 0).length,
                crestDensity: (() => {
                  // Crests below the fold are lazy-loaded, so measure the first
                  // one that has actually decoded rather than the first in DOM
                  // order - at 390px the top card can still be pending.
                  const loaded = [...document.querySelectorAll('#openingMlbSlate .ca-matchup-card__club img')]
                    .find(i => i.naturalWidth > 0);
                  if (!loaded) return 0;
                  return loaded.naturalWidth / Math.max(1, Math.round(loaded.getBoundingClientRect().width));
                })(),
                namedTeams: document.querySelectorAll('#openingMlbSlate .ca-matchup-card__name').length,
                bareAbbr: [...document.querySelectorAll('#openingMlbSlate .ca-matchup-card__club')]
                  .filter(c => !c.querySelector('.ca-matchup-card__name')).length,
              };
            }""")
            check(f"{width}px no horizontal overflow", metrics["overflow"] <= 1, str(metrics))
            check(f"{width}px grid columns", metrics["columns"] == expected_columns, str(metrics))
            # 2026-09-10 (owner decision, and what the matchup IA asks for):
            # club identity is the official crest plus the full team name. The
            # crest must actually load, and must be served at enough density to
            # stay sharp on a high-DPR screen.
            check(f"{width}px official crests", metrics["crests"] >= 2, str(metrics))
            check(f"{width}px crests load", metrics["brokenCrests"] == 0, str(metrics))
            check(f"{width}px crest density >= 2x", metrics["crestDensity"] >= 2, str(metrics))
            check(f"{width}px full team names present", metrics["namedTeams"] >= 2, str(metrics))
            check(f"{width}px no bare abbreviation identity", metrics["bareAbbr"] == 0, str(metrics))
            if width >= 1024:
                # The collapsed card gained the starter faces and a four-cell meta strip
                # (2026-09-10 owner request: pitcher/QB images, plus the weather and
                # bullpen the earlier Chase cards carried). The band is re-based on
                # that anatomy - still a real ceiling, so the card cannot sprawl.
                check(f"{width}px collapsed card height", 380 <= metrics["maxHeight"] <= 500, str(metrics))

            main_text = page.locator("main").inner_text()
            match = PROHIBITED.search(main_text)
            check(f"{width}px public copy boundary", match is None, match.group(0) if match else "")
            check(f"{width}px no page errors", not page_errors, " | ".join(page_errors[:3]))
            check(f"{width}px no console errors", not console_errors, " | ".join(console_errors[:3]))

            expanders = page.locator("#openingMlbSlate .ca-matchup-card__expand-btn")
            check(f"{width}px expand controls", expanders.count() >= 2)
            if expanders.count() >= 2:
                expanders.nth(0).focus()
                expanders.nth(0).press("Enter")
                check(f"{width}px first expansion opens", expanders.nth(0).get_attribute("aria-expanded") == "true")
                expanders.nth(1).click()
                open_count = page.locator("#openingMlbSlate .ca-matchup-card.is-expanded").count()
                check(f"{width}px one expansion at a time", open_count == 1, f"open={open_count}")
            context.close()

        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()
        page.goto(base_url.rstrip("/") + "/mlb/", wait_until="domcontentloaded", timeout=timeout_ms)
        page.wait_for_selector(".ca-matchup-card", timeout=timeout_ms)
        initial_count = page.locator(".ca-matchup-card").count()
        search = page.locator("#chaseNavSearch")
        # Search for a club that is actually on the slate being tested. Hard-coding
        # a team made this check report a filter failure on any date that club did
        # not play, which is a property of the schedule, not of the filter.
        target = (page.locator(".ca-matchup-card__name").first.inner_text() or "").strip()
        search.fill(target)
        filtered_count = page.locator(".ca-matchup-card").count()
        check("MLB team search filters the slate",
              initial_count > 1 and 1 <= filtered_count < initial_count,
              f"query={target!r} before={initial_count} after={filtered_count}")
        search.fill("")
        mlb_detail = page.locator(".ca-matchup-card__detail-link").first.get_attribute("href") or ""
        page.goto(base_url.rstrip("/") + mlb_detail, wait_until="domcontentloaded", timeout=timeout_ms)
        page.wait_for_selector(".ca-detail-hero", timeout=timeout_ms)
        check("MLB detail uses team logos", page.locator(".ca-detail-team__logo").count() == 2)
        check("MLB detail has sport-specific sections",
              page.locator("#starters, #lineups, #bullpens, #conditions, #sources").count() == 5)
        mlb_detail_text = page.locator("main").inner_text()
        match = PROHIBITED.search(mlb_detail_text)
        check("MLB detail public copy boundary", match is None, match.group(0) if match else "")
        legacy_url = base_url.rstrip("/") + "/dashboard/matchup_compare.html?away=MIN&home=DET&date=2026-09-09"
        page.goto(legacy_url, wait_until="domcontentloaded", timeout=timeout_ms)
        page.wait_for_url(re.compile(r"/mlb/matchup(?:\.html)?(?:\?|$)"), timeout=timeout_ms)
        page.wait_for_selector(".ca-detail-hero", timeout=timeout_ms)
        check("Legacy matchup URL preserves a working game", "Minnesota Twins" in page.locator("main").inner_text())
        # Past results are not a public destination; the only place a completed
        # game is reachable is inside a matchup breakdown.
        for sport in ("mlb", "nfl"):
            response = page.request.get(f"{base_url.rstrip('/')}/{sport}/results.html")
            check(f"{sport.upper()} has no public results route", response.status == 404,
                  f"status={response.status}")
        context.close()

        context = browser.new_context(viewport={"width": 1280, "height": 900})
        page = context.new_page()
        page.goto(base_url.rstrip("/") + "/nfl/", wait_until="domcontentloaded", timeout=timeout_ms)
        page.wait_for_selector(".ca-matchup-card", timeout=timeout_ms)
        nfl_text = page.locator("main").inner_text()
        for term in ("lineup", "bullpen", "probable starter", "era"):
            check(f"NFL omits MLB-only {term}", term not in nfl_text.lower())

        detail_link = page.locator(".ca-matchup-card__detail-link").first
        detail_url = detail_link.get_attribute("href") or ""
        check("NFL full-detail link exists", detail_url.startswith("/nfl/matchup.html?game="), detail_url)
        page.goto(base_url.rstrip("/") + detail_url, wait_until="domcontentloaded", timeout=timeout_ms)
        page.wait_for_selector(".ca-detail-hero", timeout=timeout_ms)
        check("NFL detail uses team logos", page.locator(".ca-detail-team__logo").count() == 2)
        check("NFL detail has factual sections", page.locator("#quarterbacks, #team-context, #conditions, #sources").count() == 4)
        detail_text = page.locator("main").inner_text()
        match = PROHIBITED.search(detail_text)
        check("NFL detail public copy boundary", match is None, match.group(0) if match else "")
        check("NFL detail no horizontal overflow", page.evaluate("document.documentElement.scrollWidth - innerWidth") <= 1)
        context.close()
        browser.close()
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8765")
    parser.add_argument("--timeout-ms", type=int, default=45000)
    parser.add_argument("--channel", default="")
    args = parser.parse_args()
    results = run(args.base_url, args.timeout_ms, args.channel)
    failures = [item for item in results if not item.ok]
    print("PUBLIC_SITE_RUNTIME_DIAGNOSTIC")
    for item in results:
        print(("PASS" if item.ok else "FAIL") + " | " + item.name + ((" | " + item.note) if item.note else ""))
    print(f"---\nTOTAL {len(results)} PASS {len(results) - len(failures)} FAIL {len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
