"""
Chase Analytics content engine - command-driven social graphics.

Captures real components (the "artifacts") straight off chase-analytics.com as it is
served today, then composes the ones you asked for into Instagram-dimension posts with
your own headline and notes. The post chrome is styled with the site's own stylesheets,
mirrored on every run, so the LIVE SITE is the design contract: neither the artifacts nor
the frame around them can drift from what a reader will find.

COMMANDS
  keys        Print the artifact key: every component, where it comes from (site,
              hosted board, legacy), and the phrases that summon it.
  compose     Any registered or ad-hoc artifacts - the adaptive path (any site section,
              the mlb-model deck, or the whole nfl-model board).
                --artifacts mlb_starter_away --games NYY@MIN
                --artifacts nfl_injuries_away,nfl_injuries_home --games DET@BUF
                --artifacts nfl_edges --rows 10
                --capture 'label=X;url=https://...;selector=.terminal-panel'
  preview     Concise multi-matchup preview - the site's slate cards, side by side.
                --games CLE@CIN,TEX@TBR,CHC@STL     (--sport nfl for football)
  deep        Detailed 1-3 game preview - pick which artifacts to assemble.
                --games PHI@MIA --artifacts mlb_hero,mlb_radar,mlb_recent
                (omit --artifacts in a terminal and it prompts you to choose)
  breakdown   One matchup, up to 3 graphics, split by aspect.
                --games PHI@MIA --aspects pitching,offense,bullpen
                --sport nfl --games DET@BUF --aspects availability,scheme,context
  full-card   Whole slate as the site's slate cards, six to a post.
  rankings    Unit rankings snapshots (LEGACY: the site has no rankings page now).
                --type starters
                --type team --family scoring --window L30
  booth       Recording booth: live graphics + camera, one take. Builds a game pack
              when --games is set, then opens the booth. Permanent video path.
                --sport nfl --games IND@KC --show "Week 3 Sunday Night Football"
                --sport nfl                         (newest pack already on disk)

TEXT LAYER (every command; see docs/CONTENT_ENGINE_SPEC.md section 6)
  --eyebrow   category label      --headline  the claim
  --sub       neutral setup       --take      YOUR angle, styled as opinion
  --note      evidence bullet (repeatable)    --cta   where to go next

NFL ON THE SITE (preview/deep/breakdown/full-card with --sport nfl, or compose)
  Per game    nfl_card, nfl_hero, nfl_offense_/nfl_defense_/nfl_injuries_ away|home,
              nfl_coverage, nfl_situations, nfl_scheme_grid, nfl_form, nfl_radar,
              nfl_context

NFL MODEL BOARD (compose only; captures the HOSTED nfl-model board)
  Boards     nfl_power_top/_bottom, nfl_edges, nfl_offense, nfl_defense,
              nfl_seeds_afc/_nfc, nfl_divisions_afc/_nfc, nfl_scheme_matrix
  Players     nfl_qb_props, nfl_rb_props, nfl_wr_props, nfl_te_props, nfl_k_props
  Per game    nfl_game, nfl_game_lines   (--games NE@SEA, from nfl-model's board)
  Receipts    nfl_gate_tiles, nfl_authority - what the numbers are worth. This model
              is RESEARCH_ONLY and does not beat the closing line; a gap it shows is
              a disagreement, not an edge, and copy must not call it one.

VIDEO
  --video     Also emit the motion version: save this post's captures and write the
              Remotion props that animate them, then print the render command. The
              video reuses the SAME capture as the still, so the two cannot drift.
  --video-platform reels|reels-ads|tiktok|shorts|youtube   whose safe areas to keep
              clear of (default reels)
  booth       Live recording studio (not a still). See COMMANDS. Phone mic is HTTPS
              on :8791; desktop camera stays on the booth page.

OTHER FLAGS
  --size 1080x1350 (default) | 1080x1080 | 1080x1920 | 1600x900   (auto-picked if unset)
  --date YYYY-MM-DD    slate date (default today)
  --layout stack|row   compose only
  --rows N / --rows-from N   row window; two slides from one board

Geometry, brand and text rules live in docs/CONTENT_ENGINE_SPEC.md. In short: every
artifact in a post shares ONE zoom so type size is identical and artifacts stay centred.

Fails closed: a missing artifact or stale slate exits non-zero and writes nothing.
A wrong graphic is worse than no graphic.
"""
from __future__ import annotations

import argparse
import base64
import csv
import html.parser
import json
import re
import shutil
import socket
import struct
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from PIL import Image, ImageFilter
from playwright.sync_api import sync_playwright

PIPELINE = Path(__file__).resolve().parents[1]
DATA = PIPELINE / "data"
OUT_ROOT = PIPELINE / "outputs" / "social_cards"
VIDEO = PIPELINE / "video"
# The vertical master the video engine renders (video/src/Root.tsx VERTICAL), and the
# margin BoardMotion leaves beside a board. Used only to report the scale a directive
# will get; the platform safe areas that set the height term are not duplicated here.
VIDEO_FRAME_W = 1080
VIDEO_BOARD_PAD = 24
# nfl-model's published board, as a sibling checkout. Used to list and validate NFL
# fixtures for --games; the artifacts themselves are captured off the hosted page.
NFL_BOARD_JSON = PIPELINE.parent / "nfl-model" / "docs" / "board.json"

# Output sizes. DEFAULT TO WHAT THE PLATFORM SERVES, not to the biggest it accepts.
# Instagram re-serves feed images at 1080 wide and downsizes anything larger with its own
# resampler, which is softer than rendering natively at 1080 - verified by pushing both
# through scripts/simulate_post.py and comparing the type. The 1440 sizes remain for
# stories and off-platform use, but a feed post should be 1080 wide.
SIZES = [
    "1440x1800",   # Instagram 4:5 at max resolution  (default for portrait)
    "1440x1440",   # Instagram square at max resolution
    "1440x2560",   # Instagram story at max resolution
    "2048x1152",   # X / OG 16:9 at high resolution
    "1080x1350", "1080x1080", "1080x1920", "1600x900",   # 1x equivalents
]

# target size -> (CSS layout size the compose route should use, raster scale)
HI_RES = {
    "1440x1800": ("1080x1350", 4 / 3),
    "1440x1440": ("1080x1080", 4 / 3),
    "1440x2560": ("1080x1920", 4 / 3),
    "2048x1152": ("1600x900", 1.28),
}


def layout_size(target: str) -> tuple[str, float]:
    """CSS layout size and raster scale for an output size."""
    return HI_RES.get(target, (target, 1.0))

# Artifacts are captured at 3x native. The composed page is itself rendered at 2x and
# then LANCZOS-downsampled, so an artifact goes through TWO resamples before it lands in
# the file; starting with more source detail is what keeps small table type crisp once
# Instagram and X re-encode the upload. 3x is the practical ceiling - beyond it the
# capture cost climbs with no visible gain at these output sizes.
CAPTURE_DPR = 3

# Instagram and X re-encode every upload as JPEG with 4:2:0 chroma subsampling, which
# softens edges - worst on the small coloured type these posts are full of. A light
# unsharp mask on the finished PNG pre-compensates for it. Kept deliberately gentle:
# enough to survive the round trip, not enough to ring on the artifacts' own hairlines.
PRESHARPEN = {"radius": 0.7, "percent": 70, "threshold": 2}

# Below this shared scale, stat tables stop being readable on a phone. Crossing it
# triggers a re-render on the tall canvas (and a warning if that still isn't enough).
# Default capture viewport. Wide enough to stay clear of the responsive contract's
# desktop cutoff (1100px); artifacts that read better narrow set their own viewport_w.
CAPTURE_VIEWPORT_W = 1600
LEGIBILITY_FLOOR = 0.62
# Unused vertical room that reads as half-empty, as a FRACTION of canvas height. A flat
# pixel budget disagreed with scripts/check_render.py (which flags a band over 10% of
# height), so posts the checker rejected were being left alone. Same yardstick now.
SLACK_FRACTION = 0.09
# Shorter canvases to try, in order, when a post leaves a dead band.
CANVAS_LADDER = {
    "1440x2560": ["1440x1800", "1440x1440"],
    "1440x1800": ["1440x1440"],
    "1080x1920": ["1080x1350", "1080x1080"],
    "1080x1350": ["1080x1080"],
}

# Text budgets. Past these lengths a slot wraps far enough to push artifacts down or
# reads as a paragraph rather than a headline; the engine warns instead of silently
# reflowing. See docs/CONTENT_ENGINE_SPEC.md for the reasoning behind each slot.
TEXT_BUDGETS = {
    "eyebrow": 28, "headline": 42, "sub": 130, "take": 190, "cta": 60, "note": 95,
}

# Native artifact widths cluster into classes (matchup card ~434px, compare-page
# boards ~1140px). Mixing classes in one stack is legal - the solver centres them at a
# shared zoom - but the narrower artifact will sit inset, so say so.
WIDTH_SPREAD_WARN = 1.5

# Site chrome that overlays content. The sticky header sits above whatever is at the
# top of the page, so an element screenshot of a table would otherwise show the nav
# painted over its column headers. Hidden on every capture.
GLOBAL_HIDE = [
    ".chase-header", ".chase-mobile-menu", ".chase-mobile-overlay",
    ".mlbma-loading", ".dash-signup",
]

# An element screenshot paints whatever sits behind the element, so the page's
# decorative background photo shows through any gap inside the artifact - most
# visibly the channel between the two cards of a `-duo`, which read as a stray
# purple band down the middle of the post. Flatten the page to the site's own --bg
# token (the same near-black the post canvas uses) so those gaps disappear. Only
# the backdrop is touched; every component keeps its own surface.
#
# `html body[class]` (0,1,2) is deliberate: mlbma_backgrounds.css sets the photo
# with `body.ca-bg-compare { ... !important }` (0,1,1), so a plain `body` rule loses
# the specificity tie even with !important and the band stayed in the capture.
GLOBAL_STYLE = """
    html body[class], html body {
        background-image: none !important;
        background-color: var(--surface-page, var(--bg, #050506)) !important;
    }
"""

# ── the live site is the design contract ────────────────────────────────────
# chase-analytics.com is what a reader lands on, so its CURRENT look governs every post:
# the artifacts are captured off its routes, and the post chrome (card_compose.html)
# is styled with the site's own stylesheets, mirrored from production at run time into
# dashboard/_site/. The chrome names semantic tokens only (--surface-page,
# --text-accent, --font-display ...), so a site restyle reaches the next post with no
# engine change. This replaced the July composer, which linked this branch's legacy
# theme.css and kept rendering the old violet-glow/DM Sans desk after the site moved to
# the black surface and Archivo (2026-09-15/16).
SITE_URL = "https://chase-analytics.com"
SITE_STYLE_DIR = PIPELINE / "dashboard" / "_site"
# The route whose <head> defines the stylesheet stack. Every public route links the same
# nine sheets (checked 2026-09-16 on /, /mlb/, /nfl/), so one is enough.
SITE_STYLE_ROUTE = "/nfl/"


def _fetch(url: str, timeout: int = 20) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "chase-content-engine"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


class _LinkParser(html.parser.HTMLParser):
    """Stylesheet hrefs in document order, whatever the attribute order."""

    def __init__(self):
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "link" and "stylesheet" in (d.get("rel") or "").split() and d.get("href"):
            self.hrefs.append(d["href"])


def _stylesheet_hrefs(page: str) -> list[str]:
    parser = _LinkParser()
    parser.feed(page)
    # Same-origin only: a third-party sheet is not part of the house design.
    return [h for h in parser.hrefs if h.startswith("/") and not h.startswith("//")]


def sync_site_style() -> dict:
    """Mirror the live site's stylesheet stack, fonts and brand icon for the composer.

    Returns the manifest. The mirror is built in a staging folder and swapped in only
    when complete, so a refresh that fails halfway (one sheet or a font unreachable)
    leaves the previous mirror intact instead of a mix of two site versions. Offline,
    the last mirror is reused with a warning; with no mirror at all the run fails
    closed, because a post in a stale or fallback style is exactly the drift this
    engine exists to prevent.
    """
    manifest_path = SITE_STYLE_DIR / "manifest.json"
    stage = SITE_STYLE_DIR.with_name(SITE_STYLE_DIR.name + ".staging")
    previous = {}
    if manifest_path.exists():
        try:
            previous = json.loads(manifest_path.read_text(encoding="utf-8"))
        except ValueError:
            previous = {}
    try:
        page = _fetch(SITE_URL + SITE_STYLE_ROUTE).decode("utf-8", "replace")
        hrefs = _stylesheet_hrefs(page)
        if not hrefs:
            raise ValueError(f"no same-origin stylesheets on {SITE_STYLE_ROUTE}")
        stamp = ""
        m = re.search(r"[?&]v=([\w.-]+)", hrefs[0])
        if m:
            stamp = m.group(1)
        icon = re.search(r'class="chase-logo".*?<img[^>]+src="([^"]+)"', page, re.S)
        icon_path = (icon.group(1) if icon
                     else "/dashboard/assets/chase-icon-filled.png").split("?")[0]

        shutil.rmtree(stage, ignore_errors=True)
        stage.mkdir(parents=True)
        assets: set[str] = set()
        sheets = []
        for href in hrefs:
            path = href.split("?")[0]
            css = _fetch(SITE_URL + href).decode("utf-8", "replace")
            base = path.rsplit("/", 1)[0] + "/"

            def local(match: re.Match) -> str:
                ref = match.group(2)
                if ref.startswith(("data:", "http:", "https:", "#")):
                    return match.group(0)
                target = urllib.parse.urljoin(base, ref.split("?")[0].split("#")[0])
                assets.add(target)
                # Absolute into the mirror, so the reference resolves the same way from
                # any sheet and never falls through to this branch's legacy files.
                return f"url({match.group(1)}/dashboard/_site{target}{match.group(1)})"

            css = re.sub(r"""url\(\s*(['"]?)([^'")]+)\1\s*\)""", local, css)
            out = stage / path.lstrip("/")
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(css, encoding="utf-8")
            sheets.append(path)
        for target in sorted(assets | {icon_path}):
            try:
                data = _fetch(SITE_URL + target)
            except Exception as exc:
                # Fonts and the brand icon ARE the look; a decorative image is not.
                if target == icon_path or target.endswith((".woff2", ".woff", ".ttf")):
                    raise
                print(f"[content-engine]   NOTE site asset {target} not mirrored ({exc})")
                continue
            out = stage / target.lstrip("/")
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(data)
        # One entry point for the composer, in the site's own cascade order.
        (stage / "site.css").write_text(
            "/* Generated by content_engine.sync_site_style - do not edit. */\n" +
            "".join(f'@import url("/dashboard/_site{p}");\n' for p in sheets),
            encoding="utf-8")
        (stage / "brand-icon.png").write_bytes(
            (stage / icon_path.lstrip("/")).read_bytes())
        manifest = {"stamp": stamp, "route": SITE_STYLE_ROUTE, "sheets": sheets,
                    "icon": icon_path,
                    "synced_at": datetime.now().isoformat(timespec="seconds")}
        (stage / "manifest.json").write_text(json.dumps(manifest, indent=2),
                                             encoding="utf-8")
        # Swap. Windows cannot rename over a non-empty folder, so move the old one
        # aside first; if that fails (another run has files open) keep the old mirror.
        old = SITE_STYLE_DIR.with_name(SITE_STYLE_DIR.name + ".old")
        shutil.rmtree(old, ignore_errors=True)
        try:
            if SITE_STYLE_DIR.exists():
                SITE_STYLE_DIR.rename(old)
            stage.rename(SITE_STYLE_DIR)
        except PermissionError:
            # Windows refuses to rename a folder anything has open (an Explorer
            # window, a shell sitting in it). The staged copy is already complete,
            # so write it over the old mirror in place instead of giving up.
            if not SITE_STYLE_DIR.exists() and old.exists():
                old.rename(SITE_STYLE_DIR)
            shutil.copytree(stage, SITE_STYLE_DIR, dirs_exist_ok=True)
            shutil.rmtree(stage, ignore_errors=True)
        shutil.rmtree(old, ignore_errors=True)
        if previous.get("stamp") and previous["stamp"] != stamp:
            print(f"[content-engine] site design changed {previous['stamp']} -> {stamp}; "
                  f"posts now render in the new style")
        print(f"[content-engine] site style {stamp or '(unstamped)'}: "
              f"{len(sheets)} sheets mirrored from {SITE_URL}")
        return manifest
    except Exception as exc:
        shutil.rmtree(stage, ignore_errors=True)
        if not SITE_STYLE_DIR.exists():
            # A failed swap after the old mirror was moved aside: put it back.
            old = SITE_STYLE_DIR.with_name(SITE_STYLE_DIR.name + ".old")
            if old.exists():
                old.rename(SITE_STYLE_DIR)
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            print(f"[content-engine] WARNING could not refresh the site style ({exc}); "
                  f"using the mirror from {manifest.get('synced_at')} "
                  f"(stamp {manifest.get('stamp')})")
            return manifest
        fail(f"cannot mirror the site style from {SITE_URL} ({exc}) and no earlier "
             f"mirror exists - a post in a fallback style would misrepresent the site")
        return {}


# The part of the site's stack the video package uses: faces and tokens only. The
# component/page sheets style site markup (body, nav, cards) and would fight a
# Remotion composition, which draws its own layout from the tokens.
VIDEO_SITE_DIR = VIDEO / "src" / "site"
VIDEO_STYLE_SHEETS = ("fonts", "tokens", "semantic")


def export_video_style(manifest: dict) -> None:
    """Copy the site's faces and tokens into video/src/site for the Remotion bundle.

    The video package follows the same contract as the stills: the live site's look
    is the design, so its compositions import these files instead of carrying token
    values of their own. Font URLs are rewritten to sit beside the sheet, which is how
    the bundler resolves them. Fails when the site stops publishing one of the three
    sheets, because a video rendered without them silently falls back to system faces.
    """
    picked = []
    for key in VIDEO_STYLE_SHEETS:
        hit = [p for p in manifest.get("sheets", []) if key in p.rsplit("/", 1)[-1]]
        if not hit:
            fail(f"the site no longer publishes a '{key}' stylesheet - the video "
                 f"package cannot follow its design (sheets: {manifest.get('sheets')})")
        picked.append(hit[0])
    stage = VIDEO_SITE_DIR.with_name("site.staging")
    shutil.rmtree(stage, ignore_errors=True)
    stage.mkdir(parents=True)
    names = []
    for path in picked:
        css = (SITE_STYLE_DIR / path.lstrip("/")).read_text(encoding="utf-8")

        def local(match: re.Match) -> str:
            target = match.group(2)
            if not target.startswith("/dashboard/_site/"):
                return match.group(0)
            src = SITE_STYLE_DIR / target[len("/dashboard/_site/"):]
            shutil.copyfile(src, stage / src.name)
            return f"url({match.group(1)}./{src.name}{match.group(1)})"

        css = re.sub(r"""url\(\s*(['"]?)([^'")]+)\1\s*\)""", local, css)
        name = path.rsplit("/", 1)[-1]
        (stage / name).write_text(css, encoding="utf-8")
        names.append(name)
    (stage / "index.css").write_text(
        "/* Generated by content_engine.export_video_style - do not edit.\n"
        f"   chase-analytics.com design stamp {manifest.get('stamp')}. */\n" +
        "".join(f'@import "./{n}";\n' for n in names), encoding="utf-8")
    (stage / "manifest.json").write_text(json.dumps(
        {**manifest, "video_sheets": names}, indent=2), encoding="utf-8")
    shutil.rmtree(VIDEO_SITE_DIR, ignore_errors=True)
    stage.rename(VIDEO_SITE_DIR)
    brand = VIDEO / "public" / "brand"
    brand.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SITE_STYLE_DIR / "brand-icon.png", brand / "chase-icon.png")


def read_site_slate(sport: str) -> list[dict]:
    """The live site's published slate for one sport, as engine game rows.

    The site's game id is what its routes are keyed by (`#matchup-<id>`,
    `matchup.html?game=<id>`), so live artifacts resolve games here and never against
    this repo's local CSV, which describes a different page.
    """
    url = f"{SITE_URL}/data/public/{sport}/slate.json"
    try:
        board = json.loads(_fetch(url))
    except Exception as exc:
        fail(f"cannot read the live {sport.upper()} slate ({url}): {exc}")
    rows = []
    for g in board.get("games") or []:
        kickoff = g.get("kickoff_utc", "")
        rows.append({
            "Away": str(g.get("away", "")).upper(),
            "Home": str(g.get("home", "")).upper(),
            "Time": kickoff,
            "GameId": str(g.get("id", "")),
            "Away_SP": g.get("away_starter") or "",
            "Home_SP": g.get("home_starter") or "",
            # The Eastern date the game is played on. A 9:40 PM ET first pitch is the
            # next day in UTC, so the UTC stamp would misdate every night game.
            "Slate_Date": _et_date(kickoff),
            "State": g.get("game_state", ""),
        })
    if not rows:
        fail(f"the live {sport.upper()} slate has no games ({url})")
    # Scores and live states come from the published snapshot. An old snapshot shows a
    # finished game as "Live" with a mid-game score, and the capture shows it that way.
    generated = board.get("generated_at_utc") or ""
    try:
        age_h = (datetime.now(ZoneInfo("UTC")) - datetime.fromisoformat(
            generated.replace("Z", "+00:00"))).total_seconds() / 3600
    except ValueError:
        age_h = None
    # Stale = the snapshot predates a game's start but the game has started since:
    # still "live" hours later, or still "scheduled" past first pitch. The detail pages
    # mix that snapshot with current stats (a starter's "last start" can be tonight's
    # outing beside a card that says Scheduled), so say so before anything is posted.
    now = datetime.now(ZoneInfo("UTC"))
    stale = []
    for r in rows:
        try:
            start = datetime.fromisoformat(r["Time"].replace("Z", "+00:00"))
        except ValueError:
            continue
        begun = (now - start).total_seconds() > 1800
        if begun and age_h is not None and (
                (r["State"] == "scheduled") or (r["State"] == "live" and age_h > 3)):
            stale.append(f"{r['Away']}@{r['Home']} ({r['State']})")
    if stale:
        print(f"[content-engine] WARNING the live {sport.upper()} slate was published "
              f"{age_h:.0f}h ago; these games have started since but still show their "
              f"old state and score: {', '.join(stale)}")
    return rows


