import shutil
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")


@unittest.skipUnless(NODE, "requires Node")
class MatchupAvailabilityTests(unittest.TestCase):
    def test_fixture_designations_gate_all_player_selection(self):
        result = subprocess.run([NODE, "-e", r"""
const assert = require('node:assert/strict');
global.window = global;
require('./dashboard/player_availability_shared.js');
const policy = global.ChasePlayerAvailability;
const murray = { name: 'Kyler Murray', position: 'QB', depth_rank: 1 };
const wentz = { name: 'Carson Wentz', position: 'QB', depth_rank: 2 };
const game = {
  home_players: [murray, wentz],
  home_lineups: { offense: { players: [murray] } },
  home_starter: 'K. Murray',
  home_availability_list: [{ name: 'Kyler Murray', position: 'QB', status: 'Out' }]
};
assert.equal(policy.nflStarter(game, 'home', 'QB'), wentz);
assert.equal(policy.nflStarter({ ...game, home_players: [murray] }, 'home', 'QB'), null);
assert.equal(policy.nflStarter({ ...game, home_players: [], home_lineups: null }, 'home', 'QB'), null);
assert.deepEqual(policy.available(game, 'away', [murray]), [murray]);

const college = {
  away_injuries: { players: [{ player: 'N. Minicucci', position: 'QB', status: 'Out For Season' }] }
};
assert.deepEqual(policy.available(college, 'away', [{ player_name: 'Nick Minicucci', position: 'QB' }]), []);
assert.deepEqual(policy.available({}, 'home', [{ player_name: 'Nick Minicucci', status: 'OFS' }]), []);

const nba = {
  home_injuries: { players: [{ player: 'Luka Doncic', player_id: '17', status: 'Out' }] }
};
assert.deepEqual(policy.available(nba, 'home', [{ player_name: 'Luka Dončić', player_id: 17 }]), []);
const other = { player_name: 'Luka Doncic', player_id: 18 };
assert.deepEqual(policy.available(nba, 'home', [other]), [other]);

const cbb = { away_cbb_availability: [{ player: 'Kai Shinholster', status: 'Suspended' }] };
assert.deepEqual(policy.available(cbb, 'away', [{ Name: 'Kai Shinholster (27) (School)' }]), []);
for (const status of ['Questionable', 'Doubtful', 'Day-To-Day', 'Game Time Decision']) {
  assert.equal(policy.isOut(status), false);
}
"""], cwd=ROOT, capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stderr)
