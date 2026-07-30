"""
Chase Analytics content engine — command-driven social graphics.

Captures real dashboard components (the "artifacts") straight off the live pages,
then composes the ones you asked for into Instagram-dimension posts with your own
headline and notes. The artifacts are screenshots of the site itself, so a post can
never drift from the site's design.

COMMANDS
  preview     Concise multi-matchup preview — matchup cards placed side by side.
                --games CLE@CIN,TEX@TBR,CHC@STL
  deep        Detailed 1-3 game preview — pick which artifacts to assemble.
                --games PHI@MIA --artifacts banner,radar,offense
                (omit --artifacts in a terminal and it prompts you to choose)
  breakdown   One matchup, up to 3 graphics, split by aspect.
                --games PHI@MIA --aspects pitching,offense,bullpen
  full-card   Whole slate as matchup-analysis banners (kicker stripped, SP names added).
  rankings    Unit rankings snapshots.
                --type starters
                --type team --family scoring --window L30

COMMON FLAGS
  --headline / --sub / --note (repeatable)   your language, verbatim
  --size 1080x1350 (default) | 1080x1080 | 1080x1920 | 1600x900
  --date YYYY-MM-DD    slate date (default today)

Output: outputs/social_cards/YYYY-MM-DD/<command>_*.png (+ captions.txt)

Fails closed: a missing artifact or stale slate exits non-zero and writes nothing.
A wrong graphic is worse than no graphic.
"""
from __future__ import annotations

import argparse
import base64
import csv
import json
import socket
import subprocess
import sys
import time
from datetime import date, datetime
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

PIPELINE = Path(__file__).resolve().parents[1]
DATA = PIPELINE / "data"
OUT_ROOT = PIPELINE / "outputs" / "social_cards"

SIZES = ["1080x1350", "1080x1080", "1080x1920", "1600x900"]

# Artifacts are captured at 2x so they downsample crisply into the final post. The
# compose page needs it to convert a bitmap width back to the artifact's CSS width.
CAPTURE_DPR = 2

# Below this shared scale, stat tables stop being readable on a phone. Crossing it
# triggers a re-render on the tall canvas (and a warning if that still isn't enough).
LEGIBILITY_FLOOR = 0.62
# More than this much unused vertical room and the post reads as half-empty; the runner
# drops to a shorter canvas instead.
SLACK_CEILING = 240

# Site chrome that overlays content. The sticky header sits above whatever is at the
# top of the page, so an element screenshot of a table would otherwise show the nav
# painted over its column headers. Hidden on every capture.
GLOBAL_HIDE = [
    ".chase-header", ".chase-mobile-menu", ".chase-mobile-overlay",
    ".mlbma-loading", ".dash-signup",
]

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
        "framed": False,
        # In-card navigation affordance is meaningless in a static post.
        "hide": [".hmc-view-full"],
    },
    "banner": {
        "label": "Matchup Analysis Banner",
        "scope": "game",
        "page": "matchup_compare.html",
        "selector": ".mc-header",
        "wait_ms": 11000,
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
        "wait_ms": 15000,
        "framed": True,
        # Post chrome already names the matchup; the artifact's own section header and
        # methodology fine print would just repeat twice in one image.
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
        "wait_ms": 15000,
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
        "wait_ms": 15000,
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
        "wait_ms": 15000,
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
        # The table lives in a fixed-height sticky scroller; without releasing it the
        # capture clips after ~8 rows and the page behind bleeds into the empty band.
        "unclip": [".pl-rank-wrap", ".pl-rank-table-wrap", ".rl-sticky-table",
                   ".rl-table-wrap"],
        "unstick": [".pl-rank-table thead th"],
        "default_rows": 14,
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
    },
}

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

ASPECTS = {
    "pitching": {
        "artifacts": ["pitcher", "pitcher_rev"],
        "eyebrow": "Pitching Breakdown",
        "caption": "Each lineup against the other side's starter",
    },
    "offense": {
        "artifacts": ["banner", "offense", "radar"],
        "eyebrow": "Offense Breakdown",
        "caption": "Lineup form and process profile",
    },
    "bullpen": {
        "artifacts": ["bullpen", "bullpen_rev"],
        "eyebrow": "Bullpen Breakdown",
        "caption": "Each lineup against the other side's relief",
    },
}


