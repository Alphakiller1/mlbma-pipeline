#!/usr/bin/env python3
"""Sync the desk header into every page that carries the shared Chase nav.

The public header was duplicated by hand across ~28 files, so a nav change had
to be repeated 28 times and drifted. This rewrites the `.chase-nav-links` block
from one template, the way scripts/integrate_chase_nav.py already syncs the
surrounding nav.

Shape follows the reference top chrome: brand, product label, sport switcher,
search, Glossary. The Model Center action and the account chip live outside this
block, in each page's own nav markup.

`/render/` capture targets are skipped - they must stay pixel-stable.
"""
from __future__ import annotations

import argparse
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]

# All four sport tabs, per the reference chrome. WNBA and CFB are parked - their
# pages say so plainly - and carry data-state="upcoming" so the switcher shows
# them muted rather than implying a slate exists.
# scripts/validate_public_fields.py still blocks promoting them inside page
# CONTENT; appearing in the switcher is not a claim that data is published.
SPORTS = [
    ("mlb", "MLB", "/mlb/", "live"),
    ("nfl", "NFL", "/nfl/", "live"),
]

SEARCH_ICON = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    'stroke-linecap="round" aria-hidden="true">'
    '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>'
)

NAV_LINKS_RE = re.compile(r'[ \t]*<div class="chase-nav-links">.*?</div>\n', re.DOTALL)


def nav_block(indent: str) -> str:
    pad = indent + "  "
    lines = [indent + '<div class="chase-nav-links">']
    lines.append(pad + '<nav class="chase-sport-tabs" aria-label="Sport">')
    for key, label, href, state in SPORTS:
        lines.append(
            pad + '  <a href="' + href + '" class="chase-sport-tab" data-nav="'
            + key + '" data-state="' + state + '">' + label + '</a>'
        )
    lines.append(pad + '</nav>')
    lines.append(pad + '<label class="chase-nav-search">')
    lines.append(pad + '  <span class="sr-only">Search teams, players or ballparks</span>')
    lines.append(pad + '  ' + SEARCH_ICON)
    lines.append(pad + '  <input type="search" id="chaseNavSearch" autocomplete="off"')
    lines.append(pad + '    placeholder="Search teams, players, ballparks...">')
    lines.append(pad + '</label>')
    lines.append(
        pad + '<a href="/dashboard/glossary" class="chase-nav-link" data-nav="glossary">Glossary</a>'
    )
    lines.append(indent + '</div>')
    return "\n".join(lines) + "\n"


def patch(path: pathlib.Path, write: bool) -> bool:
    text = path.read_text(encoding="utf-8")
    match = NAV_LINKS_RE.search(text)
    if not match:
        return False
    indent = re.match(r"[ \t]*", match.group(0)).group(0)
    replacement = nav_block(indent)
    if match.group(0) == replacement:
        return False
    if write:
        path.write_text(text[: match.start()] + replacement + text[match.end():], encoding="utf-8")
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    targets = sorted(
        p
        for p in ROOT.rglob("*.html")
        if 'class="chase-nav-links"' in p.read_text(encoding="utf-8", errors="ignore")
        and "/render/" not in p.as_posix()
        and "node_modules" not in p.as_posix()
    )
    changed = [p for p in targets if patch(p, write=not args.dry_run)]
    for p in changed:
        print("patched", p.relative_to(ROOT).as_posix())
    verb = "would change" if args.dry_run else "changed"
    print(str(len(changed)) + " of " + str(len(targets)) + " files " + verb)
    return 0


if __name__ == "__main__":
    sys.exit(main())
