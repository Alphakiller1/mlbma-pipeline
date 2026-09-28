"""Full MLB matchup audit: population, alignment and formatting across games and widths.

    python scripts/mlb_matchup_audit.py [base_url]   (default: production)
Game ids are the 2026 Wild Card games; pass others by editing GAMES.
"""
import json
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://chase-analytics.com"
GAMES = ["849845", "849849", "849851", "849843"]
WIDTHS = [1440, 1024, 390]

AUDIT = r"""() => {
  const out = {sections: {}, pageOverflow: document.documentElement.scrollWidth - innerWidth};
  const sections = [...document.querySelectorAll('.ca-detail-section')];
  for (const s of sections) {
    const r = {};
    const notes = [...s.querySelectorAll('.ca-detail-source-note')].filter(n => n.offsetParent)
      .map(n => n.innerText.trim());
    r.notes = notes;
    const tds = [...s.querySelectorAll('td')].filter(t => t.offsetParent);
    r.cells = tds.length;
    r.dashes = tds.filter(t => ['—', '-', '–', '', 'NaN', 'undefined', 'null'].includes(t.innerText.trim())
      && !t.classList.contains('ca-lineup-slot') && t.cellIndex !== 1).length;
    r.bad = tds.filter(t => /NaN|undefined|null|Infinity/.test(t.innerText)).map(t => t.innerText).slice(0, 3);
    // cells whose content is cut off
    r.clipped = tds.filter(t => t.scrollWidth > t.clientWidth + 2 && getComputedStyle(t).overflow !== 'visible')
      .map(t => t.innerText.slice(0, 20)).slice(0, 3);
    // scroll containers that overflow (fine on phones, flagged on desktop)
    r.scrollers = [...s.querySelectorAll('.ca-lineup-scroll')].filter(e => e.offsetParent)
      .filter(e => e.scrollWidth > e.clientWidth + 1).length;
    // alignment: visible tables of the same class, compare header x positions
    const groups = {};
    for (const t of [...s.querySelectorAll('table')].filter(t => t.offsetParent)) {
      const key = t.className;
      (groups[key] = groups[key] || []).push([...t.querySelectorAll('thead th')].map(h => Math.round(h.getBoundingClientRect().left - t.getBoundingClientRect().left)));
    }
    r.misaligned = Object.entries(groups).filter(([k, list]) => list.length > 1 && list.some(x => {
      const n = Math.min(x.length, list[0].length);
      return x.slice(0, n).some((v, i) => Math.abs(v - list[0][i]) > 2);
    })).map(([k]) => k);
    out.sections[s.id] = r;
  }
  return out;
}"""

report = {}
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in WIDTHS:
        for game in GAMES:
            page = browser.new_page(viewport={"width": width, "height": 1000})
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.goto(f"{BASE}/mlb/matchup.html?game={game}&gamePk={game}&date=2026-09-29",
                      wait_until="domcontentloaded")
            page.wait_for_selector(".ca-detail-hero", timeout=45000)
            for sel in ("#bullpens .ca-relief-table", "#runs-hand .ca-runs-hand-table",
                        "#form .ca-mirror__row", "#club-splits .ca-index-table", "#series .ca-h2h-table"):
                try:
                    page.wait_for_selector(sel, timeout=45000)
                except Exception:
                    pass
            page.wait_for_timeout(6000)
            result = page.evaluate(AUDIT)
            result["errors"] = errors[:5]
            report[f"{game}@{width}"] = result
            page.close()
    browser.close()

# summarise the problems only
for key, r in report.items():
    issues = []
    if r["pageOverflow"] > 1:
        issues.append(f"page overflow {r['pageOverflow']}")
    if r["errors"]:
        issues.append(f"errors {r['errors']}")
    for sid, s in r["sections"].items():
        bits = []
        if s["notes"]:
            bits.append(f"notes={s['notes']}")
        if s["dashes"]:
            bits.append(f"dashes={s['dashes']}")
        if s["bad"]:
            bits.append(f"bad={s['bad']}")
        if s["clipped"]:
            bits.append(f"clipped={s['clipped']}")
        if s["misaligned"]:
            bits.append(f"misaligned={s['misaligned']}")
        if s["scrollers"] and key.endswith("@1440"):
            bits.append(f"desktop-scroll={s['scrollers']}")
        if bits:
            issues.append(f"{sid}: " + "; ".join(bits))
    print(key, "OK" if not issues else "")
    for issue in issues:
        print("   ", issue)
json.dump(report, open("mlb_matchup_audit.json", "w"), indent=1)
