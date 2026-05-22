#!/usr/bin/env python3
"""Replace mlbma-nav-wrap with Chase v0 navigation in dashboard HTML files."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASH = ROOT / "dashboard"
NAV_HTML = (DASH / "chase_nav.html").read_text(encoding="utf-8").strip()

PAGES = [
    "chase_analytics_mlb_oem_v7.html",
    "matchup_sheet.html",
    "pitcher_profile.html",
    "batter_profile.html",
    "reliever_profile.html",
    "bullpen_report.html",
    "team_profile.html",
    "player_search.html",
    "glossary.html",
]

CHASE_CSS = '<link rel="stylesheet" href="chase_nav.css">'
CHASE_JS = '<script src="chase_nav.js"></script>'


def ensure_head_links(html: str) -> str:
    if "chase_nav.css" not in html:
        if '<link rel="stylesheet" href="mlbma_ui.css">' in html:
            html = html.replace(
                '<link rel="stylesheet" href="mlbma_ui.css">',
                '<link rel="stylesheet" href="mlbma_ui.css">\n' + CHASE_CSS,
                1,
            )
        elif "</head>" in html:
            html = html.replace("</head>", f"  {CHASE_CSS}\n</head>", 1)
    return html


def ensure_body_script(html: str) -> str:
    if "chase_nav.js" in html:
        return html
    if "</body>" in html:
        return html.replace("</body>", f"  {CHASE_JS}\n</body>", 1)
    return html


def replace_nav_wrap(html: str) -> str:
    """Remove legacy nav placeholder; nav is inserted at top of body."""
    for old in (
        '  <div class="mlbma-nav-wrap" data-mlbma-nav></div>\n',
        '    <div class="mlbma-nav-wrap" data-mlbma-nav></div>\n',
    ):
        if old in html:
            html = html.replace(old, "", 1)
    return html


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
        text = insert_nav_at_body(text)
        text = ensure_body_script(text)
        if text != orig:
            path.write_text(text, encoding="utf-8", newline="\n")
            print(f"OK {name}")
        else:
            print(f"UNCHANGED {name}")


if __name__ == "__main__":
    main()
