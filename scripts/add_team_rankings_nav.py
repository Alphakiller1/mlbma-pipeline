#!/usr/bin/env python3
"""Insert Team Rankings nav link after Matchups on dashboard pages."""
from pathlib import Path

DASH = Path(__file__).resolve().parents[1] / "dashboard"
OLD_DESK = (
    '      <a href="chase_analytics_mlb_oem_v7.html#section-matchups-hero" class="chase-nav-link" data-nav="matchups">Matchups</a>\n'
    '      <a href="chase_analytics_mlb_oem_v7.html#section-research-lab"'
)
NEW_DESK = (
    '      <a href="chase_analytics_mlb_oem_v7.html#section-matchups-hero" class="chase-nav-link" data-nav="matchups">Matchups</a>\n'
    '      <a href="matchup_sheet.html" class="chase-nav-link" data-nav="team-rankings">Team Rankings</a>\n'
    '      <a href="chase_analytics_mlb_oem_v7.html#section-research-lab"'
)
OLD_MOB = (
    '    <a href="chase_analytics_mlb_oem_v7.html#section-matchups-hero" class="chase-mobile-link" data-nav="matchups">Matchups</a>\n'
    '    <a href="chase_analytics_mlb_oem_v7.html#section-research-lab"'
)
NEW_MOB = (
    '    <a href="chase_analytics_mlb_oem_v7.html#section-matchups-hero" class="chase-mobile-link" data-nav="matchups">Matchups</a>\n'
    '    <a href="matchup_sheet.html" class="chase-mobile-link" data-nav="team-rankings">Team Rankings</a>\n'
    '    <a href="chase_analytics_mlb_oem_v7.html#section-research-lab"'
)
SKIP = {"chase_nav.html", "matchup_sheet.html"}

for path in DASH.glob("*.html"):
    if path.name in SKIP:
        continue
    text = path.read_text(encoding="utf-8")
    if "Team Rankings" in text:
        continue
    updated = text.replace(OLD_DESK, NEW_DESK).replace(OLD_MOB, NEW_MOB)
    if updated != text:
        path.write_text(updated, encoding="utf-8")
        print("OK", path.name)
