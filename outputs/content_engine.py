"""
Chase Analytics content engine - command-driven social graphics.

Captures real dashboard components (the "artifacts") straight off the live pages,
then composes the ones you asked for into Instagram-dimension posts with your own
headline and notes. The artifacts are screenshots of the site itself, so a post can
never drift from the site's design.

COMMANDS
  keys        Print the artifact key: every component, what it shows, and the
              phrases that summon it (--artifacts accepts those phrases).
  compose     Any registered or ad-hoc artifacts - the adaptive path (other areas of
              the site, or the mlb-model deck when the post is about projections).
                --artifacts model_kpis,model_slate,model_leans
                --capture 'label=X;url=https://...;selector=.terminal-panel'
  preview     Concise multi-matchup preview - matchup cards placed side by side.
                --games CLE@CIN,TEX@TBR,CHC@STL
  deep        Detailed 1-3 game preview - pick which artifacts to assemble.
                --games PHI@MIA --artifacts banner,radar,offense
                (omit --artifacts in a terminal and it prompts you to choose)
  breakdown   One matchup, up to 3 graphics, split by aspect.
                --games PHI@MIA --aspects pitching,offense,bullpen
  full-card   Whole slate as matchup-analysis banners (kicker stripped, SP names added).
  rankings    Unit rankings snapshots.
                --type starters
                --type team --family scoring --window L30

TEXT LAYER (every command; see docs/CONTENT_ENGINE_SPEC.md section 6)
  --eyebrow   category label      --headline  the claim
  --sub       neutral setup       --take      YOUR angle, styled as opinion
  --note      evidence bullet (repeatable)    --cta   where to go next

OTHER FLAGS
  --size 1080x1350 (default) | 1080x1080 | 1080x1920 | 1600x900   (auto-picked if unset)
  --date YYYY-MM-DD    slate date (default today)
  --layout stack|row   compose only

Geometry, brand and text rules live in docs/CONTENT_ENGINE_SPEC.md. In short: every
artifact in a post shares ONE zoom so type size is identical and artifacts stay centred.

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

from PIL import Image, ImageFilter
from playwright.sync_api import sync_playwright

PIPELINE = Path(__file__).resolve().parents[1]
DATA = PIPELINE / "data"
OUT_ROOT = PIPELINE / "outputs" / "social_cards"

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
        # render/pitcher_intelligence.html also mounts PitcherLab + showResearchSubtab
        # (same selector) once Today_Matchups passes the current-slate guard.
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
        "page": "render/team_rankings.html",
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


# -- the key: what each artifact is, and the language that summons it ---------
# One place to look up "what do I say to get X". Every phrase below resolves to a
# canonical artifact name, so --artifacts accepts natural language as well as keys:
#   --artifacts "projected lineups,bullpen,leans"  ==  --artifacts card,bullpen,model_leans
# Run `keys` to print this as a table.
ARTIFACT_DESC = {
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
}

ARTIFACT_ALIASES = {
    "card": ["matchup card", "game card", "the card", "lineup card",
             "projected lineups", "lineups"],
    "banner": ["matchup banner", "analysis banner", "matchup analysis", "strip",
               "identity strip", "form"],
    "radar": ["team radar", "profile radar", "team profile", "process radar",
              "spider", "spider chart"],
    "offense": ["offense splits", "offensive split comparison", "offensive splits",
                "bats", "lineup form", "splits", "hitting"],
    "pitcher": ["pitcher splits", "starter splits", "starter", "lineup vs starter",
                "hitter vs pitcher", "matchup history", "pitcher history"],
    "pitcher_rev": ["reverse pitcher splits", "other starter",
                    "home lineup vs starter", "pitcher splits reversed"],
    "bullpen": ["relief", "bullpen splits", "lineup vs relief", "pen", "relievers"],
    "bullpen_rev": ["reverse bullpen", "other bullpen", "bullpen reversed",
                    "home lineup vs relief"],
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


# phrase -> canonical name (canonical names and labels included)
ALIAS_INDEX: dict[str, str] = {}
for _name, _spec in ARTIFACTS.items():
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
        for name in names:
            print("\n  {}   [{}]".format(name, ARTIFACTS[name]["label"]))
            for line in _wrap(ARTIFACT_DESC.get(name, ""), 72):
                print("      " + line)
            phrases = ARTIFACT_ALIASES.get(name) or []
            if phrases:
                for line in _wrap("say: " + " / ".join(phrases), 72):
                    print("      " + line)
    print("\n\nASPECT SETS  (breakdown --aspects)")
    print("=" * 33)
    for aspect, spec in ASPECTS.items():
        print("  {:9} -> {}".format(aspect, ", ".join(spec["artifacts"])))
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
        for part in raw.split(";"):
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
        for key in ("contains", "hash", "eval"):
            if fields.get(key):
                entry[key] = fields[key]
        for key in ("force_show", "hide", "unclip", "unstick"):
            if fields.get(key):
                entry[key] = [v.strip() for v in fields[key].split(",") if v.strip()]
        ARTIFACTS[name] = entry
        names.append(name)
    return names


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
        self.image_counts: dict[str, int] = {}

    def url(self, spec: dict, game: dict | None, extra: dict | None) -> str:
        params = dict(spec.get("params") or {})
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
    check_lineup_integrity(games)
    artifacts = []
    for g in games:
        artifacts.append({
            "src": cap.grab("card", g),
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
        "tight": len(games) >= 3,
    }
    stem = "preview_" + "_".join(f"{g['Away']}{g['Home']}" for g in games)
    # Instagram's tallest feed crop is 4:5, so portrait is the safe default and a wide
    # canvas is only ever used when explicitly asked for.
    if not ctx["size_explicit"]:
        ctx["size"] = "1080x1350"
    return [(stem, payload)]


def cmd_deep(a, slate, games, cap, ctx):
    """Detailed preview of 1-3 games from a chosen set of artifacts, one image."""
    if not 1 <= len(games) <= 3:
        fail(f"deep takes 1-3 games ({len(games)} given)")
    offered = [n for n, s in ARTIFACTS.items() if s["scope"] == "game"]
    names = a.artifacts
    if names:
        # Accept the key or any phrase from it: "projected lineups" -> card.
        chosen = [resolve_artifact(t) for t in names.split(",") if t.strip()]
        for c in chosen:
            if ARTIFACTS[c]["scope"] != "game":
                fail(f"{c!r} is a slate artifact, not a matchup one - use `compose` "
                     f"for it. Matchup artifacts: {', '.join(offered)}")
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
    aspect_alias = {"pitching": "pitching", "pitchers": "pitching",
                    "starters": "pitching", "arms": "pitching",
                    "offense": "offense", "offence": "offense", "bats": "offense",
                    "hitting": "offense",
                    "bullpen": "bullpen", "relief": "bullpen", "pen": "bullpen"}
    wanted = [aspect_alias.get(_norm_phrase(a_), a_) for a_ in wanted]
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
        apply_captions(artifacts, a.captions)
        payload = {
            "meta": ctx["date_label"],
            "eyebrow": a.eyebrow or "Full Card",
            "title": a.headline or f"Today's Full Card{part}",
            "sub": a.sub or f"All {len(games)} games",
            "layout": "stack",
            "artifacts": artifacts,
            "take": a.take or "",
            "cta": a.cta or "",
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
        apply_captions(artifacts, a.captions)
        payload = {
            "meta": ctx["date_label"],
            "eyebrow": a.eyebrow or "Unit Rankings",
            "title": a.headline or "Today's Starters, Best To Worst",
            "sub": a.sub or "Pitching Score blends K%, BB%, ERA, FIP and what each arm allows.",
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
    src = cap.grab("team_rankings", extra={"family": key, "window": window},
                   rows=a.rows)
    label = TEAM_FAMILIES[family]
    team_slots = [{"src": src, "caption": f"{label} · {WINDOWS[window]}",
                   "framed": True}]
    apply_captions(team_slots, a.captions)
    payload = {
        "meta": ctx["date_label"],
        "eyebrow": a.eyebrow or "Team Rankings",
        "title": a.headline or f"{label} Rankings",
        "sub": a.sub or f"All 30 lineups · {WINDOWS[window]}",
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
    game = games[0] if (games and any(
        ARTIFACTS[n]["scope"] == "game" for n in names)) else None
    artifacts = [{
        "src": cap.grab(n, game if ARTIFACTS[n]["scope"] == "game" else None),
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
        "tight": len(artifacts) >= 3,
    }
    return [("compose_" + "_".join(names)[:40], payload)]


COMMANDS = {
    "keys": None,          # handled before any browser/slate work in main()
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
    ap.add_argument("--artifacts", help="deep: card,banner,radar,offense,pitcher,bullpen")
    ap.add_argument("--aspects", help="breakdown: pitching,offense,bullpen")
    ap.add_argument("--type", help="rankings: starters | team")
    ap.add_argument("--family", help="rankings/team: scoring|winning|difficulty|projection")
    ap.add_argument("--window", help="rankings/team: YTD|L30|L14|L7")
    ap.add_argument("--rows", type=int,
                    help="rankings: cap table rows (starters default 14, team all 30)")
    ap.add_argument("--per-post", type=int, default=6,
                    help="artifacts per image - full-card banners (default 6), or "
                         "preview matchup cards (default 3, which is the legible limit "
                         "on a portrait post)")
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
                         "Optional: contains=..., force_show=..., hide=..., wait=ms")
    ap.add_argument("--sub", help="post subtitle, your words")
    ap.add_argument("--eyebrow", help="small gold label above the title")
    ap.add_argument("--note", action="append", help="bullet note (repeatable)")
    ap.add_argument("--captions", action="append",
                    help="per-slot labels in slot order, appended to each slot's own "
                         "caption. One flag with commas: 'AL,NL Central,NL East'. "
                         "Repeat the flag instead when a label itself contains a comma "
                         "- each occurrence is then one slot, verbatim. Empty entry "
                         "keeps the default; prefix with = to replace it outright.")
    ap.add_argument("--size", default=None, choices=SIZES,
                    help="default 1080x1350; multi-card previews auto-pick 1080x1080")
    ap.add_argument("--date", default=date.today().isoformat())
    a = ap.parse_args()
    # Distinguish "left at the default" from "asked for 6", so preview can pick its own.
    a.per_post_explicit = any(arg.startswith("--per-post") for arg in sys.argv[1:])

    if a.command == "keys":
        print_key()
        return

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