def _et_date(stamp: str) -> str:
    try:
        when = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except ValueError:
        return ""
    return when.astimezone(ZoneInfo("America/New_York")).date().isoformat()


def check_site_date(rows: list[dict], day: str, sport: str) -> None:
    """The live site publishes ONE current slate, so it cannot serve another date.

    An MLB slate is one day, and the post's date must be that day - otherwise the post
    carries a date the games were not played on. The site keeps last night's slate up
    until the morning pipeline replaces it, so after midnight this asks for --date
    rather than guessing. An NFL slate is a week spanning Thursday to Monday, so the
    post date must fall between today and the last kickoff: the site shows no other week.
    """
    days = sorted({r["Slate_Date"] for r in rows if r["Slate_Date"]})
    if sport == "mlb":
        if day not in days:
            fail(f"the live MLB slate is for {', '.join(days) or 'an unknown date'}, "
                 f"not {day}. chase-analytics.com serves only its current slate: pass "
                 f"--date {days[0] if len(days) == 1 else '<that date>'} to post it, "
                 f"or wait for the site to publish {day}")
        return
    today = date.today().isoformat()
    last = days[-1] if days else today
    if not today <= day <= max(today, last):
        fail(f"--date {day}: the live {sport.upper()} slate runs through {last}, and "
             f"chase-analytics.com shows no other week - date the post between "
             f"{today} and {last}")


# The nfl-model dashboard, as deployed. Pages publishes it from that repo's build
# workflow rather than from its committed docs/index.html, so the two are ALLOWED to
# differ and the hosted page is the one a reader following the post actually lands on.
# It is also further ahead: the live board carries #players and #scheme sections the
# committed snapshot has never had. Capture what you link to.
NFL_BOARD_URL = "https://alphakiller1.github.io/nfl-model/"

# Artifact registry. Each entry says where the component lives, how to reach it,
# and what must be true before it can be captured. `selector` is resolved on the
# page; `contains` disambiguates when a page has several matching sections.
#   scope: 'game'  -> needs an away/home pair
#          'slate' -> one capture serves the whole post
ARTIFACTS = {
    "card": {
        "label": "Matchup Card",
        "scope": "game",
        "page": "index.html",
        "hash": "section-matchups-hero",
        "selector": ".hero-matchup-card",
        "match_game": True,
        "wait_ms": 12000,
        # The card mounts as soon as the slate lands, but Pitch Score / K% / BB% / ERA
        # come from the starter profile sheet, which arrives seconds later. Without
        # this gate the card is captured with four em dashes in each pitcher panel.
        "ready": "window.LIVE_DATA && LIVE_DATA.spProfiles && LIVE_DATA.spProfiles.length",
        "framed": False,
        # In-card navigation affordance is meaningless in a static post.
        "hide": [".hmc-view-full"],
    },
    "banner": {
        "label": "Matchup Analysis Banner",
        "scope": "game",
        "page": "matchup_compare.html",
        "selector": ".mc-header",
        "wait_ms": 15000,
        # Spec: use the banner without its "Matchup Analysis" kicker.
        "hide": [".mc-header-kicker"],
        "framed": True,
    },
    "radar": {
        "label": "Team Profile Radar",
        "scope": "game",
        "page": "matchup_compare.html",
        "selector": ".mc-radar-duo",
        "wait_ms": 14000,
        "framed": True,
    },
    "offense": {
        "label": "Offensive Split Comparison",
        "scope": "game",
        "page": "matchup_compare.html",
        "selector": ".mc-os-duo",
        "wait_ms": 14000,
        "framed": True,
        # The home/road strip has no data to show while Batter_Splits_Home/Away
        # publish header-only; drop it rather than ship 16 em dashes a side.
        "drop_if_empty": [".mc-os-strip"],
    },
    # The two split views are DIRECTIONAL: one lineup against the other side's
    # pitching. Each has a reverse variant so a matchup post can show both halves.
    "pitcher": {
        "label": "Pitcher Splits + Lineup History",
        "label_fmt": "{away} lineup vs {home} starter",
        "scope": "game",
        "page": "matchup_compare.html",
        "params": {"compare": "lvP", "lvpLineup": "away", "lvpPitcher": "home"},
        "selector": ".mc-lvp-section",
        "contains": "LINEUP & PITCHER SPLITS",
        "wait_ms": 30000,
        # These boards mount only after every batter-split tab has landed;
        # 15s caught the page before the section existed at all.
        "ready": "document.querySelectorAll('.mc-lvp-section td').length > 20",
        "fitwidth": [".mc-lcc-table"],
        "framed": True,
        # Post chrome already names the matchup; the artifact's own section header and
        # methodology fine print would just repeat twice in one image.
        "hide": [".mc-lvb-controls", ".hub-control-bar", ".mc-subsel",
                 ".mc-lvp-section-head", ".mc-lvb-section-head", ".ca-helper"],
    },
    # The full lvP board is a 2-column grid of two 535px cards, so it can never be
    # captured under ~1140px wide - which the composer then SHRINKS to 0.93 to fit 1080.
    # Registering each half separately lets a post carry one of them at 1.26x instead:
    # the same pixels, 35% larger type. Use the halves for social, the full board when
    # the reader has a screen.
    "lineup_vs_hand": {
        "label": "Lineup vs the Starter's Hand",
        "label_fmt": "{away} lineup, splits vs this starter's hand",
        "scope": "game",
        "page": "matchup_compare.html",
        "params": {"compare": "lvP", "lvpLineup": "away", "lvpPitcher": "home"},
        "selector": ".mc-card.mc-lineup-col",
        # As a grid item this card is STRETCHED to its taller sibling's height, so a
        # third of the capture is empty - and the composer, sizing the whole box, spends
        # a third of the post's height on that void. align-self:start makes it wrap its
        # own content, which is worth ~30% of rendered type size. (Do NOT narrow the
        # viewport instead: this grid does not stack, it squeezes and clips the SLG
        # column.)
        # min-height:100% is what stretches it: 100% of a grid row sized by the TALLER
        # sibling card. Its own content is ~556px, so ~120px of every capture was empty
        # and the composer spent post height on the void. Measured, not guessed.
        "style": (".mc-card.mc-lineup-col{min-height:0!important;height:auto!important;"
                  "flex:0 0 auto!important;align-self:start!important}"),
        "wait_ms": 30000,
        "ready": "document.querySelectorAll('.mc-lvp-section td').length > 20",
        "fitwidth": [".mc-lcc-table"],
        "framed": True,
        "hide": [".mc-lvb-controls", ".hub-control-bar", ".mc-subsel",
                 ".mc-lvp-section-head", ".mc-lvb-section-head", ".ca-helper"],
    },
    "lineup_vs_hand_rev": {
        "label": "Lineup vs the Starter's Hand",
        "label_fmt": "{home} lineup, splits vs this starter's hand",
        "scope": "game",
        "page": "matchup_compare.html",
        "params": {"compare": "lvP", "lvpLineup": "home", "lvpPitcher": "away"},
        "selector": ".mc-card.mc-lineup-col",
        # As a grid item this card is STRETCHED to its taller sibling's height, so a
        # third of the capture is empty - and the composer, sizing the whole box, spends
        # a third of the post's height on that void. align-self:start makes it wrap its
        # own content, which is worth ~30% of rendered type size. (Do NOT narrow the
        # viewport instead: this grid does not stack, it squeezes and clips the SLG
        # column.)
        # min-height:100% is what stretches it: 100% of a grid row sized by the TALLER
        # sibling card. Its own content is ~556px, so ~120px of every capture was empty
        # and the composer spent post height on the void. Measured, not guessed.
        "style": (".mc-card.mc-lineup-col{min-height:0!important;height:auto!important;"
                  "flex:0 0 auto!important;align-self:start!important}"),
        "wait_ms": 30000,
        "ready": "document.querySelectorAll('.mc-lvp-section td').length > 20",
        "fitwidth": [".mc-lcc-table"],
        "framed": True,
        "hide": [".mc-lvb-controls", ".hub-control-bar", ".mc-subsel",
                 ".mc-lvp-section-head", ".mc-lvb-section-head", ".ca-helper"],
    },
    "pitcher_rev": {
        "label": "Pitcher Splits + Lineup History",
        "label_fmt": "{home} lineup vs {away} starter",
        "scope": "game",
        "page": "matchup_compare.html",
        "params": {"compare": "lvP", "lvpLineup": "home", "lvpPitcher": "away"},
        "selector": ".mc-lvp-section",
        "contains": "LINEUP & PITCHER SPLITS",
        "wait_ms": 30000,
        # These boards mount only after every batter-split tab has landed;
        # 15s caught the page before the section existed at all.
        "ready": "document.querySelectorAll('.mc-lvp-section td').length > 20",
        "fitwidth": [".mc-lcc-table"],
        "framed": True,
        # Post chrome already names the matchup; the artifact's own section header and
        # methodology fine print would just repeat twice in one image.
        "hide": [".mc-lvb-controls", ".hub-control-bar", ".mc-subsel",
                 ".mc-lvp-section-head", ".mc-lvb-section-head", ".ca-helper"],
    },
    "bullpen": {
        "label": "Bullpen Stats",
        "label_fmt": "{away} lineup vs {home} relief",
        "scope": "game",
        "page": "matchup_compare.html",
        "params": {"compare": "lvB", "lvbLineup": "away", "lvbBp": "home"},
        "selector": ".mc-lvb-section",
        "contains": "LINEUP VS RELIEF",
        "wait_ms": 30000,
        # These boards mount only after every batter-split tab has landed;
        # 15s caught the page before the section existed at all.
        "ready": "document.querySelectorAll('.mc-lvb-section td').length > 20",
        "fitwidth": [".mc-lcc-table"],
        "framed": True,
        # Interactive window pills mean nothing in a static post, and the section
        # description tells the reader to use them — drop both.
        "hide": [".mc-lvb-controls", ".hub-control-bar", ".mc-subsel",
                 ".mc-lvp-section-head", ".mc-lvb-section-head", ".ca-helper"],
    },
    "bullpen_rev": {
        "label": "Bullpen Stats",
        "label_fmt": "{home} lineup vs {away} relief",
        "scope": "game",
        "page": "matchup_compare.html",
        "params": {"compare": "lvB", "lvbLineup": "home", "lvbBp": "away"},
        "selector": ".mc-lvb-section",
        "contains": "LINEUP VS RELIEF",
        "wait_ms": 30000,
        # These boards mount only after every batter-split tab has landed;
        # 15s caught the page before the section existed at all.
        "ready": "document.querySelectorAll('.mc-lvb-section td').length > 20",
        "fitwidth": [".mc-lcc-table"],
        "framed": True,
        "hide": [".mc-lvb-controls", ".hub-control-bar", ".mc-subsel",
                 ".mc-lvp-section-head", ".mc-lvb-section-head", ".ca-helper"],
    },
    "starters_rankings": {
        "label": "Today's Starters Rankings",
        "scope": "slate",
        "page": "index.html",
        "hash": "section-research-lab",
        # Pitcher Intelligence lazy-mounts only when its subtab is activated. Call the
        # app's own switcher rather than clicking: this build renders no .subtab bar.
        "eval": "if (window.showResearchSubtab) window.showResearchSubtab('pitching');",
        "selector": ".pl-rank-table",
        "wait_ms": 16000,
        "framed": True,
        # Hand is broken upstream: sp_profiles.csv carries pitcher_hand 'R' for all 309
        # rows, so the column renders "R" for every arm including known lefties. A
        # column that is wrong for half the board is worse than no column - drop it
        # here until the scraper is fixed, rather than publish a visible error.
        # Row-expand chevrons are an interactive affordance with no meaning in a
        # static post; drop the cells and the empty header that carries them.
        "hide": [".pl-sort-th--hand", ".pl-rank-hand",
                 ".pl-rank-chevron", ".pl-rank-table thead th:last-child"],
        # The table lives in a fixed-height sticky scroller; without releasing it the
        # capture clips after ~8 rows and the page behind bleeds into the empty band.
        "unclip": [".pl-rank-wrap", ".pl-rank-table-wrap", ".rl-sticky-table",
                   ".rl-table-wrap"],
        "unstick": [".pl-rank-table thead th"],
        # Same fluid-width story as the team board, with a floor: this table has a
        # min-width and 12 visible columns, so it cannot lay out under ~1030px. Shot
        # any narrower it overflows its wrapper and the page behind bleeds into the
        # right edge of the capture. fitwidth releases the min-width so 1150 gets the
        # board close to its min-content width without that bleed.
        "fitwidth": [".pl-rank-table"],
        "viewport_w": 1150,
        "default_rows": 14,
    },
    # ---- beyond the matchup brief: other site areas -------------------------
    "trends_heatmap": {
        "label": "Trends Heat Map",
        "scope": "slate",
        "page": "index.html",
        "hash": "section-research-lab",
        "eval": "if (window.showResearchSubtab) window.showResearchSubtab('trends');",
        "selector": ".thm-table",
        "wait_ms": 16000,
        "framed": True,
        "unclip": [".thm-table-wrap", ".rl-table-wrap", ".rl-sticky-table"],
        "unstick": [".thm-table thead th"],
    },
    # ---- the mlb-model dashboard (separate repo, hosted) --------------------
    # Registered by absolute URL so projections can be posted without cloning or
    # rebuilding that repo. Its views are tabbed (.view / .view.on), so each entry
    # forces its own view visible before capturing.
    "model_slate": {
        "label": "Model Slate Projections",
        "scope": "slate",
        "url": "https://alphakiller1.github.io/mlb-model/",
        "selector": "#v-today .terminal-panel",
        "contains": "PROJ TOT",
        "wait_ms": 20000,
        "framed": True,
    },
    "model_leans": {
        "label": "Biggest Model Leans",
        "scope": "slate",
        "url": "https://alphakiller1.github.io/mlb-model/",
        "selector": "#v-today .terminal-panel",
        "contains": "BIGGEST MODEL LEANS",
        "wait_ms": 20000,
        "framed": True,
    },
    "model_kpis": {
        "label": "Model Slate Summary",
        "scope": "slate",
        "url": "https://alphakiller1.github.io/mlb-model/",
        "selector": ".terminal-kpi-row",
        "wait_ms": 20000,
        "framed": True,
    },
    "model_props": {
        "label": "Model Pitcher Props",
        "scope": "slate",
        "url": "https://alphakiller1.github.io/mlb-model/",
        "selector": "#v-props .terminal-panel",
        "force_show": ["#v-props"],
        "open_details": True,
        "wait_ms": 20000,
        "framed": True,
    },
    "team_rankings": {
        "label": "Team Rankings",
        "scope": "slate",
        "page": "team_rankings.html",
        "selector": ".lv-table",
        "wait_ms": 15000,
        "framed": True,
        "unclip": [".lv-table-wrap", ".lv-body"],
        "unstick": [".lv-table thead th"],
        # Fluid table: 1350px wide at the default 1600px viewport, 730px at 780. The
        # composer fits it to ~1040px either way, so the wide capture was rendering the
        # site's own 15px type at ~11px. Captured narrow, it renders ABOVE native size.
        # 780 is the floor - below 768 the responsive contract card-ifies the table.
        "viewport_w": 780,
    },
    # ---- the nfl-model dashboard (separate repo, hosted) -------------------
    # Same pattern as the mlb-model deck above: an absolute URL, so an NFL post needs
    # neither that repo cloned nor a second local server. The hosted page is the
    # capture source deliberately - it is what a reader following the post lands on,
    # and nfl-model deploys Pages from its build workflow rather than from its docs/
    # snapshot, so the two are allowed to drift.
    #
    # The power-ratings board is 32 rows deep. On a 1080px post that is either
    # unreadable or a scroll, so it ships as two slides split at the median: the same
    # table, 1-16 and 17-32, with the site's own rank column carried through.
    #
    # Both slides drop the same two columns, and both are redundant rather than merely
    # surplus. `Eff` is exactly Off + Def - the page says so - which is a column of
    # arithmetic on a slide that already shows both terms; the `vs average` bar is a
    # picture of the Rating column sitting right next to it, and its min-width:120px
    # made it the widest thing on the board. What that buys is horizontal room for the
    # seven columns that are left, not type size: see `viewport_w` below for why type
    # size on this artifact is set by height and not by anything to do with width.
    "nfl_power_top": {
        "sport": "NFL",
        "label": "NFL Power Ratings 1-16",
        "scope": "slate",
        "url": NFL_BOARD_URL,
        # Two `.pr` tables on this page (power ratings and the model-vs-market board),
        # so the section id disambiguates rather than a `contains` text match.
        "selector": "#ratings table.pr",
        "wait_ms": 20000,
        "framed": True,
        "default_rows": 16,
        "drop_cols": ["Eff", "vs average"],
        # `th` is position:sticky, and .tablewrap clips horizontally on overflow.
        "unstick": ["#ratings table.pr thead th"],
        "unclip": ["#ratings .tablewrap"],
        # The wrapper's 16px radius clips the table's own corners. The table has no
        # background of its own - it reads the wrapper's - so an element screenshot
        # would show the page behind it as four dark notches. Square the corners
        # rather than repaint anything; the composer supplies the frame.
        "style": "#ratings .tablewrap{border-radius:0!important}",
        # NOT the usual "capture narrow for bigger type" case, and it is worth being
        # explicit about why, because doing the usual thing here made the post worse.
        # That rule holds when the composer's zoom is set by WIDTH. Sixteen rows is
        # ~700px tall, which is all the vertical room a 1080x1350 post has, so the zoom
        # here is set by HEIGHT - and height does not change with the capture width.
        # Captured at 700px the board therefore rendered at exactly the same type size
        # as this, just floating in the middle of the canvas at 60% of its width.
        # 1032 puts the board's own width at 984px, which is exactly the artifact
        # column, so the height-bound zoom of ~1.0 lands it edge to edge: same type
        # size as any other capture width, no dead margin either side.
        "viewport_w": 1032,
    },
    "nfl_power_bottom": {
        "sport": "NFL",
        "label": "NFL Power Ratings 17-32",
        "scope": "slate",
        "url": NFL_BOARD_URL,
        "selector": "#ratings table.pr",
        "wait_ms": 20000,
        "framed": True,
        "rows_from": 17,
        "drop_cols": ["Eff", "vs average"],
        "unstick": ["#ratings table.pr thead th"],
        "unclip": ["#ratings .tablewrap"],
        "style": "#ratings .tablewrap{border-radius:0!important}",
        "viewport_w": 1032,
    },
    # -- the rest of the NFL board ------------------------------------------
    # Every board below was measured on the hosted page at 820/1032/1280/1600 before
    # being registered, because `viewport_w` is a two-purpose lever: capturing narrow
    # only buys bigger type while the WIDTH term binds. These are all ~16 rows and
    # ~700px tall, which is the entire vertical budget of a 1080x1350 post, so HEIGHT
    # binds on all of them and the only job left for width is to land the artifact on
    # the ~984px column. That is what 1032 does. Capturing them narrower does not
    # enlarge the type - it floats the board inset with dead margins either side.
    "nfl_edges": {
        "sport": "NFL",
        "label": "Model vs Market",
        "scope": "slate",
        "url": NFL_BOARD_URL,
        # Only one `.pr` table in this section, so the section id is the whole selector.
        "selector": "#disagreements table.pr",
        "wait_ms": 20000,
        "framed": True,
        "unstick": ["#disagreements table.pr thead th"],
        "unclip": ["#disagreements .tablewrap"],
        "style": "#disagreements .tablewrap{border-radius:0!important}",
        "viewport_w": 1032,
    },
    # `#units` lays out as ONE column at 1032 and TWO at 1280+, so the same block is
    # 984px wide here and 588px there. 1032 is deliberate: the 588px version is
    # height-bound too, so it renders at the same type size and simply sits inset.
    # 32 rows is 1301px - twice the budget - hence the 16-row cut. `--rows-from 17`
    # ships the other half as slide two, carrying the site's own rank numbers through.
    "nfl_offense": {
        "sport": "NFL",
        "label": "Offense Power Ranking",
        "scope": "slate",
        "url": NFL_BOARD_URL,
        # The `.unit` wrapper, not the table: it carries the "Offense power ranking"
        # heading, which is both what disambiguates the two blocks and what the slide
        # needs in order to say what it is.
        "selector": "#units .unit",
        "contains": "Offense power ranking",
        "wait_ms": 20000,
        "framed": True,
        "default_rows": 16,
        "unstick": ["#units table.pr thead th"],
        "unclip": ["#units .tablewrap"],
        "style": "#units .tablewrap{border-radius:0!important}",
        "viewport_w": 1032,
    },
    "nfl_defense": {
        "sport": "NFL",
        "label": "Defense Power Ranking",
        "scope": "slate",
        "url": NFL_BOARD_URL,
        "selector": "#units .unit",
        "contains": "Defense power ranking",
        "wait_ms": 20000,
        "framed": True,
        "default_rows": 16,
        "unstick": ["#units table.pr thead th"],
        "unclip": ["#units .tablewrap"],
        "style": "#units .tablewrap{border-radius:0!important}",
        "viewport_w": 1032,
    },
    "nfl_seeds_afc": {
        "sport": "NFL",
        "label": "AFC Playoff Field",
        "scope": "slate",
        "url": NFL_BOARD_URL,
        "selector": "#seeds .unit",
        "contains": "AFC playoff field",
        "wait_ms": 20000,
        "framed": True,
        "unstick": ["#seeds table.pr thead th"],
        "unclip": ["#seeds .tablewrap"],
        "style": "#seeds .tablewrap{border-radius:0!important}",
        "viewport_w": 1032,
    },
    "nfl_seeds_nfc": {
        "sport": "NFL",
        "label": "NFC Playoff Field",
        "scope": "slate",
        "url": NFL_BOARD_URL,
        "selector": "#seeds .unit",
        "contains": "NFC playoff field",
        "wait_ms": 20000,
        "framed": True,
        "unstick": ["#seeds table.pr thead th"],
        "unclip": ["#seeds .tablewrap"],
        "style": "#seeds .tablewrap{border-radius:0!important}",
        "viewport_w": 1032,
    },
    # All eight division cards on one slide is 1048px of 251px cards - legible only as
    # a thumbnail. Split by conference instead, which is also how anyone talks about
    # them. The `.dv` cards are in fixed order (AFC East/North/South/West, then the
    # NFC), so nth-child is a stable cut needing no text match.
    #
    # 820, not 1032: `.dvs` is a 2-column grid at 820 and a 3-column one at 1032, and
    # four cards across three columns is a ragged 3+1. Two clean rows of two, 772px
    # wide, is what the width-bound zoom of ~1.27 then enlarges to fill the column.
    "nfl_divisions_afc": {
        "sport": "NFL",
        "label": "AFC Division Odds",
        "scope": "slate",
        "url": NFL_BOARD_URL,
        "selector": "#divisions .dvs",
        "wait_ms": 20000,
        "framed": True,
        "style": "#divisions .dv:nth-child(n+5){display:none!important}",
        "unclip": ["#divisions .dv-wrap"],
        "unstick": ["#divisions .dv-tbl thead th"],
        "viewport_w": 820,
    },
    "nfl_divisions_nfc": {
        "sport": "NFL",
        "label": "NFC Division Odds",
        "scope": "slate",
        "url": NFL_BOARD_URL,
        "selector": "#divisions .dvs",
        "wait_ms": 20000,
        "framed": True,
        "style": "#divisions .dv:nth-child(-n+4){display:none!important}",
        "unclip": ["#divisions .dv-wrap"],
        "unstick": ["#divisions .dv-tbl thead th"],
        "viewport_w": 820,
    },
    # The accountability strip: measured MAE against the market, ATS on the model's own
    # disagreements, and the sample both were measured on. 130px tall, so it stacks
    # under any other NFL artifact as a footer saying what the numbers are worth.
    # Posting this model's boards without it is the exact failure the board warns about.
    "nfl_gate_tiles": {
        "sport": "NFL",
        "label": "Measured Against The Market",
        "scope": "slate",
        "url": NFL_BOARD_URL,
        "selector": "#authority .tiles",
        "wait_ms": 20000,
        "framed": True,
        "viewport_w": 1032,
    },
    "nfl_authority": {
        "sport": "NFL",
        "label": "What These Numbers May Be Used For",
        "scope": "slate",
        "url": NFL_BOARD_URL,
        "selector": "#authority",
        "wait_ms": 20000,
        "framed": True,
        "unclip": ["#authority .tablewrap"],
        "unstick": ["#authority .gates thead th"],
        # Prose-heavy and 955px tall, so it sits near the legibility floor on a 4:5
        # canvas. It is a one-artifact post; give it --size 1080x1920 if it warns.
        "viewport_w": 1032,
    },
    # Player projections. These tables live inside collapsed <details>, hence
    # open_details; the selector is the <details> because its <summary> carries the
    # position label that both disambiguates the five blocks and titles the slide.
    #
    # `Role evidence` and `Scheme` are dropped by default: both are two-line
    # explanatory cells that read as noise at post size, while the projection columns
    # are what a reader came for. --drop-cols overrides this per run.
    "nfl_qb_props": {
        "sport": "NFL",
        "label": "QB Projections",
        "scope": "slate",
        "url": NFL_BOARD_URL,
        "selector": "#players details.prop-group",
        "contains": "QB projections",
        "wait_ms": 20000,
        "framed": True,
        "open_details": True,
        "default_rows": 16,
        "drop_cols": ["Role evidence", "Scheme"],
        "unclip": ["#players .tablewrap"],
        "unstick": ["#players table.pr thead th"],
        "style": ("#players .tablewrap{border-radius:0!important}"
                  "#players details.prop-group > summary::before"
                  "{content:none!important}"
                  "#players details.prop-group > summary > span"
                  "{display:none!important}"),
        "viewport_w": 1032,
    },
    "nfl_rb_props": {
        "sport": "NFL",
        "label": "RB Projections",
        "scope": "slate",
        "url": NFL_BOARD_URL,
        "selector": "#players details.prop-group",
        "contains": "RB projections",
        "wait_ms": 20000,
        "framed": True,
        "open_details": True,
        "default_rows": 16,
        "drop_cols": ["Role evidence", "Scheme"],
        "unclip": ["#players .tablewrap"],
        "unstick": ["#players table.pr thead th"],
        "style": ("#players .tablewrap{border-radius:0!important}"
                  "#players details.prop-group > summary::before"
                  "{content:none!important}"
                  "#players details.prop-group > summary > span"
                  "{display:none!important}"),
        "viewport_w": 1032,
    },
    "nfl_wr_props": {
        "sport": "NFL",
        "label": "WR Projections",
        "scope": "slate",
        "url": NFL_BOARD_URL,
        "selector": "#players details.prop-group",
        "contains": "WR projections",
        "wait_ms": 20000,
        "framed": True,
        "open_details": True,
        "default_rows": 16,
        "drop_cols": ["Role evidence", "Scheme"],
        "unclip": ["#players .tablewrap"],
        "unstick": ["#players table.pr thead th"],
        "style": ("#players .tablewrap{border-radius:0!important}"
                  "#players details.prop-group > summary::before"
                  "{content:none!important}"
                  "#players details.prop-group > summary > span"
                  "{display:none!important}"),
        "viewport_w": 1032,
    },
    "nfl_te_props": {
        "sport": "NFL",
        "label": "TE Projections",
        "scope": "slate",
        "url": NFL_BOARD_URL,
        "selector": "#players details.prop-group",
        "contains": "TE projections",
        "wait_ms": 20000,
        "framed": True,
        "open_details": True,
        "default_rows": 16,
        "drop_cols": ["Role evidence", "Scheme"],
        "unclip": ["#players .tablewrap"],
        "unstick": ["#players table.pr thead th"],
        "style": ("#players .tablewrap{border-radius:0!important}"
                  "#players details.prop-group > summary::before"
                  "{content:none!important}"
                  "#players details.prop-group > summary > span"
                  "{display:none!important}"),
        "viewport_w": 1032,
    },
    "nfl_k_props": {
        "sport": "NFL",
        "label": "Kicker Projections",
        "scope": "slate",
        "url": NFL_BOARD_URL,
        "selector": "#players details.prop-group",
        "contains": "K projections",
        "wait_ms": 20000,
        "framed": True,
        "open_details": True,
        "default_rows": 16,
        "drop_cols": ["Role evidence", "Scheme"],
        "unclip": ["#players .tablewrap"],
        "unstick": ["#players table.pr thead th"],
        "style": ("#players .tablewrap{border-radius:0!important}"
                  "#players details.prop-group > summary::before"
                  "{content:none!important}"
                  "#players details.prop-group > summary > span"
                  "{display:none!important}"),
        "viewport_w": 1032,
    },
    # The scheme matrix is the widest thing on the board: fifteen columns with a
    # min-content width of ~1149px, which no capture width brings under the artifact
    # column. Columns are therefore dropped rather than shrunk - the target-share and
    # tempo columns go, leaving the coverage and pressure story the slide is about.
    # Fails closed if the board renames a header.
    "nfl_scheme_matrix": {
        "sport": "NFL",
        "label": "Coverage & Pressure Matrix",
        "scope": "slate",
        "url": NFL_BOARD_URL,
        "selector": "#scheme details.prop-group",
        "contains": "response matrix",
        "wait_ms": 20000,
        "framed": True,
        "open_details": True,
        "default_rows": 16,
        "drop_cols": ["Motion", "Play act", "RB tgt", "WR tgt", "TE tgt",
                      "Pass att", "Pass eff"],
        "unclip": ["#scheme .tablewrap"],
        "unstick": ["#scheme table.pr thead th"],
        "style": ("#scheme .tablewrap{border-radius:0!important}"
                  "#scheme details.prop-group > summary::before"
                  "{content:none!important}"
                  "#scheme details.prop-group > summary > span"
                  "{display:none!important}"),
        "viewport_w": 1032,
    },
    # -- per-game, from the same board --------------------------------------
    # `sport` is what tells the engine that --games names NFL fixtures, to be resolved
    # against nfl-model's board rather than this repo's baseball slate. The schedule is
    # never inferred from the abbreviations themselves: MLB and NFL share sixteen of
    # them, so SEA@SF is a real fixture in both sports and a guess would silently
    # resolve it against whichever pipeline had run most recently.
    #
    # Matched on the card's own data-key (`2026_01_NE_SEA`), not on its text: an
    # innerText match for "NE" hits every card that says MONITOR or MONEYLINE.
    "nfl_game": {
        "sport": "NFL",
        "label": "NFL Game Card",
        "label_fmt": "{away} at {home}",
        "scope": "game",
        "url": NFL_BOARD_URL,
        "selector": "#board .bd-card",
        "match_data": "key",
        "wait_ms": 20000,
        "framed": True,
        # The headline and footer are <button>s whose arrow affordances read as dead
        # UI in a still. Their text is worth keeping; the arrows are not.
        "hide": [".bd-headline__cta"],
        # 890px tall at 483 wide, so this artifact is height-bound and lands narrow on
        # a 4:5 canvas. Post it at --size 1080x1920, or two across with --layout row.
        "viewport_w": 1032,
    },
    "nfl_game_lines": {
        "sport": "NFL",
        "label": "Market vs Model",
        "label_fmt": "{away} at {home}",
        "scope": "game",
        "url": NFL_BOARD_URL,
        "selector": "#board .bd-card",
        "match_data": "key",
        "wait_ms": 20000,
        "framed": True,
        "hide": [".bd-headline__cta"],
        # The same card cut to its two price blocks - DraftKings' line and the model's
        # own number. At ~465px that is proportioned for a 4:5 post, where the full
        # card is not. The head-coach strip and the two derivation blocks are what go.
        "style": ("#board .bd-card .bd-principals{display:none!important}"
                  "#board .bd-card .bd-card__groups .bd-group:nth-child(n+3)"
                  "{display:none!important}"),
        "viewport_w": 1032,
    },
    # The complement of nfl_game_lines, so the two together carry the whole card on a
    # 4:5 canvas that the full 890px card cannot fill legibly. Measured at vw 1032:
    # head 46 + headline 36 + score 66 + groups 3-4 (127 + 213) = ~530px against the
    # lines cut's ~465 - close enough that the pair does not jump on the swipe.
    "nfl_game_why": {
        "sport": "NFL",
        "label": "Why This Projection",
        "label_fmt": "{away} at {home}",
        "scope": "game",
        "url": NFL_BOARD_URL,
        "selector": "#board .bd-card",
        "match_data": "key",
        "wait_ms": 20000,
        "framed": True,
        "hide": [".bd-headline__cta"],
        "style": ("#board .bd-card .bd-principals{display:none!important}"
                  "#board .bd-card .bd-card__groups .bd-group:nth-child(-n+2)"
                  "{display:none!important}"),
        "viewport_w": 1032,
    },
}

