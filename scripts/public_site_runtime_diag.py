#!/usr/bin/env python3
"""End-to-end browser contract for the public matchup experience."""
from __future__ import annotations

import argparse
import json
import re
import urllib.parse
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
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

# Every graded figure in a desk table prints its place (owner, 2026-11-11:
# "some values are missing rank, fix this everywhere"). A cell is graded when it
# or a value inside it carries a tier class; the pill must sit in the same cell.
UNPILLED_AUDIT = r"""
() => {
  const tier = /(^|\s)c-(elite|good|mid|weak|poor)(\s|$)/;
  // Figures only: rank-bar cells hold no number, and a W/L result is a result.
  const cells = [...document.querySelectorAll('.ca-detail-stack table td')].filter(td =>
    /\d/.test(td.innerText) && !td.querySelector('[data-result], .ca-log-result'));
  const graded = cells.filter(td => tier.test(td.className) ||
    [...td.querySelectorAll('[class]')].some(el => !el.classList.contains('ca-rank') && tier.test(el.className)));
  const bad = graded.filter(td => !td.querySelector('.ca-rank')).map(td => {
    const sec = td.closest('.ca-detail-section'); const table = td.closest('table');
    const idx = [...td.parentElement.cells].indexOf(td);
    const head = table.tHead ? [...table.tHead.rows].pop().cells[idx] : null;
    return (sec ? sec.id : '?') + ' | ' + (head ? head.innerText.trim() : '') + ' | ' + td.innerText.trim().slice(0, 24);
  });
  return { graded: graded.length, unpilled: bad.length, sample: bad.slice(0, 6) };
}
"""

# Regression Watch (pipeline/regression.py, 2026-11-20), one shape on every
# desk: the ledger, a Luck By Source panel per team, a pill on every source's
# Pts/G, and each team's sources adding up to its Margin From Luck.
REGRESSION_AUDIT = r"""(id) => {
  const sec = document.getElementById(id);
  if (!sec) return { missing: true };
  const first = td => td ? parseFloat((td.childNodes[0] || {}).textContent) : NaN;
  const ledger = sec.querySelector('.ca-cfb-h2h table');
  const row = ledger ? [...ledger.tBodies[0].rows].find(r => /margin from luck/i.test(r.cells[0].textContent)) : null;
  const luck = row ? [first(row.cells[1]), first(row.cells[3])] : [];
  const panels = [...sec.querySelectorAll('.ca-regression-panel')];
  const rows = panels.map(p => [...p.querySelectorAll('tbody tr')]);
  return {
    ledger: !!ledger, panels: panels.length, rows: rows.map(r => r.length), luck,
    sums: rows.map(r => Math.round(10 * r.reduce((t, tr) => t + first(tr.cells[tr.cells.length - 1]), 0)) / 10),
    unpilled: rows.flat().filter(tr => !tr.cells[tr.cells.length - 1].querySelector('.ca-rank')).length,
    loading: /is loading/i.test(sec.textContent),
    unpublished: /regression watch is not published/i.test(sec.textContent)
  };
}"""


def regression_ok(audit: dict, published: bool, parts: int) -> bool:
    """A desk whose data carries the blocks shows them whole and reconciled;
    one whose data does not yet shows the pending note, not a broken panel."""
    if not published:
        return bool(audit.get("unpublished")) and not audit.get("loading")
    if not (audit.get("ledger") and audit.get("panels") == 2 and audit.get("rows") == [parts, parts]
            and audit.get("unpilled") == 0):
        return False
    return all(abs(total - luck) <= 0.35 for total, luck in zip(audit["sums"], audit["luck"]) if luck == luck)


# Owner rule: no dash cells anywhere - a missing figure says why ("No PA",
# "Not Applicable", "No Close Games"). Returns where each dash cell sits.
# Label standard (2026-11-19, design/MATCHUP_LABEL_STANDARD.md): headings,
# panel titles, column headers, group titles and ledger stat labels are in desk
# casing (every word capitalised; "vs" and a unit in parentheses lower case),
# slashes are never spaced, "vs" carries no period, and no caption line shows
# under a panel title. Returns the first violations found on the shown desk.
LABEL_AUDIT = r"""() => {
  const units = new Set(['in', 'lb', 'lbs', 'mph', 'ft', 'sec']);
  const lower = text => text.split(' ').some(word => word.split(/[-\/]/).some(part => {
    const m = /^([("'\u2018\u201c]*)([a-z][a-z']*)([^A-Za-z]*)$/.exec(part);
    return m && m[2] !== 'vs' && !(m[1] === '(' && units.has(m[2]));
  }));
  const raw = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const shown = el => el.offsetParent !== null;
  const out = [];
  const stack = document.querySelector('.ca-detail-stack');
  if (!stack) return out;
  const texts = [];
  stack.querySelectorAll('.ca-detail-section__head h2, .ca-detail-section__head p, .ca-detail-section h3').forEach(el => {
    if (shown(el)) texts.push(['heading', el]);
  });
  stack.querySelectorAll('.ca-detail-section thead th').forEach(el => { if (shown(el) && raw(el)) texts.push(['header', el]); });
  stack.querySelectorAll('.ca-cfb-ledger-table tbody tr').forEach(tr => {
    if (!shown(tr)) return;
    const first = tr.children[0];
    if (first) texts.push([tr.children.length === 1 ? 'group' : 'label', first]);
  });
  for (const [kind, el] of texts) {
    const text = raw(el);
    const sid = (el.closest('.ca-detail-section') || {}).id || '?';
    if (lower(text)) out.push(sid + ' ' + kind + ' lowercase: ' + text.slice(0, 60));
    else if (/\w \/ \w/.test(text) && text.indexOf('% / ') < 0) out.push(sid + ' ' + kind + ' spaced slash: ' + text.slice(0, 60));
    else if (/\bvs\./.test(text)) out.push(sid + ' ' + kind + ' vs.: ' + text.slice(0, 60));
  }
  stack.querySelectorAll('.ca-lineup-context').forEach(el => {
    if (shown(el)) out.push(((el.closest('.ca-detail-section') || {}).id || '?') + ' caption shows: ' + raw(el).slice(0, 60));
  });
  return out.slice(0, 8);
}"""


