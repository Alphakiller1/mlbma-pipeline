"""Covers matchup-page injury rows (owner 2026-11-12: CBB reports not populating).

The page moved the date into the status cell (a .mobile-date span) and the
note into a collapsed row behind an expand button; the parser read the
injury as "Illness (Nov 07, '26)" and the note as "Expand".
"""
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT))

import publish_public_cbb_availability as cbb  # noqa: E402

PAGE = """<html><head><script type="application/ld+json">{"@type": "SportsEvent",
 "startDate": "11/12/2026 19:00:00 -05:00", "awayTeam": {"name": "Richmond Spiders"},
 "homeTeam": {"name": "Penn State Nittany Lions"}}</script></head><body>
<section class="away-team-section"><h3>Richmond Injuries</h3><table><tbody>
<tr> <td> <strong> <a href="/sport/basketball/ncaab/players/375358/jack-mccaffery"> J. McCaffery </a> </strong> </td>
 <td>F</td> <td>Out - Illness<span class="mobile-date">( Nov 07, '26)</span></td> <td> Nov 07, '26</td>
 <td> <button aria-controls="injuryCollapseARICH0" class="injury-expand-btn"> <span class="sr-only">Expand</span> </button> </td> </tr>
<tr class="collapse injury-note-row" id="injuryCollapseARICH0"> <td colspan="5">McCaffery will not take the court for the Spiders.</td> </tr>
</tbody></table></section>
<section class="home-team-section"><h3>Penn State Injuries</h3><table><tbody>
<tr> <td colspan="5">No injuries to report.</td> </tr></tbody></table></section></body></html>"""


class Response:
    content = PAGE.encode()


def test_status_injury_and_note_come_through_clean(monkeypatch):
    monkeypatch.setattr(cbb, "get", lambda url: Response())
    game = {"id": "401911239", "away": "257", "home": "213"}
    fixtures = [(game, {"richmondspiders"}, {"pennstatenittanylions"})]
    now = datetime(2026, 11, 12, 15, 0, tzinfo=cbb.ET)
    check, entries = cbb.covers_fixture("https://www.covers.com/sport/basketball/ncaab/matchup/1", fixtures, now)
    assert check["away_listings"] == 1 and check["home_listings"] == 0
    team, row = entries[0]
    assert team == "257"
    assert (row["player"], row["status"], row["injury"]) == ("jack-mccaffery", "Out", "Illness")
    assert row["detail"] == "McCaffery will not take the court for the Spiders."