# ---- chase-analytics.com, as served today ------------------------------------
# These are the default matchup artifacts. Measured 2026-09-16 at vw 1032 / 780:
#  * Two-team sections (.ca-detail-duo) sit side by side from ~780px up and CLIP their
#    split tables there (scrollWidth > wrapper on starters, pitch mix and club splits).
#    Stacking the duo removes every clip and is the house rule for these captures.
#  * .ca-detail-source-note is methodology prose, 90-200px per section - the post's own
#    deck carries the context, so it is always hidden.
#  * The slate card is a fixed 400px wide at every viewport.
# Heights stacked at 1032: overview 377, starters 1004, arsenal 808, lineups 959,
# club-splits 720, recent 372, form 664, radar 450, bullpens 949; NFL availability 1953
# (two ~930px halves), scheme 2598 (post its parts), team-context 267 unstacked.
SITE_HIDE = [".ca-detail-source-note", ".ca-matchup-card__actions",
             ".ca-detail-back", ".ca-detail-nav"]
SITE_STACK = (".ca-detail-duo{display:grid!important;"
              "grid-template-columns:minmax(0,1fr)!important}")


def _site_artifact(sport: str, label: str, route: str, selector: str, *,
                   stack: bool = True, width: int = 1032, **extra) -> dict:
    entry = {
        "sport": sport.upper(),
        "label": label,
        "scope": "game",
        "site": route,
        "selector": selector,
        # The detail routes render client-side from the published JSON; wait for the
        # body of the section, not just its shell.
        "wait_ms": 20000,
        "framed": False,
        "hide": list(SITE_HIDE),
        "viewport_w": width,
        # Every data table in a live section must carry at least one number. A table
        # of nothing but dashes is data the site has not published yet (an unposted
        # lineup, a starter still TBD), and a post showing it is a wrong graphic.
        "require_data": ["table"],
    }
    if stack:
        entry["style"] = SITE_STACK
    # A whole detail section prints its own heading ("Probable Starters"), so a slot
    # caption under it would only repeat it.
    if re.fullmatch(r"#[\w-]+", selector) and selector != "#overview":
        entry["self_titled"] = True
    for key, value in extra.items():
        if key in ("hide", "style") and key in entry:
            entry[key] = entry[key] + value
        else:
            entry[key] = value
    return entry


# Report positions per unit. Specialists ride with the offense graphic; a position
# in neither set is listed on BOTH graphics rather than silently dropped.
NFL_OFFENSE_POS = ["QB", "RB", "HB", "FB", "WR", "TE", "OL", "OT", "T", "OG", "G", "C",
                   "LT", "LG", "RG", "RT", "K", "PK", "P", "LS", "KR", "PR"]
NFL_DEFENSE_POS = ["DL", "DE", "DT", "NT", "EDGE", "LB", "ILB", "OLB", "MLB", "WLB",
                   "SLB", "DB", "CB", "S", "FS", "SS", "SAF", "NB"]
NFL_BACKUP_INJURY_STYLE = (
    "#availability details.ca-injury-report .ca-avail-row[data-ce-keep='0']"
    "{display:none!important}"
    "#availability details.ca-injury-report[data-ce-kept='0']"
    "{display:none!important}")


def nfl_backup_injury_js(child: str, unit: str) -> str:
    """JS that cuts one board's injury report to this unit's non-starters.

    Returns {kept, unknown} so the runner can report positions it could not place.
    Names are compared loosely (case, punctuation and Jr./III suffixes ignored),
    because the formation and the report are rendered from different feeds.
    """
    own = NFL_OFFENSE_POS if unit == "offense" else NFL_DEFENSE_POS
    other = NFL_DEFENSE_POS if unit == "offense" else NFL_OFFENSE_POS
    return (
        "(() => {"
        f" const board = document.querySelector('#availability .ca-detail-duo > :{child}-child');"
        " if (!board) return {kept: -1, unknown: []};"
        " const norm = s => (s || '').toLowerCase()"
        r"   .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');"
        " const starters = new Set([...board.querySelectorAll('.ca-lineup-player strong')]"
        "   .map(e => norm(e.textContent)));"
        f" const own = new Set({json.dumps(own)});"
        f" const other = new Set({json.dumps(other)});"
        " const rep = board.querySelector('details.ca-injury-report');"
        " if (!rep) return {kept: 0, unknown: []};"
        " let kept = 0; const unknown = [];"
        " rep.querySelectorAll('.ca-avail-row').forEach(r => {"
        "   const pos = ((r.querySelector('.ca-avail-pos') || {}).textContent || '')"
        "     .trim().toUpperCase();"
        "   const name = norm((r.querySelector('.ca-avail-name') || {}).textContent);"
        "   const known = own.has(pos) || other.has(pos);"
        "   if (!known) unknown.push(pos || '?');"
        "   const keep = (own.has(pos) || !known) && !starters.has(name);"
        "   r.setAttribute('data-ce-keep', keep ? '1' : '0');"
        "   if (keep) kept++;"
        " });"
        " rep.open = true;"
        " rep.setAttribute('data-ce-kept', String(kept));"
        " const label = rep.querySelector('.ca-injury-report__label');"
        " if (label) label.textContent = 'Also On The Injury Report';"
        # The count must describe the rows shown, not the full report.
        " const count = rep.querySelector('.ca-injury-report__count');"
        " if (count) count.textContent = kept + (kept === 1 ? ' Player' : ' Players');"
        " return {kept: kept, unknown: unknown};"
        "})()")


_MLB_DETAIL = "/mlb/matchup.html"
_NFL_DETAIL = "/nfl/matchup.html"
ARTIFACTS.update({
    # Slate cards: one per game on /mlb/ and /nfl/.
    "mlb_card": _site_artifact("mlb", "Matchup Card", "/mlb/", "#matchup-{game_id}",
                               stack=False, width=1280, game_param=None),
    "nfl_card": _site_artifact("nfl", "Matchup Card", "/nfl/", "#matchup-{game_id}",
                               stack=False, width=1280, game_param=None),
    # Detail hero: teams, score/first pitch, venue, conditions, broadcast.
    "mlb_hero": _site_artifact("mlb", "Matchup Overview", _MLB_DETAIL, "#overview",
                               stack=False),
    "nfl_hero": _site_artifact("nfl", "Matchup Overview", _NFL_DETAIL, "#overview",
                               stack=False),
    "mlb_starters": _site_artifact("mlb", "Probable Starters", _MLB_DETAIL, "#starters"),
    # One starter panel is width-bound (~940 wide at 1032), so it is captured at 780,
    # where the stacked split table still fits without clipping (measured).
    "mlb_starter_away": _site_artifact(
        "mlb", "Probable Starter", _MLB_DETAIL,
        "#starters .ca-detail-duo > :first-child", label_fmt="{away} starter",
        width=780),
    "mlb_starter_home": _site_artifact(
        "mlb", "Probable Starter", _MLB_DETAIL,
        "#starters .ca-detail-duo > :last-child", label_fmt="{home} starter",
        width=780),
    "mlb_arsenal": _site_artifact("mlb", "Pitch Mix", _MLB_DETAIL, "#arsenal"),
    "mlb_lineups": _site_artifact("mlb", "Lineup Versus Starter", _MLB_DETAIL,
                                  "#lineups"),
    # Width-bound sections that keep their layout at 780 (no clipped tables,
    # measured): 740 wide there, so ~1.3x the type of a 1032 capture. Lineups are
    # height-bound (no gain) and bullpens clip at 780, so both stay at 1032.
    "mlb_splits": _site_artifact("mlb", "Club Batting Splits", _MLB_DETAIL,
                                 "#club-splits", width=780),
    "mlb_recent": _site_artifact("mlb", "Last Ten Games", _MLB_DETAIL, "#recent",
                                 width=780),
    "mlb_form": _site_artifact("mlb", "Offensive Form", _MLB_DETAIL, "#form",
                               width=780),
    "mlb_radar": _site_artifact("mlb", "Team Profile Radar", _MLB_DETAIL, "#radar"),
    "mlb_bullpens": _site_artifact("mlb", "Bullpen Workload", _MLB_DETAIL, "#bullpens"),
    # Injury designations, drawn as the first-string formation: one board per club,
    # one unit per graphic. Starters keep the site's headshot and status pill. Below
    # them, the board's own injury-report rows are cut to players at THIS unit's
    # positions who are NOT starting (backups: name, position, injury and
    # designation, no photo - owner direction 2026-09-17). The Offense/Defense tab bar
    # is UI and is hidden. Measured at vw 1032: formation ~790-833px, plus ~46px per
    # listed backup.
    **{f"nfl_{unit}_{side}": _site_artifact(
        "nfl", f"{unit.title()} Starters And Injuries", _NFL_DETAIL,
        f"#availability .ca-detail-duo > :{child}-child",
        label_fmt=f"{{{side}}} {unit}",
        hide=[".ca-lineup-tabs"],
        style=NFL_BACKUP_INJURY_STYLE,
        # The site opens on Offense. Select the wanted unit through its own tab and
        # refuse to shoot until it is selected, or a defense post ships the offense.
        ready=(f"(() => {{ const t = document.getElementById('{side}-{unit}-tab');"
               f" if (!t) return false;"
               f" if (t.getAttribute('aria-selected') !== 'true') t.click();"
               f" return t.getAttribute('aria-selected') === 'true'; }})()"),
        ready_required=True,
        prepare=nfl_backup_injury_js(child, unit))
       for unit in ("offense", "defense")
       for side, child in (("away", "first"), ("home", "last"))},
    "nfl_coverage": _site_artifact("nfl", "Coverage Matrix", _NFL_DETAIL,
                                   "#scheme .ca-coverage-matrix"),
    "nfl_situations": _site_artifact("nfl", "Situational Scheme", _NFL_DETAIL,
                                     "#scheme .ca-sit-block"),
    "nfl_scheme_grid": _site_artifact("nfl", "Scheme Confrontation", _NFL_DETAIL,
                                      "#scheme .ca-scheme-grid"),
    "nfl_form": _site_artifact("nfl", "Team Form", _NFL_DETAIL, "#form", width=780),
    "nfl_radar": _site_artifact("nfl", "Team Profile Radar", _NFL_DETAIL, "#radar"),
    # Width-bound: 976x267 at 1032, 740x288 at 780 (~1.3x type). Below ~700 its two
    # club panels stack and it turns tall.
    "nfl_context": _site_artifact("nfl", "Rest, Travel And Venue", _NFL_DETAIL,
                                  "#team-context", stack=False, width=780),
})

# Artifacts captured from this branch's own dashboard/ pages. Production no longer
# serves those pages (matchup_compare.html and team_rankings.html redirect to the new
# routes since 2026-09), so these show a design readers cannot find. Still runnable,
# but every use says so.
LEGACY_ARTIFACTS = {n for n, s in ARTIFACTS.items() if s.get("page")}


def artifact_source(name: str) -> str:
    """'site' (chase-analytics.com), 'legacy' (local dashboard/) or 'hosted'."""
    spec = ARTIFACTS[name]
    if spec.get("site"):
        return "site"
    return "legacy" if spec.get("page") else "hosted"


# Team Rankings families as the site names them (spec calls these the categories).
TEAM_FAMILIES = {
    "scoring": "Scoring",
    "winning": "Winning",
    "surface": "Winning",       # site key for the win/surface family
    "difficulty": "Difficulty",
    "status": "Status-Projection",
    "projection": "Status-Projection",
}
FAMILY_KEY = {"winning": "surface", "projection": "status"}
WINDOWS = {"YTD": "Season", "L30": "Last 30 days", "L14": "Last 14 days", "L7": "Last 7 days"}