DASH_AUDIT = """() => [...document.querySelectorAll('.ca-detail-stack td')]
  .filter(td => td.offsetParent && /^[—–-]$/.test(td.innerText.trim()))
  .map(td => ((td.closest('.ca-detail-section') || {}).id || '?') + ': ' +
    (td.closest('tr') || td).innerText.replace(/\s+/g, ' ').trim().slice(0, 40)).slice(0, 5)"""


TEAM_RANK_AUDIT = """
(badges, cap) => badges.map(el => ({
  rank: Number(el.dataset.rank), of: Number(el.dataset.rankOf), label: el.title
})).filter(p => !(p.rank >= 1 && p.rank <= p.of && p.of <= cap && p.label.includes(' of ')))
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
            page.wait_for_selector("#openingCbbSlate .ca-matchup-card", timeout=timeout_ms)
            page.wait_for_selector("#openingNflSlate .ca-matchup-card", timeout=timeout_ms)
            # The crest checks read naturalWidth, which is 0 until the image has
            # decoded. A fixed 300ms pause was winning that race most of the
            # time and losing it perhaps one run in five - reporting a crest
            # density of 0 and failing a deploy over a slow CDN response rather
            # than over anything in the build. Wait for the images themselves.
            try:
                page.wait_for_function(
                    """() => [...document.querySelectorAll(
                         '#openingCbbSlate .ca-matchup-card__club img')]
                       .every(i => i.complete)""",
                    timeout=timeout_ms)
            except Exception:
                pass
            page.wait_for_timeout(300)

            metrics = page.evaluate("""() => {
              const cards = [...document.querySelectorAll('#openingCbbSlate .ca-matchup-card')];
              const grid = document.querySelector('#openingCbbSlate .ca-slate-grid');
              const columns = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
              return {
                overflow: document.documentElement.scrollWidth - innerWidth,
                columns,
                cards: cards.length,
                minHeight: cards.length ? Math.min(...cards.map(x => Math.round(x.getBoundingClientRect().height))) : 0,
                maxHeight: cards.length ? Math.max(...cards.map(x => Math.round(x.getBoundingClientRect().height))) : 0,
                crests: document.querySelectorAll('#openingCbbSlate .ca-matchup-card__club img').length,
                brokenCrests: [...document.querySelectorAll('#openingCbbSlate .ca-matchup-card__club img')]
                  .filter(i => i.complete && i.naturalWidth === 0).length,
                crestDensity: (() => {
                  // Crests below the fold are lazy-loaded, so measure the first
                  // one that has actually decoded rather than the first in DOM
                  // order - at 390px the top card can still be pending.
                  const loaded = [...document.querySelectorAll('#openingCbbSlate .ca-matchup-card__club img')]
                    .find(i => i.naturalWidth > 0);
                  if (!loaded) return 0;
                  return loaded.naturalWidth / Math.max(1, Math.round(loaded.getBoundingClientRect().width));
                })(),
                namedTeams: document.querySelectorAll('#openingCbbSlate .ca-matchup-card__name').length,
                bareAbbr: [...document.querySelectorAll('#openingCbbSlate .ca-matchup-card__club')]
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
            expanders = page.locator("#openingCbbSlate .ca-matchup-card__expand-btn")
            slate_cards = page.locator("#openingCbbSlate .ca-matchup-card").count()
            check(f"{width}px expand controls",
                  slate_cards >= 1 and expanders.count() == slate_cards,
                  f"{expanders.count()} controls on {slate_cards} cards")
            if expanders.count() >= 2:
                expanders.nth(0).focus()
                expanders.nth(0).press("Enter")
                check(f"{width}px first expansion opens", expanders.nth(0).get_attribute("aria-expanded") == "true")
                expanders.nth(1).click()
                open_count = page.locator("#openingCbbSlate .ca-matchup-card.is-expanded").count()
                check(f"{width}px one expansion at a time", open_count == 1, f"open={open_count}")
            context.close()

        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()
        # Collection grows daily. Verify rendered denominators against the
        # published source, not the launch day's frozen shot totals.
        cbb_counts = {}
        for year in (2026, 2027):
            a = page.request.get(base_url.rstrip('/') + f'/data/public/cbb/{year}/teams/127.json').json()
            h = page.request.get(base_url.rstrip('/') + f'/data/public/cbb/{year}/teams/150.json').json()
            schema = 'coordinates'  # every matchup reads Chase zones so every zone ranks
            total = h['shots'][schema]['offense']['totals']
            cbb_counts[year] = f"{total['made']}/{total['attempts']}"
        page.goto(base_url.rstrip("/") + "/cbb/matchup.html?game=401909564#shooting", wait_until="domcontentloaded", timeout=timeout_ms)
        page.wait_for_selector("#cbb-shot-chart .ca-cbb-court", timeout=timeout_ms)
        cbb_watch = all((page.request.get(base_url.rstrip('/') + f'/data/public/cbb/2027/teams/{t}.json').json()
                         .get('regression') or {}).get('margin') for t in (127, 150))
        cbb_regression = page.evaluate(REGRESSION_AUDIT, "cbb-regression")
        check("CBB Regression Watch reads margin, luck by source and close games, and reconciles",
              regression_ok(cbb_regression, cbb_watch, 4), str(cbb_regression))
        check("CBB uses nine evidence tabs (Halves 2026-11-19)", page.locator(".ca-nfl-tabs a[data-nfl-tab]").count() == 9)
        page.locator('[data-cbb-view="defense"]').click()
        # The court, its badges and the table read one tone per zone; on the
        # allowed view a low FG% is the favorable end.
        agree = page.evaluate("""() => [...document.querySelectorAll('#cbb-shot-chart .ca-cfb-ledger')].every(panel => {
          const tones = [...panel.querySelectorAll('.ca-court-zone')].map(z => (z.getAttribute('class').match(/c-[a-z]+/) || [''])[0]);
          const legend = panel.querySelector('.ca-cbb-legend__labels');
          return tones.length === 5 && legend && /allowed/.test(legend.textContent) &&
            !panel.querySelector('th') .textContent.includes('gap') &&
            ![...panel.querySelectorAll('th')].some(th => /gap/i.test(th.textContent));
        })""")
        check("CBB allowed view reads low as favorable with no gap column", agree)
        page.locator('[data-cbb-view="offense"]').click()
        check("CBB observed shooting counts", cbb_counts[2027] in page.locator("#cbb-shot-chart").text_content())
        page.locator('[data-cbb-season="2026"]').click()
        check("CBB previous season changes the evidence", cbb_counts[2026] in page.locator("#cbb-shot-chart").text_content())
        page.locator('[data-cbb-season="2027"]').click()
        check("CBB current season restores the evidence", cbb_counts[2027] in page.locator("#cbb-shot-chart").text_content())
        check("CBB public copy boundary", PROHIBITED.search(page.locator("main").inner_text()) is None)
        page.evaluate("document.querySelector('.ca-detail-stack').setAttribute('data-nfl-tab', 'all')")
        page.wait_for_timeout(1500)
        cbb_pills = page.evaluate(UNPILLED_AUDIT)
        # 2026-11-19: first- and second-half figures and pace, where the export publishes them.
        halves_published = '"h1_ppp_o":0' in page.request.get(
            base_url.rstrip('/') + '/data/public/cbb/2027/teams/150.json').text().replace(' ', '')
        halves_text = page.locator("#cbb-halves").inner_text().lower()
        check("CBB halves set each offense against the defense, half by half, with pace, where published",
              not halves_published or all(k in halves_text for k in ("first half", "second half", "pts/100", "pace (poss/half)",
                                                                      "sec/possession")),
              halves_text[:200])
        cbb_labels = page.evaluate(LABEL_AUDIT)
        check("CBB labels follow the desk label standard", not cbb_labels, str(cbb_labels))
        check("CBB every graded figure carries its rank pill",
              cbb_pills["graded"] > 40 and cbb_pills["unpilled"] == 0, str(cbb_pills))
        cbb_dashes = page.evaluate(DASH_AUDIT)
        check("CBB desk has no dash cells", not cbb_dashes, str(cbb_dashes))
        # 2026-11-19: drives, floaters and pull-ups only on games whose feed names
        # them; a side with none leaves the row off instead of "Not tracked".
        check("CBB shot types print no untracked cells",
              "not tracked" not in page.locator("#cbb-shot-types").inner_text().lower())
        # Shot quality (pipeline/cbb_public/shot_quality.py), once the export publishes it.
        quality_published = '"pefg_o_all":0' in page.request.get(
            base_url.rstrip('/') + '/data/public/cbb/2027/teams/150.json').text().replace(' ', '')
        efficiency_text = page.locator("#cbb-efficiency").inner_text().lower()
        check("CBB efficiency carries xeFG and predicted eFG where published",
              not quality_published or ("xefg% (shot mix)" in efficiency_text and "predicted efg%" in efficiency_text),
              efficiency_text[:200])

        rank_url = "**/data/public/cbb/matchup-ranks.json"
        page.route(rank_url, lambda route: route.abort())
        page.goto(base_url.rstrip("/") + "/cbb/matchup.html?game=401909694&date=2026-11-02#cbb-game-log",
                  wait_until="domcontentloaded", timeout=timeout_ms)
        page.wait_for_selector("#cbb-game-log .ca-cbb-log-table", timeout=timeout_ms)
        final_rows = []
        for team in ("52", "50"):
            context_data = page.request.get(f"{base_url.rstrip('/')}/data/public/cbb/2027/teams/{team}.json").json()
            stored = next(row for row in context_data["games"] if str(row["id"]) == "401909694")
            mark = "W" if stored["points"] > stored["opponent_points"] else "L"
            score = f"{mark} {stored['points']}–{stored['opponent_points']}"
            adjusted = f"{stored['adj_points']:.1f}–{stored['adj_opponent_points']:.1f}"
            rows = page.locator("#cbb-game-log tbody tr").filter(has_text=score)
            final_rows.append(rows.count() == 1 and rows.first.locator("td").count() == 13 and
                              adjusted in rows.first.text_content())
        check("CBB finals retain both stored box scores and adjusted results", all(final_rows))
        cbb_index = page.request.get(base_url.rstrip("/") + "/data/public/cbb/teams.json").json()["teams"]
        team_count = sum("2027" in team["seasons"] for team in cbb_index.values())
        log_badges = page.locator("#cbb-game-log .ca-rank")
        invalid_ranks = log_badges.evaluate_all(TEAM_RANK_AUDIT, team_count)
        check("CBB game-log ranks fit the D-I team scale without the rank file",
              team_count > 1 and log_badges.count() > 0 and not invalid_ranks, str(invalid_ranks[:4]))
        page.unroute(rank_url)

        nba = page.request.get(base_url.rstrip('/') + '/data/public/nba/slate.json').json()
        if nba.get('games'):
            fixture = nba['games'][0]
            page.goto(base_url.rstrip('/') + '/nba/matchup.html?game=' + str(fixture['id']) + '#defense',
                      wait_until='domcontentloaded', timeout=timeout_ms)
            page.wait_for_selector('[data-nba-season="2027"]', timeout=timeout_ms)
            check('NBA measured coverage includes exact samples', page.locator('#nba-coverage .ca-coverage-sample').count() >= 4)
            page.locator('[data-nba-season="2026"]').click()
            check('NBA prior season changes measured coverage', '2025–26' in page.locator('#nba-coverage').text_content())
            check('NBA season selection preserves active tab', page.locator('.ca-detail-stack').get_attribute('data-nfl-tab') == 'defense')
            page.locator('[data-nba-season="2027"]').click()
            check('NBA current season restores measured coverage', '2026–27' in page.locator('#nba-coverage').text_content())
            check('NBA measured and inferred coverage remain distinct', 'Inferred Defensive Tendencies' in page.locator('#nba-scheme').inner_text())
            page.evaluate("document.querySelector('.ca-detail-stack').setAttribute('data-nfl-tab', 'all')")
            page.wait_for_timeout(1500)
            nba_pills = page.evaluate(UNPILLED_AUDIT)
            nba_labels = page.evaluate(LABEL_AUDIT)
            check("NBA labels follow the desk label standard", not nba_labels, str(nba_labels))
            check('NBA every graded figure carries its rank pill',
                  nba_pills['graded'] > 100 and nba_pills['unpilled'] == 0, str(nba_pills))
            nba_dashes = page.evaluate(DASH_AUDIT)
            check('NBA desk has no dash cells', not nba_dashes, str(nba_dashes))
            nba_power = page.request.get(base_url.rstrip('/') + '/data/public/nba/power.json').json()
            nba_watch = all((nba_power.get('regression') or {}).get(fixture[s]) for s in ('away', 'home'))
            page.wait_for_function("() => !/is loading/i.test((document.getElementById('nba-regression') || {}).textContent || '')",
                                   timeout=timeout_ms)
            nba_regression = page.evaluate(REGRESSION_AUDIT, "nba-regression")
            check('NBA Regression Watch reads margin, luck by source and close games, and reconciles',
                  regression_ok(nba_regression, nba_watch, 4), str(nba_regression))
            log_ranks = page.locator("#nba-game-log .ca-log-panel td.num .ca-rank")
            bad_nba_ranks = log_ranks.evaluate_all(TEAM_RANK_AUDIT, 30)
            check("NBA game-log ranks use the team scale", not bad_nba_ranks, str(bad_nba_ranks[:4]))
            page.locator("a[data-nfl-tab='units']").click()
            nba_units = page.evaluate("() => [...document.querySelectorAll('.ca-detail-section')].filter(s => s.offsetParent).map(s => s.id)")
            check("NBA Matchup tab opens on Power Ranking, as every desk does",
                  nba_units[:2] == ["nba-power", "nba-edge-map"] and "nba-predictability" in nba_units, str(nba_units))
            check("NBA consistency section is named Predictability",
                  page.locator("#nba-predictability .ca-detail-section__head h2").first.inner_text().strip() == "Predictability")
            maps = page.locator("#nba-edge-map .ca-nba-map")
            badges = maps.locator("td.num > .ca-rank")
            mismatches = badges.evaluate_all("""badges => badges.filter(badge => {
              const rank = Number(badge.dataset.rank), pool = Number(badge.dataset.rankOf);
              const side = badge.closest('td').classList.contains('ca-ledger-right') ? 'right' : 'left';
              const bar = badge.closest('tr').querySelector('.ca-ledger-bar.is-' + side);
              const grade = MLBMAAssets.rankChipClass(rank, pool);
              return rank < 1 || rank > pool || pool > 30 || !bar ||
                !bar.classList.contains(grade) || !badge.classList.contains(grade) ||
                parseFloat(bar.firstElementChild.style.width) !== Math.max(4, Math.round(100 * (pool - rank) / (pool - 1)));
            }).length""")
            check("NBA Matchup Map pairs ranks with matching grade-colored bars",
                  maps.count() == 2 and badges.count() > 0 and mismatches == 0, f"{mismatches} inconsistent bars")
            more = maps.locator("[data-nba-map-more]:visible").first
            if more.count():
                table = page.locator("#" + more.get_attribute("aria-controls"))
                visible = table.locator("tbody tr:not(.ca-ledger-group):visible")
                before = visible.count()
                more.press("Enter")
                check("NBA Matchup Map opens its additional categories by keyboard",
                      before == 10 and more.get_attribute("aria-expanded") == "true" and visible.count() > before)
                more.press("Enter")
                check("NBA Matchup Map returns to its first ten rows",
                      more.get_attribute("aria-expanded") == "false" and visible.count() == before)
            missing_notes = page.locator(".ca-detail-stack > .ca-detail-section").evaluate_all(
                """sections => sections.filter(s => !s.querySelector('.ca-detail-section__head p')?.textContent.trim())
                  .map(s => s.id)""")
            check("NBA sections label the statistics and figures they contain", not missing_notes, str(missing_notes))
            page.set_viewport_size({"width": 375, "height": 824})
            check("NBA Matchup Map fits a phone", page.evaluate("document.documentElement.scrollWidth") <= 375)
            page.locator("a[data-nfl-tab='players']").click()
            profile_headers = page.locator(".ca-nba-player-type-panel thead th:visible")
            if profile_headers.count():
                unreadable = profile_headers.evaluate_all("""headers => headers.filter(th =>
                  th.clientWidth < 32 || th.scrollWidth > th.clientWidth + 1).map(th => th.textContent)""")
                check("NBA phone shows readable player play-type columns", not unreadable, str(unreadable))

        for sport in ("cbb", "nfl", "cfb", "nba"):
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
        check("NFL desk carries the eleven evidence tabs (Penalties 2026-11-19)",
              page.locator(".ca-nfl-tabs a[data-nfl-tab]").count() == 11)
        # The desk reads a tab at a time, and where the clubs stack, one club at a time.
        shown = "() => [...document.querySelectorAll('.ca-detail-section')].filter(s => s.offsetParent).map(s => s.id).join(',')"
        check("NFL desk opens on the Units tab alone", page.evaluate(shown) == "power,strength,efficiency,dvoa,predictability", page.evaluate(shown))
        # 2026-11-18: OSI, DSI and NSI (outputs/strength_index.py).
        strength_text = page.locator("#strength").text_content().lower()
        check("NFL strength index ranks OSI, DSI and NSI for both clubs with its formula",
              ("nsi · net" in strength_text and "osi · offense" in strength_text and "dsi · defense" in strength_text
               and "home field" in strength_text and page.locator("#strength tbody .ca-rank").count() >= 26)
              or "not published" in strength_text, strength_text[:200])
        nfl_slate_text = page.request.get(base_url.rstrip("/") + "/data/public/nfl/slate.json").text()
        qb_published = '"qb_epa"' in nfl_slate_text
        # 2026-11-19: penalties by team and unit, their own tab; no longer in Situational.
        page.locator('a[data-nfl-tab="penalties"]').click()
        pen_text = page.locator("#penalties").text_content().lower()
        check("NFL Penalties tab ranks team, offense, defense and special-teams fouls where published",
              '"off_pen_pg"' not in nfl_slate_text or (
                  "offense" in pen_text and "defense" in pen_text and "special teams" in pen_text
                  and "pre-snap/g" in pen_text and page.locator("#penalties tbody .ca-rank").count() >= 40),
              pen_text[:200])
        check("NFL Situational no longer repeats the penalty rows",
              "penalties/g" not in page.locator("#situational").text_content().lower())
        page.locator('a[data-nfl-tab="units"]').click()
        check("NFL strength index shows the quarterback read where published",
              not qb_published or ("qb " in strength_text and "epa/db" in strength_text), strength_text[-200:])
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
              page.evaluate(shown) == "game-log,regression" and log_cells["panels"] == 2
              and log_cells["strips"] == 2 and log_cells["rows"] >= 4, str(log_cells))
        check("NFL game log grades every rate with a pill and no dash cells",
              log_cells["unpilled"] == 0 and log_cells["dashes"] == 0, str(log_cells))
        nfl_logs = page.request.get(base_url.rstrip("/") + "/data/public/nfl/game_logs.json").json()
        nfl_watch = bool(nfl_logs.get("regression"))
        nfl_regression = page.evaluate(REGRESSION_AUDIT, "regression")
        check("NFL Regression Watch reads margin, luck by kick and fumble and one-score games, and reconciles",
              regression_ok(nfl_regression, nfl_watch, 6), str(nfl_regression))
        page.locator('a[data-nfl-tab="passing"]').click()
        check("NFL Passing tab shows quarterbacks, coverage and looks",
              page.evaluate(shown) == "quarterbacks,coverage,looks" and page.url.endswith("#passing"),
              page.evaluate(shown) + " " + page.url)
        # Owner 2026-11-12: no purple sub-text anywhere. Provenance stays in the
        # DOM (the checks below read text_content), but none of it shows.
        purple = page.evaluate("""() => Array.from(document.querySelectorAll(
          '.ca-lineup-context, .ca-detail-eyebrow, .ca-public-page__eyebrow, .ca-analysis-scope__eyebrow'))
          .filter(el => el.offsetParent !== null).length""")
        check("NFL matchup shows no purple sub-text", purple == 0, f"visible={purple}")
        page.locator('a[data-nfl-tab="units"]').click()
        check("NFL Units tab carries DVOA with both FTN panels (no DVOA tab of its own)",
              "dvoa" in page.evaluate(shown).split(",")
              and page.locator('a[data-nfl-tab="dvoa"]').count() == 0
              and page.locator("#dvoa .ca-nfl-dvoa-panel").count() == 2)
        dvoa_text = page.locator("#dvoa").text_content().lower()
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
        check("NFL opens on current-season data",
              page.locator("[data-season-scope='current']").get_attribute("aria-pressed") == "true")
        page.locator("[data-season-scope='combined']").click()

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
        ledgers = page.locator("#efficiency [data-season-view]:visible .ca-cfb-ledger-table")
        units = ledgers.evaluate_all("""tables => tables.map(table => ({
          rows: [...table.querySelectorAll('td[role="rowheader"]')].map(td => td.textContent),
          ranks: table.querySelectorAll('.ca-rank').length,
          bars: [...table.querySelectorAll('.ca-ledger-bar i')].filter(bar => parseFloat(bar.style.width) > 0).length
        }))""")
        check("NFL unit matchups pair each offense with the defense it meets",
              len(units) == 2 and units[0]["rows"] == units[1]["rows"] and len(units[0]["rows"]) == 10,
              str(units))
        check("NFL ranked unit figures carry mirrored bars",
              bool(units) and all(unit["bars"] == unit["ranks"] > 0 for unit in units), str(units))
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
        # Owner 2026-10-04: pace by situation and time of possession.
        pace_text = page.locator("#pace").inner_text().lower()
        check("NFL pace reads every situation and time of possession, ranked",
              page.locator("#pace .ca-nfl-pace-panel").filter(visible=True).count() >= 1
              and all(label in pace_text for label in (
                  "full game", "1st half", "2nd half", "leading", "trailing", "neutral",
                  "time of possession", "sec/snap", "snaps/g"))
              and page.locator("#pace .ca-freq-mark").filter(visible=True).count() >= 10,
              pace_text[:200])
        check("NFL tendency frequencies are never graded as performance",
              page.locator("#tendencies :is(td:nth-child(2),td:nth-child(3))[class*='c-']").count() == 0)
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
        nfl_labels = page.evaluate(LABEL_AUDIT)
        check("NFL labels follow the desk label standard", not nfl_labels, str(nfl_labels))
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
        check("NFL reads sack rate once, in Efficiency",
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
                      ("yds/g", "epa/car", "stuff%", "ball carriers")))
        check("NFL running-back panels carry box, direction and NGS context",
              all(label in rb_text for label in ("light box", "run left", "ryoe / carry")) or
              section_unpublished("#rushing"))
        trench_text = page.locator("#trenches").inner_text().lower()
        check("NFL trenches pair each line with the front it meets and map run direction",
              (page.locator("#trenches .ca-arsenal-table:visible").count() == 2 and
               all(label in trench_text for label in ("line yds", "havoc%", "yds before contact", "run direction",
                                                      "at the guards", "outside the ends"))) or
              section_unpublished("#trenches"))
        direction_ranks = page.locator("#trenches .ca-nfl-mix .ca-rank")
        bad_direction_ranks = direction_ranks.evaluate_all(TEAM_RANK_AUDIT, 32)
        check("NFL run directions use eligible club pools",
              (direction_ranks.count() > 0 and not bad_direction_ranks) or section_unpublished("#trenches"),
              str(bad_direction_ranks[:4]))
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
                  ("trips/g", "trip rate", "td%", "score%", "targets by position",
                   "tgt share", "car share")))
        page.locator("[role='tab'][data-nfl-tab='receiving']").click()
        # 2026-11-18: targets to WR, TE and RB against each look, read from
        # data/public/nfl/position_coverage.json after the page opens.
        try:
            page.wait_for_selector("#position-coverage .ca-poscov-table", timeout=timeout_ms)
        except Exception:
            pass
        poscov = page.evaluate("""() => {
          const sec = document.querySelector('#position-coverage');
          const tds = [...document.querySelectorAll('#position-coverage td')].filter(td => td.offsetParent);
          return {
            tables: document.querySelectorAll('#position-coverage .ca-poscov-table').length,
            panels: document.querySelectorAll('#position-coverage [data-season-view="current"] .ca-nfl-poscov').length,
            dashes: tds.filter(td => td.innerText.trim() === '—').length,
            unpilled: tds.filter(td => /(^|\s)c-(elite|good|mid|weak|poor)(\s|$)/.test(td.className)
              && !td.querySelector('.ca-rank')).length,
            all: sec ? sec.textContent.toLowerCase() : ''
          }; }""")
        check("NFL coverage by position group sets WR, TE and RB against each look, both directions",
              (poscov["tables"] >= 4 and poscov["panels"] == 2
               and all(label in poscov["all"] for label in (
                   "wide receivers", "tight ends", "running backs", "cover 3", "vs man", "vs blitz",
                   "yards per target allowed by position and alignment")))
              or "not published" in poscov["all"],
              str({k: v for k, v in poscov.items() if k != "all"}))
        check("NFL coverage by position group grades every figure and prints no dash",
              poscov["unpilled"] == 0 and poscov["dashes"] == 0,
              str({k: v for k, v in poscov.items() if k != "all"}))
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
                  "success%" in shown_text and "play action" in shown_text and "with motion" in shown_text,
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
        page.set_viewport_size({"width": 375, "height": 824})
        page.locator("a[data-nfl-tab='tendencies']").click()
        clipped_pace = page.locator("#pace thead th:visible").evaluate_all("""headers =>
          headers.filter(th => th.scrollWidth > th.clientWidth + 1).map(th => th.textContent)""")
        check("NFL phone keeps the pace headings readable", not clipped_pace, str(clipped_pace))
        page.locator("a[data-nfl-tab='games']").click()
        scroll_panel = page.locator("#game-log .ca-lineup-scroll[data-table-scroll]:visible").first
        scroll_panel.wait_for(timeout=timeout_ms)
        check("NFL phone marks the wide game log as a focusable scroll region",
              scroll_panel.get_attribute("tabindex") == "0" and
              scroll_panel.get_attribute("role") == "region" and
              page.locator("#game-log .ca-table-scroll-note:visible").count() > 0)
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
        check("CFB desk carries the ten evidence tabs (ledger 2026-10-03, Availability, Defense 2026-11-18, Penalties 2026-11-19)",
              page.locator(".ca-nfl-tabs a[data-nfl-tab]").count() == 10)
        check("CFB opens on the Units evidence group alone",
              page.evaluate("[...document.querySelectorAll('.ca-detail-section')]"
                            ".filter(s => s.offsetParent).map(s => s.id).join(',')") ==
              "cfb-power,cfb-strength,cfb-efficiency,cfb-dvoa,cfb-predictability")
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
          const tone = el => [...el.classList].find(name => /^c-(elite|good|mid|weak|poor|volume|na)$/.test(name));
          const badges = [...document.querySelectorAll('.ca-cfb-ledger-table td.num .ca-rank')];
          const bars = badges.filter(badge => {
            const cell = badge.closest('td');
            const side = cell.classList.contains('ca-ledger-right') ? 'right' : 'left';
            const bar = cell.parentElement.querySelector('.ca-ledger-bar.is-' + side);
            const {rank, rankOf, percentile} = badge.dataset;
            const expected = Math.round(percentile ?? 100 * (rankOf - rank) / (rankOf - 1));
            return bar && tone(bar) === tone(badge) &&
              parseFloat(bar.firstElementChild.style.width) === Math.max(4, expected);
          }).length;
          return { sections: out, ranked: badges.length, bars }; }""")
        for sid, info in ledger["sections"].items():
            check(f"CFB {sid} reads both directions on identical ledger rows",
                  info["panels"] == 2 and info["same"] and len(info["rows"]) >= 6,
                  f"{info['panels']} panels, {len(info['rows'])} rows")
        all_rows = [r for info in ledger["sections"].values() for r in info["rows"]]
        # Team and run success rate / explosiveness share a label, one row each.
        repeated = sorted({r for r in all_rows if all_rows.count(r) > 1} - {"Success%", "Explosiveness"})
        check("CFB ledger lists each stat once across the desk", not repeated, ", ".join(repeated))
        check("CFB ledger badges and bars use the same grade and percentile",
              ledger["ranked"] > 40 and ledger["bars"] == ledger["ranked"],
              f"{ledger['ranked']} ranked, {ledger['bars']} bars")
        efficiency_text = page.locator("#cfb-efficiency").inner_text().lower()
        check("CFB efficiency carries scoring, yardage and per-play evidence",
              all(label in efficiency_text for label in ("pts/g", "pts/play", "yds/play", "success%")))
        dvoa_text = page.locator("#cfb-dvoa").text_content()
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
          const badges = [...document.querySelectorAll(
            '.ca-cfb-panel:not(#cfb-power .ca-cfb-panel) .ca-lineup-table td.num > .ca-rank')];
          const graded = badges.filter(el => /(^|\\s)c-(elite|good|mid|weak|poor|volume)(\\s|$)/.test(el.className));
          return {
            dashes: tds.filter(td => td.innerText.trim() === '—').length,
            tintedValues: graded.filter(badge => getComputedStyle(badge).color === getComputedStyle(badge.parentElement).color).length,
            graded: graded.length
          }; }""")
        check("CFB comparison grades live on badges beside neutral stat values",
              cfb_cells["tintedValues"] == 0 and cfb_cells["graded"] > 40,
              f"{cfb_cells['graded']} graded badges, {cfb_cells['tintedValues']} tinted values")
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
        qb_panels = page.locator("#cfb-quarterbacks.is-tab-on .ca-cfb-panel").count()
        qb_tables = page.locator("#cfb-quarterbacks .ca-cfb-ledger-table").count()
        qb_complete = all(label in qb_text for label in (
            "season line", "comp%", "yds/att", "dropbacks", "passing downs", "epa/play allowed"))
        # CFBD depth can be partial during a provider outage. Keep the two-sided
        # frame visible when one school's QB table is present and the other
        # panel is explicitly unavailable; do not invent a replacement line.
        qb_partial = "season line" in qb_text and "passer" in qb_text
        check("CFB passing tab leads with both quarterback rooms beside the defense",
              (qb_panels == 2 and qb_tables >= 1 and qb_complete)
              or qb_partial or "not published" in qb_text,
              qb_text[:200])
        player_sections = "#cfb-rushers, #cfb-receivers, #cfb-defenders"
        player_badges = page.locator(":is(" + player_sections + ") td .ca-rank")
        check("CFB player sections use positional percentiles and mute small samples", player_badges.evaluate_all(
            """badges => badges.length && badges.every(badge => badge.hasAttribute('data-percentile') &&
              (!badge.title.includes('below-threshold') || badge.classList.contains('c-na')))"""))
        # Owner 2026-11-19: the quarterback panel reads in the team-ranking
        # format - ordinal ranks on the FBS team scale, every pill tier-coloured,
        # values neutral (a look below its floor is coloured and tagged Low n).
        qb_cells = page.locator("#cfb-quarterbacks td .ca-rank").evaluate_all(
            """badges => badges.map(b => ({pct: b.hasAttribute('data-percentile'), rank: Number(b.dataset.rank),
              of: Number(b.dataset.rankOf), tone: /c-(elite|good|mid|weak|poor)/.test(b.className),
              valueTone: /c-(elite|good|mid|weak|poor)/.test(b.closest('td').className)}))""")
        check("CFB quarterback panel ranks on the FBS team scale with coloured pills",
              not qb_cells or (all(not c["pct"] and c["tone"] and 1 <= c["rank"] <= c["of"] <= 140
                                   for c in qb_cells)),
              str([c for c in qb_cells if c["pct"] or not c["tone"]][:3]))
        check("CFB QB splits rank against FBS defenses",
              qb_tables == 0 or page.locator("#cfb-quarterbacks .ca-rank[title*='FBS defenses']").count() > 0)
        defense_grades = page.locator("#cfb-passing tr").evaluate_all("""rows => rows
          .filter(row => ['EPA/Pass', 'Sack%'].includes(row.cells[0].textContent))
          .map(row => row.querySelector('.ca-ledger-right').title)""")
        check("CFB grades lower EPA allowed and more sacks as stronger defense",
              any("EPA" in title and "Lower is better" in title for title in defense_grades) and
              any("Sack" in title and "Higher is better" in title for title in defense_grades))
        cfb_strength_text = page.locator("#cfb-strength").text_content().lower()
        cfb_slate_text = page.request.get(base_url.rstrip("/") + "/data/public/cfb/slate.json").text()
        cfb_pen_text = page.locator("#cfb-penalties").text_content().lower()
        check("CFB Penalties ranks team and unit fouls where published",
              '"away_penalties"' not in cfb_slate_text or (
                  "offense" in cfb_pen_text and "defense" in cfb_pen_text and "pre-snap/g" in cfb_pen_text
                  and page.locator("#cfb-penalties tbody .ca-rank").count() >= 30),
              cfb_pen_text[:200])
        check("CFB strength index ranks OSI, DSI and NSI for both schools with its formula",
              ("nsi · net" in cfb_strength_text and "ppa" in cfb_strength_text and "home field" in cfb_strength_text)
              or "not published" in cfb_strength_text, cfb_strength_text[:200])
        cfb_reads = '"talent"' in page.request.get(base_url.rstrip("/") + "/data/public/cfb/slate.json").text()
        check("CFB strength index shows returning production and roster talent where published",
              not cfb_reads or ("returning ppa" in cfb_strength_text and "roster talent" in cfb_strength_text),
              cfb_strength_text[-200:])
        # 2026-11-18: the official scorer's charting (scripts/cfb_charting.py).
        map_text = page.locator("#cfb-pass-map").inner_text().lower()
        check("CFB pass map carries depth, direction, air yards and the pocket",
              all(label in map_text for label in (
                  "deep epa/att", "short comp%", "middle share", "air yds/tgt", "yac/comp",
                  "hurry+sack%", "pressured epa/db"))
              or "not published" in map_text,
              map_text[:200])
        passing_text = page.locator("#cfb-passing").inner_text().lower()
        check("CFB pass game carries coverage outcomes, scheme rates and protection",
              all(label in passing_text for label in (
                  "comp%", "yds/att", "yds/comp", "rating", "epa/pass", "td%",
                  "int%", "pass 1st down%", "sack%", "dropbacks/g", "db havoc%")),
              passing_text[:200])
        check("CFB quarterback rows lead with a headshot or initials",
              page.locator("#cfb-quarterbacks tbody td:first-child .ca-cfb-player__shot").count() > 0
              and page.locator("#cfb-quarterbacks tbody td:first-child .ca-cfb-player__shot").count()
              == page.locator("#cfb-quarterbacks tbody td:first-child .ca-cfb-player").count())
        page.locator("a[data-nfl-tab='rushing']").click()
        direction_text = page.locator("#cfb-run-direction").inner_text().lower()
        check("CFB run direction sets each run lane against the defense",
              all(label in direction_text for label in ("left yds/rush", "middle epa/rush", "right success%"))
              or "not published" in direction_text,
              direction_text[:200])
        run_text = page.locator("#cfb-rushing").inner_text().lower()
        check("CFB rushing tab carries run game, line play and ball carriers",
              page.locator("#cfb-rushers.is-tab-on .ca-cfb-panel").count() == 2
              and all(label in run_text for label in (
                  "epa/rush", "rush 1st down%", "line yds", "2nd level", "power", "stuff%", "front-7 havoc%")),
              run_text[:200])
        # 2026-11-19: ball carriers by run lane beside what the defense allows that way.
        lanes_published = '"away_run_lanes"' in page.request.get(base_url.rstrip("/") + "/data/public/cfb/slate.json").text()
        rushers_text = page.locator("#cfb-rushers").inner_text().lower()
        check("CFB ball carriers split by run lane beside the defense's lane figures where published",
              not lanes_published or ("by lane vs" in rushers_text and "run right" in rushers_text and " allows " in rushers_text),
              rushers_text[-200:])
        page.locator("a[data-nfl-tab='situational']").click()
        formation_text = page.locator("#cfb-formation").inner_text().lower()
        check("CFB formation and tempo carries shotgun, under center and no huddle",
              all(label in formation_text for label in ("shotgun", "under center", "no huddle", "shotgun epa/play"))
              or "not published" in formation_text,
              formation_text[:200])
        situational_text = page.locator("#cfb-situational").inner_text().lower()
        check("CFB situational carries downs, tempo, play mix and havoc",
              all(label in situational_text for label in (
                  "3rd-down conv%", "standard-down success%", "plays/g", "pass rate", "havoc%")),
              situational_text[:200])
        page.locator("a[data-nfl-tab='games']").click()
        sos_text = page.locator("#cfb-schedule").inner_text().lower()
        check("CFB schedule strength ranks played and remaining opponents for both schools",
              "games played" in sos_text and "games remaining" in sos_text
              and all(label in sos_text for label in ("opp sp+", "opp fpi", "opp win%"))
              and page.locator("#cfb-schedule tbody .ca-rank").count() >= 6,
              sos_text[:160])
        check("CFB game log lists both schools' games with a ranked season row",
              page.locator("#cfb-game-log.is-tab-on .ca-log-panel").count() == 2
              and page.locator("#cfb-game-log tbody tr.ca-log-season").count() == 2
              and page.locator("#cfb-game-log tbody .ca-rank").count() > 10)
        cfb_id = urllib.parse.parse_qs(urllib.parse.urlsplit(cfb_detail_url).query).get("game", [""])[0]
        cfb_slate = page.request.get(base_url.rstrip("/") + "/data/public/cfb/slate.json").json()
        # The desk's game id is the board's ("Away School @ Home School"); the slate's is coded.
        cfb_row = next((g for g in cfb_slate.get("games") or [] if cfb_id in
                        (str(g.get("id")), f"{g.get('away_name')} @ {g.get('home_name')}")), {})
        cfb_regression = page.evaluate(REGRESSION_AUDIT, "cfb-regression")
        check("CFB Regression Watch reads margin, luck by kick and fumble and one-score games, and reconciles",
              regression_ok(cfb_regression, bool(cfb_row.get("away_regression") and cfb_row.get("home_regression")), 6),
              cfb_id + " " + str(cfb_regression))
        page.locator("a[data-nfl-tab='availability']").click()
        injury_text = page.locator("#cfb-availability").text_content().lower()
        check("CFB availability tab carries both schools' injury reports",
              page.locator("#cfb-availability.is-tab-on .ca-cfb-injury-panel").count() == 2
              and "injury report" in injury_text and ("covers" in injury_text or "not published" in injury_text),
              injury_text[:160])
        cfb_text = page.locator("main").inner_text()
        match = PROHIBITED.search(cfb_text)
        check("CFB detail public copy boundary", match is None, match.group(0) if match else "")
        page.evaluate("document.querySelector('.ca-detail-stack').setAttribute('data-nfl-tab', 'all')")
        page.wait_for_timeout(800)
        cfb_dashes = page.evaluate(DASH_AUDIT)
        check("CFB desk has no dash cells", not cfb_dashes, str(cfb_dashes))
        cfb_labels = page.evaluate(LABEL_AUDIT)
        check("CFB labels follow the desk label standard", not cfb_labels, str(cfb_labels))
        page.locator("a[data-nfl-tab='availability']").click()
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


def form_is_current(age: float | None) -> tuple[bool, str]:
    """In season, team form must be under two weeks old. From October through
    February there are no regular-season games, so the final regular-season
    snapshot is the newest form that can exist: require that instead (data
    through Sept 15 or later). A fixed 14 days froze every deploy once the
    2026 regular season ended."""
    if age is None:
        return False, "not published"
    now = datetime.now(timezone.utc)
    if now.month in (10, 11, 12, 1, 2):
        season = now.year if now.month >= 10 else now.year - 1
        observed = now - timedelta(days=age)
        final = datetime(season, 9, 15, tzinfo=timezone.utc)
        return observed >= final, (f"offseason: final {season} snapshot, "
                                   f"data through {observed:%Y-%m-%d} ({age:.1f} days old)")
    return age <= 14, f"{age:.1f} days old"


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
