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



NFL_GRADING_AUDIT = r"""
() => {
  const SECTIONS = ['efficiency','quarterbacks','coverage','looks','rushing','trenches','receivers','redzone','tendencies'];
  const COUNT_HEADS = new Set(['DB','ATT','TD','TGT','CAR','INT','INSIDE 10','INSIDE 5']);
  const bad = [];
  let checked = 0;
  function headOf(td) {
    const table = td.closest('table'); if (!table) return '';
    const idx = [...td.parentElement.cells].indexOf(td);
    const hr = table.tHead && table.tHead.rows[table.tHead.rows.length - 1];
    return hr && hr.cells[idx] ? hr.cells[idx].innerText.trim().toUpperCase() : '';
  }
  SECTIONS.forEach(id => {
    const sec = document.getElementById(id);
    if (!sec) return;
    sec.querySelectorAll('td.num, .ca-stat__value').forEach(el => {
      if (el.closest('[hidden]')) return;
      const text = el.innerText.trim();
      if (!text || text === '—' || !/\d/.test(text)) return;
      checked++;
      const graded = /(^|\s)c-(elite|good|mid|weak|poor)(\s|$)/.test(el.className);
      const marked = !!el.querySelector('.ca-freq-mark');
      const thinRow = !!el.closest('tr.is-thin');
      const thinTile = el.classList.contains('ca-stat__value') &&
        !!el.parentElement.querySelector('.ca-thin-tag');
      const lowCount = !!el.querySelector('small.is-low') || el.classList.contains('is-low-cell');
      const count = el.tagName === 'TD' && COUNT_HEADS.has(headOf(el));
      if (!(graded || marked || thinRow || thinTile || lowCount || count)) {
        bad.push(id + ' | ' + (el.tagName === 'TD' ? headOf(el) : 'tile ' +
          (el.parentElement.querySelector('.ca-stat__label') || {}).innerText) + ' | ' + text);
      }
    });
  });
  return { checked, ungraded: bad.length, sample: bad.slice(0, 30) };
}
"""

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
                cards: cards.length,
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
            # chase-public.css narrows the grid to the card count on a short slate (one or two
            # games never sit in a half-empty row), so a 2-game day is 2 columns at 1440px.
            want_columns = min(expected_columns, metrics["cards"]) if metrics["cards"] else expected_columns
            check(f"{width}px grid columns", metrics["columns"] == want_columns, str(metrics))
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

            # Every card carries its expand control. A count of two failed the
            # gate on days with one game on the board (2026-10-01: one Wild
            # Card game), which is a property of the schedule, not the desk.
            expanders = page.locator("#openingMlbSlate .ca-matchup-card__expand-btn")
            slate_cards = page.locator("#openingMlbSlate .ca-matchup-card").count()
            check(f"{width}px expand controls",
                  slate_cards >= 1 and expanders.count() == slate_cards,
                  f"{expanders.count()} controls on {slate_cards} cards")
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
        # And a name no club carries empties the desk - so the filter is proven
        # even when only one game is on the board.
        search.fill("zzzz-no-such-club")
        none_count = page.locator(".ca-matchup-card").count()
        check("MLB team search filters the slate",
              1 <= filtered_count <= initial_count and none_count == 0
              and (initial_count == 1 or filtered_count < initial_count),
              f"query={target!r} before={initial_count} after={filtered_count} nonsense={none_count}")
        search.fill("")
        mlb_detail = page.locator(".ca-matchup-card__detail-link").first.get_attribute("href") or ""
        page.goto(base_url.rstrip("/") + mlb_detail, wait_until="domcontentloaded", timeout=timeout_ms)
        page.wait_for_selector(".ca-detail-hero", timeout=timeout_ms)
        check("MLB detail uses team logos", page.locator(".ca-detail-team__logo").count() == 2)
        # Sources and freshness moved into each section's own note, and the
        # ballpark section was cut to its weather, which now sits in the
        # banner. Pitch mix leads the lineup it explains.
        check("MLB detail has sport-specific sections",
              page.locator("#starters, #arsenal, #lineups, #pitch-matchup, #bvp, #recent, #series, "
                           "#form, #radar, #bullpens").count() == 10)
        check("MLB detail no longer carries a ballpark or sources section",
              page.locator("#conditions, #sources").count() == 0)
        try:
            page.wait_for_selector("#bullpens .ca-bullpen-split-table", timeout=timeout_ms)
        except Exception:
            pass
        bullpen_tables = page.locator("#bullpens .ca-bullpen-split-table")
        check("MLB bullpen splits render for both clubs", bullpen_tables.count() == 2,
              f"tables={bullpen_tables.count()}")
        check("MLB bullpen split table includes season, venue, batter hand and leverage",
              page.locator("#bullpens .ca-bullpen-split-table tbody tr").count() == 12,
              f"rows={page.locator('#bullpens .ca-bullpen-split-table tbody tr').count()}")
        # Playoff depth (2026-09-28): every hitter against the opposing
        # starter's mix, every active reliever graded, and the pen's own mix.
        try:
            page.wait_for_selector("#bullpens .ca-relief-table", timeout=timeout_ms)
            page.wait_for_selector("#pitch-matchup .ca-pitch-matchup-table", timeout=timeout_ms)
        except Exception:
            pass
        check("MLB reliever table renders for both clubs",
              page.locator("#bullpens .ca-relief-table").count() == 2)
        check("MLB bullpen section carries no pen pitch mix",
              page.locator("#bullpens .ca-arsenal-table").count() == 0)
        try:
            page.wait_for_selector("#runs-hand .ca-runs-hand-table", timeout=timeout_ms)
        except Exception:
            pass
        check("MLB runs by starter hand read for both clubs with window and venue filters",
              page.locator("#runs-hand .ca-form-panel").count() == 2
              and page.locator("#runs-hand [data-runs-pick]").count() == 7
              and page.locator("#runs-hand [data-runs-view]:not([hidden])").count() == 2)
        check("MLB batter vs pitcher reads for both clubs",
              page.locator("#bvp .ca-bvp").count() == 2)
        check("MLB club splits carry RISP, two-out RISP and late & close",
              all(t in page.locator("#club-splits").inner_text()
                  for t in ("With RISP", "RISP, 2 Outs", "Late & Close")))
        check("MLB lineup vs pitch mix reads three metrics for both clubs",
              # Three metric tables per club whose opposing starter is named.
              page.locator("#pitch-matchup .ca-pitch-matchup-table").count() % 3 == 0,
              f"tables={page.locator('#pitch-matchup .ca-pitch-matchup-table').count()}")
        depth = page.evaluate("""() => {
          const vis = sel => [...document.querySelectorAll(sel)].filter(td => td.offsetParent);
          const graded = td => /(^|\\s)c-(elite|good|mid|weak|poor)(\\s|$)/.test(td.className);
          // Owner rule: MLB ranks print on team stats and pitch-mix stats only.
          const ranked = vis('#pitch-matchup td, #club-splits .ca-index-table td, '
            + '#bullpens .ca-bullpen-split-table td');
          const player = vis('#bvp td, #bullpens .ca-relief-table td');
          return {
            dashes: ranked.concat(player).filter(td => td.innerText.trim() === '—').length,
            unpilled: ranked.filter(td => graded(td) && !td.querySelector('.ca-rank')).length,
            playerRanks: player.filter(td => td.querySelector('.ca-rank')).length,
            playerGraded: player.filter(graded).length
          }; }""")
        check("MLB depth tables have no empty (dash) cells", depth["dashes"] == 0,
              f"{depth['dashes']} dash cells")
        check("MLB depth tables pill every graded number", depth["unpilled"] == 0,
              f"{depth['unpilled']} without a pill")
        check("MLB player stats (BvP, relievers) are graded by colour with no rank numbers",
              depth["playerRanks"] == 0 and depth["playerGraded"] > 0,
              f"{depth['playerRanks']} ranked, {depth['playerGraded']} graded")
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
        mirror_rows = page.locator("#form [data-form-view='season'] .ca-mirror__row").count()
        check("MLB mirror grades both clubs row by row", mirror_rows >= 8,
              f"rows={mirror_rows}")
        undecided = page.locator(
            "#form [data-form-view='season'] .ca-mirror__row:not(.is-away):not(.is-home)").count()
        check("MLB mirror gives every row a side", undecided == 0,
              f"undecided={undecided}")
        webs = page.locator("#radar .ca-radar svg").count()
        shapes = page.locator("#radar .ca-radar__area").count()
        check("MLB radar draws both webs", webs == 2, f"webs={webs}")
        check("MLB radar overlays both clubs on each web", shapes == 4,
              f"shapes={shapes}")
        form_meters = page.locator("#form [data-form-view='season'] .ca-segment-meter")
        meter_count = form_meters.count()
        meter_cells = page.locator("#form [data-form-view='season'] .ca-segment-meter > i").count()
        check("MLB form uses ten-cell grade meters",
              meter_count == 20 and meter_cells == meter_count * 10,
              f"{meter_cells} cells across {meter_count} meters")
        # Split filters: every split view is a graded mirror of both clubs.
        page.locator("#form [data-form-split='vr']").click()
        try:
            page.wait_for_selector("#form [data-form-view='vr']:not([hidden]) .ca-mirror__row",
                                   timeout=timeout_ms)
        except Exception:
            pass
        check("MLB form filters read both clubs on a split",
              page.locator("#form [data-form-view='vr']:not([hidden]) .ca-mirror__row").count() >= 8,
              str(page.locator("#form [data-form-split]").count()) + " filters")
        page.locator("#form [data-form-split='season']").click()
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
        check("NFL desk carries the ten evidence tabs",
              page.locator(".ca-nfl-tabs a[data-nfl-tab]").count() == 10)
        # The desk reads a tab at a time, and where the clubs stack, one club at a time.
        shown = "() => [...document.querySelectorAll('.ca-detail-section')].filter(s => s.offsetParent).map(s => s.id).join(',')"
        check("NFL desk opens on the Units tab alone", page.evaluate(shown) == "efficiency", page.evaluate(shown))
        page.locator('a[data-nfl-tab="games"]').click()
        try:
            page.wait_for_selector("#game-log .ca-log-panel table", timeout=timeout_ms)
        except Exception:
            pass
        log_cells = page.evaluate("""() => {
          const tds = [...document.querySelectorAll('#game-log td')].filter(td => td.offsetParent);
          return {
            panels: document.querySelectorAll('#game-log .ca-log-panel').length,
            strips: document.querySelectorAll('#game-log .ca-log-strip svg').length,
            rows: document.querySelectorAll('#game-log tbody tr').length,
            dashes: tds.filter(td => td.innerText.trim() === '—').length,
            unpilled: tds.filter(td => /(^|\\s)c-(elite|good|mid|weak|poor)(\\s|$)/.test(td.className)
              && !td.querySelector('.ca-rank')).length
          }; }""")
        check("NFL Games tab logs both clubs with a margin strip",
              page.evaluate(shown) == "game-log" and log_cells["panels"] == 2
              and log_cells["strips"] == 2 and log_cells["rows"] >= 4, str(log_cells))
        check("NFL game log grades every rate with a pill and no dash cells",
              log_cells["unpilled"] == 0 and log_cells["dashes"] == 0, str(log_cells))
        page.locator('a[data-nfl-tab="passing"]').click()
        check("NFL Passing tab shows quarterbacks, coverage and looks",
              page.evaluate(shown) == "quarterbacks,coverage,looks" and page.url.endswith("#passing"),
              page.evaluate(shown) + " " + page.url)
        page.locator('a[data-nfl-tab="dvoa"]').click()
        check("NFL DVOA tab exposes both FTN panels",
              page.evaluate(shown) == "dvoa"
              and page.locator("#dvoa .ca-nfl-dvoa-panel").count() == 2)
        dvoa_text = page.locator("#dvoa").inner_text().lower()
        check("NFL DVOA publishes all eight team-unit values",
              page.locator("#dvoa tbody tr").count() == 8
              and "not published" not in dvoa_text,
              dvoa_text)
        check("NFL DVOA includes FTN week provenance and rank pills, no League Rank column",
              "ftn public team total dvoa" in dvoa_text
              and "week " in dvoa_text and "league rank" not in dvoa_text
              and page.locator("#dvoa tbody .ca-rank").count() == 8,
              dvoa_text)
        page.locator('a[data-nfl-tab="passing"]').click()
        club_panels = "() => [...document.querySelectorAll('#coverage .ca-detail-duo')].filter(d => d.offsetParent).map(d => [...d.children].filter(c => c.offsetParent).length).join(',')"
        check("NFL stacked layout reads one club at a time", page.evaluate(club_panels) == "1",
              page.evaluate(club_panels))
        page.locator('.ca-nfl-club__btn[data-club="both"]').click()
        check("NFL club switch shows both clubs on request", page.evaluate(club_panels) == "2",
              page.evaluate(club_panels))
        page.goto(base_url.rstrip("/") + detail_url + "#trenches", wait_until="domcontentloaded", timeout=timeout_ms)
        page.wait_for_selector(".ca-detail-hero", timeout=timeout_ms)
        check("NFL section deep link opens the tab that holds it",
              page.evaluate("document.querySelector('.ca-detail-stack').dataset.nflTab") == "rushing")
        # Every section and both clubs on screen for the content checks below.
        page.locator('.ca-nfl-club__btn[data-club="both"]').click()
        page.evaluate("document.querySelector('.ca-detail-stack').setAttribute('data-nfl-tab', 'all')")
        page.evaluate("() => { const r = document.getElementById('radar'); r && r.scrollIntoView(); }")
        page.wait_for_timeout(300)

        def section_unpublished(selector: str) -> bool:
            return "not published" in page.locator(selector).inner_text().lower()

        nfl_sections = ("#efficiency", "#dvoa", "#quarterbacks", "#coverage", "#looks", "#rushing",
                        "#trenches", "#receivers", "#tendencies", "#availability", "#radar",
                        "#team-context")
        check("NFL detail has factual sections",
              page.locator(", ".join(nfl_sections)).count() == len(nfl_sections))
        check("NFL detail no longer carries a venue or sources section",
              page.locator("#conditions, #sources, #form, #scheme, #players").count() == 0)
        nfl_webs = page.locator("#radar .ca-radar svg").count()
        check("NFL radar draws both phases", nfl_webs == 2, f"webs={nfl_webs}")
        # The NFL desk reads in the MLB table language: every evidence section is
        # an away | home duo of one of the three MLB components.
        for sid, component in (("#efficiency", ".ca-form-panel"), ("#dvoa", ".ca-nfl-dvoa-panel"),
                               ("#quarterbacks", ".ca-starter-panel"),
                               ("#coverage", ".ca-arsenal-panel"), ("#looks", ".ca-arsenal-panel"),
                               ("#rushing", ".ca-starter-panel"), ("#trenches", ".ca-form-panel"),
                               ("#receivers", ".ca-form-panel"), ("#tendencies", ".ca-arsenal-panel")):
            n = page.locator(f"{sid} .ca-detail-duo:visible > {component}").count()
            check(f"NFL {sid[1:]} is a two-club duo of {component}", n == 2, f"panels={n}")
        # Unit Matchups: each possession is the offense's row directly above the
        # defense it meets, in the same columns.
        # The form table sits in the evidence-window view (model form / this season).
        rows = page.locator("#efficiency .ca-form-panel > [data-season-view]:not([hidden]) > .ca-lineup-scroll tbody tr").count()
        check("NFL unit matchups pair each offense with the defense it meets", rows == 4, f"rows={rows}")
        grades = page.locator("#efficiency td[class*='c-']").evaluate_all(
            "nodes => [...new Set(nodes.map(n => getComputedStyle(n).color))].length")
        check("NFL unit matchups grade on the five-band ramp", grades >= 4, f"distinct colors={grades}")
        # Pitch Mix shape: ten usage squares per row, a ranked result, and the
        # other club's result in the last column.
        mix_rows = page.locator("#coverage .ca-arsenal-table:visible tbody tr")
        squares = page.locator("#coverage .ca-arsenal-table:visible .ca-usage__grid > i").count()
        check("NFL coverage rows carry ten usage squares",
              mix_rows.count() > 0 and squares == mix_rows.count() * 10,
              f"{squares} squares across {mix_rows.count()} rows")
        check("NFL coverage results carry league rank chips",
              page.locator("#coverage .ca-arsenal-table:visible .ca-rank").count() >= mix_rows.count())
        usage = page.locator("#coverage .ca-arsenal-panel").first.locator(".ca-usage b").evaluate_all(
            "nodes => nodes.map(n => parseFloat(n.textContent))")
        check("NFL coverage shells are ordered by the defense's own usage, never by gap",
              usage == sorted(usage, reverse=True), str(usage))
        # Evidence, never verdicts.
        detail_lower = page.locator(".ca-detail-stack").inner_text().lower()
        check("NFL names no gaps for the reader",
              "largest matchup gaps" not in detail_lower and "quick read" not in detail_lower and
              page.locator(".ca-nfl-signal, .is-off, .is-def, [data-matchup-side]").count() == 0)
        check("NFL tendencies are never graded",
              page.locator("#tendencies td[class*='c-']").count() == 0)
        cov_usage = page.locator("#coverage .ca-arsenal-table td:has(.ca-usage)").count()
        cov_marks = page.locator("#coverage .ca-arsenal-table td:has(.ca-usage) .ca-freq-mark").count()
        check("NFL coverage usage carries a league marker on every row",
              cov_usage > 0 and cov_marks == cov_usage, f"{cov_marks} marks on {cov_usage} usage cells")
        # Owner 2026-10-01: frequencies carry their league rank as a coloured
        # pill, never an arrow.
        bad_marks = page.locator(".ca-freq-mark").evaluate_all(
            r"ns => ns.filter(n => !/^\d+(st|nd|rd|th)$/.test(n.textContent.trim())"
            r" || !/(^|\s)c-(elite|good|mid|weak|poor)(\s|$)/.test(n.className)).map(n => n.textContent)")
        check("NFL league markers are colour-coded rank pills",
              page.locator(".ca-freq-mark").count() > 0 and not bad_marks, str(bad_marks[:5]))
        check("NFL shows no frequency arrows",
              not any(g in page.locator("main").inner_text() for g in "▲▼"))
        check("NFL published tendencies, looks, receivers and QB opponent rates carry markers",
              all(page.locator(f"{sid} .ca-freq-mark").count() > 0 or section_unpublished(sid)
                  for sid in ("#looks", "#tendencies", "#receivers", "#quarterbacks")))
        # Every number in the analysis is either graded (tier colour + rank),
        # marked against the league (neutral arrow), tagged as a thin sample, or
        # a plain sample count. A number that is simply grey is a regression.
        unpilled = page.evaluate(r"""() => [...document.querySelectorAll('main td.num, main .ca-stat__value')]
          .filter(el => el.offsetParent && /(^|\s)c-(elite|good|mid|weak|poor)(\s|$)/.test(el.className)
            && !el.querySelector('.ca-rank')).length""")
        check("NFL every graded number shows its rank pill", unpilled == 0, f"{unpilled} without a pill")
        # Empty cells and ungraded thin rows are regressions. A status line is
        # valid only when it explicitly tells the reader that a source has not
        # published that evidence yet.
        gaps = page.evaluate("""() => {
          const vis = [...document.querySelectorAll('.ca-detail-stack td')].filter(td => td.offsetParent);
          return {
            dashes: vis.filter(td => td.innerText.trim() === '—').length,
            notes: [...document.querySelectorAll('.ca-detail-stack .ca-detail-source-note')]
              .filter(n => n.offsetParent).map(n => n.innerText.trim()).slice(0, 3),
            thin: [...document.querySelectorAll('.ca-detail-stack .ca-thin-tag')].filter(e => e.offsetParent).length
          }; }""")
        check("NFL desk has no empty (dash) cells", gaps["dashes"] == 0, f"{gaps['dashes']} dash cells")
        check("NFL status lines only describe unpublished evidence",
              all("not published" in note.lower() for note in gaps["notes"]), str(gaps["notes"]))
        check("NFL desk grades every row (no Low n tags)", gaps["thin"] == 0, f"{gaps['thin']} Low n tags")
        grading = page.evaluate(NFL_GRADING_AUDIT)
        check("NFL every number is graded, marked, tagged thin or a count",
              grading["checked"] > 200 and grading["ungraded"] == 0,
              f"{grading['ungraded']} of {grading['checked']}: {grading['sample'][:3]}")
        # The evidence window changes the data: combined two-season lines under
        # "2025 + 2026", the current season alone under "2026 Only".
        tiles_of = "() => [...document.querySelectorAll('#quarterbacks .ca-stat__value')].filter(e => e.offsetParent).map(e => e.innerText).join('|')"
        combined_tiles = page.evaluate(tiles_of)
        page.locator("[data-season-scope='current']").click()
        current_tiles = page.evaluate(tiles_of)
        page.locator("[data-season-scope='combined']").click()
        page.locator("[data-season-scope='current']").click()
        now_looks = page.locator("#looks .ca-arsenal-table:visible tbody tr").count()
        now_tend = page.locator("#tendencies .ca-arsenal-table:visible tbody tr").count()
        now_looks_text = page.locator("#looks").inner_text().lower()
        now_tend_text = page.locator("#tendencies").inner_text().lower()
        page.locator("[data-season-scope='combined']").click()
        check("NFL 2026 Only fills looks and tendencies with current-season charting",
              (now_looks >= 4 and now_tend >= 6) or
              ("not published" in now_looks_text and "not published" in now_tend_text),
              f"looks={now_looks} tendencies={now_tend}")
        check("NFL evidence window changes the numbers, not just what is hidden",
              (combined_tiles and current_tiles and combined_tiles != current_tiles) or
              section_unpublished("#quarterbacks"),
              f"{combined_tiles[:40]} vs {current_tiles[:40]}")
        check("NFL usage is never graded",
              page.locator(".ca-arsenal-table td:has(.ca-usage)[class*='c-']").count() == 0)
        check("NFL thin samples are tagged and never graded",
              page.locator("tr.is-thin td[class*='c-']").count() == 0 and
              page.locator("tr.is-thin").count() == page.locator("tr.is-thin .ca-thin-tag").count())
        check("NFL quarterback looks are read in families",
              page.locator("#quarterbacks tr.ca-split-group").count() >= 4 or
              section_unpublished("#quarterbacks"))
        trench_heads = page.locator("#trenches thead").all_inner_texts()
        check("NFL reads sack rate once, in Unit Matchups",
              (bool(trench_heads) and "sack" not in trench_heads[0].lower()) or
              section_unpublished("#trenches"),
              "missing trenches table header" if not trench_heads else trench_heads[0])
        nav_rows = page.locator(".ca-detail-nav").evaluate(
            "el => new Set([...el.children].map(a => Math.round(a.getBoundingClientRect().top))).size")
        check("NFL section nav is a single row", nav_rows == 1, f"rows={nav_rows}")
        qb_text = page.locator("#quarterbacks").inner_text().lower()
        check("NFL quarterback panels carry the season line, splits and time to throw",
              (page.locator("#quarterbacks .ca-starter-panel .ca-stat").count() >= 6 and
               all(label in qb_text for label in ("vs man", "vs zone", "vs blitz", "pressured", "time to throw")))
              or section_unpublished("#quarterbacks"))
        check("NFL quarterback splits show how often the opponent shows each look",
              page.locator("#quarterbacks th.ca-opp-shows").count() >= 2 or
              section_unpublished("#quarterbacks"))
        check("NFL quarterback splits drop the renamed middle-field duplicates",
              "middle field" not in qb_text)
        rb_text = page.locator("#rushing").inner_text().lower()
        run_game_text = page.locator("#run-game").inner_text().lower()
        check("NFL run-game unit profiles and ball carriers are populated",
              page.locator("#run-game .ca-form-panel").count() >= 2
              and page.locator("#run-game tbody tr").count() >= 8
              and "run game figures are not published" not in run_game_text
              and all(label in run_game_text for label in
                      ("yds/g", "epa/car", "stuffed", "ball carriers")))
        check("NFL running-back panels carry box, direction and NGS context",
              all(label in rb_text for label in ("light box", "run left", "ryoe / carry")) or
              section_unpublished("#rushing"))
        trench_text = page.locator("#trenches").inner_text().lower()
        check("NFL trenches pair each line with the front it meets and map run direction",
              (page.locator("#trenches .ca-arsenal-table:visible").count() == 2 and
               all(label in trench_text for label in ("line yds", "havoc", "ybc", "run direction",
                                                      "at the guards", "outside the ends"))) or
              section_unpublished("#trenches"))
        rz = page.locator("#redzone")
        page.locator("[role='tab'][data-nfl-tab='redzone']").click()
        combined_rz = rz.locator("[data-season-view='combined']:visible").inner_text().lower()
        visible_combined_panels = rz.locator(
            "[data-season-view='combined']:visible .ca-form-panel:visible").count()
        page.locator("[data-season-scope='current']").click()
        current_rz = rz.locator("[data-season-view='current']:visible").inner_text().lower()
        visible_current_panels = rz.locator(
            "[data-season-view='current']:visible .ca-form-panel:visible").count()
        page.locator("[data-season-scope='combined']").click()
        check("NFL red zone tab visibly opens populated data",
              rz.is_visible() and visible_combined_panels == 2 and visible_current_panels == 2 and
              "red zone data is not published" not in combined_rz + current_rz,
              f"combined={visible_combined_panels} current={visible_current_panels}")
        check("NFL red zone pairs each offense with the defense it meets, in both windows",
              rz.locator("[data-season-view='combined'] .ca-form-panel").count() == 2 and
              rz.locator("[data-season-view='current'] .ca-form-panel").count() == 2)
        check("NFL red zone carries trips, conversion, position targets and player shares",
              all(label in combined_rz and label in current_rz for label in
                  ("trips / g", "trip rate", "td%", "score%", "targets by position",
                   "tgt share", "car share")))
        page.locator("[role='tab'][data-nfl-tab='receiving']").click()
        rec_text = page.locator("#receivers").inner_text().lower()
        receiver_matrix_heads = [head.lower() for head in
                                 page.locator("#receivers .ca-split-block h4").all_inner_texts()
                                 if "receivers by coverage" in head.lower()]
        check("NFL receivers carry splits against coverage, shell and pass rush",
              ("receivers by coverage" in rec_text and
               all(label in rec_text for label in ("vs man", "vs zone", "single high (mfc)", "vs blitz"))) or
              not receiver_matrix_heads)
        # Owner 2026-10-01: WR success against specific coverages and schemes.
        rec_switch = page.locator("#receivers .ca-rec-metric").filter(visible=True).first
        if receiver_matrix_heads and rec_switch.count():
            rec_switch.locator("[data-rec-metric='success_rate']").click()
            shown = rec_switch.locator("[data-rec-metric-view]:not([hidden])")
            shown_text = shown.inner_text().lower() if shown.count() == 1 else ""
            check("NFL receiver matrix switches to success rate, with scheme looks",
                  rec_switch.locator("[data-rec-metric]").count() == 4 and shown.count() == 1 and
                  "success %" in shown_text and "play action" in shown_text and "with motion" in shown_text,
                  shown_text[:160])
            rec_switch.locator("[data-rec-metric='yards_per_target']").click()
        check("NFL pass catchers include the target distribution against the other defense",
              page.locator("#receivers .ca-arsenal-table:visible").count() == 2 and
              "target distribution" in page.locator("#receivers").inner_text().lower())
        detail_text = page.locator("main").inner_text()
        match = PROHIBITED.search(detail_text)
        check("NFL detail public copy boundary", match is None, match.group(0) if match else "")
        check("NFL detail no horizontal overflow", page.evaluate("document.documentElement.scrollWidth - innerWidth") <= 1)
        page.locator("[role='tab'][data-nfl-tab='passing']").click()
        page.set_viewport_size({"width": 390, "height": 844})
        check("NFL phone layout has no horizontal overflow",
              page.evaluate("document.documentElement.scrollWidth - innerWidth") <= 1)
        check("NFL phone stacks each duo into one column",
              page.locator("#coverage .ca-detail-duo").first.evaluate(
                  "el => getComputedStyle(el).gridTemplateColumns.split(' ').length") == 1)
        page.set_viewport_size({"width": 1280, "height": 900})

        page.goto(base_url.rstrip("/") + "/cfb/", wait_until="domcontentloaded", timeout=timeout_ms)
        page.wait_for_selector(".ca-matchup-card", timeout=timeout_ms)
        cfb_detail_link = page.locator(".ca-matchup-card__detail-link").first
        cfb_detail_url = cfb_detail_link.get_attribute("href") or ""
        check("CFB full-detail link exists",
              cfb_detail_url.startswith("/cfb/matchup.html?game="), cfb_detail_url)
        page.goto(base_url.rstrip("/") + cfb_detail_url,
                  wait_until="domcontentloaded", timeout=timeout_ms)
        # The CFB desk reads in the NFL desk's design layer (2026-09-29): tabs,
        # each unit above the unit it meets, a rank pill on every graded number,
        # no verdict lines, no gap ordering, no dash cells.
        page.wait_for_selector(".ca-nfl-tabs", timeout=timeout_ms)
        check("CFB desk carries the seven evidence tabs (ledger restructure 2026-10-03)",
              page.locator(".ca-nfl-tabs a[data-nfl-tab]").count() == 7)
        check("CFB opens on the Units evidence group alone",
              page.evaluate("[...document.querySelectorAll('.ca-detail-section')]"
                            ".filter(s => s.offsetParent).map(s => s.id).join(',')") ==
              "cfb-efficiency,cfb-dvoa")
        # Owner 2026-10-03: one matchup ledger for every unit comparison - both
        # directions side by side, the same rows in the same order, each stat
        # once on the desk, a rank bar beside every ranked figure.
        ledger = page.evaluate("""() => {
          const out = {};
          for (const id of ['cfb-efficiency', 'cfb-passing', 'cfb-rushing', 'cfb-situational']) {
            const panels = [...document.querySelectorAll('#' + id + ' .ca-cfb-ledger')];
            const labels = panels.map(p => [...p.querySelectorAll('tbody tr:not(.ca-ledger-group) td:first-child')]
              .map(td => td.textContent.trim()).join('|'));
            out[id] = { panels: panels.length, same: labels.length === 2 && labels[0] === labels[1],
                        rows: labels.length ? labels[0].split('|').filter(Boolean) : [] };
          }
          const ranked = [...document.querySelectorAll('.ca-cfb-ledger-table td.num .ca-rank')].length;
          const bars = [...document.querySelectorAll('.ca-cfb-ledger-table .ca-ledger-bar i')]
            .filter(i => parseFloat(i.style.width) > 0).length;
          return { sections: out, ranked, bars }; }""")
        for sid, info in ledger["sections"].items():
            check(f"CFB {sid} reads both directions on identical ledger rows",
                  info["panels"] == 2 and info["same"] and len(info["rows"]) >= 6,
                  f"{info['panels']} panels, {len(info['rows'])} rows")
        all_rows = [r for info in ledger["sections"].values() for r in info["rows"]]
        repeated = sorted({r for r in all_rows if all_rows.count(r) > 1} - {"Success", "Explosive"})
        check("CFB ledger lists each stat once across the desk", not repeated, ", ".join(repeated))
        check("CFB every ranked ledger figure carries its rank bar",
              ledger["ranked"] > 40 and ledger["bars"] == ledger["ranked"],
              f"{ledger['ranked']} ranked, {ledger['bars']} bars")
        efficiency_text = page.locator("#cfb-efficiency").inner_text().lower()
        check("CFB efficiency carries scoring, yardage and per-play evidence",
              all(label in efficiency_text for label in ("points/g", "pts/play", "yds/play", "success")))
        dvoa_text = page.locator("#cfb-dvoa").inner_text()
        check("CFB DVOA equivalent sets both SP+ profiles school against school",
              page.locator("#cfb-dvoa .ca-cfb-h2h").count() == 1
              and page.locator("#cfb-dvoa tbody tr").count() == 4
              and page.locator("#cfb-dvoa tbody .ca-rank").count() == 8
              and "Not Rated" not in dvoa_text
              and "Not Published" not in dvoa_text)
        dvoa_lower = dvoa_text.lower()
        check("CFB adjusted efficiency labels source and methodology",
              "cfb update sp+" in dvoa_lower
              and "opponent-adjusted cfb efficiency" in dvoa_lower
              and "not ftn dvoa" in dvoa_lower
              and "fbs rank" not in dvoa_lower)
        cfb_cells = page.evaluate("""() => {
          const tds = [...document.querySelectorAll('.ca-cfb-panel td')];
          const graded = td => /(^|\\s)c-(elite|good|mid|weak|poor)(\\s|$)/.test(td.className);
          return {
            dashes: tds.filter(td => td.innerText.trim() === '—').length,
            unpilled: tds.filter(td => graded(td) && !td.querySelector('.ca-rank')).length,
            graded: tds.filter(graded).length
          }; }""")
        check("CFB every graded number carries its rank pill",
              cfb_cells["unpilled"] == 0 and cfb_cells["graded"] > 0,
              f"{cfb_cells['graded']} graded, {cfb_cells['unpilled']} without a pill")
        check("CFB desk has no empty (dash) cells", cfb_cells["dashes"] == 0,
              f"{cfb_cells['dashes']} dash cells")
        stack_text = page.locator(".ca-detail-stack").inner_text().lower()
        check("CFB carries no section explanations or verdict lines",
              page.locator(".ca-research-paths, .ca-cfb-reading-key, .ca-metric-guide").count() == 0
              and "grades ahead of" not in stack_text and "carries the stronger" not in stack_text)
        check("CFB names no largest gaps for the reader", "largest" not in stack_text)
        page.locator("a[data-nfl-tab='passing']").click()
        check("CFB tabs switch to one group",
              page.locator("#cfb-passing.is-tab-on").count() == 1
              and page.locator("#cfb-efficiency.is-tab-on").count() == 0)
        qb_text = page.locator("#cfb-quarterbacks").inner_text().lower()
        check("CFB passing tab leads with both quarterback rooms beside the defense",
              page.locator("#cfb-quarterbacks.is-tab-on .ca-cfb-panel").count() == 2
              and page.locator("#cfb-quarterbacks .ca-cfb-ledger-table").count() >= 1
              and all(label in qb_text for label in (
                  "season line", "comp%", "yds/att", "dropbacks", "passing downs", "allows")),
              qb_text[:200])
        passing_text = page.locator("#cfb-passing").inner_text().lower()
        check("CFB pass game carries coverage outcomes, scheme rates and protection",
              all(label in passing_text for label in (
                  "comp%", "yds/att", "yds/comp", "rating", "epa/pass", "td rate",
                  "int rate", "pass 1d%", "sack%", "dropbacks/g", "db havoc")),
              passing_text[:200])
        check("CFB quarterback rows lead with a headshot or initials",
              page.locator("#cfb-quarterbacks tbody td:first-child .ca-cfb-player__shot").count() > 0
              and page.locator("#cfb-quarterbacks tbody td:first-child .ca-cfb-player__shot").count()
              == page.locator("#cfb-quarterbacks tbody td:first-child .ca-cfb-player").count())
        page.locator("a[data-nfl-tab='rushing']").click()
        run_text = page.locator("#cfb-rushing").inner_text().lower()
        check("CFB rushing tab carries run game, line play and ball carriers",
              page.locator("#cfb-rushers.is-tab-on .ca-cfb-panel").count() == 2
              and all(label in run_text for label in (
                  "epa/rush", "rush 1d%", "line yds", "2nd level", "power", "stuffed", "front-7 havoc")),
              run_text[:200])
        page.locator("a[data-nfl-tab='situational']").click()
        situational_text = page.locator("#cfb-situational").inner_text().lower()
        check("CFB situational carries downs, tempo, play mix and havoc",
              all(label in situational_text for label in (
                  "3rd down", "standard dn", "plays/g", "pass rate", "havoc")),
              situational_text[:200])
        page.locator("a[data-nfl-tab='games']").click()
        check("CFB game log lists both schools' games with a ranked season row",
              page.locator("#cfb-game-log.is-tab-on .ca-log-panel").count() == 2
              and page.locator("#cfb-game-log tbody tr.ca-log-season").count() == 2
              and page.locator("#cfb-game-log tbody .ca-rank").count() > 10)
        cfb_text = page.locator("main").inner_text()
        match = PROHIBITED.search(cfb_text)
        check("CFB detail public copy boundary", match is None, match.group(0) if match else "")
        check("CFB detail no horizontal overflow",
              page.evaluate("document.documentElement.scrollWidth - innerWidth") <= 1)
        page.set_viewport_size({"width": 390, "height": 844})
        check("CFB phone layout has no horizontal overflow",
              page.evaluate("document.documentElement.scrollWidth - innerWidth") <= 1)
        check("CFB phone reads one school at a time",
              page.locator(".ca-detail-stack").get_attribute("data-club") in ("away", "home"))
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
