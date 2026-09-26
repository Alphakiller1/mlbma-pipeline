from __future__ import annotations

import unittest
from unittest.mock import patch

import pandas as pd

from outputs import nfl_advanced_context as ctx


class NflAdvancedContextTests(unittest.TestCase):
    def test_ftn_blitzer_count_means_any_extra_rusher(self):
        rows = pd.DataFrame({"n_blitzers": [0.0, 1.0, 2.0]})
        masks = ctx._split_masks(rows, "QB")
        self.assertEqual(masks["blitz"].tolist(), [False, True, True])
        self.assertEqual(masks["no_blitz"].tolist(), [True, False, False])

    def test_coverage_and_box_personnel_masks_are_literal_charting(self):
        rows = pd.DataFrame({
            "defense_coverage_type": ["COVER_1", "COVER_4", "COVER_3"],
            "defense_man_zone_type": ["MAN_COVERAGE", "ZONE_COVERAGE", "ZONE_COVERAGE"],
            "was_pressure": [True, False, False],
            "defenders_in_box": [8.0, 6.0, 7.0],
            "defense_personnel": [
                "2 CB, 1 FS, 2 SS, 6 front", "3 CB, 1 FS, 1 SS, 6 front",
                "4 CB, 1 FS, 1 SS, 5 front",
            ],
        })
        qb = ctx._split_masks(rows, "QB")
        self.assertEqual(qb["single_high"].tolist(), [True, False, True])
        self.assertEqual(qb["two_high"].tolist(), [False, True, False])
        self.assertEqual(qb["pressure"].tolist(), [True, False, False])
        rb = ctx._split_masks(rows, "RB")
        self.assertEqual(rb["stacked_box"].tolist(), [True, False, False])
        self.assertEqual(rb["nickel"].tolist(), [True, True, False])
        self.assertEqual(rb["dime"].tolist(), [False, False, True])

    def test_adjusted_line_yards_caps_breakaways_and_weights_losses(self):
        self.assertEqual(ctx._line_yards(-2), -2.4)
        self.assertEqual(ctx._line_yards(4), 4)
        self.assertEqual(ctx._line_yards(8), 6)
        self.assertEqual(ctx._line_yards(30), 7)

    def test_ngs_rushing_uses_latest_cumulative_player_row(self):
        frame = pd.DataFrame({
            "season": [2026, 2026], "season_type": ["REG", "REG"], "week": [1, 2],
            "player_display_name": ["Runner", "Runner"], "player_position": ["RB", "RB"],
            "team_abbr": ["AAA", "AAA"], "efficiency": [3.1, 3.0],
            "percent_attempts_gte_eight_defenders": [20.0, 35.0],
            "avg_time_to_los": [2.7, 2.6], "rush_attempts": [10, 22],
            "expected_rush_yards": [40.0, 88.0], "rush_yards_over_expected": [5.0, 12.0],
            "rush_yards_over_expected_per_att": [.5, .55],
            "rush_pct_over_expected": [.4, .5], "player_gsis_id": ["p1", "p1"],
        })
        with patch.object(ctx, "_frame", return_value=frame):
            result = ctx._ngs_rushing(2026)["p1"]
        self.assertEqual(result["week"], 2)
        self.assertEqual(result["eight_plus_box_rate"], .35)
        self.assertEqual(result["expected_yards_per_carry"], 4.0)

    def test_run_front_is_point_of_attack_not_blocking_scheme(self):
        rows = pd.DataFrame({
            "run_gap": ["guard", "guard", "end"],
            "run_location": ["middle", "left", "right"],
            "yards_gained": [2, -1, 8], "epa": [-.1, -.4, .5],
            "success": [0, 0, 1],
        })
        result = ctx._run_front(rows)
        self.assertEqual(result["gap_guard"]["carries"], 2)
        self.assertEqual(result["gap_guard"]["stuff_rate"], .5)
        self.assertNotIn("zone", result)


if __name__ == "__main__":
    unittest.main()