def fail(msg: str) -> None:
    print(f"[content-engine] FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


# ── slate ────────────────────────────────────────────────────────────────────
def read_slate(day: str) -> list[dict]:
    path = DATA / "today_matchups.csv"
    if not path.exists():
        fail(f"{path} missing - run the pipeline first")
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        fail("slate is empty")
    dates = {r.get("Slate_Date", "").strip() for r in rows}
    if dates != {day}:
        fail(f"slate date(s) {sorted(dates)} != requested {day} (stale data?)")
    return rows


def resolve_games(slate: list[dict], spec: str | None) -> list[dict]:
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
            fail(f"{key} is not on the {slate[0]['Slate_Date']} slate. "
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


def artifact_caption(name: str, game: dict | None) -> str:
    """Label for an artifact slot; directional variants name the two sides."""
    spec = ARTIFACTS[name]
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


class Capturer:
    """Screenshots dashboard components as base64 PNGs, memoized per run."""

    def __init__(self, browser, port: int, verbose: bool = True):
        self.browser = browser
        self.port = port
        self.verbose = verbose
        self.cache: dict[str, str] = {}

    def url(self, spec: dict, game: dict | None, extra: dict | None) -> str:
        params = dict(spec.get("params") or {})
        if game is not None and spec["page"] == "matchup_compare.html":
            params.update({"away": game["Away"], "home": game["Home"]})
        params.update(extra or {})
        query = "&".join(f"{k}={v}" for k, v in params.items())
        frag = f"#{spec['hash']}" if spec.get("hash") else ""
        base = f"http://127.0.0.1:{self.port}/dashboard/{spec['page']}"
        return base + (f"?{query}" if query else "") + frag

    def grab(self, name: str, game: dict | None = None,
             extra: dict | None = None, rows: int | None = None) -> str:
        spec = ARTIFACTS[name]
        # Time is part of the identity: two halves of a doubleheader share Away/Home and
        # would otherwise reuse each other's captured pixels.
        key = json.dumps([name, game and game["Away"], game and game["Home"],
                          game and game.get("Time"), extra, rows], sort_keys=True)
        if key in self.cache:
            return self.cache[key]

        page = self.browser.new_page(viewport={"width": 1600, "height": 1400},
                                     device_scale_factor=CAPTURE_DPR)
        try:
            page.goto(self.url(spec, game, extra), wait_until="domcontentloaded",
                      timeout=45000)
            # Views lazy-init off the hash; a stamped hash after load re-triggers it.
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
            selector = spec["selector"]
            try:
                page.wait_for_selector(selector, timeout=spec.get("wait_ms", 12000),
                                       state="attached")
            except Exception:
                fail(f"artifact {name!r} never rendered ({selector} not found on "
                     f"{self.url(spec, game, extra)})")
            # These views re-render as sheet data lands, which detaches elements
            # mid-capture. Wait until the component stops changing before shooting.
            self._wait_stable(page, selector)
            # Resolve WHICH element to shoot before anything is hidden: the disambiguating
            # text ("LINEUP & PITCHER SPLITS") often lives in the very header we strip.
            target_index = self._resolve_index(page, spec, game)
            if target_index is None:
                fail(f"artifact {name!r}: no {selector} matched "
                     f"{spec.get('contains') or 'this game'} on "
                     f"{self.url(spec, game, extra)}")
            page.add_style_tag(content="*{animation:none!important;transition:none!important}")
            # Hiding via a stylesheet, not inline styles: a late re-render replaces the
            # nodes (and would resurrect an inline-hidden element), but the rule persists.
            hides = GLOBAL_HIDE + (spec.get("hide") or [])
            page.add_style_tag(content=", ".join(hides) + "{display:none!important}")
            if spec.get("unclip"):
                page.add_style_tag(content=", ".join(spec["unclip"]) + """{
                    max-height:none!important; height:auto!important;
                    overflow:visible!important}""")
            if spec.get("unstick"):
                page.add_style_tag(
                    content=", ".join(spec["unstick"]) + "{position:static!important}")
            row_cap = rows if rows is not None else spec.get("default_rows")
            if row_cap:
                page.add_style_tag(
                    content=f"{selector} tbody tr:nth-child(n+{int(row_cap) + 1})"
                            "{display:none!important}")
            if spec.get("unclip") or row_cap:
                page.wait_for_timeout(700)

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
        if self.verbose:
            tag = f" {game['Away']}@{game['Home']}" if game else ""
            print(f"[content-engine]   captured {name}{tag} ({len(raw)//1024} KB)")
        return data

    @staticmethod
    def _wait_stable(page, selector: str, tries: int = 14) -> None:
        """Poll until element count + rendered text stop changing between samples."""
        probe = """sel => {
            const els = [...document.querySelectorAll(sel)];
            return els.length + ':' + els.reduce((n, e) => n + (e.innerText || '').length, 0);
        }"""
        last = None
        for _ in range(tries):
            now = page.evaluate(probe, selector)
            if now == last:
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
        if spec.get("contains"):
            index = page.evaluate(
                """([sel, needle]) => {
                    const els = [...document.querySelectorAll(sel)];
                    return els.findIndex(el =>
                      (el.innerText || '').toUpperCase().includes(needle));
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
    page = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=2)
    try:
        payload = {**payload, "captureDpr": CAPTURE_DPR}
        page.add_init_script(
            f"window.CARD_DATA = {json.dumps(payload)};"
            f"window.CARD_SIZE = {json.dumps(size)};")
        page.goto(f"http://127.0.0.1:{port}/dashboard/card_compose.html",
                  wait_until="domcontentloaded", timeout=45000)
        try:
            page.wait_for_function("window.__composeReady === true", timeout=25000)
        except Exception:
            fail(f"compose page never signalled ready for {out_path.name}")
        page.evaluate("document.fonts.ready")
        page.wait_for_timeout(500)
        scale = page.evaluate("window.__composeScale") or 1.0
        slack = page.evaluate("window.__composeSlack") or 0.0
        raw = out_path.with_name("_raw_" + out_path.name)
        page.screenshot(path=str(raw))
    finally:
        page.close()
    # Rendered at DPR2 then downsampled to the exact target — crisper than DPR1.
    Image.open(raw).resize((w, h), Image.LANCZOS).save(out_path)
    raw.unlink()
    print(f"[content-engine] wrote {out_path.name}")
    return float(scale), float(slack)


def choose_artifacts(available: list[str], game: dict | None = None) -> list[str]:
    """Spec: on command I get prompted to select from the artifact categories.

    Directional variants are listed with their teams named — otherwise the two halves
    of each split view show up as two identically-labelled options.
    """
    print("\nSelect artifacts to assemble (comma-separated numbers, or 'all'):")
    for i, name in enumerate(available, start=1):
        print(f"  {i}. {artifact_caption(name, game)}  [{name}]")
    raw = input("> ").strip().lower()
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
    if len(games) > 4:
        fail(f"preview takes up to 4 games ({len(games)} given) - "
             f"use full-card for the whole slate")
    check_lineup_integrity(games)
    artifacts = []
    for g in games:
        artifacts.append({
            "src": cap.grab("card", g),
            "caption": f"{g['Away']} @ {g['Home']}",
            "framed": False,
        })
    payload = {
        "meta": ctx["date_label"],
        "eyebrow": a.eyebrow or "Today's Slate",
        "title": a.headline or f"{len(games)} Games To Watch",
        "sub": a.sub or " · ".join(sp_label(g) for g in games),
        "layout": "row" if len(games) > 1 else "stack",
        "artifacts": artifacts,
        "notes": a.note or [],
        "tight": len(games) >= 3,
    }
    stem = "preview_" + "_".join(f"{g['Away']}{g['Home']}" for g in games)
    # Matchup cards are fixed-height portraits: 3+ across only fills a square canvas,
    # 1-2 fill the 4:5 feed post. Respect an explicit --size, otherwise fit the shape.
    if not ctx["size_explicit"]:
        ctx["size"] = "1080x1080" if len(games) >= 3 else "1080x1350"
    return [(stem, payload)]


def cmd_deep(a, slate, games, cap, ctx):
    """Detailed preview of 1-3 games from a chosen set of artifacts, one image."""
    if not 1 <= len(games) <= 3:
        fail(f"deep takes 1-3 games ({len(games)} given)")
    offered = [n for n, s in ARTIFACTS.items() if s["scope"] == "game"]
    names = a.artifacts
    if names:
        chosen = [t.strip().lower() for t in names.split(",") if t.strip()]
        for c in chosen:
            if c not in offered:
                fail(f"{c!r} is not a game artifact. Choose from: {', '.join(offered)}")
    elif sys.stdin.isatty():
        chosen = choose_artifacts(offered, games[0])
    else:
        chosen = ["card", "banner", "offense"]
        print(f"[content-engine] no --artifacts given; using default set: "
              f"{', '.join(chosen)}")

    if "card" in chosen:
        check_lineup_integrity(games)
    out = []
    for g in games:
        artifacts = [{
            "src": cap.grab(name, g),
            "caption": artifact_caption(name, g),
            "framed": ARTIFACTS[name].get("framed", True),
        } for name in chosen]
        payload = {
            "meta": ctx["date_label"],
            "eyebrow": a.eyebrow or "Matchup Preview",
            "title": a.headline or f"{g['Away']} @ {g['Home']}",
            "sub": a.sub or sp_label(g),
            "layout": "stack",
            "artifacts": artifacts,
            "notes": a.note or [],
            "tight": len(artifacts) >= 4,
        }
        out.append((f"deep_{g['Away']}{g['Home']}", payload))
    return out


def cmd_breakdown(a, slate, games, cap, ctx):
    """One matchup, up to 3 graphics: pitching / offense / bullpen."""
    if len(games) != 1:
        fail(f"breakdown covers exactly 1 matchup ({len(games)} given)")
    g = games[0]
    wanted = [t.strip().lower() for t in (a.aspects or "pitching,offense,bullpen").split(",")
              if t.strip()]
    for asp in wanted:
        if asp not in ASPECTS:
            fail(f"{asp!r} is not an aspect. Choose from: {', '.join(ASPECTS)}")
    out = []
    for asp in wanted[:3]:
        spec = ASPECTS[asp]
        artifacts = [{
            "src": cap.grab(name, g),
            "caption": artifact_caption(name, g),
            "framed": ARTIFACTS[name].get("framed", True),
        } for name in spec["artifacts"]]
        payload = {
            "meta": ctx["date_label"],
            "eyebrow": a.eyebrow or spec["eyebrow"],
            "title": a.headline or f"{g['Away']} @ {g['Home']}",
            "sub": a.sub or spec["caption"],
            "layout": "stack",
            "artifacts": artifacts,
            "notes": a.note or [],
        }
        out.append((f"breakdown_{g['Away']}{g['Home']}_{asp}", payload))
    return out


def cmd_full_card(a, slate, games, cap, ctx):
    """Whole slate as banners only, with starting pitchers named per game."""
    per_post = max(1, a.per_post)
    chunks = [games[i:i + per_post] for i in range(0, len(games), per_post)]
    out = []
    for idx, chunk in enumerate(chunks, start=1):
        artifacts = [{
            "src": cap.grab("banner", g),
            "note": sp_label(g),
            "framed": True,
        } for g in chunk]
        part = f" ({idx}/{len(chunks)})" if len(chunks) > 1 else ""
        payload = {
            "meta": ctx["date_label"],
            "eyebrow": a.eyebrow or "Full Card",
            "title": a.headline or f"Today's Full Card{part}",
            "sub": a.sub or f"All {len(games)} games",
            "layout": "stack",
            "artifacts": artifacts,
            "notes": a.note or [],
            "tight": True,
        }
        out.append((f"fullcard_{idx}", payload))
    return out


def cmd_rankings(a, slate, games, cap, ctx):
    """Unit rankings: today's starters, or team rankings by category + window."""
    kind = (a.type or "starters").lower()
    if kind == "starters":
        artifacts = [{"src": cap.grab("starters_rankings", rows=a.rows),
                      "caption": "Projected starters · ranked by Pitching Score",
                      "framed": True}]
        payload = {
            "meta": ctx["date_label"],
            "eyebrow": a.eyebrow or "Unit Rankings",
            "title": a.headline or "Today's Starters, Best To Worst",
            "sub": a.sub or "Pitching Score blends K%, BB%, ERA, FIP and what each arm allows.",
            "layout": "stack",
            "artifacts": artifacts,
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
    src = cap.grab("team_rankings", extra={"family": key, "window": window},
                   rows=a.rows)
    label = TEAM_FAMILIES[family]
    payload = {
        "meta": ctx["date_label"],
        "eyebrow": a.eyebrow or "Team Rankings",
        "title": a.headline or f"{label} Rankings",
        "sub": a.sub or f"All 30 lineups · {WINDOWS[window]}",
        "layout": "stack",
        "artifacts": [{"src": src, "caption": f"{label} · {WINDOWS[window]}",
                       "framed": True}],
        "notes": a.note or [],
    }
    return [(f"rankings_team_{key}_{window}", payload)]


COMMANDS = {
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
    ap.add_argument("--artifacts", help="deep: card,banner,radar,offense,pitcher,bullpen")
    ap.add_argument("--aspects", help="breakdown: pitching,offense,bullpen")
    ap.add_argument("--type", help="rankings: starters | team")
    ap.add_argument("--family", help="rankings/team: scoring|winning|difficulty|projection")
    ap.add_argument("--window", help="rankings/team: YTD|L30|L14|L7")
    ap.add_argument("--rows", type=int,
                    help="rankings: cap table rows (starters default 14, team all 30)")
    ap.add_argument("--per-post", type=int, default=6,
                    help="full-card: banners per image (default 6)")
    ap.add_argument("--headline", help="post title, your words")
    ap.add_argument("--sub", help="post subtitle, your words")
    ap.add_argument("--eyebrow", help="small gold label above the title")
    ap.add_argument("--note", action="append", help="bullet note (repeatable)")
    ap.add_argument("--size", default=None, choices=SIZES,
                    help="default 1080x1350; multi-card previews auto-pick 1080x1080")
    ap.add_argument("--date", default=date.today().isoformat())
    a = ap.parse_args()

    day = a.date
    try:
        date_label = datetime.strptime(day, "%Y-%m-%d").strftime("%B %-d, %Y")
    except ValueError:
        date_label = datetime.strptime(day, "%Y-%m-%d").strftime("%B %d, %Y").replace(" 0", " ")
    slate = read_slate(day)
    games = resolve_games(slate, a.games)
    if not games:
        fail("no games selected")

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
            cap = Capturer(browser, port)
            posts = COMMANDS[a.command](a, slate, games, cap, ctx)
            size = ctx["size"]  # a command may have chosen a better canvas
            for stem, payload in posts:
                out_path = out_dir / f"{stem}_{size}.png"
                scale, slack = compose(browser, port, out_path, size, payload)
                # Several stacked artifacts can squeeze small enough that the numbers
                # stop being readable. Rescue it on the tall canvas, which buys ~40%
                # more vertical room, unless the caller pinned a size. Row layouts are
                # width-constrained, so a taller canvas buys them nothing — warn only.
                stacked = (payload.get("layout") or "stack") == "stack"
                if scale < LEGIBILITY_FLOOR and stacked and not ctx["size_explicit"] \
                        and size != "1080x1920":
                    print(f"[content-engine] artifacts squeezed to {scale:.0%} - "
                          f"re-rendering {stem} at 1080x1920 for legibility")
                    out_path.unlink(missing_ok=True)
                    out_path = out_dir / f"{stem}_1080x1920.png"
                    scale, slack = compose(
                        browser, port, out_path, "1080x1920", payload)
                # Opposite problem: artifacts at full size leaving a dead band. Drop to
                # the square canvas so the post reads as composed, not half-empty.
                elif slack > SLACK_CEILING and stacked and not ctx["size_explicit"]                         and size == "1080x1350":
                    print(f"[content-engine] {slack:.0f}px of dead space - "
                          f"re-rendering {stem} at 1080x1080")
                    out_path.unlink(missing_ok=True)
                    out_path = out_dir / f"{stem}_1080x1080.png"
                    scale, slack = compose(
                        browser, port, out_path, "1080x1080", payload)
                if scale < LEGIBILITY_FLOOR:
                    advice = ("fewer games per post" if not stacked
                              else "fewer artifacts, or one per graphic")
                    print(f"[content-engine] NOTE {out_path.name}: artifacts at "
                          f"{scale:.0%} of captured size - consider {advice}.")
                written.append((out_path.name, payload))
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
            for note in payload.get("notes") or []:
                f.write(f"• {note}\n")
            f.write("chase-analytics.com\n")
    print(f"[content-engine] {len(written)} image(s) + captions -> {out_dir} "
          f"({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
