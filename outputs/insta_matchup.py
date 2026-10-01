"""
Instagram matchup posts: two 1080x1350 images per game, built from the live site.

    python -m outputs.insta_matchup                      # every game on today's MLB slate
    python -m outputs.insta_matchup --games PHI@ATL,BOS@NYY
    python -m outputs.insta_matchup --league nfl --games PIT@CLE

Per MLB game:
  1. Probable Starters  (#starters)  - both pitchers, stacked so the full splits table fits
  2. Offense            (#lineups)   - each order against the hand it faces tonight
Per NFL game (the page is tabbed, one club's side at a time):
  1. Away quarterback   (#quarterbacks, away side) - season line and splits by defensive look
  2. Home quarterback   (#quarterbacks, home side)
  3. Unit Matchups      (#efficiency, both sides)   - each offense above the defense it meets
  4. Injury Report      (#availability, both clubs) - the official designations
  plus a cover (0-cover, InstaCover): both QBs, the matchup and a tale of the tape in the
  site's own numbers and grade colours; --only cover makes just that.

How it stays honest and legible:
  - the sections are screenshots of chase-analytics.com itself (the design contract),
    with the two teams stacked; the page width is solved so the section fills the post,
    and a capture whose table is cut off (scrollWidth > clientWidth) is widened, never used;
  - the header line (series, game number, local start) comes from MLB's stats API;
  - the offense post says the orders are projected unless MLB has posted both lineups.

Output: video/out/instagram/<date>/<nn>-<AWAY>-<HOME>-1-starters.png and -2-offense.png
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from PIL import Image

from outputs.video_thumb import ESPN_ALIAS, SITE, find_game, nickname

ROOT = Path(__file__).resolve().parents[1]
VIDEO = ROOT / "video"
API = "https://statsapi.mlb.com/api/v1"

# The InstaMatchup body box (1080x1350 minus header 196, footer 72, sides 28): height / width.
BODY_ASPECT = (1350 - 196 - 72) / (1080 - 56)
PAGE_PAD = 56  # the matchup page's side padding at these widths
# Per league: the sections to post, in carousel order. NFL matchup pages are tabbed and show
# one club's side at a time: `tab` opens the section's tab, `club` picks the side
# (away/home), `both` shows the two sides' panels together.
SECTIONS = {
    "mlb": [
        {"section": "starters", "tag": "1-starters"},
        {"section": "lineups", "tag": "2-offense"},
    ],
    "nfl": [
        {"section": "quarterbacks", "tag": "1-qb-away", "tab": "Passing", "club": "away"},
        {"section": "quarterbacks", "tag": "2-qb-home", "tab": "Passing", "club": "home"},
        {"section": "efficiency", "tag": "3-units", "tab": "Units", "both": True},
        # Injury report: both clubs' boards, header + the opened official report only (the
        # starter grid is all ACTIVE; the report is what the post is for). Short, so it may
        # use a narrower page = bigger type.
        {"section": "availability", "tag": "4-injuries", "tab": "Lineups", "open": True, "min_width": 600,
         "title": ("Injury Report", "Official Designations"),
         "css": ("#availability .ca-lineup-board{display:block!important}"
                 "#availability .ca-lineup-board + .ca-lineup-board{margin-top:18px}"
                 "#availability .ca-lineup-tabs,#availability .ca-lineup-unit{display:none!important}")},
    ],
}
ESPN_NFL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event="


def fail(msg: str) -> None:
    print(f"[insta] ERROR {msg}", file=sys.stderr)
    sys.exit(1)


def get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "chase-analytics-insta"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def game_meta(game_pk: str) -> dict:
    """Series name, game number and ET start from MLB; whether both lineups are posted."""
    g = get_json(f"{API}/schedule?sportId=1&gamePk={game_pk}")["dates"][0]["games"][0]
    start = datetime.fromisoformat(g["gameDate"].replace("Z", "+00:00")).astimezone(ZoneInfo("America/New_York"))
    series = re.sub(r"\s*Series$", "", g.get("seriesDescription") or "Regular Season")
    eyebrow = f"{series} · Game {g['seriesGameNumber']}" if g.get("gameType") != "R" else "Regular Season"
    eyebrow += f" · {start:%a} {start:%I:%M %p}".replace(" 0", " ") + " ET"
    posted = False
    try:
        box = get_json(f"{API}/game/{game_pk}/boxscore")
        posted = all(len(box["teams"][s].get("battingOrder") or []) >= 9 for s in ("away", "home"))
    except Exception:
        pass
    return {"eyebrow": eyebrow, "lineups_posted": posted, "date": g["officialDate"]}


def nfl_meta(event: str) -> dict:
    """Week, ET kickoff and broadcast from ESPN (the site's NFL game id is ESPN's event id)."""
    d = get_json(ESPN_NFL + event)
    c = d["header"]["competitions"][0]
    start = datetime.fromisoformat(c["date"].replace("Z", "+00:00")).astimezone(ZoneInfo("America/New_York"))
    tv = next((b.get("media", {}).get("shortName") for b in c.get("broadcasts", []) if b.get("media")), "")
    eyebrow = f"NFL · Week {d['header'].get('week')} · {start:%a} {start:%I:%M %p}".replace(" 0", " ") + " ET"
    records = {}
    for t in c.get("competitors", []):
        recs = t.get("record") or t.get("records") or []
        total = next((r for r in recs if r.get("type") == "total"), recs[0] if recs else {})
        records[t.get("homeAway")] = total.get("summary", "")
    v = (d.get("gameInfo") or {}).get("venue") or {}
    addr = v.get("address") or {}
    place = ", ".join(y for y in [addr.get("city"), addr.get("state")] if y)
    venue = " · ".join(x for x in [v.get("fullName"), place] if x)
    return {"eyebrow": eyebrow + (f" · {tv}" if tv else ""), "lineups_posted": True, "date": f"{start:%Y-%m-%d}",
            "records": records, "venue": venue}


# The cover's tale of the tape, read off the live page (desktop width: both clubs side by side).
COVER_JS = r"""() => {
  const split = (cell) => {
    const pill = cell.querySelector('[class*=rank]');
    const rank = pill ? pill.innerText.trim() : '';
    let value = cell.innerText.trim(); if (rank && value.endsWith(rank)) value = value.slice(0, -rank.length).trim();
    return { value, rank, color: getComputedStyle(pill || cell).color };
  };
  return [...document.querySelectorAll('#efficiency .ca-nfl-duo > *')].map(panel => {
    const t = [...panel.querySelectorAll('table')].find(x => x.offsetParent);
    const rows = t ? [...t.querySelectorAll('tbody tr')] : [];
    return { title: (panel.querySelector('h3') || {}).innerText || '',
             offense: rows[0] ? split(rows[0].children[1]) : null, defense: rows[1] ? split(rows[1].children[1]) : null };
  });
}"""
QB_JS = r"""() => [...document.querySelectorAll('#quarterbacks .ca-nfl-duo > *')].map(p => {
  const tile = (label) => {
    const st = [...p.querySelectorAll('.ca-stat')].find(x => (x.innerText || '').trim().toUpperCase().startsWith(label));
    if (!st) return null;
    const pill = st.querySelector('[class*=rank]'); const rank = pill ? pill.innerText.trim() : '';
    const lab = (st.querySelector('[class*=label]') || {}).innerText || '';
    let value = st.innerText.trim(); if (lab && value.startsWith(lab)) value = value.slice(lab.length).trim();
    if (rank && value.endsWith(rank)) value = value.slice(0, -rank.length).trim();
    return { value, rank, color: getComputedStyle(pill || st).color };
  };
  return { name: (p.querySelector('h3') || {}).innerText || '', img: (p.querySelector('img') || {}).src || '',
           epa: tile('EPA'), pressured: tile('PRESSURED') };
})"""


def nfl_cover(page, url: str, game: dict, meta: dict, logos: dict, away: str, home: str, pub: Path) -> dict:
    page.set_viewport_size({"width": 1400, "height": 1000})
    page.goto(url, wait_until="networkidle", timeout=60000)
    page.wait_for_selector("#efficiency table", state="attached", timeout=30000)
    page.wait_for_timeout(2500)
    units = page.evaluate(COVER_JS)
    page.get_by_text("Passing", exact=True).first.click()
    page.wait_for_timeout(2000)
    qbs = page.evaluate(QB_JS)
    an, hn = nickname(game["away_name"]), nickname(game["home_name"])
    # Unit panels are titled "<Club> Offense vs <Club> Defense".
    by = {}
    for u in units:
        if u["title"].startswith(an):
            by["away_off"], by["home_def"] = u["offense"], u["defense"]
        elif u["title"].startswith(hn):
            by["home_off"], by["away_def"] = u["offense"], u["defense"]
    if len(by) < 4 or not all(by.values()) or len(qbs) < 2 or not all(q["epa"] and q["pressured"] for q in qbs):
        fail(f"cover: the page did not give both clubs' unit and QB numbers ({sorted(by)}, {len(qbs)} QBs)")

    def headshot(src: str, side: str) -> str:
        if not src:
            return ""
        big = re.sub(r"w_\d+,h_\d+", "w_600,h_600", src)  # NFL.com's 160px crop -> 600px
        dest = pub / f"{meta['date']}-{away}-{home}-{side}-qb.png"
        req = urllib.request.Request(big, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            dest.write_bytes(r.read())
        return f"instagram/{dest.name}"

    def side(k: str, name: str, q: dict) -> dict:
        return {"abbr": {"away": away, "home": home}[k], "name": name, "record": meta.get("records", {}).get(k, ""),
                "logo": logos[k], "player": q["name"], "headshot": headshot(q["img"], k), "role": "QB"}

    return {
        "league": "nfl",
        "eyebrow": meta["eyebrow"],
        "away": side("away", an, qbs[0]),
        "home": side("home", hn, qbs[1]),
        "rows": [
            {"label": "Offense EPA / Play", "away": by["away_off"], "home": by["home_off"]},
            {"label": "Defense EPA / Play", "away": by["away_def"], "home": by["home_def"]},
            {"label": "QB EPA / Dropback", "away": qbs[0]["epa"], "home": qbs[1]["epa"]},
            {"label": "QB Pressured", "away": qbs[0]["pressured"], "home": qbs[1]["pressured"]},
        ],
        "venue": meta.get("venue", ""),
        "cta": "Swipe for the breakdown",
    }


def capture(page, url: str, spec: dict, out: Path) -> tuple[int, int]:
    """Screenshot one section, stacked, at the page width that fills the post body."""
    section = spec["section"]
    width = 860
    for _ in range(4):
        page.set_viewport_size({"width": width, "height": 1400})
        page.goto(url, wait_until="networkidle", timeout=60000)
        page.wait_for_selector(f"#{section}", state="attached", timeout=30000)
        if spec.get("tab"):
            page.get_by_text(spec["tab"], exact=True).first.click()
        if spec.get("club"):
            page.locator(f'button[data-club="{spec["club"]}"]').first.click()
        page.wait_for_timeout(800)
        page.add_style_tag(content=(
            f"#{section} .ca-detail-duo{{grid-template-columns:1fr!important}}"
            ".ca-detail-source-note{display:none!important}"
            # both clubs' panels at once (NFL shows one side at a time)
            + (f"#{section} .ca-nfl-duo > .ca-form-panel{{display:block!important}}" if spec.get("both") else "")
            + spec.get("css", "")))
        if spec.get("open"):
            page.evaluate(f"document.querySelectorAll('#{section} details').forEach(d => d.open = true)")
        if spec.get("title"):
            # the post shows part of the section: name what is actually on it
            page.evaluate("""([id, t, sub]) => { const h = document.querySelector('#' + id + ' h2');
                if (!h) return; const small = h.parentElement.querySelector('p, .ca-section-sub, small');
                h.firstChild.textContent = t; if (small) small.textContent = sub; }""", [section, *spec["title"]])
        el = page.locator(f"#{section}").first
        el.scroll_into_view_if_needed()
        page.wait_for_timeout(2500)  # headshots, logos, late data
        clipped = page.evaluate(
            f"[...document.querySelectorAll('#{section} table')].some(t => t.scrollWidth > t.clientWidth + 1)")
        box = el.bounding_box()
        want = round(box["height"] / BODY_ASPECT) + PAGE_PAD
        if clipped:
            want = max(want, width + 80)
        want = max(spec.get("min_width", 760), min(1200, want))
        if not clipped and abs(want - width) <= 12:
            break
        width = want
    if clipped:
        fail(f"#{section} still cuts its table off at {width}px - not posting clipped data")
    el.screenshot(path=str(out))
    with Image.open(out) as im:
        return im.size


def fetch_logo(src: str, dest: Path) -> str:
    big = re.sub(r"([?&])w=\d+&h=\d+", lambda m: m.group(1) + "w=500&h=500", src)
    with urllib.request.urlopen(urllib.request.Request(big, headers={"User-Agent": "Mozilla/5.0"}), timeout=30) as r:
        dest.write_bytes(r.read())
    return f"instagram/{dest.name}"


def slate_games(page, league: str) -> list[tuple[str, str]]:
    page.goto(f"{SITE}/{league}/", wait_until="networkidle", timeout=60000)
    page.wait_for_selector(".ca-matchup-card[data-game]", timeout=30000)
    pairs = page.evaluate("""() => [...document.querySelectorAll('.ca-matchup-card[data-game]')].map(c =>
        [...c.querySelectorAll('img')].map(i => (i.getAttribute('src') || '').match(/teamlogos\\/\\w+\\/[\\w-]+\\/(\\w+)\\.png/))
          .filter(Boolean).map(m => m[1].toUpperCase()).slice(0, 2))""")
    back = {v: k for k, v in ESPN_ALIAS.items()}
    return [(back.get(a, a), back.get(h, h)) for a, h in pairs if a and h]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--league", choices=["mlb", "nfl"], default="mlb")
    ap.add_argument("--games", help="AWAY@HOME,AWAY@HOME (default: every game on today's slate)")
    ap.add_argument("--only", help="make just these posts, by tag word: e.g. injuries, or qb,units")
    a = ap.parse_args()

    from playwright.sync_api import sync_playwright

    pub = VIDEO / "public" / "instagram"
    pub.mkdir(parents=True, exist_ok=True)
    npx = shutil.which("npx") or fail("npx is not on PATH (install Node)")
    made = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 1000}, device_scale_factor=2)
        games = [tuple(g.strip().upper().split("@")) for g in a.games.split(",")] if a.games else slate_games(page, a.league)
        if not games:
            fail(f"no games on the {a.league.upper()} slate")
        sections = SECTIONS[a.league]
        total = len(sections)
        if a.only:
            want = [w.strip() for w in a.only.split(",") if w.strip()]
            sections = [sp for sp in sections if any(w in sp["tag"] for w in want)]
            if not sections and "cover" not in want:
                fail(f"no post matches --only {a.only}")
        for n, (away, home) in enumerate(games, 1):
            game = find_game(page, a.league, away, home, None)
            meta = game_meta(game["id"]) if a.league == "mlb" else nfl_meta(game["id"])
            slug = f"{n:02d}-{away}-{home}"
            print(f"[insta] {away}@{home}: {meta['eyebrow']}" + ("" if a.league != "mlb" else f" · lineups {'posted' if meta['lineups_posted'] else 'projected'}"))
            logos = {side: fetch_logo(src, pub / f"{meta['date']}-{away}-{home}-{side}.png")
                     for side, src in zip(("away", "home"), game["logos"])}
            out_dir = VIDEO / "out" / "instagram" / meta["date"]
            out_dir.mkdir(parents=True, exist_ok=True)
            if a.league == "nfl" and (not a.only or "cover" in a.only):
                cover = nfl_cover(page, SITE + game["href"], game, meta, logos, away, home, pub)
                props_file = VIDEO / "props" / "instagram" / f"{meta['date']}-{slug}-0-cover.json"
                props_file.parent.mkdir(parents=True, exist_ok=True)
                props_file.write_text(json.dumps(cover, indent=2), encoding="utf-8")
                out = out_dir / f"{slug}-0-cover.png"
                r = subprocess.run([npx, "remotion", "still", "InstaCover", str(out), f"--props={props_file}", "--log=error"], cwd=VIDEO)
                if r.returncode:
                    sys.exit(r.returncode)
                print(f"[insta]   {out.relative_to(ROOT)}  (cover)")
                made.append(out)
            for spec in sections:
                i = SECTIONS[a.league].index(spec) + 1  # carousel position in the full set
                section, tag = spec["section"], spec["tag"]
                shot = pub / f"{meta['date']}-{away}-{home}-{tag}.png"
                w, h = capture(page, SITE + game["href"], spec, shot)
                props = {
                    "league": a.league,
                    "eyebrow": meta["eyebrow"],
                    "awayName": nickname(game["away_name"]),
                    "homeName": nickname(game["home_name"]),
                    "awayLogo": logos["away"],
                    "homeLogo": logos["home"],
                    "artifact": {"src": f"instagram/{shot.name}", "width": w, "height": h},
                    "page": f"{i}/{total}",
                }
                if section == "lineups" and not meta["lineups_posted"]:
                    props["note"] = "Projected orders until lineups are posted"
                props_file = VIDEO / "props" / "instagram" / f"{meta['date']}-{slug}-{tag}.json"
                props_file.parent.mkdir(parents=True, exist_ok=True)
                props_file.write_text(json.dumps(props, indent=2), encoding="utf-8")
                out = out_dir / f"{slug}-{tag}.png"
                r = subprocess.run([npx, "remotion", "still", "InstaMatchup", str(out), f"--props={props_file}", "--log=error"], cwd=VIDEO)
                if r.returncode:
                    sys.exit(r.returncode)
                print(f"[insta]   {out.relative_to(ROOT)}  (section {w // 2}x{h // 2})")
                made.append(out)
        browser.close()
    print(f"[insta] {len(made)} images in {made[0].parent if made else '-'}")
    if made and sys.platform == "win32" and not os.environ.get("INSTA_NO_OPEN"):
        # One image: show it (an already-open folder gave no sign anything happened).
        os.startfile(made[0] if len(made) == 1 else made[0].parent)


if __name__ == "__main__":
    main()
