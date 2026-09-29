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
import re
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
VIDEO = ROOT / "video"
SITE = "https://chase-analytics.com"

# Section to capture, and which band of it reads at thumbnail size (fractions of its height).
DEFAULTS = {
    "mlb": {"section": "starters", "crop": (0.0, 0.46)},
    "nfl": {"section": "overview", "crop": (0.0, 1.0)},
}
# The site's logos are ESPN's; a few clubs go by another code there.
ESPN_ALIAS = {"WAS": "WSH", "CHW": "CWS", "KCR": "KC", "SDP": "SD", "SFG": "SF", "TBR": "TB", "ATH": "OAK"}
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
        codes = [m.group(1) for i in logos if (m := re.search(r"/teamlogos/\w+/\d+/(\w+)\.png", i["src"]))]
        hit = c["id"] == game_id if game_id else codes[:2] == [code(away), code(home)]
        if hit:
            people = [i["alt"] for i in c["imgs"] if "/teamlogos/" not in i["src"] and i["alt"]]
            return {
                "id": c["id"],
                "href": c["href"] or f"/{league}/matchup.html?game={c['id']}",
                "away_name": logos[0]["alt"] if logos else away,
                "home_name": logos[1]["alt"] if len(logos) > 1 else home,
                "people": people[:2],
            }
    seen = ", ".join("@".join(
        re.findall(r"/teamlogos/\w+/\d+/(\w+)\.png", " ".join(i["src"] for i in c["imgs"]))[:2]).upper() for c in cards)
    fail(f"{away}@{home} is not on the live {league.upper()} slate. On it: {seen or 'nothing'}")


def capture(page, url: str, section: str, out: Path) -> tuple[int, int]:
    page.goto(url, wait_until="networkidle", timeout=60000)
    sel = f"#{section}"
    try:
        page.wait_for_selector(sel, timeout=30000)
    except Exception:
        ids = page.evaluate("[...document.querySelectorAll('section[id]')].map(s => s.id)")
        fail(f"no #{section} on {url}. Sections there: {', '.join(ids)}")
    page.wait_for_timeout(2500)  # headshots and late data
    # Footnotes and source lines are noise at thumbnail size.
    page.add_style_tag(content=".ca-detail-source-note{display:none!important}")
    page.locator(sel).first.screenshot(path=str(out))
    with Image.open(out) as im:
        return im.size


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--league", choices=["mlb", "nfl"], required=True)
    ap.add_argument("--game", required=True, help="AWAY@HOME, e.g. PHI@ATL")
    ap.add_argument("--game-id", help="the site's game id, when two games share clubs")
    ap.add_argument("--title", help='the hook, e.g. "Luzardo vs Sale" (default: the two starters/QBs)')
    ap.add_argument("--sub", help='accent line (default: "Phillies at Braves")')
    ap.add_argument("--eyebrow", help='small caps line (default: "MLB · Matchup Analysis")')
    ap.add_argument("--badge", help='top-right chip, e.g. "Wild Card"')
    ap.add_argument("--section", help="matchup-page section id to show (MLB default starters, NFL overview)")
    ap.add_argument("--crop", help="band of the section, as TOP,BOTTOM fractions (e.g. 0,0.4)")
    ap.add_argument("--out", help="output PNG (default video/out/thumbs/<date>-<AWAY>-<HOME>.png)")
    a = ap.parse_args()

    if "@" not in a.game:
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
        w, h = capture(page, SITE + game["href"], section, shot)
        browser.close()
    print(f"[video-thumb] captured #{section} of {away}@{home} ({w}x{h}) -> {shot.relative_to(ROOT)}")

    people = game["people"]
    props = {
        "league": a.league,
        "away": away,
        "home": home,
        "eyebrow": a.eyebrow or f"{a.league.upper()} · Matchup Analysis",
        "title": a.title or (f"{surname(people[0])} vs {surname(people[1])}" if len(people) == 2 else f"{away} at {home}"),
        "sub": a.sub if a.sub is not None else f"{nickname(game['away_name'])} at {nickname(game['home_name'])}",
        "artifact": {"src": f"thumbs/{shot.name}", "width": w, "height": h, "cropTop": crop[0], "cropBottom": crop[1]},
    }
    if a.badge:
        props["badge"] = a.badge
    props_dir = VIDEO / "props" / "thumbs"
    props_dir.mkdir(parents=True, exist_ok=True)
    props_file = props_dir / f"{slug}.json"
    props_file.write_text(json.dumps(props, indent=2), encoding="utf-8")

    out = Path(a.out).resolve() if a.out else VIDEO / "out" / "thumbs" / f"{slug}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    npx = shutil.which("npx") or fail("npx is not on PATH (install Node)")
    print(f"[video-thumb] rendering: {props['title']} / {props['sub']}")
    r = subprocess.run([npx, "remotion", "still", "ThumbnailDesk", str(out), f"--props={props_file}", "--log=error"], cwd=VIDEO)
    if r.returncode:
        sys.exit(r.returncode)
    print(f"[video-thumb] thumbnail: {out}")


if __name__ == "__main__":
    main()
