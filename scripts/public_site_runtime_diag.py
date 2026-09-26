#!/usr/bin/env python3
"""End-to-end browser contract for the public matchup experience."""
from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent


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
            # The crest checks read naturalWidth, which is 0 until the image has
            # decoded. A fixed 300ms pause was winning that race most of the
            # time and losing it perhaps one run in five - reporting a crest
            # density of 0 and failing a deploy over a slow CDN response rather
            # than over anything in the build. Wait for the images themselves.
            try:
                page.wait_for_function(
                    """() => [...document.querySelectorAll(
                         '#openingMlbSlate .ca-matchup-card__club img')]
                       .every(i => i.complete)""",
                    timeout=timeout_ms)
            except Exception:
                pass
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
            # Density 0 means no crest had decoded yet - that is a statement
            # about the network, not about the build, and failing on it took a
            # deploy down for a slow CDN response. The assertion is about a
            # crest that IS decoded being served at enough density; whether one
            # decoded in time is what "crests load" already covers.
            check(f"{width}px crest density >= 2x",
                  metrics["crestDensity"] == 0 or metrics["crestDensity"] >= 2,
                  str(metrics))
            check(f"{width}px a crest decoded in time to measure",
                  metrics["crestDensity"] > 0, str(metrics))
            check(f"{width}px full team names present", metrics["namedTeams"] >= 2, str(metrics))
            check(f"{width}px no bare abbreviation identity", metrics["bareAbbr"] == 0, str(metrics))
            if width >= 1024:
                # design/GPT_IMAGE_PROMPTS_CHASE_DESK.md fixes the collapsed card at
                # 272-350px with three compact factual cells. This is the style
                # lock's own number, not a band re-based on whatever the card had
                # grown to - it had drifted to 449px, and the extra height was
                # bought by dropping a cell, so it was failing twice over.
                check(f"{width}px collapsed card height",
                      272 <= metrics["maxHeight"] <= 350, str(metrics))
                cells = page.eval_on_selector_all(
                    ".ca-matchup-card__summary .ca-matchup-card__fact", "els => els.length")
                cards = page.locator(".ca-matchup-card").count()
                check(f"{width}px three factual cells per card",
                      cards > 0 and cells == cards * 3, f"{cells} cells across {cards} cards")
                clipped = page.eval_on_selector_all(
                    ".ca-matchup-card", "els => els.filter(c => c.scrollHeight > c.clientHeight).length")
                check(f"{width}px no card clips its own content", clipped == 0, f"clipped={clipped}")

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
        # Sources and freshness moved into each section's own note, and the
        # ballpark section was cut to its weather, which now sits in the
        # banner. Pitch mix leads the lineup it explains.
        check("MLB detail has sport-specific sections",
              page.locator("#starters, #arsenal, #lineups, #recent, #form, #radar, #bullpens")
              .count() == 7)
        check("MLB detail no longer carries a ballpark or sources section",
              page.locator("#conditions, #sources").count() == 0)
        try:
            page.wait_for_selector("#bullpens .ca-bullpen-split-table", timeout=timeout_ms)
        except Exception:
            pass
        bullpen_tables = page.locator("#bullpens .ca-bullpen-split-table")
        check("MLB bullpen splits render for both clubs", bullpen_tables.count() == 2,
              f"tables={bullpen_tables.count()}")
        check("MLB bullpen split table includes season, venue and batter hand",
              page.locator("#bullpens .ca-bullpen-split-table tbody tr").count() == 8,
              f"rows={page.locator('#bullpens .ca-bullpen-split-table tbody tr').count()}")
        check("MLB bullpen workload remains available",
              page.locator("#bullpens .ca-pc-table").count() == 2)
        mlb_overflow = page.evaluate(
            "Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth")
        check("MLB detail no horizontal overflow", mlb_overflow <= 1,
              f"overflow={mlb_overflow}")
        mlb_ids = page.eval_on_selector_all(
            ".ca-detail-section", "els => els.map(e => e.id)")
        check("MLB pitch mix is read before the lineup it explains",
              mlb_ids.index("arsenal") < mlb_ids.index("lineups"), str(mlb_ids))
        # Team form is only meaningful if it describes roughly now. The site
        # once served numbers seven weeks old, correctly labelled and entirely
        # unnoticed, because the snapshot lives in whichever checkout ran the
        # pipeline and nothing checked how old it was.
        age = form_age_days()
        # The style lock reserves #9A6BFF for active navigation, the 3px card
        # edge, links and focus - explicitly "not data grading". Every bar that
        # describes a number must take the metric ramp instead.
        violet = "rgb(154, 107, 255)"
        data_bars = page.eval_on_selector_all(
            ".ca-pct-bar__fill, .ca-arsenal-bar__fill, .ca-mirror__fill, .ca-rate-bar > span",
            "els => els.map(e => getComputedStyle(e).backgroundColor)")
        offenders = [c for c in data_bars if c == violet]
        check("violet is not used for data grading", not offenders,
              f"{len(offenders)} of {len(data_bars)} data bars are brand violet")
        check("MLB team form is current", age is not None and age <= 14,
              "not published" if age is None else f"{age:.1f} days old")
        check("MLB form panels state when the form was published",
              "Team form as published" in page.locator("#form").inner_text())
        # The mirror and the radar both arrive with the league artifact, which
        # is a separate fetch from the one that paints the section. Wait for the
        # thing being asserted rather than for a fixed delay - a gate that fails
        # when a request is slow will fail a deploy for no reason.
        try:
            page.wait_for_selector("#form .ca-mirror__row", timeout=timeout_ms)
            page.wait_for_selector("#radar .ca-radar__area", timeout=timeout_ms)
        except Exception:
            pass
        # The thirty-club board is gone: the mirror above it already grades
        # both clubs against the same pool, and the radar states the whole
        # profile at a glance. What replaced the board is checked instead.
        check("MLB form section no longer carries the full league board",
              page.locator("#form .ca-league-table").count() == 0)
        mirror_rows = page.locator("#form .ca-mirror__row").count()
        check("MLB mirror grades both clubs row by row", mirror_rows >= 8,
              f"rows={mirror_rows}")
        undecided = page.locator(
            "#form .ca-mirror__row:not(.is-away):not(.is-home)").count()
        check("MLB mirror gives every row a side", undecided == 0,
              f"undecided={undecided}")
        webs = page.locator("#radar .ca-radar svg").count()
        shapes = page.locator("#radar .ca-radar__area").count()
        check("MLB radar draws both webs", webs == 2, f"webs={webs}")
        check("MLB radar overlays both clubs on each web", shapes == 4,
              f"shapes={shapes}")
        form_meters = page.locator("#form .ca-segment-meter")
        meter_count = form_meters.count()
        meter_cells = page.locator("#form .ca-segment-meter > i").count()
        check("MLB form uses ten-cell grade meters",
              meter_count == 20 and meter_cells == meter_count * 10,
              f"{meter_cells} cells across {meter_count} meters")
        check("MLB form meters do not use club-brand grading",
              page.locator("#form [data-club]").count() == 0)
        mlb_detail_text = page.locator("main").inner_text()
        match = PROHIBITED.search(mlb_detail_text)
        check("MLB detail public copy boundary", match is None, match.group(0) if match else "")
        page.set_viewport_size({"width": 390, "height": 844})
        phone_overflow = page.evaluate(
            "Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth")
        check("MLB phone layout has no horizontal overflow", phone_overflow <= 1,
              f"overflow={phone_overflow}")
        check("MLB phone split tables scroll inside their panels",
              page.locator("#bullpens .ca-lineup-scroll").count() >= 4)
        legacy_url = base_url.rstrip("/") + "/dashboard/matchup_compare.html?away=MIN&home=DET&date=2026-09-09"
        page.goto(legacy_url, wait_until="domcontentloaded", timeout=timeout_ms)
        page.wait_for_url(re.compile(r"/mlb/matchup(?:\.html)?(?:\?|$)"), timeout=timeout_ms)
        page.wait_for_selector(".ca-detail-hero", timeout=timeout_ms)
        check("Legacy matchup URL preserves a working game", "Minnesota Twins" in page.locator("main").inner_text())
        # Past results are not a public destination; the only place a completed
        # game is reachable is inside a matchup breakdown.
        for sport in ("mlb", "nfl", "cfb"):
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
        check("NFL detail has factual sections",
              page.locator("#availability, #scheme, #form, #radar, #team-context").count() == 5)
        check("NFL detail no longer carries a venue or sources section",
              page.locator("#conditions, #sources").count() == 0)
        nfl_webs = page.locator("#radar .ca-radar svg").count()
        check("NFL radar draws both phases", nfl_webs == 2, f"webs={nfl_webs}")
        # inner_text() returns rendered text, and the provenance line is
        # uppercased by the stylesheet, so the comparison is case-insensitive.
        scheme_text = page.locator("#scheme").inner_text().lower()
        check("NFL scheme removes redundant charting banner", "charted from the" not in scheme_text)
        check("NFL scheme speaks in the past tense", "played zone on" in scheme_text)
        meters = page.locator("#scheme .ca-segment-meter")
        meter_count = meters.count()
        cells = page.locator("#scheme .ca-segment-meter > i").count()
        check("NFL analysis uses ten-cell league-rank meters",
              meter_count > 0 and cells == meter_count * 10,
              f"{cells} cells across {meter_count} meters")
        check("NFL form removes continuous fill bars",
              page.locator("#form .ca-mirror__fill").count() == 0)
        check("NFL pressure rows pair tendency with opponent response",
              page.locator("#scheme .ca-pressure-row").count() == 6)
        # Team form is a mirrored comparison now: one row per rate, both clubs
        # on one axis, a rank under every value.
        rows = page.locator("#form .ca-mirror__row").count()
        ranks = page.locator("#form .ca-mirror__value i").count()
        check("NFL form compares both clubs on one axis", rows == 10, f"rows={rows}")
        check("NFL form annotates every rate with a rank", ranks == rows * 2,
              f"{ranks} ranks across {rows} rows")
        legend = page.locator("#form .ca-grade-legend > span")
        legend_colors = legend.evaluate_all(
            "nodes => [...new Set(nodes.map(n => getComputedStyle(n).color))].length")
        check("NFL rank legend exposes all five named grade bands",
              legend.count() == 5 and legend_colors == 5,
              f"bands={legend.count()} colors={legend_colors}")
        overview_values = page.locator(
            "#form [data-matchup-panel]:not([hidden]) .ca-nfl-matchup-cell strong")
        overview_colors = overview_values.evaluate_all(
            "nodes => [...new Set(nodes.map(n => getComputedStyle(n).color))].length")
        check("NFL overview values inherit their direction-aware rank colors",
              overview_colors >= 4, f"distinct colors={overview_colors}")
        check("NFL matchup lab exposes four connected team stat views",
              page.locator("#form [data-team-stat-view]").count() == 4)
        check("NFL matchup lab opens one team stat view at a time",
              page.locator("#form [data-team-stat-panel]:not([hidden])").count() == 1)
        page.locator("#form [data-team-stat-view='rushing']").click()
        check("NFL rushing view shows both offense-defense pairings",
              page.locator("#form [data-team-stat-panel='rushing'] .ca-nfl-split-card").count() == 2)
        check("NFL team cards separate volume from matchup efficiency",
              page.locator("#form [data-team-stat-panel='rushing'] .ca-nfl-split-section__head").count() == 4 and
              all(label in page.locator("#form [data-team-stat-panel='rushing']").inner_text()
                  for label in ("Per-Game Volume", "Matchup Efficiency")))
        check("NFL rushing view includes EPA, success and stacked-box splits",
              page.locator("#form [data-team-stat-panel='rushing'] .ca-nfl-split-duel__row").count() == 6)
        split_values = page.locator(
            "#form [data-team-stat-panel='rushing'] .ca-nfl-split-duel__value strong")
        split_colors = split_values.evaluate_all(
            "nodes => [...new Set(nodes.map(n => getComputedStyle(n).color))].length")
        check("NFL rushing splits use the same five-band grade ramp",
              split_colors == 5, f"distinct colors={split_colors}")
        page.locator("#form [data-team-stat-view='trenches']").click()
        trench = page.locator("#form [data-team-stat-panel='trenches']")
        check("NFL trenches view shows both line confrontations",
              trench.locator(".ca-trench-card").count() == 2)
        check("NFL trenches view publishes contact yards, line yards and havoc",
              all(label in trench.inner_text() for label in
                  ("RB Yards Before Contact / Carry", "Adjusted Line Yards", "Havoc Rate")))
        check("NFL trenches view shows run defense by point of attack",
              trench.locator(".ca-run-front").count() == 2 and
              all(label in trench.inner_text() for label in ("Guard", "Tackle", "End")))
        check("NFL trenches view states the blocking-charting limit",
              "zone-versus-gap blocking" in trench.inner_text().lower())
        check("NFL hides the unconnected DVOA view instead of opening a dead panel",
              page.locator("#form [data-team-stat-view='dvoa']").count() == 0 and
              page.locator("#form [data-team-stat-panel='dvoa']").count() == 0)
        page.locator("#form [data-team-stat-view='overview']").click()
        check("NFL opens with four concise matchup signals",
              page.locator("#form .ca-nfl-signal").count() == 4)
        check("NFL shows one directional unit board at a time",
              page.locator("#form [data-matchup-panel]:not([hidden])").count() == 1)
        check("NFL standard production includes ranked per-game offensive pace",
              page.locator("#form .ca-production-compare__row").count() == 7 and
              "Offensive Pace" in page.locator("#form .ca-production-compare").inner_text() and
              "plays per game" in page.locator("#form .ca-production-compare").inner_text())
        page.locator("#form [data-matchup-side='home']").click()
        check("NFL unit switch exposes the selected offense-defense pairing",
              page.locator("#form [data-matchup-side='home'][aria-selected='true']").count() == 1
              and page.locator("#form [data-matchup-panel='home']:not([hidden])").count() == 1)
        check("NFL removes the duplicate narrative lens cards",
              page.locator("#form .ca-script-lens").count() == 0)
        check("NFL opens the core coverage matchup while keeping secondary detail progressive",
              page.locator(
                  "#scheme [data-scheme-direction-panel]:not([hidden]) .ca-scheme-detail[open]"
              ).count() == 1 and page.locator(
                  "#scheme [data-scheme-direction-panel]:not([hidden]) .ca-scheme-detail:not([open])"
              ).count() == 1)
        scheme_text = page.locator(
            "#scheme [data-scheme-direction-panel]:not([hidden])").inner_text()
        check("NFL quarterback splits include shell, coverage and pressure looks",
              all(label in scheme_text for label in (
                  "Single High / MFC", "Two High / MFO", "Middle Field Closed",
                  "Middle Field Open", "Cover 3", "Cover 4", "Man", "Zone", "Blitz", "Pressure")))
        check("NFL quarterback splits show time to throw and per-game volume",
              all(label in scheme_text.lower() for label in
                  ("time to throw", "pass att / g", "db/g", "yds/g")))
        check("NFL scheme tables group sample, per-game and efficiency columns",
              page.locator("#scheme .ca-scheme-table__groups").count() >= 2 and
              all(label in scheme_text.lower() for label in
                  ("per game", "efficiency", "next gen timing & volume")))
        check("NFL running-back splits include box, personnel and NGS context",
              all(label in scheme_text.lower() for label in
                  ("stacked box", "light box", "nickel", "8+ box faced", "ryoe / carry")))
        check("NFL player research opens with four comparable volume baselines",
              page.locator("#players .ca-player-compare__row").count() == 4)
        check("NFL player research exposes position and stat-family filters",
              page.locator("#players [data-player-position]").count() == 5
              and page.locator("#players [data-player-family]").count() == 6)
        page.locator("#players [data-player-family='splits']").click()
        check("NFL advanced player lab does not invent unavailable receiving splits",
              page.locator("#players .ca-player-deep-dive summary").count() >= 1 or
              "No qualifying advanced player split sample" in page.locator("#players").inner_text())
        page.locator("#players [data-player-family='overview']").click()
        page.locator("#players [data-player-position='rb']").click()
        page.locator("#players [data-player-family='rushing']").click()
        check("NFL player filters isolate the selected rushing workload",
              page.locator(
                  "#players [data-player-panel]:not([hidden]) "
                  ".ca-player-volume-card:not([hidden])"
              ).count() == 1
              and page.locator(
                  "#players [data-player-panel]:not([hidden]) "
                  ".ca-player-volume-card:not([hidden]) .ca-player-stat:not([hidden])"
              ).count() == 3)
        page.locator("#players [data-player-position='all']").click()
        page.locator("#players [data-player-family='overview']").click()
        check("NFL player research shows one team board at a time",
              page.locator("#players [data-player-panel]:not([hidden])").count() == 1)
        page.locator("#players [data-player-side='home']").click()
        check("NFL player team switch exposes the selected club",
              page.locator("#players [data-player-side='home'][aria-selected='true']").count() == 1
              and page.locator("#players [data-player-panel='home']:not([hidden])").count() == 1)
        detail_text = page.locator("main").inner_text()
        match = PROHIBITED.search(detail_text)
        check("NFL detail public copy boundary", match is None, match.group(0) if match else "")
        check("NFL detail no horizontal overflow", page.evaluate("document.documentElement.scrollWidth - innerWidth") <= 1)
        page.set_viewport_size({"width": 390, "height": 844})
        check("NFL phone layout has no horizontal overflow",
              page.evaluate("document.documentElement.scrollWidth - innerWidth") <= 1)
        check("NFL phone quick read uses a two-column scan",
              page.locator(".ca-nfl-signal-grid").evaluate(
                  "el => getComputedStyle(el).gridTemplateColumns.split(' ').length") == 2)
        page.set_viewport_size({"width": 1280, "height": 900})

        page.goto(base_url.rstrip("/") + "/cfb/", wait_until="domcontentloaded", timeout=timeout_ms)
        page.wait_for_selector(".ca-matchup-card", timeout=timeout_ms)
        cfb_detail_link = page.locator(".ca-matchup-card__detail-link").first
        cfb_detail_url = cfb_detail_link.get_attribute("href") or ""
        check("CFB full-detail link exists",
              cfb_detail_url.startswith("/cfb/matchup.html?game="), cfb_detail_url)
        page.goto(base_url.rstrip("/") + cfb_detail_url,
                  wait_until="domcontentloaded", timeout=timeout_ms)
        page.wait_for_selector(".ca-cfb-reading-key", timeout=timeout_ms)
        check("CFB current matchup has both directional unit boards",
              page.locator(".ca-cfb-matchup-stack > .ca-arsenal-panel").count() == 2)
        check("CFB matchup exposes the reading order",
              page.locator(".ca-cfb-reading-key").count() == 1)
        check("CFB matchup explains six competitive dynamics",
              page.locator(".ca-cfb-script-dynamics .ca-script-lens").count() == 6)
        check("CFB matchup keeps largest gaps progressive",
              page.locator(".ca-cfb-gap-detail:not([open])").count() == 1)
        page.locator("[data-cfb-compare='passing']").click()
        check("CFB stat-family tabs select one visible panel",
              page.locator("[data-cfb-compare='passing'][aria-selected='true']").count() == 1
              and page.locator("[data-cfb-compare-panel='passing']:not([hidden])").count() == 1)
        page.locator(".ca-metric-guide summary").click()
        check("CFB metric guide expands",
              page.locator(".ca-metric-guide[open]").count() == 1)
        cfb_text = page.locator("main").inner_text()
        match = PROHIBITED.search(cfb_text)
        check("CFB detail public copy boundary", match is None, match.group(0) if match else "")
        check("CFB detail no horizontal overflow",
              page.evaluate("document.documentElement.scrollWidth - innerWidth") <= 1)
        page.set_viewport_size({"width": 390, "height": 844})
        check("CFB phone layout has no horizontal overflow",
              page.evaluate("document.documentElement.scrollWidth - innerWidth") <= 1)
        check("CFB phone dynamics stack to one column",
              page.locator(".ca-script-lens-grid").evaluate(
                  "el => getComputedStyle(el).gridTemplateColumns.split(' ').length") == 1)
        check("CFB phone section navigation hides its scrollbar",
              page.locator(".ca-detail-nav").evaluate(
                  "el => getComputedStyle(el).scrollbarWidth") == "none")
        context.close()
        browser.close()
    return results


def form_age_days() -> float | None:
    """How old the observations behind the published team context are."""
    path = ROOT / "data" / "public" / "team_context.json"
    if not path.is_file():
        return None
    try:
        stamp = json.loads(path.read_text(encoding="utf-8")).get("data_through_utc")
        observed = datetime.fromisoformat(str(stamp).replace("Z", "+00:00"))
    except (ValueError, TypeError, json.JSONDecodeError):
        return None
    return (datetime.now(timezone.utc) - observed).total_seconds() / 86400


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
