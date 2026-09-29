"""
Instagram matchup posts: two 1080x1350 images per game, built from the live site.

    python -m outputs.insta_matchup                      # every game on today's MLB slate
    python -m outputs.insta_matchup --games PHI@ATL,BOS@NYY

Per game:
  1. Probable Starters  (#starters)  - both pitchers, stacked so the full splits table fits
  2. Offense            (#lineups)   - each order against the hand it faces tonight

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
SECTIONS = [("starters", "1-starters"), ("lineups", "2-offense")]


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


def capture(page, url: str, section: str, out: Path) -> tuple[int, int]:
    """Screenshot one section, stacked, at the page width that fills the post body."""
    width = 860
    for _ in range(4):
        page.set_viewport_size({"width": width, "height": 1400})
        page.goto(url, wait_until="networkidle", timeout=60000)
        page.wait_for_selector(f"#{section}", timeout=30000)
        page.add_style_tag(content=(
            f"#{section} .ca-detail-duo{{grid-template-columns:1fr!important}}"
            ".ca-detail-source-note{display:none!important}"))
        el = page.locator(f"#{section}").first
        el.scroll_into_view_if_needed()
        page.wait_for_timeout(2500)  # headshots, logos, late data
        clipped = page.evaluate(
            f"[...document.querySelectorAll('#{section} table')].some(t => t.scrollWidth > t.clientWidth + 1)")
        box = el.bounding_box()
        want = round(box["height"] / BODY_ASPECT) + PAGE_PAD
        if clipped:
            want = max(want, width + 80)
        want = max(760, min(1200, want))
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


def slate_games(page) -> list[tuple[str, str]]:
    page.goto(f"{SITE}/mlb/", wait_until="networkidle", timeout=60000)
    page.wait_for_selector(".ca-matchup-card[data-game]", timeout=30000)
    pairs = page.evaluate("""() => [...document.querySelectorAll('.ca-matchup-card[data-game]')].map(c =>
        [...c.querySelectorAll('img')].map(i => (i.getAttribute('src') || '').match(/teamlogos\\/\\w+\\/[\\w-]+\\/(\\w+)\\.png/))
          .filter(Boolean).map(m => m[1].toUpperCase()).slice(0, 2))""")
    back = {v: k for k, v in ESPN_ALIAS.items()}
    return [(back.get(a, a), back.get(h, h)) for a, h in pairs if a and h]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--games", help="AWAY@HOME,AWAY@HOME (default: every game on today's slate)")
    a = ap.parse_args()

    from playwright.sync_api import sync_playwright

    pub = VIDEO / "public" / "instagram"
    pub.mkdir(parents=True, exist_ok=True)
    npx = shutil.which("npx") or fail("npx is not on PATH (install Node)")
    made = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 1000}, device_scale_factor=2)
        games = [tuple(g.strip().upper().split("@")) for g in a.games.split(",")] if a.games else slate_games(page)
        if not games:
            fail("no games on today's MLB slate")
        for n, (away, home) in enumerate(games, 1):
            game = find_game(page, "mlb", away, home, None)
            meta = game_meta(game["id"])
            slug = f"{n:02d}-{away}-{home}"
            print(f"[insta] {away}@{home}: {meta['eyebrow']} · lineups {'posted' if meta['lineups_posted'] else 'projected'}")
            logos = {side: fetch_logo(src, pub / f"{meta['date']}-{away}-{home}-{side}.png")
                     for side, src in zip(("away", "home"), game["logos"])}
            out_dir = VIDEO / "out" / "instagram" / meta["date"]
            out_dir.mkdir(parents=True, exist_ok=True)
            for i, (section, tag) in enumerate(SECTIONS, 1):
                shot = pub / f"{meta['date']}-{away}-{home}-{section}.png"
                w, h = capture(page, SITE + game["href"], section, shot)
                props = {
                    "league": "mlb",
                    "eyebrow": meta["eyebrow"],
                    "awayName": nickname(game["away_name"]),
                    "homeName": nickname(game["home_name"]),
                    "awayLogo": logos["away"],
                    "homeLogo": logos["home"],
                    "artifact": {"src": f"instagram/{shot.name}", "width": w, "height": h},
                    "page": f"{i}/{len(SECTIONS)}",
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
        os.startfile(made[0].parent)


if __name__ == "__main__":
    main()
