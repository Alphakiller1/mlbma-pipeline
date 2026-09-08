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
              the site, the mlb-model deck, or the whole nfl-model board).
                --artifacts model_kpis,model_slate,model_leans
                --artifacts nfl_edges --rows 10
                --artifacts nfl_game_lines --games NE@SEA
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

NFL (compose only; captures the HOSTED nfl-model board, needs no MLB slate)
  Boards      nfl_power_top/_bottom, nfl_edges, nfl_offense, nfl_defense,
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
        background-color: var(--bg, #08090F) !important;
    }
"""

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
        fail("one post cannot mix " + " and ".join(sorted(leagues)).upper() +
             " matchup artifacts - --games can only name one sport's fixtures")
    return leagues.pop() if leagues else "mlb"


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
    "lineup_vs_hand": ["lineup vs hand", "away lineup card", "bats vs hand",
                       "lineup splits card"],
    "lineup_vs_hand_rev": ["reverse lineup vs hand", "home lineup card",
                           "other lineup vs hand"],
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
    "nfl_scheme_matrix": ["scheme", "coverage matrix", "response matrix",
                          "scheme intelligence", "coverage and pressure",
                          "matchup matrix"],
    "nfl_game": ["nfl game card", "nfl matchup", "game card nfl", "nfl card"],
    "nfl_game_lines": ["nfl lines", "market vs model", "nfl price card",
                       "line card", "nfl spread card"],
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


def write_video_directive(day: str, stem: str, payload: dict,
                          platform: str) -> Path | None:
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

    def __init__(self, browser, port: int, verbose: bool = True,
                 viewport_w: int | None = None, drop_cols: list[str] | None = None):
        self.browser = browser
        self.port = port
        self.verbose = verbose
        self.cache: dict[str, str] = {}
        self.image_counts: dict[str, int] = {}
        # The site's tables are FLUID: the team board lays out 1350px wide at a 1600px
        # viewport and 730px at 780px, at the same font size. Since the composer can
        # only fit ~1040 CSS px across, a wide capture is scaled DOWN and the numbers
        # end up smaller than the source - the single biggest driver of an unreadable
        # post. Capturing narrow is therefore how type gets bigger, not a canvas change.
        self.viewport_w = viewport_w
        self.drop_cols = drop_cols or []

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
             extra: dict | None = None, rows: int | None = None,
             rows_from: int | None = None) -> str:
        spec = ARTIFACTS[name]
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
                    fail(f"artifact {name!r} never rendered ({selector} not found on "
                         f"{self.url(spec, game, extra)})")
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
            page.add_style_tag(content="*{animation:none!important;transition:none!important}")
            page.add_style_tag(content=GLOBAL_STYLE)
            # Hiding via a stylesheet, not inline styles: a late re-render replaces the
            # nodes (and would resurrect an inline-hidden element), but the rule persists.
            hides = GLOBAL_HIDE + (spec.get("hide") or [])
            page.add_style_tag(content=", ".join(hides) + "{display:none!important}")
            self._drop_empty(page, spec, selector, target_index)
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
        # The chosen artifacts belong in the name. Two `deep` runs on the same game -
        # the card, then the offensive board - otherwise share one stem, and because a
        # canvas step-down deletes the file it is replacing, the second run silently
        # destroyed the first run's post. Same convention `compose` already uses.
        out.append((f"deep_{g['Away']}{g['Home']}_" + "_".join(chosen)[:40], payload))
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
    src = cap.grab("team_rankings", extra={"family": key, "window": window},
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
                    help="cap table rows - rankings (starters default 14, team all 30) "
                         "and compose (overrides the artifact's own row cap)")
    ap.add_argument("--rows-from", type=int, metavar="N", dest="rows_from",
                    help="compose: hide rows ABOVE N, so a long board ships as two "
                         "slides. '--rows 16' then '--rows-from 17' splits a 32-row "
                         "ranking in half with the site's own rank numbers intact.")
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
                         "rails cover real pixels. See video/src/graphics/ShowTemplate.")
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

    day = a.date
    try:
        date_label = datetime.strptime(day, "%Y-%m-%d").strftime("%B %-d, %Y")
    except ValueError:
        date_label = datetime.strptime(day, "%Y-%m-%d").strftime("%B %d, %Y").replace(" 0", " ")
    # Which sport's fixtures does --games name? Only `compose` can reach another
    # sport's board, so every other command is baseball by definition.
    league = games_league(a.artifacts) if a.command == "compose" else "mlb"
    if league != "mlb":
        # An NFL post reads nothing from this repo's baseball pipeline, so a stale or
        # missing MLB slate must not block it.
        slate = []
        games = resolve_nfl_games(a.games)
    else:
        # Only a post that shows an MLB game needs the MLB slate; --games is how the
        # caller says so. Everything except `compose` is a matchup command by
        # definition.
        needs_slate = a.command != "compose" or bool(a.games)
        slate = read_slate(day, required=needs_slate)
        games = resolve_games(slate, a.games) if slate else []
        if needs_slate and not games:
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
                    write_video_directive(day, stem, payload, a.video_platform)
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