# breakdown aspect sets, per sport, all captured off chase-analytics.com. The retired
# compare-page boards (pitcher/bullpen) are still reachable by key through `deep`.
ASPECTS = {
    "mlb": {
        "pitching": {"artifacts": ["mlb_starters"], "eyebrow": "Pitching Breakdown",
                     "caption": "Both probable starters, split by batter hand and park"},
        "arsenal": {"artifacts": ["mlb_arsenal"], "eyebrow": "Pitch Mix",
                    "caption": "What each starter throws, and how the other side hits it"},
        "offense": {"artifacts": ["mlb_splits"], "eyebrow": "Offense Breakdown",
                    "caption": "Both clubs by opposing hand and home/road"},
        "lineups": {"artifacts": ["mlb_lineups"], "eyebrow": "Lineup Breakdown",
                    "caption": "Each batting order against the opposing starter"},
        "form": {"artifacts": ["mlb_form"], "eyebrow": "Form Breakdown",
                 "caption": "Offensive form, club against club"},
        "bullpen": {"artifacts": ["mlb_bullpens"], "eyebrow": "Bullpen Breakdown",
                    "caption": "Workload and availability in both bullpens"},
    },
    "nfl": {
        "offense": {"artifacts": ["nfl_offense_away"], "eyebrow": "Injury Report",
                    "caption": "Away offense: starters in formation, injured backups "
                               "by name"},
        "offense_home": {"artifacts": ["nfl_offense_home"], "eyebrow": "Injury Report",
                         "caption": "Home offense: starters in formation, injured "
                                    "backups by name"},
        "defense": {"artifacts": ["nfl_defense_away"], "eyebrow": "Injury Report",
                    "caption": "Away defense: starters in formation, injured backups "
                               "by name"},
        "defense_home": {"artifacts": ["nfl_defense_home"], "eyebrow": "Injury Report",
                         "caption": "Home defense: starters in formation, injured "
                                    "backups by name"},
        "scheme": {"artifacts": ["nfl_coverage"], "eyebrow": "Scheme Breakdown",
                   "caption": "How each offence meets the coverage it will see"},
        "form": {"artifacts": ["nfl_form"], "eyebrow": "Form Breakdown",
                 "caption": "Team form, club against club"},
        "context": {"artifacts": ["nfl_hero", "nfl_context"], "eyebrow": "Game Context",
                    "caption": "Rest, travel and venue"},
    },
}
DEFAULT_ASPECTS = {"mlb": "pitching,offense,bullpen", "nfl": "scheme,form,context"}
ASPECT_ALIAS = {
    "mlb": {"pitchers": "pitching", "starters": "pitching", "arms": "pitching",
            "offence": "offense", "bats": "offense", "hitting": "offense",
            "splits": "offense", "batting orders": "lineups", "relief": "bullpen",
            "pen": "bullpen", "bullpens": "bullpen", "pitch mix": "arsenal"},
    "nfl": {"injuries": "offense", "injury report": "offense",
            "availability": "offense",
            "offence": "offense", "defence": "defense", "travel": "context",
            "rest": "context", "coverage": "scheme"},
}
# `deep` with no --artifacts and no terminal to ask in.
DEEP_DEFAULTS = {"mlb": ["mlb_hero", "mlb_recent"], "nfl": ["nfl_hero", "nfl_context"]}


def post_sport(names: list[str]) -> str:
    """The sport a post built from these artifacts is about.

    Artifacts carry their sport in the registry; anything without one is this repo's
    own baseball dashboard, which is what every post was for its whole life. A post
    that mixes sports is legal and names neither.
    """
    sports = {ARTIFACTS[n].get("sport", "MLB") for n in names}
    if not sports:
        # No artifacts named at all: this repo's own baseball dashboard, which is the
        # same default card_compose.html falls back to when a post sends no site line.
        return "MLB"
    return sports.pop() if len(sports) == 1 else "Sports"


def site_line(names: list[str]) -> str:
    """The footer line for a post built from these artifacts.

    It names a sport, so an NFL post must not advertise MLB research.
    """
    return f"Access Premium {post_sport(names)} Research At Chase-Analytics.com"


