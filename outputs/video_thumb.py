"""
YouTube thumbnails in the series look (the `ThumbnailDesk` still): black desk, violet
glow, headline column, and a REAL chase-analytics.com component on the right.

    python -m outputs.video_thumb --league mlb --game PHI@ATL
    python -m outputs.video_thumb --league mlb --game PHI@ATL --title "Luzardo vs Sale" --badge "Wild Card"
    python -m outputs.video_thumb --league nfl --game GB@DAL --section overview

What it does, so every video's thumbnail is made the same way:
  1. finds the game on the live slate page (chase-analytics.com/<league>/) by the two
     clubs' logos, and opens its matchup page;
  2. screenshots one section of that page at 2x (default: MLB `starters`, NFL
     `overview`) into video/public/thumbs/;
  3. renders video/out/thumbs/<date>-<AWAY>-<HOME>.png (1280x720) with Remotion.

Words default from the page itself: the title is the two starters (MLB) or
quarterbacks (NFL) by surname, the sub line the two nicknames. Override any of them.
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import date
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
VIDEO = ROOT / "video"
SITE = "https://chase-analytics.com"

# Section to capture, and which band of it reads at thumbnail size (fractions of its height).
DEFAULTS = {
    "mlb": {"section": "starters", "crop": (0.0, 0.46)},
    # Both QBs side by side (desktop width), cut to headshots + headline tiles.
    "nfl": {"section": "quarterbacks", "crop": "tiles"},
}
# The site's logos are ESPN's; a few clubs go by another code there.
# (the White Sox are "chw" on ESPN: "CWS", MLB's code, maps to it - not the other way round)
ESPN_ALIAS = {"WAS": "WSH", "CWS": "CHW", "KCR": "KC", "SDP": "SD", "SFG": "SF", "TBR": "TB", "ATH": "OAK"}
TWO_WORD = ("Red Sox", "White Sox", "Blue Jays")


def fail(msg: str) -> None:
    print(f"[video-thumb] ERROR {msg}", file=sys.stderr)
    sys.exit(1)


def nickname(full: str) -> str:
    full = full.replace(" logo", "").strip()
    for two in TWO_WORD:
        if full.endswith(two):
            return two
    return full.split()[-1] if full else ""


def surname(name: str) -> str:
    parts = [p for p in name.split() if p.rstrip(".").lower() not in ("jr", "sr", "ii", "iii", "iv")]
    return parts[-1] if parts else name


def find_game(page, league: str, away: str, home: str, game_id: str | None) -> dict:
    page.goto(f"{SITE}/{league}/", wait_until="networkidle", timeout=60000)
    page.wait_for_selector("[id^=matchup-]", timeout=30000)
    cards = page.evaluate(
        """() => [...document.querySelectorAll('.ca-matchup-card[data-game]')].map(c => ({
              id: c.dataset.game,
              href: c.querySelector('a[href*="matchup.html"]')?.getAttribute('href') || '',
              imgs: [...c.querySelectorAll('img')].map(i => ({ src: i.getAttribute('src') || '', alt: i.alt || '' })),
           }))"""
    )
    code = lambda t: ESPN_ALIAS.get(t.upper(), t.upper()).lower()
    for c in cards:
        logos = [i for i in c["imgs"] if "/teamlogos/" in i["src"]]
        # "/500/" or "/500-dark/": the site uses ESPN's dark variant for some clubs (NYY, SD).
        codes = [m.group(1) for i in logos if (m := re.search(r"/teamlogos/\w+/[\w-]+/(\w+)\.png", i["src"]))]
        hit = c["id"] == game_id if game_id else codes[:2] == [code(away), code(home)]
        if hit:
            people = [i["alt"] for i in c["imgs"] if "/teamlogos/" not in i["src"] and i["alt"]]
            return {
                "id": c["id"],
                "href": c["href"] or f"/{league}/matchup.html?game={c['id']}",
                "away_name": logos[0]["alt"] if logos else away,
                "home_name": logos[1]["alt"] if len(logos) > 1 else home,
                "people": people[:2],
                # The site's own logo URLs: ESPN's dark-background variant where the club
                # needs one (NYY and SD are navy on black otherwise).
                "logos": [i["src"] for i in logos[:2]],
            }
    seen = ", ".join("@".join(
        re.findall(r"/teamlogos/\w+/[\w-]+/(\w+)\.png", " ".join(i["src"] for i in c["imgs"]))[:2]).upper() for c in cards)
    fail(f"{away}@{home} is not on the live {league.upper()} slate. On it: {seen or 'nothing'}")


# NFL matchup pages are tabbed: the tab that shows each section.
NFL_TABS = {
    "efficiency": "Units", "dvoa": "DVOA", "quarterbacks": "Passing", "coverage": "Passing", "looks": "Passing",
    "run-game": "Rushing", "trenches": "Rushing", "rushing": "Rushing", "receivers": "Receiving",
    "redzone": "Red Zone", "tendencies": "Tendencies", "def-tendencies": "Tendencies",
    "availability": "Lineups", "radar": "Profile", "team-context": "Profile",
}


def capture(page, url: str, section: str, out: Path) -> tuple[int, int]:
    page.goto(url, wait_until="networkidle", timeout=60000)
    sel = f"#{section}"
    try:
        page.wait_for_selector(sel, state="attached", timeout=30000)
        if "/nfl/" in url and section in NFL_TABS:
            page.get_by_text(NFL_TABS[section], exact=True).first.click()
        page.wait_for_selector(sel, timeout=15000)
    except Exception:
        ids = page.evaluate("[...document.querySelectorAll('section[id]')].map(s => s.id)")
        fail(f"no #{section} on {url}. Sections there: {', '.join(ids)}")
    page.wait_for_timeout(2500)  # headshots and late data
    # Footnotes and source lines are noise at thumbnail size.
    page.add_style_tag(content=".ca-detail-source-note{display:none!important}")
    page.locator(sel).first.screenshot(path=str(out))
    with Image.open(out) as im:
        return im.size


def tiles_crop(page, section: str) -> tuple[float, float]:
    """Crop band ending just under the section's headline stat tiles (headshots + numbers)."""
    frac = page.evaluate(r"""(id) => { const s = document.getElementById(id); const r = s.getBoundingClientRect();
        const tiles = [...s.querySelectorAll('.ca-stat')].filter(t => t.offsetParent);
        if (!tiles.length) return 1; const bottom = Math.max(...tiles.map(t => t.getBoundingClientRect().bottom));
        return Math.min(1, (bottom - r.top + 18) / r.height); }""", section)
    return (0.0, float(frac))


