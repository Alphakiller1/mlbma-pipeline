import shutil
import subprocess
import unittest
from pathlib import Path

from pipeline.cbb_public.export import matchup_baselines


ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")


class PublicPaceTests(unittest.TestCase):
    def test_cbb_comparison_cohorts_keep_method_and_role_separate(self):
        contexts = [
            {"rates": {}, "shots": {}, "observed_tactics": {
                "pace": {"observed_per40": 67, "recent5_per40": 65, "games": 6},
                "situations": [
                    {"side": "offense", "kind": "transition", "usage": .22, "ppp": 1.3, "possessions": 12},
                    {"side": "defense", "kind": "transition", "usage": .33, "ppp": 1.8, "possessions": 8},
                ],
            }},
            {"rates": {}, "shots": {}, "official_box": {"pace": {"estimated_per40": 73}}},
        ]
        result = matchup_baselines(contexts)
        self.assertEqual(result["pace_samples"], {
            "observed_per40": [67], "recent5_per40": [65], "estimated_per40": [73],
        })
        defense, offense = result["matchup_comparisons"]
        self.assertEqual(defense["usage_samples"], [.33])
        self.assertEqual(defense["ppp_baseline"]["sample_size"], 0)
        self.assertEqual(offense["ppp_baseline"]["mean"], 1.3)

    @unittest.skipUnless(NODE, "requires Node")
    def test_direction_tiers_neutral_values_and_ties(self):
        process = subprocess.run([NODE, "-e", r"""
const assert = require('node:assert/strict');
global.window = global;
require('./dashboard/chase_icons.js');
const {rankedPace, observedPace} = ChaseIcons;
const pace = (r, of = 101, lower = false) => rankedPace(r, of, lower, 'teams', '5 games');
assert.match(pace(1), /data-pace-direction="fast" data-pace-tier="3"/);
assert.match(pace(15), /data-pace-direction="fast" data-pace-tier="2"/);
assert.match(pace(27), /data-pace-direction="fast" data-pace-tier="1"/);
assert.equal(pace(50), '');
assert.match(pace(101), /data-pace-direction="slow" data-pace-tier="3"/);
assert.match(pace(101, 101, true), /data-pace-direction="fast" data-pace-tier="3"/);
assert.equal(pace(1, 4), '');
assert.equal(observedPace(70, Array(12).fill(70), 'D-I teams'), '');
assert.match(observedPace(80, [61,63,64,65,66,67,68,69,70,80], 'D-I teams'),
  /data-pace-direction="fast" data-pace-tier="3"/);
"""], cwd=ROOT, capture_output=True, text=True, timeout=15)
        self.assertEqual(process.returncode, 0, process.stderr)
