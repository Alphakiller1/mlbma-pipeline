"""Every CFB player's value and games missed, for the live official report
(scripts/cfb_injury_value.table and the desk's join, 2026-11-21)."""
import json
import shutil
import subprocess
import unittest
from pathlib import Path

from scripts import cfb_injuries, cfb_injury_value as civ

ROOT = Path(__file__).resolve().parents[1]
COEF = {"QB": 10.0, "RB": 4.0, "WR": 3.0}


class TableTests(unittest.TestCase):
    def test_every_box_score_player_with_value_and_games_missed(self):
        usage = {
            "1": {"name": "Will Wilson", "shares": {"att": 0.9}, "recent": {"att": 0.3}, "missed": 2},
            "2": {"name": "Ronnie Royal III", "shares": {"tkl": 0.1}, "recent": {"tkl": 0.1}, "missed": 0},
            "3": {"name": "", "shares": {"car": 1.0}, "recent": {}, "missed": 0},
        }
        rows = civ.table(usage, COEF)
        self.assertEqual(rows, [["Ronnie Royal III", None, None, 0], ["Will Wilson", 9.0, 3.0, 2]])

    def test_the_table_is_a_classified_slate_key(self):
        spec = json.loads((ROOT / "design" / "public_metric_classification.json").read_text(encoding="utf-8"))
        classified = {k for v in spec.values() if isinstance(v, list) for k in v}
        self.assertLessEqual({"away_value_table", "home_value_table"}, classified)


NAMES = ["Ronnie Royal, III", "Brenten \"Inky\" Jones", "Ja’Kobi Jackson", "J. Dawson", "Jalen Dawson Jr.",
         "Max Riley", "Phillip Daniels", "D'Andre Smith-Jones"]


@unittest.skipUnless(shutil.which("node"), "requires Node")
class DeskKeyTests(unittest.TestCase):
    def test_the_desk_keys_names_as_the_publisher_does(self):
        script = r"""
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(process.argv[1] + '/dashboard/public_game_detail.js', 'utf8');
const start = src.indexOf('function cfbPlayerKey('), end = src.indexOf('function watchCfbInjuries(');
vm.runInThisContext(src.slice(start, end));
const names = JSON.parse(process.argv[2]);
const game = { away_value_table: [['Will Wilson', 9, 3, 2], ['Will Walker', 1, 1, 0], ['Ronnie Royal III', null, null, 0]] };
process.stdout.write(JSON.stringify({ keys: names.map(cfbPlayerKey), values: cfbPlayerValues(game, 'away') }));
"""
        done = subprocess.run([shutil.which("node"), "-e", script, str(ROOT), json.dumps(NAMES)],
                              capture_output=True, text=True, encoding="utf-8", timeout=60)
        self.assertEqual(done.returncode, 0, done.stderr[-1500:])
        out = json.loads(done.stdout)
        self.assertEqual(out["keys"], [cfb_injuries._key(n) for n in NAMES])
        # Will Wilson and Will Walker share "wwilson"? No: "wwilson" and "wwalker" - both kept.
        self.assertEqual(out["values"]["wwilson"], [9, 3, 2])
        self.assertEqual(out["values"]["rroyal"], [None, None, 0])

    def test_a_key_two_players_share_is_left_out(self):
        script = r"""
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(process.argv[1] + '/dashboard/public_game_detail.js', 'utf8');
vm.runInThisContext(src.slice(src.indexOf('function cfbPlayerKey('), src.indexOf('function watchCfbInjuries(')));
const game = { home_value_table: [['Jalen Smith', 2, 2, 0], ['Jordan Smith', 1, 1, 0], ['Max Riley', null, null, 3]] };
process.stdout.write(JSON.stringify(cfbPlayerValues(game, 'home')));
"""
        done = subprocess.run([shutil.which("node"), "-e", script, str(ROOT)],
                              capture_output=True, text=True, encoding="utf-8", timeout=60)
        self.assertEqual(done.returncode, 0, done.stderr[-1500:])
        self.assertEqual(json.loads(done.stdout), {"mriley": [None, None, 3]})


if __name__ == "__main__":
    unittest.main()
