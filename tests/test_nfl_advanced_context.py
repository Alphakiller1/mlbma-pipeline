from __future__ import annotations

import unittest

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


if __name__ == "__main__":
    unittest.main()