def fail(msg: str) -> None:
    print(f"[content-engine] FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


# ── slate ────────────────────────────────────────────────────────────────────
def read_slate(day: str, required: bool = True) -> list[dict]:
    """Today's MLB slate, or [] when it is not required and not usable.

    The fail-closed check is the whole point of this function and stays exactly as
    strict for every post that shows an MLB game. But a `compose` post can be built
    entirely from another sport's board - the nfl-model and mlb-model decks are
    slate-scope artifacts on their own hosted repos - and refusing one of those
    because this repo's baseball pipeline has not run yet is a gate doing the
    opposite of its job. Needing the slate is signalled by asking for --games.
    """
    path = DATA / "today_matchups.csv"
    rows: list[dict] = []
    problem = None
    if not path.exists():
        problem = f"{path} missing - run the pipeline first"
    else:
        with open(path, newline="", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        if not rows:
            problem = "slate is empty"
        else:
            dates = {r.get("Slate_Date", "").strip() for r in rows}
            if dates != {day}:
                problem = (f"slate date(s) {sorted(dates)} != requested {day} "
                           f"(stale data?)")
    if problem:
        if required:
            fail(problem)
        print(f"[content-engine] NOTE MLB slate unusable ({problem}) - this post "
              f"does not read it, continuing")
        return []
    return rows


def artifact_league(name: str) -> str:
    """The schedule an artifact's --games names. Declared, never inferred."""
    return ARTIFACTS[name].get("sport", "MLB").lower()


def games_league(artifacts: str | None) -> str:
    """Which sport's fixture list this post's --games refers to.

    Decided by the matchup artifacts asked for, so that one flag can name a baseball
    game or a football one without a second flag to say which. Slate-scope artifacts
    do not vote: they need no game at all, and an NFL board stacked under an MLB
    matchup card is a legal (if odd) post.
    """
    names = [ALIAS_INDEX.get(_norm_phrase(t.strip()))
             for t in (artifacts or "").split(",") if t.strip()]
    leagues = {artifact_league(n) for n in names
               if n and ARTIFACTS[n]["scope"] == "game"}
    if len(leagues) > 1:
        fail("one post cannot mix " + " and ".join(l.upper() for l in sorted(leagues)) +
             " matchup artifacts - --games can only name one sport's fixtures")
    return leagues.pop() if leagues else "mlb"


def resolve_post_games(a, day: str) -> tuple[list[dict], list[dict]]:
    """(slate, games) for this post, read from wherever its matchup artifacts live.

    Live-site artifacts are keyed by the site's game id, so they resolve against the
    site's own published slate; nfl-model board cards against board.json; the retired
    local pages against this repo's CSV. One post draws its matchup artifacts from ONE
    source - their game identities are not interchangeable.
    """
    if a.command == "rankings":
        slate = read_slate(day)
        return slate, resolve_games(slate, a.games)
    if a.command == "breakdown":
        resolve_aspects(a)  # a typo should fail before any network work
    if a.command in ("preview", "full-card", "breakdown"):
        rows = read_site_slate(a.sport)
        check_site_date(rows, day, a.sport)
        return rows, resolve_games(rows, a.games, _other_sport_hint(a.sport))
    if a.artifacts:
        names = [resolve_artifact(t) for t in a.artifacts.split(",") if t.strip()]
    elif a.command == "deep":
        names = DEEP_DEFAULTS[a.sport]
    else:
        names = []
    game_names = [n for n in names if ARTIFACTS[n]["scope"] == "game"]
    if a.command == "deep":
        slate_names = [n for n in names if n not in game_names]
        if slate_names:
            fail(f"{', '.join(slate_names)} is a slate artifact, not a matchup one - "
                 f"use `compose` for it")
    if not game_names:
        if a.games:
            print("[content-engine] NOTE --games ignored: no matchup artifact asked for")
        return [], []
    # No --games resolves to the whole slate, which is right for `deep` (it then
    # refuses more than three) but for `compose` would silently post whichever game
    # happens to be listed first. Name the game.
    if a.command == "compose" and not a.games:
        fail(f"{', '.join(game_names)} is a matchup artifact - pass --games AWAY@HOME "
             f"to say which game")
    sources = {artifact_source(n) for n in game_names}
    if len(sources) > 1:
        fail("one post cannot mix matchup artifacts from different sources "
             f"({', '.join(sorted(sources))}): their games are keyed differently. "
             "Live-site artifacts are the mlb_*/nfl_* keys marked (site) in `keys`.")
    source = sources.pop()
    league = games_league(",".join(game_names))
    if source == "site":
        rows = read_site_slate(league)
        check_site_date(rows, day, league)
        return rows, resolve_games(rows, a.games, _other_sport_hint(league))
    if source == "hosted":
        return [], resolve_nfl_games(a.games)
    slate = read_slate(day)
    return slate, resolve_games(slate, a.games)


def _other_sport_hint(sport: str) -> str:
    other = "nfl" if sport == "mlb" else "mlb"
    return (f" (an {other.upper()} game? add --sport {other}, or use {other}_* "
            f"artifacts)")


def resolve_aspects(a) -> list[str]:
    """breakdown's aspect list for --sport, validated."""
    aspects = ASPECTS[a.sport]
    wanted = [t.strip().lower()
              for t in (a.aspects or DEFAULT_ASPECTS[a.sport]).split(",") if t.strip()]
    wanted = [ASPECT_ALIAS[a.sport].get(_norm_phrase(t),
                                        _norm_phrase(t).replace(" ", "_"))
              for t in wanted]
    for asp in wanted:
        if asp not in aspects:
            fail(f"{asp!r} is not an {a.sport.upper()} aspect. "
                 f"Choose from: {', '.join(aspects)}")
    if len(wanted) > 3:
        fail(f"breakdown makes at most 3 graphics ({len(wanted)} aspects given)")
    return wanted


def resolve_nfl_games(spec: str | None) -> list[dict]:
    """`--games NE@SEA` against nfl-model's published board.

    The board is read only to VALIDATE and to list what is available; the capture
    itself matches on the card's data-key and fails closed if the fixture is not on
    the page. So a missing or unclonable nfl-model is a warning, not a wall - the
    hosted board is the source of truth, and this file is a local convenience that is
    allowed to lag it, exactly like docs/index.html does.
    """
    tokens = [t.strip().upper() for t in (spec or "").split(",") if t.strip()]
    for token in tokens:
        if "@" not in token:
            fail(f"--games entry {token!r} must look like AWAY@HOME")
    fixtures: dict[str, dict] = {}
    if NFL_BOARD_JSON.exists():
        try:
            board = json.loads(NFL_BOARD_JSON.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            print(f"[content-engine] NOTE {NFL_BOARD_JSON.name} unreadable ({exc}) - "
                  f"not validating --games against it")
            board = {}
        for g in board.get("games") or []:
            away, home = str(g.get("away", "")).upper(), str(g.get("home", "")).upper()
            if away and home:
                fixtures[f"{away}@{home}"] = {
                    "Away": away, "Home": home,
                    "Kickoff": g.get("kickoff", ""),
                    "Week": board.get("week"), "Season": board.get("season"),
                }
    else:
        print(f"[content-engine] NOTE {NFL_BOARD_JSON} not found - --games will be "
              f"taken as given and checked against the live board at capture time")
    picked = []
    for token in tokens:
        if fixtures and token not in fixtures:
            fail(f"{token} is not on the published NFL board. "
                 f"Available: {', '.join(sorted(fixtures))}")
        away, _, home = token.partition("@")
        picked.append(fixtures.get(token, {"Away": away, "Home": home}))
    return picked


def resolve_games(slate: list[dict], spec: str | None, hint: str = "") -> list[dict]:
    """`--games CLE@CIN,TEX@TBR` in the order given; no --games means the whole slate.

    Doubleheaders put two rows under one AWAY@HOME key. A dict would silently drop one,
    so keys map to lists and an ambiguous pick must be disambiguated as AWAY@HOME#2
    (game order as listed on the slate).
    """
    if not spec:
        return slate
    index: dict[str, list[dict]] = {}
    for r in slate:
        index.setdefault(f"{r['Away'].upper()}@{r['Home'].upper()}", []).append(r)
    picked = []
    for token in [t.strip().upper() for t in spec.split(",") if t.strip()]:
        key, _, suffix = token.partition("#")
        if "@" not in key:
            fail(f"--games entry {token!r} must look like AWAY@HOME (or AWAY@HOME#2)")
        if key not in index:
            fail(f"{key} is not on the {slate[0]['Slate_Date']} slate{hint}. "
                 f"Available: {', '.join(sorted(index))}")
        candidates = index[key]
        if suffix:
            if not suffix.isdigit() or not 1 <= int(suffix) <= len(candidates):
                fail(f"{token}: {key} has {len(candidates)} game(s) on this slate; "
                     f"use #1..#{len(candidates)}")
            picked.append(candidates[int(suffix) - 1])
        elif len(candidates) > 1:
            times = ", ".join(
                f"#{i} {c.get('Time', '?').strip()}"
                for i, c in enumerate(candidates, start=1))
            fail(f"{key} is a doubleheader on this slate ({times}) - "
                 f"pick one, e.g. {key}#1")
        else:
            picked.append(candidates[0])
    return picked


# -- the key: what each artifact is, and the language that summons it ---------
# One place to look up "what do I say to get X". Every phrase below resolves to a
# canonical artifact name, so --artifacts accepts natural language as well as keys:
#   --artifacts "projected lineups,bullpen,leans"  ==  --artifacts card,bullpen,model_leans
# Run `keys` to print this as a table.
ARTIFACT_DESC = {
    "mlb_card": "The slate card from /mlb/: venue, first pitch or live score, both "
                "clubs with records, probable starters, conditions and broadcast.",
    "mlb_hero": "The matchup page's opening panel: both clubs, score or first pitch, "
                "venue, conditions, broadcast and status. The compact matchup shot.",
    "mlb_starters": "Both probable starters: ERA, Pitch Score, QS%, IP, last start and "
                    "splits by batter hand and home/road. Tall - best alone.",
    "mlb_starter_away": "The away starter's panel on its own, large enough for a phone.",
    "mlb_starter_home": "The home starter's panel on its own.",
    "mlb_arsenal": "Each starter's pitch mix: usage, count, velocity, run value per 100 "
                   "and how the opposing club hits each pitch.",
    "mlb_lineups": "Both batting orders against the opposing starter's hand.",
    "mlb_splits": "Both clubs' batting splits by opposing hand and home/road.",
    "mlb_recent": "Each club's last ten games.",
    "mlb_form": "Offensive form mirrored club against club, with league context.",
    "mlb_radar": "Two team-profile radars on the site's current axes.",
    "mlb_bullpens": "Both bullpens' recent workload and who is available.",
    "nfl_card": "The slate card from /nfl/: venue, kickoff, both clubs, the starting "
                "quarterbacks, travel, availability and broadcast.",
    "nfl_hero": "The NFL matchup page's opening panel.",
    "nfl_offense_away": "Away club's injury designations on offense: the first-string "
                        "formation with headshots and each starter's status, then any "
                        "injured backups at offensive positions (and specialists) "
                        "listed by name, no photo. Best alone.",
    "nfl_offense_home": "The same for the home club.",
    "nfl_defense_away": "Away club's injury designations on defense: starters in "
                        "formation with status, injured defensive backups listed by name.",
    "nfl_defense_home": "The same for the home club.",
    "nfl_coverage": "The matchup's coverage matrix from the scheme section.",
    "nfl_situations": "Situational scheme block (first block of the scheme section).",
    "nfl_scheme_grid": "Scheme confrontation grid, offence against defence.",
    "nfl_form": "Team form, mirrored club against club.",
    "nfl_radar": "Two team-profile radars.",
    "nfl_context": "Rest, travel and venue for both clubs.",
    "card": "Full game card: both starters with pitch scores and K/BB/ERA, the lineup "
            "edge bar, and both projected lineups with handedness.",
    "banner": "Wide identity strip: records, last-10 form pips, first pitch, venue and "
              "weather. The compact way to show a matchup.",
    "radar": "Two five-axis radars comparing the lineups on process composite "
             "(RCV/ABQ/OSI/OBR/projOSI) and offense vs schedule.",
    "offense": "Both lineups' wRC+/OPS/wOBA/SLG ranks over L7, L14, L30 and YTD, split "
               "overall, by opposing hand, and home/road.",
    "pitcher": "Away lineup batter-by-batter vs the home starter, that starter's allowed "
               "splits by batter hand, and career hitter-vs-pitcher history.",
    "pitcher_rev": "The same board with the sides swapped: home lineup vs away starter.",
    "bullpen": "Away lineup batter-by-batter vs the home bullpen only (starters excluded).",
    "bullpen_rev": "The same board swapped: home lineup vs the away bullpen.",
    "starters_rankings": "Every projected starter on the slate ranked by Pitch Score, "
                         "with K%/BB%/ERA/FIP, what they allow, and stuff flags.",
    "lineup_vs_hand": "One lineup batter-by-batter against the hand the opposing "
                      "starter throws - the left half of the pitcher board, captured "
                      "on its own so it renders large enough for a phone.",
    "lineup_vs_hand_rev": "The same for the other lineup.",
    "team_rankings": "All 30 clubs ranked in one category (scoring, winning, difficulty "
                     "or projection) over a chosen window.",
    "trends_heatmap": "League-wide trend heat map from the Research Lab.",
    "model_kpis": "Model slate summary strip: game count, slate date, how many carry a "
                  "sharp signal, priced markets, and the decision gate.",
    "model_slate": "Model projections per game: win probability, projected total, margin, "
                   "lean and sharp flag.",
    "model_leans": "The model's biggest priced gaps, ranked by edge, with the model "
                   "number and state.",
    "model_props": "Model pitcher-prop board.",
    "nfl_power_top": "NFL power ratings, teams 1-16: opponent-adjusted Rating, the "
                     "matchup model's Off and Def, and projected wins.",
    "nfl_power_bottom": "The same board, teams 17-32 - slide two of the pair.",
    "nfl_edges": "Every priced game ranked by how far the model sits from the "
                 "DraftKings number, with both totals beside it. A map of where the "
                 "model has an opinion - the board's own words - not a card.",
    "nfl_offense": "Offensive units ranked by points per game above average, with "
                   "EPA per play, first-down rate, explosive rate, sack rate and "
                   "giveaway rate. Top 16; --rows-from 17 gives the other half.",
    "nfl_defense": "The same for defensive units, where the rates record what "
                   "OPPONENTS did: low EPA allowed and high sack rate are both good.",
    "nfl_seeds_afc": "The AFC playoff field over 20,000 simulated seasons - playoff "
                     "odds, division odds and top-seed odds, cut line drawn in.",
    "nfl_seeds_nfc": "The same for the NFC.",
    "nfl_divisions_afc": "All four AFC divisions: mean simulated record, division "
                         "odds and playoff odds, with the division favourite named.",
    "nfl_divisions_nfc": "The same four cards for the NFC.",
    "nfl_gate_tiles": "The accountability strip: the model's margin error against the "
                      "market's on the same games, how its own disagreements actually "
                      "covered, and the sample size. Stacks under any NFL board.",
    "nfl_authority": "The full authority section - what the numbers may be used for, "
                     "the production gates met and unmet, and why this model is "
                     "research only. Prose-heavy; give it a canvas of its own.",
    "nfl_qb_props": "Next-game QB centres: attempts, completions, passing yards, "
                    "touchdowns, interceptions and rushing yards, with a confidence "
                    "grade. Ordered BY GAME, not ranked - the default 16 rows are the "
                    "slate's first eight fixtures; --rows-from 17 walks the rest.",
    "nfl_rb_props": "Next-game RB centres: carries, rushing yards, targets, "
                    "receptions, receiving yards and touchdown rate.",
    "nfl_wr_props": "Next-game WR centres: targets, receptions, receiving yards and "
                    "touchdown rate.",
    "nfl_te_props": "Next-game TE centres, same columns as the receivers.",
    "nfl_k_props": "Next-game kicker centres: attempts, makes, extra points and "
                   "projected kicking points.",
    "nfl_scheme_matrix": "This week's coverage and pressure matrix - each offence "
                         "against the man/zone mix, blitz rate and pressure rate it "
                         "is about to face.",
    "nfl_game": "One game's full board card: status, kickoff, both power ratings and "
                "projected scores, head coaches, DraftKings' live spread/total/"
                "moneyline, the model's own numbers beside them, and the derivation. "
                "Tall - post it at 1080x1920, or two across with --layout row.",
    "nfl_game_lines": "The same card cut to the two price blocks: what DraftKings is "
                      "posting and what the model makes it. Proportioned for 4:5.",
    "nfl_game_why": "The other half of that card: the offense, defense and rating "
                    "edges behind the projection, plus the per-unit terms - home "
                    "field, first downs, sacks, EPA/play, explosives, turnovers.",
}

ARTIFACT_ALIASES = {
    # chase-analytics.com as served today. The everyday phrases live HERE, so asking
    # for "the matchup card" gets the card a reader will actually find on the site.
    "mlb_card": ["matchup card", "game card", "the card", "mlb card", "slate card"],
    "mlb_hero": ["matchup banner", "analysis banner", "matchup analysis", "banner",
                 "overview", "matchup overview", "hero", "strip", "identity strip"],
    "mlb_starters": ["starters", "probable starters", "pitchers", "starter splits",
                     "pitcher splits", "pitching"],
    "mlb_starter_away": ["away starter", "visiting starter"],
    "mlb_starter_home": ["home starter"],
    "mlb_arsenal": ["arsenal", "pitch mix", "pitch types", "repertoire"],
    "mlb_lineups": ["lineups", "projected lineups", "lineup vs starter",
                    "lineup card", "batting orders"],
    "mlb_splits": ["club splits", "batting splits", "splits", "offense splits",
                   "offensive splits", "hitting"],
    "mlb_recent": ["last ten", "last 10", "recent games", "recent form"],
    "mlb_form": ["form", "offensive form", "lineup form", "bats", "league context"],
    "mlb_radar": ["radar", "team radar", "profile radar", "team profile", "spider",
                  "spider chart"],
    "mlb_bullpens": ["bullpens", "bullpen", "relief", "pen", "relievers",
                     "bullpen workload"],
    "nfl_card": ["nfl card", "nfl matchup card", "nfl slate card"],
    "nfl_hero": ["nfl matchup", "nfl overview", "nfl banner", "nfl hero"],
    "nfl_offense_away": ["nfl away lineup", "away offense", "nfl_availability_away",
                         "away availability", "nfl_injuries_away", "away injuries",
                         "injury report", "injuries", "availability",
                         "injury designations"],
    "nfl_offense_home": ["nfl home lineup", "home offense", "nfl_availability_home",
                         "home availability", "nfl_injuries_home", "home injuries",
                         "home injury report"],
    "nfl_defense_away": ["away defense", "nfl away defense", "away defense injuries"],
    "nfl_defense_home": ["home defense", "nfl home defense", "home defense injuries"],
    "nfl_coverage": ["coverage matrix", "nfl coverage", "man zone"],
    "nfl_situations": ["situations", "situational", "down and distance",
                       "nfl situations"],
    "nfl_scheme_grid": ["scheme confrontation", "scheme grid", "nfl scheme"],
    "nfl_form": ["nfl form", "team form"],
    "nfl_radar": ["nfl radar", "nfl team radar"],
    "nfl_context": ["rest travel venue", "travel", "rest", "nfl context",
                    "team context"],
    # Retired local dashboard pages. Reachable by exact key only (plus the phrases
    # below that have no live equivalent); `keys` marks them legacy.
    "lineup_vs_hand": ["lineup vs hand", "bats vs hand"],
    "lineup_vs_hand_rev": ["reverse lineup vs hand", "other lineup vs hand"],
    "pitcher": ["hitter vs pitcher", "matchup history", "pitcher history"],
    "starters_rankings": ["starters rankings", "todays starters", "pitcher rankings",
                          "ranked starters", "best to worst", "pitch score",
                          "pitching score"],
    "team_rankings": ["team rankings", "league rankings", "all 30", "club rankings",
                      "team board"],
    "trends_heatmap": ["trends", "heat map", "heatmap", "trends heat map"],
    "model_kpis": ["model summary", "slate summary", "model kpis", "model header"],
    "model_slate": ["model slate", "projections", "model projections",
                    "win probability", "projected totals", "model board"],
    "model_leans": ["leans", "biggest leans", "model leans", "edges", "biggest edges"],
    "model_props": ["model props", "pitcher props", "props"],
    "nfl_power_top": ["nfl power ratings", "nfl top 16", "nfl rankings",
                      "nfl power rankings", "power ratings top"],
    "nfl_power_bottom": ["nfl bottom 16", "nfl power ratings bottom",
                         "nfl rankings bottom", "power ratings bottom"],
    "nfl_edges": ["nfl edges", "model vs market", "disagreements", "biggest gaps",
                  "where the model differs", "nfl leans", "market gaps"],
    "nfl_offense": ["nfl offense", "offense power ranking", "offensive rankings",
                    "best offenses", "offense units"],
    "nfl_defense": ["nfl defense", "defense power ranking", "defensive rankings",
                    "best defenses", "defense units"],
    "nfl_seeds_afc": ["afc playoff field", "afc seeds", "afc playoff odds", "afc"],
    "nfl_seeds_nfc": ["nfc playoff field", "nfc seeds", "nfc playoff odds", "nfc"],
    "nfl_divisions_afc": ["afc divisions", "afc division odds", "afc division winners"],
    "nfl_divisions_nfc": ["nfc divisions", "nfc division odds", "nfc division winners"],
    "nfl_gate_tiles": ["accountability", "track record", "measured against the market",
                       "model accuracy", "nfl tiles", "receipts"],
    "nfl_authority": ["authority", "research only", "gates", "what these numbers mean",
                      "why not a bet"],
    "nfl_qb_props": ["qb props", "quarterback projections", "qb projections",
                     "passing props"],
    "nfl_rb_props": ["rb props", "running back projections", "rb projections",
                     "rushing props"],
    "nfl_wr_props": ["wr props", "receiver projections", "wr projections",
                     "receiving props", "wideouts"],
    "nfl_te_props": ["te props", "tight end projections", "te projections"],
    "nfl_k_props": ["kicker props", "kicker projections", "k props", "kickers"],
    "nfl_scheme_matrix": ["scheme", "league scheme matrix", "response matrix",
                          "scheme intelligence", "coverage and pressure",
                          "matchup matrix"],
    "nfl_game": ["nfl board card", "nfl model card", "game card nfl"],
    "nfl_game_lines": ["nfl lines", "market vs model", "nfl price card",
                       "line card", "nfl spread card"],
    "nfl_game_why": ["why this projection", "nfl why", "game derivation",
                     "how the model got there", "nfl game why"],
}


def _norm_phrase(text: str) -> str:
    return " ".join(str(text).lower().replace("_", " ").replace("-", " ").split())


def _wrap(text: str, width: int) -> list[str]:
    words, lines, cur = str(text).split(), [], ""
    for word in words:
        if len(cur) + len(word) + 1 > width:
            lines.append(cur)
            cur = word
        else:
            cur = (cur + " " + word).strip()
    if cur:
        lines.append(cur)
    return lines


# Retired-page artifacts carry a `legacy_` prefix, so a bare word can never land on a
# page chase-analytics.com no longer serves. Where the live site has the same content,
# the old key becomes a phrase for the LIVE artifact (`card` -> mlb_card); otherwise it
# stays a phrase for the legacy entry, so older commands still run (with the warning).
LEGACY_TO_SITE = {"card": "mlb_card", "banner": "mlb_hero", "radar": "mlb_radar",
                  "offense": "mlb_splits", "pitcher": "mlb_starters",
                  "bullpen": "mlb_bullpens"}
for _old in sorted(LEGACY_ARTIFACTS):
    _new = "legacy_" + _old
    ARTIFACTS[_new] = ARTIFACTS.pop(_old)
    if _old in ARTIFACT_DESC:
        ARTIFACT_DESC[_new] = ARTIFACT_DESC.pop(_old)
    _phrases = ARTIFACT_ALIASES.pop(_old, [])
    if _old in LEGACY_TO_SITE:
        ARTIFACT_ALIASES.setdefault(LEGACY_TO_SITE[_old], []).append(_old)
        ARTIFACT_ALIASES[_new] = _phrases
    else:
        ARTIFACT_ALIASES[_new] = [_old] + _phrases
LEGACY_ARTIFACTS = {"legacy_" + n for n in LEGACY_ARTIFACTS}

# phrase -> canonical name (canonical names and labels included)
ALIAS_INDEX: dict[str, str] = {}
# Live-site artifacts claim shared labels first ("Team Profile Radar" is both the live
# section and the retired compare-page board).
for _name, _spec in sorted(ARTIFACTS.items(),
                           key=lambda kv: kv[1].get("site") is None):
    ALIAS_INDEX[_norm_phrase(_name)] = _name
    ALIAS_INDEX.setdefault(_norm_phrase(_spec["label"]), _name)
for _name, _phrases in ARTIFACT_ALIASES.items():
    for _phrase in _phrases:
        ALIAS_INDEX.setdefault(_norm_phrase(_phrase), _name)


def resolve_artifact(token: str) -> str:
    """Accept a key or any phrase from the key; fail with the closest suggestions."""
    want = _norm_phrase(token)
    if want in ALIAS_INDEX:
        return ALIAS_INDEX[want]
    near = sorted({n for phrase, n in ALIAS_INDEX.items()
                   if want and (want in phrase or phrase in want)})
    if len(near) == 1:
        return near[0]
    hint = (" Closest: " + ", ".join(near) if near
            else " Run `keys` to see every artifact and the phrases that reach it.")
    fail("{!r} does not name an artifact.{}".format(token, hint))


def print_key() -> None:
    """Print the key: artifact, what it shows, and the language that summons it."""
    for heading, names in (
        ("MATCHUP ARTIFACTS  (need --games)",
         [n for n, sp in ARTIFACTS.items() if sp["scope"] == "game"]),
        ("SLATE ARTIFACTS  (no --games needed)",
         [n for n, sp in ARTIFACTS.items() if sp["scope"] == "slate"]),
    ):
        print("\n" + heading)
        print("=" * len(heading))
        order = {"site": 0, "hosted": 1, "legacy": 2}
        for name in sorted(names, key=lambda n: order[artifact_source(n)]):
            print("\n  {}   [{}]  ({})".format(
                name, ARTIFACTS[name]["label"],
                {"site": "site", "legacy": "LEGACY - retired page",
                 "hosted": "hosted board"}[artifact_source(name)]))
            for line in _wrap(ARTIFACT_DESC.get(name, ""), 72):
                print("      " + line)
            phrases = ARTIFACT_ALIASES.get(name) or []
            if phrases:
                for line in _wrap("say: " + " / ".join(phrases), 72):
                    print("      " + line)
    print("\n\nASPECT SETS  (breakdown --aspects)")
    print("=" * 33)
    for sport, sets in ASPECTS.items():
        for aspect, spec in sets.items():
            print("  {} {:17} -> {}".format(sport, aspect, ", ".join(spec["artifacts"])))
    print("\nTEXT SLOTS  (any command)")
    print("=" * 25)
    roles = {"eyebrow": "small label above the title",
             "headline": "the claim",
             "sub": "neutral one-sentence setup",
             "take": "YOUR angle - rendered as opinion",
             "cta": "where to go next",
             "note": "evidence bullet, repeatable"}
    for slot, limit in TEXT_BUDGETS.items():
        print("  --{:9} <= {:3} chars   {}".format(slot, limit, roles[slot]))
    print("\nFull rules: docs/CONTENT_ENGINE_SPEC.md\n")


def check_lineup_integrity(games: list[dict]) -> None:
    """Warn when a game's lineup source carries more than one card per team.

    Two cards for one team (a stale card alongside today's) used to render as duplicate
    batting-order slots — slots 1-5 twice each. matchup_shared.parseLineup now keeps one
    row per slot, so the card is no longer visibly broken, but it shows whichever card
    came last: still worth eyeballing before publishing, hence a warning not a refusal.
    """
    path = DATA / "today_lineups.csv"
    if not path.exists():
        return
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    slots: dict[tuple[str, str], list[str]] = {}
    for r in rows:
        key = (str(r.get("Game", "")).upper(), str(r.get("Team", "")).upper())
        slots.setdefault(key, []).append(str(r.get("Bat_Order", "")))
    for g in games:
        pairing = f"{g['Away'].upper()}@{g['Home'].upper()}"
        for team in (g["Away"].upper(), g["Home"].upper()):
            orders = slots.get((pairing, team))
            if orders and len(orders) != len(set(orders)):
                print(f"[content-engine] WARNING {pairing}: {team}'s lineup source has "
                      f"{len(orders)} rows for 9 slots (more than one card). The card "
                      f"renders the last card's nine - check it matches the real lineup.")


def register_ad_hoc(specs: list[str] | None) -> list[str]:
    """Turn --capture strings into registry entries so any component anywhere can be
    composed without editing this file. This is what keeps the engine adaptive: new
    boards on the site, the mlb-model dashboard, a staging build - all reachable."""
    names = []
    for i, raw in enumerate(specs or [], start=1):
        fields = {}
        # Split only on a ';' that starts another key=, so a style= value can carry
        # ordinary CSS declarations.
        for part in re.split(r";(?=\s*[a-z_]+=)", raw):
            if not part.strip():
                continue
            key, _, value = part.partition("=")
            fields[key.strip().lower()] = value.strip()
        if "selector" not in fields:
            fail(f"--capture #{i} needs a selector= (got {raw!r})")
        if "url" not in fields and "page" not in fields:
            fail(f"--capture #{i} needs url= or page= (got {raw!r})")
        name = fields.get("name") or f"custom{i}"
        entry = {
            "label": fields.get("label") or name.replace("_", " ").title(),
            "scope": "slate",
            "selector": fields["selector"],
            "wait_ms": int(fields.get("wait") or 16000),
            "framed": str(fields.get("framed", "true")).lower() != "false",
        }
        if fields.get("url"):
            entry["url"] = fields["url"]
        else:
            entry["page"] = fields["page"]
        if fields.get("sport"):
            entry["sport"] = fields["sport"].upper()
        if fields.get("width"):
            entry["viewport_w"] = int(fields["width"])
        for key in ("contains", "hash", "eval", "style"):
            if fields.get(key):
                entry[key] = fields[key]
        for key in ("force_show", "hide", "unclip", "unstick"):
            if fields.get(key):
                entry[key] = [v.strip() for v in fields[key].split(",") if v.strip()]
        ARTIFACTS[name] = entry
        names.append(name)
    return names


MARK_TYPES = ("focus", "reset", "highlight", "circle", "underline", "arrow", "label",
              "spotlight")


def parse_marks(specs: list[str] | None) -> list[dict]:
    """--mark "type:target[=text][@seconds][!tone]" -> Annotate steps.

    Examples:
        --mark "focus:Josh Allen" --mark "highlight:Josh Allen=Doubtful!caution"
        --mark "arrow:Also On The Injury Report=5 backups listed@4.5"
        --mark reset@7
    Steps without @seconds are spaced 1.4 s apart from 1.0 s; a highlight/label that
    follows a focus lands as the camera arrives.
    """
    steps, clock = [], 1.0
    for raw in specs or []:
        body, tone = (raw.rsplit("!", 1) + [""])[:2] if "!" in raw else (raw, "")
        body, at = (body.rsplit("@", 1) + [""])[:2] if "@" in body else (body, "")
        kind, _, rest = body.partition(":")
        kind = kind.strip().lower()
        if kind not in MARK_TYPES:
            fail(f"--mark {raw!r}: type must be one of {', '.join(MARK_TYPES)}")
        target, _, text = rest.partition("=")
        step = {"type": kind}
        if target.strip():
            step["target"] = target.strip()
        if text.strip():
            step["text"] = text.strip()
        if tone.strip():
            if tone.strip() not in ("accent", "positive", "negative", "caution", "primary"):
                fail(f"--mark {raw!r}: tone must be accent/positive/negative/caution/primary")
            step["tone"] = tone.strip()
        if at.strip():
            step["at"] = float(at)
            clock = step["at"]
        else:
            step["at"] = round(clock, 2)
        if kind in ("focus", "reset"):
            step["dur"] = 1.0
            clock = step["at"] + 0.9
        else:
            clock = step["at"] + 1.4
        steps.append(step)
    return steps


def check_marks(steps: list[dict], anchors: list[dict]) -> None:
    """Fail now, not at render time, when a mark names a row the capture lacks."""
    texts = [" ".join(str(a.get("text", "")).lower().split()) for a in anchors]
    for st in steps:
        want = st.get("target")
        if not isinstance(want, str):
            continue
        w = " ".join(want.lower().split())
        if not any(w in t for t in texts):
            sample = ", ".join(sorted({a["text"] for a in anchors if a.get("kind", "").startswith(("tr", "article"))})[:20])
            fail(f"--mark target {want!r} is not in the capture. Try one of: {sample}")


def write_video_directive(day: str, stem: str, payload: dict,
                          platform: str, marks: list[str] | None = None) -> Path | None:
    """Save this post's captures as files and emit the Remotion props that animate them.

    This is the bridge between the two engines, and it exists because a board that has
    already been captured for a still post is the SAME board the motion version needs.
    Rebuilding these tables in React would create a second source of truth that drifts
    from the site - the exact failure the still engine was designed to make impossible
    (see docs/CONTENT_ENGINE_SPEC.md section 1). So the video engine consumes the
    capture rather than reimplementing it, and every artifact registered here becomes
    animatable for free, including ones registered ad-hoc with --capture.

    The captures are written at their full 3x pixel size and the props carry their
    NATIVE (CSS) dimensions alongside, because that ratio is what lets the composition
    lay them out in the same units the still composer uses while still having the
    source pixels to scale up on a 1080-wide vertical frame.
    """
    artifacts = payload.get("artifacts") or []
    if not artifacts:
        return None
    sport = str(payload.get("sport") or "MLB")
    league = "nfl" if sport.upper() == "NFL" else "mlb"
    shots = VIDEO / "public" / "captures" / day
    shots.mkdir(parents=True, exist_ok=True)
    captures = []
    for i, art in enumerate(artifacts, start=1):
        src = str(art.get("src") or "")
        if not src.startswith("data:image/png;base64,"):
            continue
        raw = base64.b64decode(src.split(",", 1)[1])
        name = f"{stem}-{i}.png"
        (shots / name).write_bytes(raw)
        with Image.open(shots / name) as im:
            px_w, px_h = im.size
        captures.append({
            # staticFile() resolves against video/public, so the prop is the path
            # from there - not from the repo root and not an absolute path.
            "src": f"captures/{day}/{name}",
            "width": round(px_w / CAPTURE_DPR),
            "height": round(px_h / CAPTURE_DPR),
            "caption": art.get("caption") or "",
            "anchors": CAPTURE_ANCHORS.get(hash(src), []),
        })
    if not captures:
        return None
    props = {
        "platform": platform,
        "league": league,
        "eyebrow": payload.get("eyebrow") or "",
        "title": payload.get("title") or "",
        "sub": payload.get("sub") or "",
        "take": payload.get("take") or "",
        "notes": payload.get("notes") or [],
        # Only `compose` sets `site`; for every other command card_compose.html falls
        # back to the MLB line, so the motion cut has to say the same thing rather
        # than shipping with no watermark at all.
        "footer": payload.get("site") or site_line([]),
        "captures": captures,
    }
    out = VIDEO / "props" / league / f"{stem}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(props, indent=2), encoding="utf-8")
    rel = out.relative_to(VIDEO).as_posix()
    print(f"[content-engine] video directive -> {out}")
    # The same capture as an illustration: Annotate props, with --mark steps if given.
    steps = parse_marks(marks)
    check_marks(steps, captures[0]["anchors"])
    ann = {
        "platform": platform,
        "capture": captures[0],
        "steps": steps,
        "eyebrow": props["eyebrow"],
        "title": props["title"],
    }
    ann_out = out.with_name(f"{stem}.annotate.json")
    ann_out.write_text(json.dumps(ann, indent=2), encoding="utf-8")
    print(f"[content-engine]   annotate props -> {ann_out.name} "
          f"({len(captures[0]['anchors'])} anchors, {len(steps)} mark(s))")
    print(f"[content-engine]   cd video && npx remotion render Annotate "
          f"out/{stem}-annotate.mov --props={ann_out.relative_to(VIDEO).as_posix()}")
    # What the composition can do with this, on the width term alone. The height term
    # needs the platform safe areas, and those live in exactly one place - SAFE in
    # video/src/graphics/ShowTemplate.tsx - so they are deliberately NOT restated here:
    # a second copy would be a table to forget to update, which is the drift this whole
    # design exists to prevent. The real zoom is therefore this or lower, never higher.
    widest = max(c["width"] for c in captures)
    zoom = round((VIDEO_FRAME_W - 2 * VIDEO_BOARD_PAD) / widest, 2)
    if zoom < 1.0:
        print(f"[content-engine] NOTE this board is {widest}px wide, so a "
              f"{VIDEO_FRAME_W}px vertical frame renders it at {zoom:.0%} or less - "
              f"smaller than the site's own type, on a graphic that is WATCHED rather "
              f"than studied. Re-run with fewer columns (--drop-cols) or a narrower "
              f"capture (--capture-width) before cutting this into a video.")
    else:
        print(f"[content-engine]   board {widest}x{max(c['height'] for c in captures)} "
              f"native - up to {zoom:.2f}x on width; height may reduce it further.")
    print(f"[content-engine]   cd video && npx remotion render BoardMotion "
          f"out/{stem}-{platform}.mov --props={rel}")
    return out


def check_text_budgets(payload: dict) -> None:
    """Warn on overlong copy rather than silently reflowing the layout."""
    for slot, key in (("eyebrow", "eyebrow"), ("headline", "title"),
                      ("sub", "sub"), ("take", "take"), ("cta", "cta")):
        text = str(payload.get(key) or "")
        limit = TEXT_BUDGETS[slot]
        if len(text) > limit:
            print(f"[content-engine] NOTE {slot} is {len(text)} chars (budget {limit}) "
                  f"- it will wrap and squeeze the artifacts")
    notes = payload.get("notes") or []
    if len(notes) > 3:
        print(f"[content-engine] NOTE {len(notes)} bullet notes (3 read cleanly)")
    for note in notes:
        if len(str(note)) > TEXT_BUDGETS["note"]:
            print(f"[content-engine] NOTE a bullet is {len(str(note))} chars "
                  f"(budget {TEXT_BUDGETS['note']})")


def apply_captions(artifacts: list[dict], spec: list[str] | None = None,
                   labels: list[str] | None = None) -> None:
    """Fold --captions into the per-slot captions, positionally.

    A label is appended to the caption the engine already derived, because the slot's
    own identity (which game, which side) is what makes a multi-artifact post readable
    -- losing it to a label would be a downgrade. A leading '=' replaces instead.
    """
    if labels is None:
        labels = resolve_labels(spec, len(artifacts))
    if not labels:
        return
    _stamp_captions(artifacts, labels)


def resolve_labels(spec: list[str] | None, n_slots: int) -> list[str]:
    """Turn the raw --captions flag into a flat label list."""
    if not spec:
        return []
    # Resolution order, so the behaviour is predictable rather than clever:
    #   several --captions -> one label each, verbatim (commas allowed in a label)
    #   one --captions, one slot -> verbatim; splitting could not be intended
    #   one --captions, many slots -> split on commas (the convenient common case)
    if len(spec) > 1:
        return [part.strip() for part in spec]
    if n_slots == 1:
        return [spec[0].strip()]
    return [part.strip() for part in spec[0].split(",")]


def _stamp_captions(artifacts: list[dict], labels: list[str]) -> None:
    if len(labels) > len(artifacts):
        print(f"[content-engine] NOTE {len(labels)} captions given for "
              f"{len(artifacts)} slot(s); the extras are ignored")
    for slot, label in zip(artifacts, labels):
        if not label:
            continue
        if label.startswith("="):
            slot["caption"] = label[1:].strip()
        else:
            base = str(slot.get("caption") or "").strip()
            slot["caption"] = f"{base} · {label}" if base else label
        if len(artifacts) >= 3 and len(str(slot["caption"])) > 34:
            print(f"[content-engine] NOTE caption {slot['caption']!r} is long for a "
                  f"{len(artifacts)}-up layout; it will wrap")


def artifact_caption(name: str, game: dict | None) -> str:
    """Label for an artifact slot; directional variants name the two sides."""
    spec = ARTIFACTS[name]
    if spec.get("self_titled"):
        return ""
    fmt = spec.get("label_fmt")
    if fmt and game is not None:
        return fmt.format(away=game["Away"], home=game["Home"])
    return spec["label"]


# NOTE: today_matchups.csv's `Time` column is unreliable — it currently reports no day
# games at all (every row 6:40 PM ET or later) while the dashboard's live schedule shows
# 12:10/12:35/1:05/1:10 PM starts. Composed text therefore never states first pitch: the
# captured card and banner artifacts already display the authoritative time, and printing
# a second, contradictory time in the same image is worse than printing none.
def sp_label(r: dict) -> str:
    away, home = r.get("Away_SP", "").strip(), r.get("Home_SP", "").strip()
    dash = "—"
    away = dash if away in ("", "--") else away
    home = dash if home in ("", "--") else home
    return f"{away} vs {home}"


# ── capture ──────────────────────────────────────────────────────────────────
def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


# Named regions inside each capture, keyed by the capture's data URI, for the video
# package's Annotate tool (a row can then be targeted by its text). Collected in the
# same page state the screenshot is taken in, in the capture's native CSS pixels.
CAPTURE_ANCHORS: dict[int, list[dict]] = {}

ANCHOR_JS = r"""([sel, i]) => {
    const root = document.querySelectorAll(sel)[i];
    if (!root) return [];
    const R = root.getBoundingClientRect();
    const pick = 'tr, h1, h2, h3, h4, [class*="__head"], [class*="__title"], '
      + '.ca-lineup-player, .ca-avail-row, .ca-status-pill, .ca-matchup-card, '
      + '.ca-detail-section, [class*="__team"], [class*="-player"], '
      + 'details, summary, [class*="__label"], [class*="report"]';
    const out = [], seen = new Set();
    root.querySelectorAll(pick).forEach(el => {
        if (!el.getClientRects().length) return;
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return;
        const text = (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 90);
        if (!text) return;
        const key = text + '|' + Math.round(r.x) + '|' + Math.round(r.y);
        if (seen.has(key)) return;
        seen.add(key);
        out.push({text, kind: el.tagName.toLowerCase() + (el.classList[0] ? '.' + el.classList[0] : ''),
                  x: Math.round(r.x - R.x), y: Math.round(r.y - R.y),
                  w: Math.round(r.width), h: Math.round(r.height)});
    });
    return out.slice(0, 500);
}"""


class Capturer:
    """Screenshots dashboard components as base64 PNGs, memoized per run."""

    def __init__(self, browser, port: int, verbose: bool = True,
                 viewport_w: int | None = None, drop_cols: list[str] | None = None):
        self.browser = browser
        self.port = port
        self.verbose = verbose
        self.cache: dict[str, str] = {}
        self.image_counts: dict[str, int] = {}
        self.warned_legacy: set[str] = set()
        # The site's tables are FLUID: the team board lays out 1350px wide at a 1600px
        # viewport and 730px at 780px, at the same font size. Since the composer can
        # only fit ~1040 CSS px across, a wide capture is scaled DOWN and the numbers
        # end up smaller than the source - the single biggest driver of an unreadable
        # post. Capturing narrow is therefore how type gets bigger, not a canvas change.
        self.viewport_w = viewport_w
        self.drop_cols = drop_cols or []

    def url(self, spec: dict, game: dict | None, extra: dict | None) -> str:
        params = dict(spec.get("params") or {})
        if spec.get("site"):
            # chase-analytics.com routes are keyed by the site's own game id.
            if game is not None and spec.get("game_param", "game"):
                params[spec.get("game_param", "game")] = game["GameId"]
            # The MLB pages load the schedule for the BROWSER's Eastern date unless
            # told otherwise. After midnight that is tomorrow, and both /mlb/ and the
            # detail page then report last night's game as "not in the published
            # slate" although slate.json still lists it (found 2026-09-17 00:10 ET).
            # Pin the date the post is about.
            if game is not None and spec.get("sport") == "MLB" and game.get("Slate_Date"):
                params["date"] = game["Slate_Date"]
            params.update(extra or {})
            query = "&".join(f"{k}={v}" for k, v in params.items())
            return SITE_URL + spec["site"] + (f"?{query}" if query else "")
        if game is not None and spec.get("page") == "matchup_compare.html":
            params.update({"away": game["Away"], "home": game["Home"]})
        params.update(extra or {})
        query = "&".join(f"{k}={v}" for k, v in params.items())
        frag = f"#{spec['hash']}" if spec.get("hash") else ""
        # `url` is an absolute address (the hosted mlb-model dashboard, a staging build,
        # any page at all); `page` is a file served from this repo's dashboard/.
        base = spec.get("url") or (
            f"http://127.0.0.1:{self.port}/dashboard/{spec['page']}")
        joiner = "&" if ("?" in base and query) else ("?" if query else "")
        return base + joiner + query + frag

    def grab(self, name: str, game: dict | None = None,
             extra: dict | None = None, rows: int | None = None,
             rows_from: int | None = None) -> str:
        spec = dict(ARTIFACTS[name])
        if spec.get("site") and game is not None:
            if not game.get("GameId"):
                fail(f"artifact {name!r} is keyed by the site's game id, but "
                     f"{game['Away']}@{game['Home']} came from a source that has none")
            spec["selector"] = spec["selector"].format(game_id=game["GameId"])
        if name in LEGACY_ARTIFACTS and name not in self.warned_legacy:
            self.warned_legacy.add(name)
            print(f"[content-engine] WARNING {name}: captured from this branch's "
                  f"retired dashboard/{spec['page']}, which chase-analytics.com no "
                  f"longer serves - the post will not match the live site")
        # Time is part of the identity: two halves of a doubleheader share Away/Home and
        # would otherwise reuse each other's captured pixels.
        vw = int(self.viewport_w or spec.get("viewport_w") or CAPTURE_VIEWPORT_W)
        key = json.dumps([name, game and game["Away"], game and game["Home"],
                          game and game.get("Time"), extra, rows, rows_from, vw,
                          self.drop_cols], sort_keys=True)
        if key in self.cache:
            return self.cache[key]

        page = self.browser.new_page(viewport={"width": vw, "height": 1400},
                                     device_scale_factor=CAPTURE_DPR)
        try:
            page.goto(self.url(spec, game, extra), wait_until="domcontentloaded",
                      timeout=45000)
            self._activate(page, spec)
            selector = spec["selector"]
            wait_ms = spec.get("wait_ms", 12000)
            try:
                page.wait_for_selector(selector, timeout=wait_ms, state="attached")
            except Exception:
                # Batch runs load the same page many times; a slow render is transient.
                # Reload once with a longer budget before giving up on the whole post.
                print(f"[content-engine]   {name}: {selector} not up in "
                      f"{wait_ms}ms - reloading once")
                try:
                    page.reload(wait_until="domcontentloaded", timeout=45000)
                    self._activate(page, spec)
                    page.wait_for_selector(selector, timeout=wait_ms + 10000,
                                           state="attached")
                except Exception:
                    reason = ""
                    try:
                        text = page.evaluate("document.body.innerText") or ""
                        if "not in the published slate" in text:
                            reason = (" - the page says the game is not in its "
                                      "published slate")
                    except Exception:
                        pass
                    fail(f"artifact {name!r} never rendered ({selector} not found on "
                         f"{self.url(spec, game, extra)}){reason}")
            # These views re-render as sheet data lands, which detaches elements
            # mid-capture. Wait for the artifact's own data, then until the component
            # stops changing, before shooting.
            self._wait_ready(page, spec)
            self._wait_stable(page, selector)
            # Resolve WHICH element to shoot before anything is hidden: the disambiguating
            # text ("LINEUP & PITCHER SPLITS") often lives in the very header we strip.
            target_index = self._resolve_index(page, spec, game)
            if target_index is None:
                fail(f"artifact {name!r}: no {selector} matched "
                     f"{spec.get('contains') or 'this game'} on "
                     f"{self.url(spec, game, extra)}")
            self._prepare(page, name, spec)
            page.add_style_tag(content="*{animation:none!important;transition:none!important}")
            page.add_style_tag(content=GLOBAL_STYLE)
            # Hiding via a stylesheet, not inline styles: a late re-render replaces the
            # nodes (and would resurrect an inline-hidden element), but the rule persists.
            hides = GLOBAL_HIDE + (spec.get("hide") or [])
            page.add_style_tag(content=", ".join(hides) + "{display:none!important}")
            self._drop_empty(page, spec, selector, target_index)
            self._require_data(page, name, spec, selector, target_index)
            if spec.get("unclip"):
                page.add_style_tag(content=", ".join(spec["unclip"]) + """{
                    max-height:none!important; height:auto!important;
                    overflow:visible!important}""")
            if spec.get("fitwidth"):
                # Horizontal twin of `unclip`. A table with a min-width wider than its
                # scroll wrapper is merely scrollable on the site, but a screenshot cuts
                # the last column clean off - the lineup tables sit at min-width 520px
                # inside a 505px wrap and lost their SLG values. Releasing the floor and
                # letting the table fill its wrapper compresses the columns by ~3%.
                page.add_style_tag(
                    content=", ".join(spec["fitwidth"]) +
                            "{min-width:0!important; width:100%!important}")
            if spec.get("open_details"):
                page.evaluate(
                    "() => document.querySelectorAll('details')"
                    ".forEach(d => { d.open = true; })")
                page.wait_for_timeout(1000)
            if spec.get("force_show"):
                # Tabbed dashboards keep inactive views at display:none, so an element
                # inside one has no box to screenshot until it is forced visible.
                page.add_style_tag(
                    content=", ".join(spec["force_show"]) +
                            "{display:block!important;visibility:visible!important}")
                page.wait_for_timeout(1200)
            if spec.get("style"):
                # Free-form CSS for an artifact that needs one specific fix (e.g. a grid
                # item that must not stretch). Injected as a stylesheet like every other
                # rule here, so a late re-render cannot drop it.
                page.add_style_tag(content=spec["style"])
            if spec.get("unstick"):
                page.add_style_tag(
                    content=", ".join(spec["unstick"]) + "{position:static!important}")
            drops = self.drop_cols or spec.get("drop_cols") or []
            if drops:
                # Trim columns by their header text. Narrowing the board is what buys
                # bigger type: the composer's zoom is capped by the artifact's own
                # width, so every column removed is type size gained.
                found = page.evaluate(
                    r"""([sel, i, labels]) => {
                        const t = document.querySelectorAll(sel)[i];
                        if (!t) return {};
                        // Last header row: grouped tables carry their real labels there.
                        const ths = [...t.querySelectorAll('thead tr:last-child th')];
                        const hit = {};
                        labels.forEach(raw => {
                          const want = raw.trim().toUpperCase();
                          ths.forEach((th, n) => {
                            const txt = th.textContent.replace(/\s+/g, ' ')
                                          .trim().toUpperCase();
                            // Headers carry a sort arrow, so match on the prefix.
                            if (txt === want || txt.startsWith(want)) {
                              (hit[raw] = hit[raw] || []).push(n + 1);
                            }
                          });
                        });
                        return hit;
                    }""", [selector, target_index, drops])
                missing = [d for d in drops if not found.get(d)]
                if missing:
                    fail(f"--drop-cols: no column headed {missing!r} in {name!r} "
                         f"(a typo would otherwise ship the untrimmed board)")
                idx = sorted({n for hits in found.values() for n in hits})
                page.add_style_tag(content=", ".join(
                    f"{selector} tr > *:nth-child({n})" for n in idx) +
                    "{display:none!important}")
                page.wait_for_timeout(400)

            row_cap = rows if rows is not None else spec.get("default_rows")
            if row_cap:
                page.add_style_tag(
                    content=f"{selector} tbody tr:nth-child(n+{int(row_cap) + 1})"
                            "{display:none!important}")
            # The twin of the cap, and the reason a 32-row board can ship as two
            # slides: `rows_from` hides everything ABOVE the cut. The site's own rank
            # column is left untouched, so slide two starts at 17 and reads as a
            # continuation rather than a second, separate ranking.
            row_from = rows_from if rows_from is not None else spec.get("rows_from")
            if row_from:
                page.add_style_tag(
                    content=f"{selector} tbody tr:nth-child(-n+{int(row_from) - 1})"
                            "{display:none!important}")
            if spec.get("unclip") or row_cap or row_from:
                page.wait_for_timeout(700)

            # Horizontal bleed guard - the twin of `unclip`'s vertical one. `fitwidth`
            # (width:100%) CANNOT take a table below its min-content width, so a narrow
            # capture can leave the board wider than the wrapper that PAINTS its
            # background: the element screenshot then shows the page behind it as a seam
            # down the right edge (the starters board bled 77px this way, dragging a
            # lighter band through the OOR column). Widen the viewport until the painted
            # wrapper covers the artifact. The wrapper is fluid, so this settles in one
            # pass and still leaves the board near min-content - far narrower, and so
            # far larger in the post, than the default 1600px capture.
            for _ in range(3):
                over = page.evaluate(
                    r"""([sel, i]) => {
                        const el = document.querySelectorAll(sel)[i];
                        if (!el) return 0;
                        const w = el.getBoundingClientRect().width;
                        // The first ancestor that actually paints is the one whose
                        // absence shows up as a bleed.
                        let p = el.parentElement;
                        while (p && p.tagName !== 'BODY') {
                            const bg = getComputedStyle(p).backgroundColor;
                            if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                                return Math.ceil(w - p.getBoundingClientRect().width);
                            }
                            p = p.parentElement;
                        }
                        return 0;
                    }""", [selector, target_index])
                if over <= 2:
                    break
                vw += over + 24
                page.set_viewport_size({"width": vw, "height": 1400})
                page.wait_for_timeout(700)
                if self.verbose:
                    print(f"[content-engine]   {name}: bleeding {over}px past its own "
                          f"card - widened capture to {vw}px")

            # Headshots and team logos are marked loading="lazy", so they do not even
            # START fetching until the element is scrolled into view - and the shot
            # follows ~500ms later. A slow headshot therefore shipped as an empty circle
            # where the starter's face belongs. Force them eager here, then wait for
            # every one to settle before shooting.
            page.evaluate(
                r"""([sel, i]) => {
                    const el = document.querySelectorAll(sel)[i];
                    if (!el) return;
                    el.querySelectorAll('img').forEach(g => {
                        g.loading = 'eager';
                        g.decoding = 'sync';
                        // Re-assigning the src kicks a lazy image that has not been
                        // asked to load yet; harmless for one already in flight.
                        if (!g.complete && g.src) { const s = g.src; g.src = s; }
                    });
                }""", [selector, target_index])
            try:
                page.wait_for_function(
                    r"""([sel, i]) => {
                        const el = document.querySelectorAll(sel)[i];
                        if (!el) return false;
                        return [...el.querySelectorAll('img')].every(g => g.complete);
                    }""", arg=[selector, target_index], timeout=15000)
            except Exception:
                print(f"[content-engine]   NOTE {name}: image(s) still loading after "
                      f"15s - shooting anyway")

            # Pitcher headshots and team logos are remote images; a post that ships a
            # broken image is worse than one that waits. Count them inside the target.
            broken = page.evaluate(
                """([sel, i]) => {
                    const el = document.querySelectorAll(sel)[i];
                    if (!el) return {total: 0, broken: 0};
                    const imgs = [...el.querySelectorAll('img')];
                    return {
                      total: imgs.length,
                      broken: imgs.filter(g => g.complete && g.naturalWidth === 0).length,
                    };
                }""", [selector, target_index])
            if broken.get("broken"):
                print(f"[content-engine]   WARNING {name}: {broken['broken']} of "
                      f"{broken['total']} image(s) failed to load (headshots/logos)")
            elif broken.get("total"):
                self.image_counts[name] = broken["total"]

            anchors = page.evaluate(ANCHOR_JS, [selector, target_index])
            raw = None
            last_error = "no visible element matched"
            for attempt in range(3):
                handle = page.locator(selector).nth(target_index)
                try:
                    handle.scroll_into_view_if_needed(timeout=8000)
                    page.wait_for_timeout(500)
                    raw = handle.screenshot(type="png", timeout=20000)
                    break
                except Exception as exc:  # re-rendered under us; re-resolve and retry
                    last_error = str(exc).split("\n")[0]
                    page.wait_for_timeout(1500)
            if raw is None:
                fail(f"artifact {name!r}: {last_error} "
                     f"({selector} on {self.url(spec, game, extra)})")
        finally:
            page.close()

        data = "data:image/png;base64," + base64.b64encode(raw).decode()
        self.cache[key] = data
        CAPTURE_ANCHORS[hash(data)] = anchors
        if self.verbose:
            tag = f" {game['Away']}@{game['Home']}" if game else ""
            # Native CSS size, the number the layout solver works in (spec 3.1).
            w, h = struct.unpack(">II", raw[16:24])
            print(f"[content-engine]   captured {name}{tag} ({len(raw)//1024} KB, "
                  f"{round(w / CAPTURE_DPR)}x{round(h / CAPTURE_DPR)} native)")
        return data

    @staticmethod
    def _activate(page, spec: dict) -> None:
        """Post-load steps that reveal the target: stamp the view hash, call the app's
        own tab switcher, click any pane. Re-run verbatim after a reload."""
        if spec.get("hash"):
            page.evaluate(
                "h => { if (location.hash !== '#'+h) { location.hash = h; } "
                "if (window.syncDashboardView) window.syncDashboardView(); }",
                spec["hash"])
        page.wait_for_timeout(2500)
        if spec.get("eval"):
            page.evaluate(f"() => {{ {spec['eval']} }}")
            page.wait_for_timeout(3000)
        for sel in spec.get("click") or []:
            try:
                page.click(sel, timeout=8000)
            except Exception:
                pass  # the pane may already be mounted

    @staticmethod
    def _drop_empty(page, spec: dict, selector: str, index: int) -> None:
        """Remove sub-blocks of the artifact that carry no data at all.

        A panel rendered as nothing but em dashes tells a reader nothing and looks
        like a rendering fault in a finished post. This is not editorial trimming:
        a block only qualifies when it has data cells and every one of them is
        missing. Self-correcting - the moment the upstream data lands, the block has
        numbers and is kept.

        Only `td` cells are examined. Judging the whole block by its text was wrong:
        the window labels down the side of a strip (L7, L14, L30) carry digits of
        their own, so a fully em-dashed panel still looked populated.

        Live example: `Batter_Splits_Home` / `Batter_Splits_Away` publish header-only,
        so the offensive board's third strip (TEAM ON ROAD / TEAM AT HOME) renders 16
        em dashes per side.
        """
        sels = spec.get("drop_if_empty") or []
        if not sels:
            return
        dropped = page.evaluate(
            """([sel, i, subs]) => {
                const root = document.querySelectorAll(sel)[i];
                if (!root) return 0;
                let n = 0;
                subs.forEach(s => root.querySelectorAll(s).forEach(el => {
                    const cells = [...el.querySelectorAll('td')];
                    if (!cells.length) return;
                    if (cells.some(c => /[0-9]/.test(c.textContent || ''))) return;
                    el.style.display = 'none';
                    n++;
                }));
                return n;
            }""", [selector, index, sels])
        if dropped:
            print(f"[content-engine]   dropped {dropped} empty block(s) from "
                  f"{spec.get('label', 'artifact')} (no data upstream)")

    def _prepare(self, page, name: str, spec: dict) -> None:
        """Artifact-specific DOM preparation (e.g. cutting a report to the rows this
        graphic is about). Runs on the settled page, before any styling."""
        if not spec.get("prepare"):
            return
        result = page.evaluate(f"() => {spec['prepare']}")
        if isinstance(result, dict):
            if result.get("kept", 0) < 0:
                fail(f"artifact {name!r}: preparation found nothing to prepare")
            if result.get("unknown"):
                print(f"[content-engine]   NOTE {name}: injury position(s) "
                      f"{sorted(set(result['unknown']))} are not mapped to a unit - "
                      f"listed on both the offense and defense graphic")
            if self.verbose and "kept" in result:
                print(f"[content-engine]   {name}: {result['kept']} injured backup(s) "
                      f"listed under the formation")
        page.wait_for_timeout(300)

    def grab_matchup(self, names: list[str], game: dict, facts: bool = False) -> str:
        """One continuous capture of a matchup page: the site's own matchup banner
        (#overview) as the heading, then the chosen sections, with everything else on
        the page removed.

        Owner direction 2026-09-17: the matchup banner is the heading, and a post should
        read as one cohesive piece of the site rather than separately framed blocks.
        Shooting the page's own container keeps the site's spacing and backgrounds
        between banner and sections, which a composition of separate captures cannot.
        """
        specs = []
        for n in names:
            spec = dict(ARTIFACTS[n])
            spec["selector"] = spec["selector"].format(game_id=game["GameId"])
            specs.append((n, spec))
        routes = {sp["site"] for _, sp in specs}
        if len(routes) != 1:
            fail(f"{', '.join(names)} live on different pages - post them separately")
        boards = {}
        for n, sp in specs:
            # Two units of one club share one board and one tab bar.
            if n.startswith(("nfl_offense_", "nfl_defense_")):
                side = n.rsplit("_", 1)[1]
                if side in boards:
                    fail(f"{boards[side]} and {n} are the same board on different tabs - "
                         f"post them as two graphics")
                boards[side] = n
        base = {"site": routes.pop(), "sport": specs[0][1]["sport"]}
        # The widest section decides: a narrower capture would clip it. The banner
        # lays out cleanly at 780 and up, so it never forces a width of its own.
        vw = int(self.viewport_w or max(
            sp.get("viewport_w") or CAPTURE_VIEWPORT_W for _, sp in specs))
        key = json.dumps(["matchup", names, game["GameId"], game.get("Time"), vw,
                          facts],
                         sort_keys=True)
        if key in self.cache:
            return self.cache[key]
        url = self.url(base, game, None)
        page = self.browser.new_page(viewport={"width": vw, "height": 1400},
                                     device_scale_factor=CAPTURE_DPR)
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=45000)
            wanted = ["#overview"] + [sp["selector"] for _, sp in specs]
            for sel in wanted:
                try:
                    page.wait_for_selector(sel, timeout=20000, state="attached")
                except Exception:
                    text = page.evaluate("document.body.innerText") or ""
                    why = (" - the page says the game is not in its published slate"
                           if "not in the published slate" in text else "")
                    fail(f"matchup post: {sel} never rendered on {url}{why}")
            for n, sp in specs:
                self._wait_ready(page, sp)
            self._wait_stable(page, "main")
            for n, sp in specs:
                self._prepare(page, n, sp)
            marked = page.evaluate(
                r"""(sels) => {
                    const wanted = sels.map(s => document.querySelector(s));
                    if (wanted.some(w => !w)) return {missing: true};
                    let root = wanted[0];
                    while (root && !wanted.every(w => root.contains(w))) {
                        root = root.parentElement;
                    }
                    if (!root) return {missing: true};
                    const walk = el => {
                        for (const ch of el.children) {
                            if (wanted.some(w => w === ch || w.contains(ch))) continue;
                            if (wanted.some(w => ch.contains(w))) { walk(ch); continue; }
                            // A section that holds a wanted part keeps its heading.
                            if (ch.classList.contains('ca-detail-section__head')) continue;
                            ch.setAttribute('data-ce-drop', '');
                        }
                    };
                    walk(root);
                    root.setAttribute('data-ce-root', '');
                    return {ok: true};
                }""", wanted)
            if not marked.get("ok"):
                fail(f"matchup post: could not isolate {', '.join(names)} on {url}")
            page.add_style_tag(
                content="*{animation:none!important;transition:none!important}")
            page.add_style_tag(content=GLOBAL_STYLE)
            hides = list(GLOBAL_HIDE) + ["[data-ce-drop]"]
            if not facts:
                # As a heading the banner needs the clubs and the time; its four fact
                # tiles are about half its height, which the sections need more.
                hides.append("#overview .ca-detail-facts")
            styles = []
            for _, sp in specs:
                hides += sp.get("hide") or []
                if sp.get("style") and sp["style"] not in styles:
                    styles.append(sp["style"])
            page.add_style_tag(content=", ".join(dict.fromkeys(hides)) +
                               "{display:none!important}")
            for css in styles:
                page.add_style_tag(content=css)
            if any(sp.get("open_details") for _, sp in specs):
                page.evaluate("() => document.querySelectorAll('[data-ce-root] details')"
                              ".forEach(d => { d.open = true; })")
            page.wait_for_timeout(700)
            for n, sp in specs:
                self._require_data(page, n, sp, sp["selector"], 0)
            page.evaluate(
                r"""() => document.querySelectorAll('[data-ce-root] img').forEach(g => {
                    g.loading = 'eager'; g.decoding = 'sync';
                    if (!g.complete && g.src) { const s = g.src; g.src = s; }
                })""")
            try:
                page.wait_for_function(
                    "() => [...document.querySelectorAll('[data-ce-root] img')]"
                    ".every(g => g.complete)", timeout=15000)
            except Exception:
                print("[content-engine]   NOTE matchup post: image(s) still loading "
                      "after 15s - shooting anyway")
            broken = page.evaluate(
                "() => [...document.querySelectorAll('[data-ce-root] img')]"
                ".filter(g => g.complete && g.naturalWidth === 0).length")
            if broken:
                print(f"[content-engine]   WARNING matchup post: {broken} image(s) "
                      f"failed to load (headshots/logos)")
            anchors = page.evaluate(ANCHOR_JS, ["[data-ce-root]", 0])
            handle = page.locator("[data-ce-root]").first
            handle.scroll_into_view_if_needed(timeout=8000)
            page.wait_for_timeout(500)
            raw = handle.screenshot(type="png", timeout=30000)
        finally:
            page.close()
        data = "data:image/png;base64," + base64.b64encode(raw).decode()
        self.cache[key] = data
        CAPTURE_ANCHORS[hash(data)] = anchors
        if self.verbose:
            w, h = struct.unpack(">II", raw[16:24])
            print(f"[content-engine]   captured banner + {', '.join(names)} "
                  f"{game['Away']}@{game['Home']} ({len(raw)//1024} KB, "
                  f"{round(w / CAPTURE_DPR)}x{round(h / CAPTURE_DPR)} native at vw {vw})")
        return data

    @staticmethod
    def _require_data(page, name: str, spec: dict, selector: str, index: int) -> None:
        """Fail when a block that must carry data is nothing but placeholders.

        The fail-closed twin of `_drop_empty`: that one removes an optional empty
        strip, this one refuses the whole capture. Only `td` cells after each row's
        first are judged (the first is a label or batting order), and a block is
        empty when it HAS such cells and none contains a digit.
        """
        subs = spec.get("require_data") or []
        if not subs:
            return
        empty = page.evaluate(
            """([sel, i, subs]) => {
                const root = document.querySelectorAll(sel)[i];
                if (!root) return [];
                const out = [];
                subs.forEach(s => root.querySelectorAll(s).forEach(el => {
                    if (!el.getClientRects().length) return;  // hidden by the spec
                    // A row's first cell is its label or order (1-9 in a lineup),
                    // which has digits even when every stat is a placeholder.
                    const cells = [...el.querySelectorAll('tr')].flatMap(
                        tr => [...tr.querySelectorAll('td')].slice(1));
                    if (!cells.length) return;
                    if (cells.some(c => /[0-9]/.test(c.textContent || ''))) return;
                    // Name the block by the nearest heading above it.
                    let box = el, head = '';
                    while (box && box !== root && !head) {
                        let sib = box.previousElementSibling;
                        while (sib && !head) {
                            head = (sib.innerText || '').trim()
                                     .split(String.fromCharCode(10))[0];
                            sib = sib.previousElementSibling;
                        }
                        box = box.parentElement;
                    }
                    out.push(head || 'a table');
                }));
                return out;
            }""", [selector, index, subs])
        if empty:
            fail(f"artifact {name!r}: no data yet in {', '.join(empty)} - the site "
                 f"shows only placeholders there (lineup not posted, starter TBD?). "
                 f"Refusing to post a half-empty graphic.")

    @staticmethod
    def _wait_ready(page, spec: dict, tries: int = 30) -> None:
        """Poll an artifact's own data-readiness predicate before measuring stability.

        Stability alone is not enough. These components mount a skeleton the moment
        the slate lands - the matchup card paints its pitcher panels with em-dash
        placeholders for Pitch Score / K% / BB% / ERA and then sits perfectly still
        for several seconds while the profile sheet is still in flight. A capture
        taken in that window looks finished and ships four empty stat slots, which
        is exactly the "wrong graphic" the engine is supposed to refuse. `ready` is a
        JS expression that goes true only once the data the artifact displays has
        actually arrived.
        """
        expr = spec.get("ready")
        if not expr:
            return
        for _ in range(tries):
            try:
                if page.evaluate(f"() => !!({expr})"):
                    return
            except Exception:
                pass  # app globals not installed yet
            page.wait_for_timeout(700)
        if spec.get("ready_required"):
            fail(f"readiness check never passed ({expr[:80]}...) - refusing to "
                 f"capture {spec.get('label', 'artifact')} in the wrong state")
        print(f"[content-engine]   WARNING: readiness check never passed "
              f"({expr[:60]}...) - the artifact may be missing values")

    @staticmethod
    def _wait_stable(page, selector: str, tries: int = 14) -> None:
        """Poll until element count + rendered text stop changing between samples.

        Two consecutive identical samples are required, not one: a single match can
        land inside a lull between two render passes (data arrives in stages), and
        that produced captures of half-populated components.
        """
        probe = """sel => {
            const els = [...document.querySelectorAll(sel)];
            return els.length + ':' + els.reduce((n, e) => n + (e.innerText || '').length, 0);
        }"""
        last, matches = None, 0
        for _ in range(tries):
            now = page.evaluate(probe, selector)
            matches = matches + 1 if now == last else 0
            if matches >= 2:
                return
            last = now
            page.wait_for_timeout(700)

    def _resolve_index(self, page, spec: dict, game: dict | None) -> int | None:
        """Index of the element to shoot: the one for this game, or matching `contains`,
        else the first with real area. Returns None when nothing qualifies."""
        selector = spec["selector"]
        if spec.get("match_game") and game is not None:
            index = page.evaluate(
                """([sel, a, h]) => {
                    const els = [...document.querySelectorAll(sel)];
                    return els.findIndex(el => {
                      const t = (el.innerText || '').toUpperCase();
                      return t.includes(a) && t.includes(h);
                    });
                }""", [selector, game["Away"].upper(), game["Home"].upper()])
            return None if index is None or index < 0 else index
        if spec.get("match_data") and game is not None:
            # Match the element's own data attribute, not its text. The NFL board's
            # game cards are keyed `2026_01_NE_SEA`, and an innerText search for "NE"
            # would hit every card carrying the words MONITOR or MONEYLINE.
            want = f"_{game['Away'].upper()}_{game['Home'].upper()}"
            index = page.evaluate(
                """([sel, attr, suffix]) => {
                    const els = [...document.querySelectorAll(sel)];
                    return els.findIndex(el =>
                      (el.dataset[attr] || '').toUpperCase().endsWith(suffix));
                }""", [selector, spec["match_data"], want])
            return None if index is None or index < 0 else index
        if spec.get("contains"):
            index = page.evaluate(
                """([sel, needle]) => {
                    const els = [...document.querySelectorAll(sel)];
                    return els.findIndex(el => {
                      if (!(el.innerText || '').toUpperCase().includes(needle)) return false;
                      // Must actually be rendered: a match inside a collapsed <details>
                      // or an inactive tab has no box and cannot be screenshotted.
                      const r = el.getBoundingClientRect();
                      return r.width > 40 && r.height > 40;
                    });
                }""", [selector, spec["contains"].upper()])
            return None if index is None or index < 0 else index
        count = page.locator(selector).count()
        for i in range(count):
            box = page.locator(selector).nth(i).bounding_box()
            if box and box["width"] > 40 and box["height"] > 40:
                return i
        return None


# ── compose ──────────────────────────────────────────────────────────────────
def compose(browser, port: int, out_path: Path, size: str,
            payload: dict) -> tuple[float, float]:
    """Render one post. Returns (artifact scale, leftover vertical slack in px) so the
    caller can pick a better canvas: scale < 1 means squeezed, slack > 0 means airy."""
    w, h = (int(v) for v in size.split("x"))
    css_size, raster = layout_size(size)
    cw, ch = (int(v) for v in css_size.split("x"))
    # Supersample the 1x sizes (they have no headroom); render the hi-res sizes at their
    # own scale so glyphs are rasterised at final resolution instead of being softened by
    # a downsample.
    dpr = 2.0 if raster == 1.0 else raster
    page = browser.new_page(viewport={"width": cw, "height": ch},
                            device_scale_factor=dpr)
    try:
        payload = {**payload, "captureDpr": CAPTURE_DPR}
        page.add_init_script(
            f"window.CARD_DATA = {json.dumps(payload)};"
            f"window.CARD_SIZE = {json.dumps(css_size)};")
        page.goto(f"http://127.0.0.1:{port}/dashboard/card_compose.html",
                  wait_until="domcontentloaded", timeout=45000)
        try:
            page.wait_for_function("window.__composeReady === true", timeout=25000)
        except Exception:
            fail(f"compose page never signalled ready for {out_path.name}")
        page.evaluate("document.fonts.ready")
        page.wait_for_timeout(500)
        # The chrome is only the site's style if the mirrored stack actually applied:
        # tokens resolved and both brand faces loaded. A missing mirror or a renamed
        # face would otherwise render silently in system fallbacks.
        style = page.evaluate("""() => {
            const cs = getComputedStyle(document.body);
            const loaded = [...document.fonts].filter(f => f.status === 'loaded')
                                              .map(f => f.family.replace(/["']/g, ''));
            return {page: cs.getPropertyValue('--surface-page').trim(),
                    display: cs.getPropertyValue('--font-display').trim(),
                    loaded: [...new Set(loaded)]};
        }""")
        if not style["page"] or not style["display"]:
            fail(f"{out_path.name}: the site's design tokens did not load in the "
                 f"compose page (dashboard/_site/site.css missing or empty)")
        faces = [f.strip().strip("'\"") for f in style["display"].split(",")[:1]] + \
            ["Chase Sans"]
        missing = [f for f in faces if f not in style["loaded"]]
        if missing:
            fail(f"{out_path.name}: brand face(s) {missing} did not load "
                 f"(loaded: {style['loaded']}) - the post would render in a fallback")
        scale = page.evaluate("window.__composeScale") or 1.0
        slack = page.evaluate("window.__composeSlack") or 0.0
        spread = page.evaluate("window.__composeWidthSpread") or 1.0
        if spread > WIDTH_SPREAD_WARN:
            print(f"[content-engine] NOTE {out_path.name}: artifact native widths "
                  f"differ {spread:.1f}x - the narrower one is centred inset rather "
                  f"than stretched, so type size stays equal across artifacts")
        raw = out_path.with_name("_raw_" + out_path.name)
        page.screenshot(path=str(raw))
    finally:
        page.close()
    shot = Image.open(raw)
    if shot.size != (w, h):
        shot = shot.resize((w, h), Image.LANCZOS)
    shot.convert("RGB").filter(ImageFilter.UnsharpMask(**PRESHARPEN)).save(out_path)
    shot.close()
    raw.unlink()
    print(f"[content-engine] wrote {out_path.name}")
    return float(scale), float(slack)


def banner_eligible(names: list[str]) -> bool:
    """True when every artifact is a section of the site's matchup page, so the post
    can be one continuous capture under the site's own matchup banner."""
    return bool(names) and all(
        ARTIFACTS[n].get("site") in (_MLB_DETAIL, _NFL_DETAIL) for n in names)


def matchup_post(a, cap, ctx, game: dict, names: list[str]) -> dict:
    """A matchup post headed by the site's matchup banner, sections joined beneath.

    The banner states the matchup, so the post's own title block is left empty
    unless the caller writes one (--headline / --eyebrow / --sub / --take).
    """
    heroes = {"mlb_hero", "nfl_hero"}
    sections = [n for n in names if n not in heroes]
    src = (cap.grab_matchup(sections, game, facts=a.banner_facts) if sections
           else cap.grab(names[0], game))
    artifacts = [{"src": src, "caption": "", "framed": False}]
    apply_captions(artifacts, a.captions)
    return {
        "meta": ctx["date_label"],
        "eyebrow": a.eyebrow or "",
        "title": a.headline or "",
        "sub": a.sub or "",
        "layout": "stack",
        "artifacts": artifacts,
        "take": a.take or "",
        "cta": a.cta or "",
        "notes": a.note or [],
        "site": site_line(names),
        "sport": post_sport(names),
    }


class NoAnswer(Exception):
    """The artifact prompt got no input (stdin closed)."""


def choose_artifacts(available: list[str], game: dict | None = None) -> list[str]:
    """Spec: on command I get prompted to select from the artifact categories.

    Directional variants are listed with their teams named — otherwise the two halves
    of each split view show up as two identically-labelled options.
    """
    print("\nSelect artifacts to assemble (comma-separated numbers, or 'all'):")
    for i, name in enumerate(available, start=1):
        # Self-titled sections carry no slot caption; the prompt still needs a name.
        label = artifact_caption(name, game) or ARTIFACTS[name]["label"]
        print(f"  {i}. {label}  [{name}]")
    try:
        raw = input("> ").strip().lower()
    except EOFError:
        # Windows reports NUL as a terminal, so a redirected run lands here.
        raise NoAnswer from None
    if raw in ("", "all"):
        return available
    picked = []
    for token in raw.replace(" ", "").split(","):
        if token in ARTIFACTS:
            picked.append(token)
            continue
        if token.isdigit() and 1 <= int(token) <= len(available):
            picked.append(available[int(token) - 1])
        else:
            fail(f"{token!r} is not one of the offered artifacts")
    return picked or available


# ── commands ─────────────────────────────────────────────────────────────────
def cmd_preview(a, slate, games, cap, ctx):
    """Concise multi-matchup preview: cards placed adjacent, dimensions for IG."""
    if len(games) > 6:
        fail(f"preview takes up to 6 games ({len(games)} given) - "
             f"use full-card for the whole slate")
    # A portrait post can only hold so many cards before the type stops surviving
    # social re-encoding: 3 across is the legible limit on 1080 wide. Beyond that,
    # split across images rather than shrinking the cards.
    per_post = a.per_post if a.per_post_explicit else (3 if len(games) > 3 else len(games))
    chunks = [games[i:i + per_post] for i in range(0, len(games), per_post)]
    if len(chunks) > 1:
        print(f"[content-engine] {len(games)} games at {per_post} per post -> "
              f"{len(chunks)} images (keeps the cards readable)")
    # Labels are indexed across the whole selection, not restarted per image, so
    # --captions ",AL,NL Central,NL East," still lines up after a split.
    all_labels = resolve_labels(a.captions, len(games))
    posts, offset = [], 0
    for idx, chunk in enumerate(chunks, start=1):
        posts.extend(_preview_post(
            a, chunk, cap, ctx, idx, len(chunks),
            all_labels[offset:offset + len(chunk)]))
        offset += len(chunk)
    return posts


def _preview_post(a, games, cap, ctx, part, parts, labels):
    artifacts = []
    for g in games:
        artifacts.append({
            "src": cap.grab(f"{a.sport}_card", g),
            "caption": f"{g['Away']} @ {g['Home']}",
            "framed": False,
        })
    apply_captions(artifacts, labels=labels)
    part_tag = f" ({part}/{parts})" if parts > 1 else ""
    payload = {
        "meta": ctx["date_label"],
        "eyebrow": a.eyebrow or "Today's Slate",
        "title": (a.headline or f"{len(games)} Games To Watch") + part_tag,
        "sub": a.sub or " · ".join(sp_label(g) for g in games),
        # Grid wraps into rows and picks its own column count, so 5 cards become
        # 3 + 2 instead of five slivers. One card is just a stack of one.
        "layout": "grid" if len(games) > 1 else "stack",
        "artifacts": artifacts,
        "take": a.take or "",
        "cta": a.cta or "",
        "notes": a.note or [],
        "site": site_line([f"{a.sport}_card"]),
        "sport": a.sport.upper(),
        "tight": len(games) >= 3,
    }
    stem = f"preview_{a.sport}_" + "_".join(f"{g['Away']}{g['Home']}" for g in games)
    # Instagram's tallest feed crop is 4:5, so portrait is the safe default and a wide
    # canvas is only ever used when explicitly asked for.
    if not ctx["size_explicit"]:
        ctx["size"] = "1080x1350"
    return [(stem, payload)]


def cmd_deep(a, slate, games, cap, ctx):
    """Detailed preview of 1-3 games from a chosen set of artifacts, one image."""
    if not 1 <= len(games) <= 3:
        fail(f"deep takes 1-3 games ({len(games)} given)")
    offered = [n for n, s in ARTIFACTS.items()
               if s["scope"] == "game" and s.get("site")
               and artifact_league(n) == a.sport]
    names = a.artifacts
    if names:
        # Accept the key or any phrase from it: "projected lineups" -> card.
        chosen = [resolve_artifact(t) for t in names.split(",") if t.strip()]
        for c in chosen:
            if ARTIFACTS[c]["scope"] != "game":
                fail(f"{c!r} is a slate artifact, not a matchup one - use `compose` "
                     f"for it. Matchup artifacts: {', '.join(offered)}")
            if artifact_league(c) != artifact_league(chosen[0]):
                fail("deep takes one sport's matchup artifacts at a time")
    else:
        chosen = None
        if sys.stdin.isatty():
            try:
                chosen = choose_artifacts(offered, games[0])
            except NoAnswer:
                pass
        if chosen is None:
            chosen = DEEP_DEFAULTS[a.sport]
            print(f"[content-engine] no --artifacts given; using default set: "
                  f"{', '.join(chosen)}")

    if "legacy_card" in chosen:
        check_lineup_integrity(games)
    out = []
    for g in games:
        stem = f"deep_{g['Away']}{g['Home']}_" + "_".join(chosen)[:40]
        if banner_eligible(chosen) and not a.segmented:
            out.append((stem, matchup_post(a, cap, ctx, g, chosen)))
            continue
        artifacts = [{
            "src": cap.grab(name, g),
            "caption": artifact_caption(name, g),
            "framed": ARTIFACTS[name].get("framed", True),
        } for name in chosen]
        apply_captions(artifacts, a.captions)
        payload = {
            "meta": ctx["date_label"],
            "eyebrow": a.eyebrow or "Matchup Preview",
            "title": a.headline or f"{g['Away']} @ {g['Home']}",
            "sub": a.sub or sp_label(g),
            "layout": "stack",
            "artifacts": artifacts,
            "take": a.take or "",
            "cta": a.cta or "",
            "notes": a.note or [],
            "site": site_line(chosen),
            "sport": post_sport(chosen),
            "tight": len(artifacts) >= 4,
        }
        # The chosen artifacts belong in the name. Two `deep` runs on the same game -
        # the card, then the offensive board - otherwise share one stem, and because a
        # canvas step-down deletes the file it is replacing, the second run silently
        # destroyed the first run's post. Same convention `compose` already uses.
        out.append((stem, payload))
    return out


def cmd_breakdown(a, slate, games, cap, ctx):
    """One matchup, up to 3 graphics: pitching / offense / bullpen."""
    if len(games) != 1:
        fail(f"breakdown covers exactly 1 matchup ({len(games)} given)")
    g = games[0]
    aspects = ASPECTS[a.sport]
    out = []
    for asp in resolve_aspects(a):
        spec = aspects[asp]
        stem = f"breakdown_{g['Away']}{g['Home']}_{asp}"
        if banner_eligible(spec["artifacts"]) and not a.segmented:
            payload = matchup_post(a, cap, ctx, g, spec["artifacts"])
            # A carousel still needs to say which slide is which; the aspect's own
            # eyebrow does that without restating the matchup the banner shows.
            payload["eyebrow"] = a.eyebrow or spec["eyebrow"]
            out.append((stem, payload))
            continue
        artifacts = [{
            "src": cap.grab(name, g),
            "caption": artifact_caption(name, g),
            "framed": ARTIFACTS[name].get("framed", True),
        } for name in spec["artifacts"]]
        apply_captions(artifacts, a.captions)
        payload = {
            "meta": ctx["date_label"],
            "eyebrow": a.eyebrow or spec["eyebrow"],
            "title": a.headline or f"{g['Away']} @ {g['Home']}",
            "sub": a.sub or spec["caption"],
            "layout": "stack",
            "artifacts": artifacts,
            "take": a.take or "",
            "cta": a.cta or "",
            "notes": a.note or [],
            "site": site_line(spec["artifacts"]),
            "sport": a.sport.upper(),
        }
        out.append((stem, payload))
    return out


def cmd_full_card(a, slate, games, cap, ctx):
    """Whole slate as the site's slate cards, in a grid."""
    # The detail page's overview panel (976x377) was the first choice, but three of
    # them stacked render at ~0.64x on 4:5 and the venue/conditions text is unreadable.
    # The slate card (400x337) carries the same essentials - clubs, time, starters,
    # venue, conditions - and tiles two across, so six fit a post at ~full size.
    per_post = max(1, a.per_post if a.per_post_explicit else 6)
    chunks = [games[i:i + per_post] for i in range(0, len(games), per_post)]
    out = []
    for idx, chunk in enumerate(chunks, start=1):
        # The card names the starters itself, so no note under it.
        artifacts = [{
            "src": cap.grab(f"{a.sport}_card", g),
            "caption": f"{g['Away']} @ {g['Home']}",
            "framed": False,
        } for g in chunk]
        part = f" ({idx}/{len(chunks)})" if len(chunks) > 1 else ""
        apply_captions(artifacts, a.captions)
        payload = {
            "meta": ctx["date_label"],
            "eyebrow": a.eyebrow or "Full Card",
            "title": a.headline or f"Today's Full Card{part}",
            "sub": a.sub or f"All {len(games)} games",
            "layout": "grid" if len(chunk) > 1 else "stack",
            "artifacts": artifacts,
            "take": a.take or "",
            "cta": a.cta or "",
            "notes": a.note or [],
            "site": site_line([f"{a.sport}_card"]),
            "sport": a.sport.upper(),
            "tight": True,
        }
        out.append((f"fullcard_{a.sport}_{idx}", payload))
    return out


def cmd_rankings(a, slate, games, cap, ctx):
    """Unit rankings: today's starters, or team rankings by category + window."""
    kind = (a.type or "starters").lower()
    if kind == "starters":
        artifacts = [{"src": cap.grab("legacy_starters_rankings", rows=a.rows),
                      "caption": "Projected starters · ranked by Pitching Score",
                      "framed": True}]
        apply_captions(artifacts, a.captions)
        payload = {
            "meta": ctx["date_label"],
            "eyebrow": a.eyebrow or "Unit Rankings",
            "title": a.headline or (f"Today's Top {a.rows} Starters" if a.rows
                                else "Today's Starters, Best To Worst"),
            # docs/ECOSYSTEM.md: PitchScore = 0.40*K% + 0.35*inv(BB%) + 0.25*inv(HR/9).
            # The old deck claimed ERA, FIP "and what each arm allows" were in the
            # blend. They are columns on the board, not inputs to the score - the post
            # was describing the metric wrongly in the site's own voice.
            "sub": a.sub or ("Pitch Score: 40% strikeout rate, 35% walk avoidance, "
                             "25% home run suppression."),
            "layout": "stack",
            "artifacts": artifacts,
            "take": a.take or "",
            "cta": a.cta or "",
            "notes": a.note or [],
        }
        return [("rankings_starters", payload)]

    if kind != "team":
        fail(f"--type must be 'starters' or 'team' (got {kind!r})")
    family = (a.family or "scoring").lower()
    if family not in TEAM_FAMILIES:
        fail(f"--family must be one of: {', '.join(sorted(set(TEAM_FAMILIES)))}")
    window = (a.window or "YTD").upper()
    if window not in WINDOWS:
        fail(f"--window must be one of: {', '.join(WINDOWS)}")
    key = FAMILY_KEY.get(family, family)
    src = cap.grab("legacy_team_rankings", extra={"family": key, "window": window},
                   rows=a.rows)
    label = TEAM_FAMILIES[family]
    scope = (f"Top {a.rows} lineups" if a.rows and a.rows < 30 else "All 30 lineups")
    team_slots = [{"src": src, "caption": f"{label} · {WINDOWS[window]}",
                   "framed": True}]
    apply_captions(team_slots, a.captions)
    payload = {
        "meta": ctx["date_label"],
        "eyebrow": a.eyebrow or "Team Rankings",
        "title": a.headline or f"{label} Rankings",
        # The deck must never contradict the artifact: a --rows cut shows fewer than
        # the full board, so it cannot be described as all 30 (same rule as first pitch).
        "sub": a.sub or f"{scope} · {WINDOWS[window]}",
        "layout": "stack",
        "artifacts": team_slots,
        "take": a.take or "",
        "cta": a.cta or "",
        "notes": a.note or [],
    }
    return [(f"rankings_team_{key}_{window}", payload)]


def cmd_compose(a, slate, games, cap, ctx):
    """Assemble any registered or ad-hoc artifacts - the adaptive path.

    Used for anything outside the matchup brief: other areas of the site, or the
    mlb-model dashboard's own boards when the post is about projections.
        --artifacts model_edge,model_props
        --capture 'label=Edge Board;url=https://...;selector=#v-today .ca-board'
    """
    names = register_ad_hoc(a.capture)
    if a.artifacts:
        names = [resolve_artifact(t) for t in a.artifacts.split(",") if t.strip()] + names
    if not names:
        fail("compose needs --artifacts and/or --capture. Registered slate artifacts: "
             + ", ".join(n for n, sp in ARTIFACTS.items() if sp["scope"] == "slate"))
    # Silently defaulting to the first game on the slate was a trap: `compose
    # --artifacts card` looked like it worked and shipped whichever matchup happened
    # to be listed first. Name the game or do not ask for a matchup artifact.
    wants_game = [n for n in names if ARTIFACTS[n]["scope"] == "game"]
    if wants_game and not games:
        fail(f"{', '.join(wants_game)} is a matchup artifact - "
             f"pass --games AWAY@HOME to say which game")
    game = games[0] if wants_game else None
    if wants_game and len(wants_game) == len(names) and banner_eligible(names) \
            and not a.segmented:
        subject = f"{game['Away']}{game['Home']}_"
        return [(f"compose_{subject}" + "_".join(names)[:40],
                 matchup_post(a, cap, ctx, game, names))]
    # --rows / --rows-from override the artifact's own window, which is what lets one
    # registry entry ship a 32-row board as two slides: `--rows 16` then
    # `--rows-from 17`, with the site's own rank column carried through both.
    artifacts = [{
        "src": cap.grab(n, game if ARTIFACTS[n]["scope"] == "game" else None,
                        rows=a.rows, rows_from=a.rows_from),
        "caption": artifact_caption(n, game),
        "framed": ARTIFACTS[n].get("framed", True),
    } for n in names]
    apply_captions(artifacts, a.captions)
    payload = {
        "meta": ctx["date_label"],
        "eyebrow": a.eyebrow or "Chase Analytics",
        "title": a.headline or "Today's Read",
        "sub": a.sub or "",
        "layout": a.layout,
        "artifacts": artifacts,
        "take": a.take or "",
        "cta": a.cta or "",
        "notes": a.note or [],
        "site": site_line(names),
        # Carried so the video directive can name the league without re-deriving it
        # from the artifact list, and so the still and the motion cut agree.
        "sport": post_sport(names),
        "tight": len(artifacts) >= 3,
    }
    # The game belongs in the name: the same artifact composed for two matchups shared
    # one stem, so the second post silently overwrote the first (same trap `deep` had).
    subject = f"{game['Away']}{game['Home']}_" if game else ""
    return [(f"compose_{subject}" + "_".join(names)[:40], payload)]


def _booth_pack_from_stdout(text: str) -> str | None:
    for line in reversed(text.splitlines()):
        if "[video-pack]" in line and "->" in line:
            rel = Path(line.split("->", 1)[1].strip())
            return str(Path("props") / "pack" / rel.name)
    return None


def run_booth(a) -> None:
    """Build a game pack if a matchup was named, then start the recording booth."""
    video = PIPELINE / "video"
    booth_js = video / "scripts" / "booth.mjs"
    if not booth_js.is_file():
        fail("recording booth is missing (video/scripts/booth.mjs)")
    node = shutil.which("node")
    if not node:
        fail("node is not on PATH; the recording booth needs Node to serve the studio")

    pack = (a.pack or "").strip() or None
    games_arg = (a.games or "").strip()
    if games_arg and not pack:
        game = games_arg.split(",")[0].strip()
        cmd = [sys.executable, "-m", "outputs.video_pack",
               "--league", a.sport, "--game", game]
        if a.date:
            cmd += ["--date", a.date]
        if a.show:
            cmd += ["--show", a.show]
        if a.tag:
            cmd += ["--tag", a.tag]
        plat = a.video_platform if a.video_platform in ("reels", "reels-ads", "tiktok", "shorts") else "reels"
        cmd += ["--platform", plat]
        print("[content-engine] building game pack for the booth ...")
        r = subprocess.run(cmd, cwd=PIPELINE, capture_output=True, text=True)
        sys.stdout.write(r.stdout or "")
        sys.stderr.write(r.stderr or "")
        if r.returncode:
            sys.exit(r.returncode)
        pack = _booth_pack_from_stdout(r.stdout or "")
        if not pack:
            fail("game pack built but its folder could not be read from video_pack output")

    argv = [node, str(booth_js)]
    if pack:
        argv += ["--pack", pack]
    plat = a.video_platform if a.video_platform in ("reels", "tiktok", "shorts") else "reels"
    argv += ["--platform", plat]
    if a.no_open:
        argv.append("--no-open")
    print("[content-engine] recording booth — keep this window open while you record")
    raise SystemExit(subprocess.call(argv, cwd=video))


COMMANDS = {
    "keys": None,          # handled before any browser/slate work in main()
    "sync-style": None,    # mirror the site's style for stills AND the video package
    "booth": None,         # recording studio; does not compose a still
    "compose": cmd_compose,
    "preview": cmd_preview,
    "deep": cmd_deep,
    "breakdown": cmd_breakdown,
    "full-card": cmd_full_card,
    "rankings": cmd_rankings,
}


def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=sorted(COMMANDS))
    ap.add_argument("--games", help="AWAY@HOME[,AWAY@HOME...] in the order to show")
    ap.add_argument("--sport", choices=["mlb", "nfl"], default="mlb",
                    help="preview / deep / breakdown / full-card / booth: which live "
                         "slate (default mlb). compose and deep --artifacts take the "
                         "sport from the artifacts themselves. booth needs --sport nfl "
                         "for an NFL pack.")
    ap.add_argument("--artifacts", help="deep/compose: e.g. mlb_hero,mlb_starters,"
                                        "mlb_radar (run `keys` for all)")
    ap.add_argument("--aspects", help="breakdown: mlb pitching,arsenal,offense,lineups,"
                                      "form,bullpen | nfl offense,"
                                      "offense_home,defense,defense_home,scheme,"
                                      "form,context")
    ap.add_argument("--type", help="rankings: starters | team")
    ap.add_argument("--family", help="rankings/team: scoring|winning|difficulty|projection")
    ap.add_argument("--window", help="rankings/team: YTD|L30|L14|L7")
    ap.add_argument("--rows", type=int,
                    help="cap table rows - rankings (starters default 14, team all 30) "
                         "and compose (overrides the artifact's own row cap)")
    ap.add_argument("--rows-from", type=int, metavar="N", dest="rows_from",
                    help="compose: hide rows ABOVE N, so a long board ships as two "
                         "slides. '--rows 16' then '--rows-from 17' splits a 32-row "
                         "ranking in half with the site's own rank numbers intact.")
    ap.add_argument("--per-post", type=int, default=6,
                    help="artifacts per image - full-card slate cards (default 6), or "
                         "preview matchup cards (default 3, which is the legible limit "
                         "on a portrait post)")
    ap.add_argument("--segmented", action="store_true",
                    help="matchup posts: compose each section as its own framed block "
                         "under a typed title, instead of one continuous capture "
                         "under the site's matchup banner (the default)")
    ap.add_argument("--banner-facts", action="store_true", dest="banner_facts",
                    help="matchup posts: keep the banner's venue / conditions / "
                         "broadcast / status tiles (hidden by default)")
    ap.add_argument("--headline", help="post title, your words")
    ap.add_argument("--take", help="your angle/perspective - rendered as a styled "
                                   "callout, visually separated from neutral captions")
    ap.add_argument("--cta", help="call to action under the site URL")
    ap.add_argument("--layout", choices=["stack", "row", "grid"], default="stack",
                    help="compose: stack vertically (default), one row, or a wrapping "
                         "grid that picks its own column count")
    ap.add_argument("--capture", action="append", metavar="SPEC",
                    help="ad-hoc artifact, repeatable: "
                         "'label=Model Board;url=https://...;selector=.ca-board' "
                         "(or page=team_profile.html for a local dashboard page). "
                         "Optional: contains=..., force_show=..., hide=..., wait=ms, "
                         "width=PX (capture viewport), sport=NFL (footer line), "
                         "style=CSS (injected before capture)")
    ap.add_argument("--sub", help="post subtitle, your words")
    ap.add_argument("--eyebrow", help="small accent label above the title")
    ap.add_argument("--note", action="append", help="bullet note (repeatable)")
    ap.add_argument("--captions", action="append",
                    help="per-slot labels in slot order, appended to each slot's own "
                         "caption. One flag with commas: 'AL,NL Central,NL East'. "
                         "Repeat the flag instead when a label itself contains a comma "
                         "- each occurrence is then one slot, verbatim. Empty entry "
                         "keeps the default; prefix with = to replace it outright.")
    ap.add_argument("--capture-width", type=int, default=None, metavar="PX",
                    help="viewport width the artifact is captured at (default 1600, or "
                         "the artifact's own). The site's tables are fluid, so a "
                         "NARROWER capture makes the numbers BIGGER in the post - the "
                         "composer scales one artifact to ~1040px either way. Do not go "
                         "below the table's own min-content width or the page behind it "
                         "bleeds into the shot.")
    ap.add_argument("--drop-cols", metavar="LABELS",
                    help="comma-separated table column headers to remove before "
                         "capture, e.g. 'OSI Allowed,ABQ Allowed,OOR'. Fewer columns "
                         "means a narrower board and bigger type.")
    ap.add_argument("--heading-scale", type=float, default=1.0, metavar="X",
                    help="multiply the chrome heading type (eyebrow, headline, deck) "
                         "- 1.0 is the house size, 1.15 reads a little bigger. Larger "
                         "headings take room from the artifacts, so a big lede can "
                         "trip the legibility rescue onto a taller canvas.")
    ap.add_argument("--video", action="store_true",
                    help="also emit the motion version of this post: save its captures "
                         "into video/public/captures/ and write the Remotion props that "
                         "animate them, then print the render command. The video reuses "
                         "the SAME capture as the still, so the two cannot drift.")
    ap.add_argument("--video-platform", default="reels", dest="video_platform",
                    choices=["reels", "reels-ads", "tiktok", "shorts", "youtube"],
                    help="which platform's UI safe areas the motion version keeps clear "
                         "of (default reels). Not cosmetic: the caption and like/share "
                         "rails cover real pixels. See video/src/graphics/ShowTemplate. "
                         "booth uses reels/tiktok/shorts (youtube falls back to reels).")
    ap.add_argument("--pack",
                    help="booth: existing pack folder, e.g. props/pack/2026-09-20-IND-KC "
                         "(relative to video/). Skips a rebuild.")
    ap.add_argument("--show",
                    help="booth: show / slot name written into the pack, e.g. "
                         "'Week 3 Sunday Night Football'")
    ap.add_argument("--tag",
                    help="booth: short badge on the pack, e.g. SNF (default from --show)")
    ap.add_argument("--no-open", action="store_true", dest="no_open",
                    help="booth: serve the studio but do not open a browser")
    ap.add_argument("--mark", action="append", metavar="SPEC",
                    help="with --video: an Annotate step, repeatable. "
                         "'type:target[=text][@sec][!tone]', type in "
                         "focus/reset/highlight/circle/underline/arrow/label/spotlight; "
                         "target is row/heading text from the capture")
    ap.add_argument("--size", default=None, choices=SIZES,
                    help="default 1080x1350; multi-card previews auto-pick 1080x1080")
    ap.add_argument("--date", default=date.today().isoformat())
    a = ap.parse_args()
    # Distinguish "left at the default" from "asked for 6", so preview can pick its own.
    a.per_post_explicit = any(arg.startswith("--per-post") for arg in sys.argv[1:])

    if not 0.7 <= a.heading_scale <= 1.6:
        fail(f"--heading-scale must be between 0.7 and 1.6 (got {a.heading_scale})")

    if a.command == "keys":
        print_key()
        return
    if a.command == "sync-style":
        manifest = sync_site_style()
        export_video_style(manifest)
        print(f"[content-engine] video package style -> {VIDEO_SITE_DIR} "
              f"(stamp {manifest.get('stamp')})")
        return
    if a.command == "booth":
        export_video_style(sync_site_style())
        run_booth(a)
        return

    day = a.date
    try:
        date_label = datetime.strptime(day, "%Y-%m-%d").strftime("%B %-d, %Y")
    except ValueError:
        date_label = datetime.strptime(day, "%Y-%m-%d").strftime("%B %d, %Y").replace(" 0", " ")
    slate, games = resolve_post_games(a, day)
    if a.command not in ("compose", "rankings") and not games:
        fail("no games selected")
    # The post chrome renders in the site's CURRENT style - mirror it before anything
    # is composed. See sync_site_style.
    export_video_style(sync_site_style())

    out_dir = OUT_ROOT / day
    out_dir.mkdir(parents=True, exist_ok=True)
    ctx = {"date_label": date_label, "day": day,
           "size": a.size or "1080x1350", "size_explicit": a.size is not None}

    port = free_port()
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=PIPELINE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    t0 = time.time()
    written: list[tuple[str, dict]] = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            cap = Capturer(browser, port, viewport_w=a.capture_width,
                           drop_cols=[c.strip() for c in (a.drop_cols or "").split(",")
                                      if c.strip()])
            posts = COMMANDS[a.command](a, slate, games, cap, ctx)
            size = ctx["size"]  # a command may have chosen a better canvas
            for stem, payload in posts:
                if a.heading_scale != 1.0:
                    payload = {**payload, "headingScale": a.heading_scale}
                check_text_budgets(payload)
                out_path = out_dir / f"{stem}_{size}.png"
                scale, slack = compose(browser, port, out_path, size, payload)
                # Several stacked artifacts can squeeze small enough that the numbers
                # stop being readable. Rescue it on the tall canvas, which buys ~40%
                # more vertical room, unless the caller pinned a size. Row layouts are
                # width-constrained, so a taller canvas buys them nothing — warn only.
                stacked = (payload.get("layout") or "stack") == "stack"
                slack_ceiling = int(int(size.split("x")[1]) * SLACK_FRACTION)
                if scale < LEGIBILITY_FLOOR and stacked and not ctx["size_explicit"] \
                        and size != "1080x1920":
                    print(f"[content-engine] artifacts squeezed to {scale:.0%} - "
                          f"re-rendering {stem} at 1080x1920 for legibility")
                    out_path.unlink(missing_ok=True)
                    out_path = out_dir / f"{stem}_1080x1920.png"
                    scale, slack = compose(
                        browser, port, out_path, "1080x1920", payload)
                # Opposite problem: artifacts sized fine but a dead band left over.
                # Step down the ladder until the post fills the frame. Applies to every
                # layout - a width-bound grid is the worst offender.
                elif slack > slack_ceiling and not ctx["size_explicit"]:
                    for shorter in CANVAS_LADDER.get(size, []):
                        print(f"[content-engine] {slack:.0f}px of dead space - "
                              f"re-rendering {stem} at {shorter}")
                        out_path.unlink(missing_ok=True)
                        out_path = out_dir / f"{stem}_{shorter}.png"
                        size = shorter
                        scale, slack = compose(
                            browser, port, out_path, shorter, payload)
                        if (slack <= int(int(shorter.split('x')[1]) * SLACK_FRACTION)
                                or scale < LEGIBILITY_FLOOR):
                            break
                if scale < LEGIBILITY_FLOOR:
                    advice = ("fewer games per post" if not stacked
                              else "fewer artifacts, or one per graphic")
                    print(f"[content-engine] NOTE {out_path.name}: artifacts at "
                          f"{scale:.0%} of captured size - consider {advice}.")
                written.append((out_path.name, payload))
                # After the still is on disk, not before: a post that failed its
                # legibility or slack rescue should not leave a video directive
                # pointing at captures the still engine rejected.
                if a.video:
                    write_video_directive(day, stem, payload, a.video_platform, a.mark)
            browser.close()
    finally:
        server.terminate()

    captions = out_dir / "captions.txt"
    with open(captions, "a", encoding="utf-8") as f:
        f.write(f"\n=== {a.command} · {datetime.now():%H:%M} · {date_label} ===\n")
        for name, payload in written:
            f.write(f"\n[{name}]\n{payload.get('title', '')}\n")
            if payload.get("sub"):
                f.write(payload["sub"] + "\n")
            # The take is the whole reason the post has a point of view; it belongs in
            # the caption box, not just burned into the image.
            if payload.get("take"):
                f.write("\n" + payload["take"] + "\n")
            notes = payload.get("notes") or []
            if notes:
                f.write("\n")
            for note in notes:
                f.write(f"• {note}\n")
            f.write("\nchase-analytics.com")
            f.write(f" · {payload['cta']}\n" if payload.get("cta") else "\n")
    print(f"[content-engine] {len(written)} image(s) + captions -> {out_dir} "
          f"({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
