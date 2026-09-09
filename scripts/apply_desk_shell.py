#!/usr/bin/env python3
"""Sync the desk header (sport switcher + search) into every page that carries
the shared Chase nav.

The public header was duplicated by hand across ~28 files, so a nav change had
to be repeated 28 times and drifted. This rewrites the `.chase-nav-links` block
from one template, the same way scripts/integrate_chase_nav.py already syncs the
surrounding nav.

Nav shape follows design/GPT_IMAGE_PROMPTS_CHASE_DESK.md: brand, sport
switcher, search, Glossary, and one Model Center button at the far right.
`/render/` capture targets are skipped — they must stay pixel-stable.
"""
from __future__ import annotations

import argparse
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]

# The reference renderings show four sport tabs. Only MLB and NFL ship here:
# /wnba/ and /cfb/ are parked routes whose whole content is "not on the public
# desk", so promoting them to the primary switcher would advertise two dead
# ends. scripts/validate_public_fields.py enforces this, and the 2026-09-09
# visual audit raised the same finding (S4). To ship them later, add the tuple
# here and drop the sport from the validator's parked list.
SPORTS = [
    ("mlb", "MLB", "/mlb/", "live"),
    ("nfl", "NFL", "/nfl/", "live"),
]

NAV_LINKS_RE = re.compile(
    r'[ \t]*<div class="chase-nav-links">.*?</div>\n', re.DOTALL
)


def nav_block(indent: str) -> str:
    pad = indent + "  "
    tabs = "\n".join(
        f'{pad}  <a href="{href}" class="chase-sport-tab" data-nav="{key}" '
        f'data-state="{state}">{label}</a>'
        for key, label, href, state in SPORTS
    )
    return (
        f'{indent}<div class="chase-nav-links">\n'
        f'{pad}<span class="chase-nav-product">Matchup research</span>\n'
        f'{pad}<span class="chase-nav-rule" aria-hidden="true"></span>\n'
        f'{pad}<nav class="chase-sport-tabs" aria-label="Sport">\n'
        f'{tabs}\n'
        f'{pad}</nav>\n'
        # The renderings put a search field in the header. The slate pages
        # already carry a working one in .ca-desk-toolbar that filters the
        # loaded games; a second header field would be a control that does
        # nothing, so the toolbar keeps ownership of search.
        f'{pad}<a href="/#matchupDesk" class="chase-nav-link" '
        f'data-nav="matchups">Matchups</a>\n'
        f'{pad}<a href="/dashboard/glossary" class="chase-nav-link" '
        f'data-nav="glossary">Glossary</a>\n'
        f'{indent}</div>\n'
    )


def patch(path: pathlib.Path, write: bool) -> bool:
    text = path.read_text(encoding="utf-8")
    match = NAV_LINKS_RE.search(text)
    if not match:
        return False
    indent = re.match(r"[ \t]*", match.group(0)).group(0)
    replacement = nav_block(indent)
    if match.group(0) == replacement:
        return False
    updated = text[: match.start()] + replacement + text[match.end() :]
    if write:
        path.write_text(updated, encoding="utf-8")
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
    print(f"{len(changed)} of {len(targets)} files {'would change' if args.dry_run else 'changed'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
