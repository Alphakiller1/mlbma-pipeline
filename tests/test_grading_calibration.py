"""The one grading scale, exercised against the real dashboard/mlbma_assets.js.

Every chip, heat cell and rank badge on the site resolves through these four
functions, and each assertion here is a bug that shipped:

  * ranks were coloured by a hard-coded thirty-club ladder ("top 5 / 12 / 20"),
    so 5th of 32 and 5th of 362 were painted as 5th of 30, and two copies of the
    ladder disagreed with each other about 26th of 30;
  * the value bands were not centred on the league average - the neutral band ran
    from -0.85 to +0.30 sigma, so a below-average value read neutral while an
    equally above-average one read green;
  * a context with no baseline fell back to an OSI-shaped mean 50 / sd 12, which
    graded a .320 wOBA or a 3.40 ERA with total confidence;
  * a live refresh of `kpct` left the legacy `k_pct` spelling on the hand-typed
    numbers.

Node is used because the file is the production artifact, not a port of it.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "dashboard" / "mlbma_assets.js"

HARNESS = r"""
const fs = require('fs');
const vm = require('vm');
const sandbox = { console, setTimeout, fetch: () => Promise.reject(new Error('offline')) };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), sandbox);
const A = sandbox.MLBMAAssets;

const out = {};

// Rank tiers read the denominator they were ranked in.
function spread(of) {
  const counts = {};
  for (let rank = 1; rank <= of; rank++) {
    const tier = A.rankTier(rank, of);
    counts[tier] = (counts[tier] || 0) + 1;
  }
  return counts;
}
out.spread30 = spread(30);
out.spread32 = spread(32);
out.fifthOf30 = A.rankTier(5, 30);
out.fifthOf362 = A.rankTier(5, 362);
out.noDenominator = A.rankTier(5, null);
out.outOfRange = A.rankTier(31, 30);
out.chipFor1of30 = A.rankChipClass(1, 30);

// Value tiers are symmetric about the league average and honour direction.
A.applyLeagueBaselines({ baselines: { osi: { mean: 50, std: 10 } } });
out.above = A.valueTier(50 + 1.5 * 10, 'osi');
out.below = A.valueTier(50 - 1.5 * 10, 'osi');
out.atMean = A.valueTier(50, 'osi');
out.nearAbove = A.valueTier(50 + 0.5 * 10, 'osi');
out.nearBelow = A.valueTier(50 - 0.5 * 10, 'osi');
// era is low-is-better in the registry, so a high ERA is the poor end.
A.applyLeagueBaselines({ baselines: { era: { mean: 4.0, std: 1.0 } } });
out.highEra = A.valueTier(5.5, 'era');
out.lowEra = A.valueTier(2.5, 'era');

// A context with no baseline is not graded, and never borrows another's scale.
out.unknownTier = A.valueTier(0.32, 'no_such_context');
out.unknownChip = A.solidChipClass(0.32, 'no_such_context');
out.wobaOnOsiScale = A.valueTier(0.320, 'osi');

// Generated split families arrive with their own direction.
A.applyLeagueBaselines({ baselines: {
  bat_vl_ops: { mean: 0.711, std: 0.15, hi: true },
  sp_home_ops: { mean: 0.697, std: 0.118, hi: false }
} });
out.batterGoodOps = A.valueTier(0.95, 'bat_vl_ops');
out.starterGoodOps = A.valueTier(0.55, 'sp_home_ops');
out.undeclaredIgnored = A.valueTier(1, 'bat_zz_made_up');

// Aliases follow their canonical context when the league refreshes.
A.applyLeagueBaselines({ baselines: { kpct: { mean: 30, std: 2 } } });
out.aliasMean = A.CONTEXT_BASELINES.k_pct.mean;

// An explicit baseline (NFL situational responses) uses the same bands.
out.epaAboveLeague = A.baselineTier(0.20, { mean: 0.05, std: 0.08 }, true);
out.epaAllowedLow = A.baselineTier(-0.20, { mean: 0.05, std: 0.08 }, false);
out.epaAtLeague = A.baselineTier(0.05, { mean: 0.05, std: 0.08 }, true);
out.noBaseline = A.baselineTier(0.2, null, true);

process.stdout.write(JSON.stringify(out));
"""


def _node():
    return shutil.which("node")


@unittest.skipIf(_node() is None, "node is not installed")
class GradingCalibrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        harness = ROOT / "tests" / "_grading_harness.js"
        harness.write_text(HARNESS, encoding="utf-8")
        try:
            result = subprocess.run([_node(), str(harness), str(ASSETS)],
                                    capture_output=True, text=True, timeout=60)
        finally:
            harness.unlink(missing_ok=True)
        if result.returncode:
            raise AssertionError(f"harness failed: {result.stderr}")
        cls.out = json.loads(result.stdout)

    def test_rank_tiers_are_symmetric_in_any_denominator(self):
        """The middle of the league is the middle of the scale, in a pool of any size."""
        self.assertEqual(self.out["spread30"],
                         {"elite": 4, "strong": 7, "mid": 8, "weak": 7, "poor": 4})
        self.assertEqual(self.out["spread32"],
                         {"elite": 5, "strong": 7, "mid": 8, "weak": 7, "poor": 5})

    def test_a_rank_is_read_against_its_own_denominator(self):
        self.assertEqual(self.out["fifthOf30"], "strong")
        self.assertEqual(self.out["fifthOf362"], "elite")
        self.assertEqual(self.out["chipFor1of30"], "c-elite")

    def test_a_rank_with_no_denominator_is_not_coloured(self):
        self.assertIsNone(self.out["noDenominator"])
        self.assertIsNone(self.out["outOfRange"])

    def test_value_tiers_are_centred_on_the_league_average(self):
        self.assertEqual(self.out["atMean"], "mid")
        self.assertEqual(self.out["above"], "elite")
        self.assertEqual(self.out["below"], "poor")
        self.assertEqual(self.out["nearAbove"], "strong")
        self.assertEqual(self.out["nearBelow"], "weak")

    def test_direction_comes_from_the_registry(self):
        self.assertEqual(self.out["highEra"], "poor")
        self.assertEqual(self.out["lowEra"], "elite")

    def test_a_context_with_no_baseline_is_never_graded(self):
        self.assertIsNone(self.out["unknownTier"])
        self.assertEqual(self.out["unknownChip"], "c-mid")
        # The old fallback graded a wOBA on OSI's mean-50 scale as the worst in the league.
        self.assertEqual(self.out["wobaOnOsiScale"], "poor")

    def test_generated_families_carry_their_own_direction(self):
        self.assertEqual(self.out["batterGoodOps"], "elite")
        self.assertEqual(self.out["starterGoodOps"], "elite")
        self.assertIsNone(self.out["undeclaredIgnored"])

    def test_legacy_alias_follows_its_canonical_context(self):
        self.assertEqual(self.out["aliasMean"], 30)

    def test_explicit_baselines_use_the_same_bands(self):
        self.assertEqual(self.out["epaAtLeague"], "mid")
        self.assertEqual(self.out["epaAboveLeague"], "elite")
        self.assertEqual(self.out["epaAllowedLow"], "elite")
        self.assertEqual(self.out["noBaseline"], None)


if __name__ == "__main__":
    unittest.main()
