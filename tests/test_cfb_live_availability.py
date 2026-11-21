"""CFB's game-specific live injury contract and provider date handling."""
from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]


class CfbLiveAvailabilityTests(unittest.TestCase):
    def run_js(self, source):
        result = subprocess.run(
            ["node", "--input-type=module", "-e", source],
            cwd=ROOT, capture_output=True, text=True, timeout=15,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_official_revisions_match_teams_date_and_latest_publication(self):
        self.run_js("""
            import assert from 'node:assert/strict';
            import { conferenceReports, conferenceFixture } from './functions/_shared/college_availability.js';
            const revision = (day, time, status) => ({
              publishDate: day, postedTime: time, conferenceTimeZone: 'CT',
              footer: { date: '2026-11-21' }, ReportType: 'Game Day',
              games: [
                { teamName: 'Illinois', rows: [{ name: 'QB #12 First Player', status }] },
                { teamName: 'Iowa', rows: [{ name: 'S Second Player', status: 'Out - (1st Half)' }] }
              ]
            });
            const games = conferenceReports({
              old: revision('2026-11-20', '19:00:00', 'Out'),
              final: revision('2026-11-21', '10:30:00', 'Available')
            });
            const game = conferenceFixture(games, new Date('2026-11-21T18:00Z'), ['iowa', 'illinois'], Date.parse('2026-11-21T17:00Z'));
            assert.equal(game.published, '2026-11-21T16:30:00.000Z');
            assert.equal(game.teams[0].players[0].status, 'Available');
            assert.equal(game.teams[1].players[0].status, 'Out (1st Half)');
            assert.equal(conferenceFixture(games, new Date('2026-11-14T18:00Z'), ['iowa', 'illinois']), undefined);
            assert.equal(conferenceFixture(games, new Date('2026-11-21T18:00Z'), ['iowa', 'indiana']), undefined);
            assert.equal(conferenceFixture(games, new Date('2026-11-21T18:00Z'), ['iowa', 'illinois'],
              Date.parse('2026-11-21T13:00Z')).teams[0].players[0].status, 'Out');
        """)

    def test_a_pending_report_says_when_it_is_due_and_is_never_a_report(self):
        # 2026-11-21: the American lists each game-day report as "Report Pending"
        # with its post time; the desk says when, rather than "unavailable".
        self.run_js("""
            import assert from 'node:assert/strict';
            import { conferenceReports, conferenceFixture, pendingFixture } from './functions/_shared/college_availability.js';
            const games = conferenceReports({ a: {
              publishDate: '2026-11-21', postedTime: '9:00:00', conferenceTimeZone: 'CT', footer: { date: '2026-11-21' },
              ReportType: 'Report Pending', games: [{ teamDisplayName: 'Memphis' }, { teamDisplayName: 'Navy' }]
            } });
            const kickoff = new Date('2026-11-21T17:00Z');
            assert.equal(conferenceFixture(games, kickoff, ['memphis', 'navy']), undefined);
            assert.equal(pendingFixture(games, kickoff, ['memphis', 'navy']), '2026-11-21T15:00:00.000Z');
            assert.equal(pendingFixture(games, kickoff, ['memphis', 'tulane']), null);
            assert.equal(pendingFixture(games, new Date('2026-11-28T17:00Z'), ['memphis', 'navy']), null);
        """)

    def test_secondary_coverage_requires_same_fixture_time_and_preserves_report_status(self):
        self.run_js("""
            import assert from 'node:assert/strict';
            import { rotowireFixture } from './functions/api/cfb-availability.js';
            const rows = [
              { RotoSchoolName: 'Louisiana Monroe', game_datetime: '2026-11-21 14:30:00', player: 'First Player', IR: 'GTD' },
              { RotoSchoolName: 'App State', game_datetime: '2026-11-14 14:30:00', player: 'Other Game', IR: 'OFS' }
            ];
            const data = rotowireFixture(rows, new Date('2026-11-21T19:30Z'), ['ulm', 'appstate']);
            assert.equal(data.away[0].status, 'Game Time Decision');
            assert.equal(data.away[0].updated, undefined);
            assert.equal(data.home, undefined);
        """)

    def test_unposted_team_remains_unknown(self):
        self.run_js("""
            import assert from 'node:assert/strict';
            import { jsonConferenceReports } from './functions/_shared/college_availability.js';
            const [game] = jsonConferenceReports({ games: [{
              kickoffUTC: '2026-11-21T19:30:00Z', updatedAtUTC: '2026-11-20T18:00:00Z',
              away: { name: 'UL Monroe', players: [] },
              home: { name: 'App State', players: [{ name: 'A. Player', status: 'Out for Season' }] }
            }] });
            assert.equal(game.teams[0].school, 'ulm');
            assert.equal(game.teams[0].players, null);
            assert.equal(game.teams[1].players[0].status, 'Out For Season');
        """)

    def test_archive_matches_opponent_and_day(self):
        self.run_js("""
            import assert from 'node:assert/strict';
            import { archiveFixture } from './functions/_shared/college_availability.js';
            const row = { Team: 'Miami (OH)', TeamDisplay: 'Miami', OpponentDisplay: 'at Kent State',
              Week: 'Tue, 17 Nov 2026 00:00:00 GMT', 'Game Day': 'Out', Player: 'First Player' };
            const teams = archiveFixture({data:[row, {...row, OpponentDisplay:'at Toledo', Player:'Unrelated Player'}]},
              new Date('2026-11-18T00:00:00Z'), ['miamioh', 'kentstate']);
            assert.deepEqual(teams[0].players, [{player:'First Player', status:'Out'}]);
            assert.equal(teams[1].players, null);
        """)

    def test_official_reports_override_stale_flags_without_scratching_first_half_players(self):
        self.run_js("""
            import assert from 'node:assert/strict';
            globalThis.window = {};
            await import('./dashboard/player_availability_shared.js');
            const { status, available } = window.ChasePlayerAvailability;
            const a = { name: 'First Player', status: 'Out' };
            const b = { name: 'Second Player' };
            const game = { sport: 'cfb', away_injuries: { coverage: 'official',
              players: [{ player: 'Second Player', status: 'Out (1st Half)' }] } };
            assert.equal(status(game, 'away', a), '');
            assert.equal(available(game, 'away', [a, b]).length, 2);
            game.away_injuries.coverage = 'secondary';
            assert.equal(status(game, 'away', a), 'Out');
        """)


if __name__ == '__main__':
    unittest.main()
