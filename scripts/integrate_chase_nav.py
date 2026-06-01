#!/usr/bin/env python3
"""Sync Chase navigation + design system links across dashboard HTML files."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASH = ROOT / "dashboard"
NAV_HTML = (DASH / "chase_nav.html").read_text(encoding="utf-8").strip()

PAGES = [
    "index.html",
    "chase_analytics_mlb_oem_v7.html",
    "model_report.html",
    "matchup_compare.html",
    "matchup_sheet.html",
    "pitcher_profile.html",
    "batter_profile.html",
    "reliever_profile.html",
    "bullpen_report.html",
    "team_profile.html",
    "glossary.html",
]

CHASE_CSS = '<link rel="stylesheet" href="chase_nav.css">'
DESIGN_CSS = '<link rel="stylesheet" href="mlbma_design_system.css">'
RESEARCH_CSS = '<link rel="stylesheet" href="research_lab.css">'
FAVICON = '<link rel="icon" type="image/png" href="assets/chase-icon-filled.png">'
CHASE_JS = '<script src="chase_nav.js"></script>'
ASSETS_JS = '<script src="mlbma_assets.js"></script>'

NAV_BLOCK_RE = re.compile(
    r'(?:<!-- Chase Analytics navigation[^\n]*\n)?'
    r'<header class="chase-header" id="chaseHeader">[\s\S]*?'
    r'</header>\s*\n'
    r'<div class="chase-mobile-overlay"[\s\S]*?'
    r'<span id="mobileLastUpdated">[^<]*</span>[\s\S]*?'
    r'(?=\s*<script|\s*<div class="container"|\s*<div class="mr-page"|\s*<main[\s>]|\s*<div id="compareRoot")',
    re.MULTILINE,
)

# Truncated drawer — mobile menu never closed (content nested inside hidden panel).
NAV_BLOCK_TRUNCATED_RE = re.compile(
    r'(?:<!-- Chase Analytics navigation[^\n]*\n)?'
    r'<header class="chase-header" id="chaseHeader">[\s\S]*?'
    r'</header>\s*\n'
    r'<div class="chase-mobile-overlay"[\s\S]*?'
    r'<div class="chase-mobile-brand"[\s\S]*?</div>\s*\n'
    r'(?=\s*<script|\s*<div class="container"|\s*<div class="mr-page"|\s*<main[\s>]|\s*<div id="compareRoot")',
    re.MULTILINE,
)

MOBILE_DRAWER_TAIL = (
    "  <div class=\"chase-mobile-nav\">\n"
    "    <a href=\"chase_analytics_mlb_oem_v7.html\" class=\"chase-mobile-link\" data-nav=\"opening\">Opening Dashboard</a>\n"
    "    <a href=\"chase_analytics_mlb_oem_v7.html#section-matchups-hero\" class=\"chase-mobile-link\" data-nav=\"matchups\">Matchups</a>\n"
    "    <a href=\"team_rankings.html\" class=\"chase-mobile-link\" data-nav=\"team-rankings\">Team Rankings</a>\n"
    "    <a href=\"chase_analytics_mlb_oem_v7.html#section-research-lab\" class=\"chase-mobile-link\" data-nav=\"research\">Research Lab</a>\n"
    "    <div class=\"chase-mobile-section\">Profiles</div>\n"
    "    <a href=\"team_profile.html\" class=\"chase-mobile-link\">Team Profile</a>\n"
    "    <a href=\"pitcher_profile.html\" class=\"chase-mobile-link\">Pitcher Profile</a>\n"
    "    <a href=\"bullpen_report.html\" class=\"chase-mobile-link\">Bullpen Report</a>\n"
    "    <a href=\"batter_profile.html\" class=\"chase-mobile-link\">Batter Profile</a>\n"
    "    <a href=\"reliever_profile.html\" class=\"chase-mobile-link\">Reliever Profile</a>\n"
    "    <a href=\"glossary.html\" class=\"chase-mobile-link\" data-nav=\"glossary\">Glossary</a>\n"
    "    <a href=\"model_report.html\" class=\"chase-mobile-link\" data-nav=\"model-report\">Model Report</a>\n"
    "  </div>\n"
    "  <div class=\"chase-mobile-status\">\n"
    "    <div class=\"chase-timestamp\">\n"
    "      <span class=\"chase-pipeline-dot\" title=\"Pipeline: Fresh\"></span>\n"
    "      <span id=\"mobileLastUpdated\">syncing…</span>\n"
    "    </div>\n"
    "  </div>\n"
    "</div>\n\n"
)

TRAILING_NAV_DIV_RE = re.compile(
    r'(?:</div>\s*){1,12}(?=\s*<script|\s*<div class="container"|\s*<div class="mr-page"|\s*<main[\s>]|\s*<div id="compareRoot")',
    re.MULTILINE,
)

# Leftover fragment when an older regex stopped at the first </div> inside the drawer.
ORPHAN_MOBILE_NAV_RE = re.compile(
    r'\n\s*<div class="chase-mobile-nav">[\s\S]*?'
    r'<span id="mobileLastUpdated">[^<]*</span>\s*</div>\s*</div>\s*</div>\s*\n',
    re.MULTILINE,
)


def ensure_head_links(html: str) -> str:
    if DESIGN_CSS not in html:
        if '<link rel="stylesheet" href="mlbma_ui.css">' in html:
            html = html.replace(
                '<link rel="stylesheet" href="mlbma_ui.css">',
                '<link rel="stylesheet" href="mlbma_ui.css">\n' + DESIGN_CSS,
                1,
            )
        elif "</head>" in html:
            html = html.replace("</head>", f"  {DESIGN_CSS}\n</head>", 1)
    if "chase_nav.css" not in html:
        if DESIGN_CSS in html:
            html = html.replace(DESIGN_CSS, DESIGN_CSS + "\n" + CHASE_CSS, 1)
        elif '<link rel="stylesheet" href="mlbma_ui.css">' in html:
            html = html.replace(
                '<link rel="stylesheet" href="mlbma_ui.css">',
                '<link rel="stylesheet" href="mlbma_ui.css">\n' + CHASE_CSS,
                1,
            )
        elif "</head>" in html:
            html = html.replace("</head>", f"  {CHASE_CSS}\n</head>", 1)
    if FAVICON not in html and "</head>" in html:
        html = html.replace("</head>", f"  {FAVICON}\n</head>", 1)
    if ASSETS_JS not in html and "mlbma_config.js" in html:
        html = html.replace(
            '<script src="mlbma_config.js"></script>',
            '<script src="mlbma_config.js"></script>\n' + ASSETS_JS,
            1,
        )
    return html


def ensure_body_script(html: str) -> str:
    if "chase_nav.js" in html:
        return html
    if "</body>" in html:
        return html.replace("</body>", f"  {CHASE_JS}\n</body>", 1)
    return html


def replace_nav_wrap(html: str) -> str:
    for old in (
        '  <div class="mlbma-nav-wrap" data-mlbma-nav></div>\n',
        '    <div class="mlbma-nav-wrap" data-mlbma-nav></div>\n',
    ):
        if old in html:
            html = html.replace(old, "", 1)
    return html


NAV_COMMENT = "<!-- Chase Analytics navigation — synced via scripts/integrate_chase_nav.py -->\n"
NAV_COMMENT_RE = re.compile(
    r"(?:<!-- Chase Analytics navigation[^\n]*\n)+",
    re.MULTILINE,
)


def dedupe_nav_comments(html: str) -> str:
    if 'id="chaseHeader"' not in html:
        return html
    return NAV_COMMENT_RE.sub(NAV_COMMENT, html, count=1)


def strip_orphan_mobile_nav(html: str) -> str:
    prev = None
    while prev != html:
        prev = html
        html = ORPHAN_MOBILE_NAV_RE.sub("\n", html)
    return html


def strip_trailing_nav_divs(html: str) -> str:
    return TRAILING_NAV_DIV_RE.sub("", html, count=1)


def ensure_mobile_nav_complete(html: str) -> str:
    """Repair nav when mobile drawer was truncated (missing links + closing divs)."""
    if 'id="chaseHeader"' not in html or 'class="chase-mobile-nav"' in html:
        return html
    broken = re.compile(
        r'(<div class="chase-mobile-brand"[\s\S]*?</div>\s*)\n'
        r'(?=\s*<script|\s*<div class="container"|\s*<div class="mr-page"|\s*<main[\s>]|\s*<div id="compareRoot")',
        re.MULTILINE,
    )
    if broken.search(html):
        html = broken.sub(r"\1\n" + MOBILE_DRAWER_TAIL, html, count=1)
    return html


def sync_nav_block(html: str) -> str:
    if 'id="chaseHeader"' not in html:
        return html
    html = dedupe_nav_comments(html)
    html = strip_orphan_mobile_nav(html)
    if NAV_BLOCK_RE.search(html):
        html = NAV_BLOCK_RE.sub(NAV_HTML + "\n", html, count=1)
    elif NAV_BLOCK_TRUNCATED_RE.search(html):
        html = NAV_BLOCK_TRUNCATED_RE.sub(NAV_HTML + "\n", html, count=1)
    html = strip_orphan_mobile_nav(html)
    html = ensure_mobile_nav_complete(html)
    return dedupe_nav_comments(html)


def insert_nav_at_body(html: str) -> str:
    if 'id="chaseHeader"' in html:
        return html
    m = re.search(r"<body>\s*\n", html)
    if not m:
        return html
    pos = m.end()
    chunk = html[pos : pos + 400]
    if re.search(r'<div class="loading', chunk):
        m2 = re.search(
            r'<div class="loading[^"]*"[\s\S]*?</div>\s*\n|'
            r'<div class="loading-text"[^>]*>[\s\S]*?</div>\s*\n',
            chunk,
        )
        if m2:
            pos += m2.end()
    return html[:pos] + NAV_HTML + "\n\n" + html[pos:]


def main() -> None:
    for name in PAGES:
        path = DASH / name
        if not path.exists():
            print(f"SKIP missing {name}")
            continue
        text = path.read_text(encoding="utf-8")
        orig = text
        text = ensure_head_links(text)
        text = replace_nav_wrap(text)
        text = strip_orphan_mobile_nav(text)
        text = sync_nav_block(text)
        text = insert_nav_at_body(text)
        text = ensure_body_script(text)
        if text != orig:
            path.write_text(text, encoding="utf-8", newline="\n")
            print(f"OK {name}")
        else:
            print(f"UNCHANGED {name}")


if __name__ == "__main__":
    main()
