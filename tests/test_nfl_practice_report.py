"""Official daily participation and later game-specific status changes."""
from datetime import datetime
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

from outputs import nfl_practice_report as practice

ROOT = Path(__file__).resolve().parents[1]
PAGE = (ROOT / "tests/fixtures/nfl_club_practice_report.html").read_text()
KICKOFF = "2026-11-22T18:00:00Z"


class WeeklyPracticeTests(unittest.TestCase):
    def parse(self, page=PAGE, kickoff=KICKOFF):
        return practice.parse(page, season=2026, week=11, kickoff=kickoff, source_url="https://www.panthers.com/team/injury-report/week/REG-11")

    def test_counts_real_participation_and_preserves_each_date(self):
        rows = self.parse()
        player = rows["CAR"]["limitedtightend"]
        self.assertEqual([row["date"] for row in player["history"]], ["2026-11-18", "2026-11-19", "2026-11-20"])
        self.assertEqual((player["participated"], player["limited"], player["dnp"], player["reported"]), (2, 2, 1, 3))
        pending = rows["BAL"]["pendingdefender"]
        self.assertEqual([row["status"] for row in pending["history"]], ["Not listed", "Full", "Pending"])
        self.assertEqual((pending["reported"], pending["participated"], pending["dnp"]), (1, 1, 0))

    def test_monday_night_uses_the_local_game_date(self):
        page = PAGE.replace("Wed", "Thu").replace("Fri", "Sat")
        # Replace the original Thursday column separately to preserve Thu/Fri/Sat.
        page = page.replace("<th>Thu</th><th>Thu</th>", "<th>Thu</th><th>Fri</th>")
        row = self.parse(page, "2026-11-24T01:15:00Z")["CAR"]["limitedtightend"]
        self.assertEqual([day["date"] for day in row["history"]], ["2026-11-19", "2026-11-20", "2026-11-21"])

    def test_wrong_week_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "different week"):
            self.parse(PAGE.replace("REG-11", "REG-10"))

    def test_source_outage_keeps_only_the_same_week(self):
        saved = {"season": 2026, "week": 11, "teams": self.parse()}
        fixture = [{"away": "BAL", "home": "CAR", "kickoff_utc": KICKOFF}]
        with patch("urllib.request.urlopen", side_effect=OSError("offline")):
            current = practice.collect(fixture, 2026, 11, saved)
            next_week = practice.collect(fixture, 2026, 12, saved)
        self.assertEqual(current["teams"], saved["teams"])
        self.assertEqual(next_week["teams"], {})
        self.assertTrue(current["warnings"])

    def test_explicit_late_rule_out_wins_while_a_return_window_alone_does_not(self):
        row = self.parse()["CAR"]["returnwindowback"]
        update = {"status": "Injured Reserve", "updated_at_utc": "2026-11-21T21:13:00Z", "announced_out": True}
        self.assertTrue(practice.post_practice_update(update, row, KICKOFF, datetime.fromisoformat("2026-11-22T05:00:00+00:00")))
        self.assertFalse(practice.post_practice_update(update, row, KICKOFF, datetime.fromisoformat("2026-11-21T18:00:00+00:00")))
        self.assertFalse(practice.post_practice_update({**update, "announced_out": False}, row, KICKOFF))
        self.assertFalse(practice.post_practice_update({**update, "updated_at_utc": "2026-11-19T21:13:00Z"}, row, KICKOFF))
        self.assertFalse(practice.post_practice_update({**update, "updated_at_utc": "2026-11-23T21:13:00Z"}, row, KICKOFF))

    def test_worker_parser_and_downgrade_policy_agree(self):
        code = """
        import assert from 'node:assert/strict'; import fs from 'node:fs';
        import {parseNflPractice,nflPostPracticeUpdate} from './functions/_shared/nfl_practice.js';
        import {mergeNflReports} from './functions/api/nfl-availability.js';
        const kickoff='2026-11-22T18:00:00Z';
        const rows=parseNflPractice(fs.readFileSync('tests/fixtures/nfl_club_practice_report.html','utf8'),
          {season:2026,week:11,kickoff,sourceUrl:'https://www.panthers.com/team/injury-report/week/REG-11'});
        assert.deepEqual(rows.CAR.limitedtightend.history.map(d=>d.date),['2026-11-18','2026-11-19','2026-11-20']);
        assert.equal(rows.CAR.limitedtightend.limited,2);
        assert.equal(rows.BAL.pendingdefender.reported,1);
        const update={name:'Return Window Back',status:'Injured Reserve',roster:true,announced_out:true,updated_at_utc:'2026-11-21T21:13:00Z'};
        assert.equal(nflPostPracticeUpdate(update,rows.CAR.returnwindowback,kickoff,Date.parse('2026-11-22T05:00:00Z')),true);
        const original=Date.now; Date.now=()=>Date.parse('2026-11-22T05:00:00Z');
        const merged=mergeNflReports([{name:update.name,status:'Questionable',practice:'Full'}],[update],rows.CAR,kickoff);
        Date.now=original;
        assert.equal(merged[0].status,'Injured Reserve');
        assert.equal(merged[0].practice_report.participated,3);
        console.log(JSON.stringify(rows.CAR.limitedtightend.history));
        """
        result = subprocess.run(["node", "--input-type=module", "-e", code], cwd=ROOT, capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), self.parse()["CAR"]["limitedtightend"]["history"])

    def test_announced_rule_out_survives_an_outage_but_not_a_new_fixture(self):
        code = """
        import assert from 'node:assert/strict'; globalThis.window=globalThis;
        await import('./dashboard/player_availability_shared.js');
        const prior={name:'Late Rule Out',status:'Injured Reserve',announced_out:true,
          updated_at_utc:'2026-11-21T21:13:00Z',practice_report:{season:2026,week:11},snap_counts:{total:33}};
        const game={away_availability_list:[prior]};
        const outage={players:[],coverage:'official',has_roster_updates:true,has_dated_updates:false,season:2026,week:11};
        ChasePlayerAvailability.applyNflReport(game,'away',outage,[prior]);
        assert.equal(game.away_availability_list[0].status,'Injured Reserve');
        ChasePlayerAvailability.applyNflReport(game,'away',{...outage,week:12},[prior]);
        assert.deepEqual(game.away_availability_list,[]);
        """
        result = subprocess.run(["node", "--input-type=module", "-e", code], cwd=ROOT, capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