def bracket_thumb(a) -> None:
    """The playoff-bracket thumbnail: the live bracket from the site booth, empty, so the
    champion slot is the question mark the video answers."""
    import socket
    from playwright.sync_api import sync_playwright

    season = a.season or date.today().year
    base, server = "http://127.0.0.1:8792", None
    try:
        urllib.request.urlopen(base + "/__booth/api/info", timeout=3).read()
    except Exception:
        # No booth running: start one quietly for the capture.
        with socket.socket() as sk:
            sk.bind(("127.0.0.1", 0))
            port = sk.getsockname()[1]
        base = f"http://127.0.0.1:{port}"
        server = subprocess.Popen(["node", "scripts/site-booth.mjs", "--port", str(port), "--no-open"], cwd=VIDEO,
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    thumbs = VIDEO / "public" / "thumbs"
    thumbs.mkdir(parents=True, exist_ok=True)
    shot = thumbs / f"{season}-bracket.png"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            # A fresh browser has no saved picks: the bracket is shown as the open question.
            page = browser.new_page(viewport={"width": 1280, "height": 560}, device_scale_factor=2)
            for _ in range(20):
                try:
                    page.goto(f"{base}/__booth/bracket/?clean&season={season}", wait_until="networkidle", timeout=20000)
                    break
                except Exception:
                    page.wait_for_timeout(1000)
            page.wait_for_function("document.querySelectorAll('.series').length >= 11", timeout=30000)
            page.wait_for_timeout(1500)  # logos
            # Thumbnail height is tight: a 1280 page (bigger cards, club codes) at its natural
            # height, not stretched, so the whole bracket fits under the headline and reads.
            page.add_style_tag(content=(
                ".bracket{min-height:0!important}.champ{flex:0 0 auto!important;min-height:0!important;"
                "padding:12px!important;gap:4px!important}.champ .q{font-size:72px!important}"))
            # the bracket lines are drawn from the layout: redraw them for the tightened one
            page.evaluate("window.dispatchEvent(new Event('resize'))")
            page.wait_for_timeout(400)
            # The whole bracket, including the World Series card that runs past the section's box.
            box = page.evaluate("""() => {
                const els = [document.getElementById('bracket'), ...document.querySelectorAll('.series, .champ')];
                const r = els.map(e => e.getBoundingClientRect());
                const x = Math.min(...r.map(b => b.left)), y = Math.min(...r.map(b => b.top));
                return { x, y, width: Math.max(...r.map(b => b.right)) - x, height: Math.max(...r.map(b => b.bottom)) - y + 6 };
            }""")
            page.screenshot(path=str(shot), clip=box, full_page=True)
            browser.close()
    finally:
        if server:
            server.terminate()
    with Image.open(shot) as im:
        w, h = im.size
    print(f"[video-thumb] captured the {season} bracket ({w}x{h}) -> {shot.relative_to(ROOT)}")
    props = {
        "league": "mlb",
        # Explicitly no clubs: Remotion merges the composition's example props (PHI/ATL) otherwise.
        "away": "",
        "home": "",
        "eyebrow": a.eyebrow or f"MLB · {season} Postseason",
        "title": a.title or "Playoff Bracket Predictions",
        "sub": a.sub if a.sub is not None else "Who wins it all?",
        "artifact": {"src": f"thumbs/{shot.name}", "width": w, "height": h, "cropTop": 0, "cropBottom": 1},
    }
    if a.badge:
        props["badge"] = a.badge
    render(props, f"{season}-bracket", a.out)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--league", choices=["mlb", "nfl"], default="mlb")
    ap.add_argument("--game", help="AWAY@HOME, e.g. PHI@ATL")
    ap.add_argument("--bracket", action="store_true",
                    help="the playoff bracket (the site booth's /__booth/bracket/) instead of one game")
    ap.add_argument("--season", type=int, help="bracket season (default: this year)")
    ap.add_argument("--game-id", help="the site's game id, when two games share clubs")
    ap.add_argument("--title", help='the hook, e.g. "Luzardo vs Sale" (default: the two starters/QBs)')
    ap.add_argument("--sub", help='accent line (default: "Phillies at Braves")')
    ap.add_argument("--eyebrow", help='small caps line (default: "MLB · Matchup Analysis")')
    ap.add_argument("--badge", help='top-right chip, e.g. "Wild Card"')
    ap.add_argument("--section", help="matchup-page section id to show (MLB default starters, NFL overview)")
    ap.add_argument("--crop", help="band of the section, as TOP,BOTTOM fractions (e.g. 0,0.4)")
    ap.add_argument("--out", help="output PNG (default video/out/thumbs/<date>-<AWAY>-<HOME>.png)")
    a = ap.parse_args()

    if a.bracket:
        return bracket_thumb(a)
    if not a.game or "@" not in a.game:
        fail("--game must be AWAY@HOME")
    away, home = (t.strip().upper() for t in a.game.split("@", 1))
    d = DEFAULTS[a.league]
    section = a.section or d["section"]
    crop = tuple(float(x) for x in a.crop.split(",")) if a.crop else d["crop"]
    if a.section and not a.crop:
        crop = (0.0, 1.0)

    from playwright.sync_api import sync_playwright

    thumbs = VIDEO / "public" / "thumbs"
    thumbs.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 1000}, device_scale_factor=2)
        game = find_game(page, a.league, away, home, a.game_id)
        m = re.search(r"date=(\d{4}-\d{2}-\d{2})", game["href"])
        day = m.group(1) if m else "undated"
        slug = f"{day}-{away}-{home}"
        shot = thumbs / f"{slug}-{section}.png"
        if a.league == "nfl":
            page.set_viewport_size({"width": 1440, "height": 1000})  # both clubs side by side
        w, h = capture(page, SITE + game["href"], section, shot)
        if crop == "tiles":
            crop = tiles_crop(page, section)
        browser.close()
    print(f"[video-thumb] captured #{section} of {away}@{home} ({w}x{h}) -> {shot.relative_to(ROOT)}")
    logo_files = {}
    for side, src in zip(("away", "home"), game["logos"]):
        big = re.sub(r"([?&])w=\d+&h=\d+", lambda m: m.group(1) + "w=500&h=500", src)  # the card asks for 132 px
        dest = thumbs / f"{slug}-{side}-logo.png"
        try:
            with urllib.request.urlopen(urllib.request.Request(big, headers={"User-Agent": "Mozilla/5.0"}), timeout=30) as r:
                dest.write_bytes(r.read())
            logo_files[side] = f"thumbs/{dest.name}"
        except Exception as e:
            print(f"[video-thumb] NOTE {side} logo not fetched ({e}); using the kit's logo")

    people = game["people"]
    props = {
        "league": a.league,
        "away": away,
        "home": home,
        "eyebrow": a.eyebrow or f"{a.league.upper()} · Matchup Analysis",
        "title": a.title or (f"{surname(people[0])} vs {surname(people[1])}" if len(people) == 2 else f"{away} at {home}"),
        "sub": a.sub if a.sub is not None else f"{nickname(game['away_name'])} at {nickname(game['home_name'])}",
        **({"awayLogo": logo_files["away"]} if "away" in logo_files else {}),
        **({"homeLogo": logo_files["home"]} if "home" in logo_files else {}),
        "artifact": {"src": f"thumbs/{shot.name}", "width": w, "height": h, "cropTop": crop[0], "cropBottom": crop[1]},
    }
    if a.badge:
        props["badge"] = a.badge
    render(props, slug, a.out)


def render(props: dict, slug: str, out_arg: str | None) -> None:
    props_dir = VIDEO / "props" / "thumbs"
    props_dir.mkdir(parents=True, exist_ok=True)
    props_file = props_dir / f"{slug}.json"
    props_file.write_text(json.dumps(props, indent=2), encoding="utf-8")

    out = Path(out_arg).resolve() if out_arg else VIDEO / "out" / "thumbs" / f"{slug}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    npx = shutil.which("npx") or fail("npx is not on PATH (install Node)")
    print(f"[video-thumb] rendering: {props['title']} / {props['sub']}")
    r = subprocess.run([npx, "remotion", "still", "ThumbnailDesk", str(out), f"--props={props_file}", "--log=error"], cwd=VIDEO)
    if r.returncode:
        sys.exit(r.returncode)
    print(f"[video-thumb] thumbnail: {out}")
    if sys.platform == "win32" and not os.environ.get("THUMB_NO_OPEN"):
        os.startfile(out)  # show it: a saved file with no window looked like nothing happened


if __name__ == "__main__":
    main()
