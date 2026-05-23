#!/usr/bin/env python3
"""Repair truncated Chase mobile nav blocks on dashboard HTML pages."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASH = ROOT / "dashboard"
NAV_HTML = (DASH / "chase_nav.html").read_text(encoding="utf-8").strip()
NAV_COMMENT = "<!-- Chase Analytics navigation — synced via scripts/integrate_chase_nav.py -->\n"

# Match nav from comment/header through mobile drawer (complete or truncated).
NAV_TO_CONTENT_RE = re.compile(
    r"(?:<!-- Chase Analytics navigation[^\n]*\n)?"
    r'<header class="chase-header" id="chaseHeader">[\s\S]*?'
    r"(?=\s*<script|\s*<div class=\"container\"|\s*<div class=\"mr-page\"|\s*<main |\s*<div id=\"compareRoot\"|\s*<div id=\"hubLoading\")",
    re.MULTILINE,
)

PAGES = list(DASH.glob("*.html"))


def needs_repair(html: str) -> bool:
    if 'id="chaseHeader"' not in html:
        return False
    return 'id="mobileLastUpdated"' not in html or 'class="chase-mobile-nav"' not in html


def repair(html: str) -> str:
    if not needs_repair(html):
        return html
    if not NAV_TO_CONTENT_RE.search(html):
        return html
    return NAV_TO_CONTENT_RE.sub(NAV_COMMENT + NAV_HTML + "\n\n", html, count=1)


def main() -> None:
    for path in sorted(PAGES):
        text = path.read_text(encoding="utf-8")
        fixed = repair(text)
        if fixed != text:
            path.write_text(fixed, encoding="utf-8", newline="\n")
            print("REPAIRED", path.name)
        else:
            print("ok", path.name)


if __name__ == "__main__":
    main()
