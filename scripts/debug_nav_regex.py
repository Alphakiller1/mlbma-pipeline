import re
from pathlib import Path

html = Path("dashboard/chase_analytics_mlb_oem_v7.html").read_text(encoding="utf-8")
NAV_BLOCK_RE = re.compile(
    r'(?:<!-- Chase Analytics navigation[^\n]*\n)?'
    r'<header class="chase-header" id="chaseHeader">[\s\S]*?'
    r'</header>\s*\n'
    r'<div class="chase-mobile-overlay"[\s\S]*?'
    r'<span id="mobileLastUpdated">[^<]*</span>[\s\S]*?'
    r'(?=\s*<script|\s*<div class="container"|\s*<div class="mr-page"|\s*<main |\s*<div id="compareRoot")',
    re.MULTILINE,
)
m = NAV_BLOCK_RE.search(html)
print("NAV_BLOCK_RE match", bool(m))
if m:
    print("len", len(m.group(0)))
    print("tail", repr(m.group(0)[-120:]))
