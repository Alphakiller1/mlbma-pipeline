"""Source-specific checks for the active matchup injury endpoints."""
from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]


class LiveMatchupReportsTests(unittest.TestCase):
    def run_js(self, source):
        result = subprocess.run(
            ["node", "--input-type=module", "-e", source],
            cwd=ROOT, capture_output=True, text=True, timeout=15,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_nfl_inactives_override_practice_and_previous_game_statuses_do_not(self):
        self.run_js("""
            import assert from 'node:assert/strict';
            import { mergeNflReports } from './functions/api/nfl-availability.js';
            const current = [
              {name:'Practiced Player', status:'', practice:'Full'},
              {name:'Ruled Out Player', status:'Out', practice:'DNP'},
              {name:'Questionable Player', status:'Questionable', practice:'Limited'}
            ];
            const espn = [
              {name:'Practiced Player',status:'Out'},
              {name:'Questionable Player',status:'Inactive',inactive:true},
              {name:'Reserve Player',status:'Injured Reserve',roster:true}
            ];
            const merged = mergeNflReports(current, espn);
            assert.deepEqual(merged.map(row => row.status),['Out','Inactive','Injured Reserve']);
            assert.equal(merged[1].practice,'Limited');
        """)

    def test_nfl_official_clearance_wins_even_when_no_teammate_has_a_game_designation(self):
        self.run_js("""
            import assert from 'node:assert/strict';
            import { mergeNflReports } from './functions/api/nfl-availability.js';
            const cleared = [{name:'Cleared Quarterback',status:'',practice:'Full'}];
            const old = [{name:'Cleared Quarterback',status:'Out'}];
            assert.deepEqual(mergeNflReports(cleared, old), []);
            assert.deepEqual(mergeNflReports([], old), []);
            assert.equal(mergeNflReports(undefined, old)[0].status, 'Out');
            assert.equal(mergeNflReports(cleared, [{...old[0],status:'Inactive',inactive:true}])[0].status, 'Inactive');
        """)

    def test_nfl_cards_and_analysis_share_clearance_and_backup_selection(self):
        self.run_js("""
            import assert from 'node:assert/strict';
            globalThis.window = globalThis;
            await import('./dashboard/player_availability_shared.js');
            const policy = ChasePlayerAvailability;
            const first = {name:'Starting Quarterback',position:'QB',depth_rank:1,injury_status:'Out'};
            const backup = {name:'Backup Quarterback',position:'QB',depth_rank:2};
            const game = {away_players:[first,backup],away_availability_list:[
              {name:first.name,position:'QB',status:'Out',value:2.1}
            ]};
            const saved = game.away_availability_list;
            assert.equal(policy.nflStarter(game,'away','QB'),backup);
            policy.applyNflReport(game,'away',{players:[],coverage:'official',has_roster_updates:true},saved);
            assert.equal(policy.nflStarter(game,'away','QB'),first);
            assert.equal(game.away_availability,'No designations listed');
            policy.applyNflReport(game,'away',{players:[{name:first.name,position:'QB',status:'Inactive'}],
              coverage:'official',has_roster_updates:true},saved);
            assert.equal(policy.nflStarter(game,'away','QB'),backup);
            assert.equal(game.away_availability_list[0].value,2.1);
            assert.equal(game.away_availability,'1 inactive');
            globalThis.document = {addEventListener(){}};
            await import('./dashboard/matchup_card.js');
            const html = ChaseMatchupCard.cardHtml('nfl', {...game,id:'1',away:'AWY',home:'HME',
              home_availability_list:[]});
            assert.ok(html.includes('1 inactive'));
            assert.ok(!html.includes('Availability Report Pending'));
        """)

    def test_nba_pdf_keeps_date_and_club_and_preserves_reported_status(self):
        self.run_js("""
            import assert from 'node:assert/strict';
            import { parseNbaReport } from './functions/api/nba-availability.js';
            const x = [23, 200, 264, 425, 586, 666];
            const line = (y, ...cells) => cells.flatMap((str,i) => str ?
              [{str, transform:[1,0,0,1,x[i],y]}] : []);
            const report = parseNbaReport([[
              ...line(480, 'Game','Matchup','Team','Player','Current','Reason'),
              ...line(462, '','','','','','Injury/Illness - Left ankle'),
              ...line(455, '11/21/2026','MIL@NYK','Milwaukee Bucks','Player, Test','Questionable',''),
              ...line(448, '','','','','','sprain'),
              ...line(430, '','','New York Knicks','','','NOT YET SUBMITTED'),
              ...line(407, '11/22/2026','MIL@NYK','Milwaukee Bucks','Player, Test','Available','')
            ]]);
            assert.equal(report['2026-11-21/MIL@NY'].milwaukeebucks[0].reason, 'Injury/Illness - Left ankle sprain');
            assert.equal(report['2026-11-21/MIL@NY'].milwaukeebucks[0].status, 'Questionable');
            assert.equal(report['2026-11-21/MIL@NY'].newyorkknicks, undefined);
            assert.equal(report['2026-11-22/MIL@NY'].milwaukeebucks[0].status, 'Available');
        """)

    def test_cbb_requires_unique_roster_matches_and_preserves_verified_empty(self):
        self.run_js("""
            import assert from 'node:assert/strict';
            import { cbbRoster, coversReport, verifiedCbbPlayers } from './functions/api/cbb-availability.js';
            const roster = cbbRoster({team:{id:4,location:'College'}, season:{year:2027}, athletes:[
              {id:1, displayName:'John Player'}, {id:2,displayName:'Duplicate Name'}, {id:3,displayName:'Duplicate Name'}
            ]}, '4', 2027);
            const candidates = [{name:'John Player',status:'Out'}, {name:'Duplicate Name',status:'Out'},
              {name:'John Player Jr.',status:'Out'}];
            assert.deepEqual(verifiedCbbPlayers(candidates, roster, Date.now()).map(row => row.player_id), ['1']);
            const html = '<script data-react-helmet="true" type="application/ld+json">' +
              '{"@type":"SportsEvent","startDate":"11/21/2026 23:00:00 &#x2B;00:00","awayTeam":{"name":"College"},"homeTeam":{"name":"Other"}}' +
              '</script><section class="away-team-section"><h3>Injuries</h3><table><tr><td>No injuries to report.</td></tr></table></section>';
            const fixture = coversReport(html, '1');
            assert.equal(fixture.kickoff, Date.parse('2026-11-21T23:00Z'));
            assert.deepEqual(fixture.teams, [[],null]);
        """)


if __name__ == "__main__":
    unittest.main()
