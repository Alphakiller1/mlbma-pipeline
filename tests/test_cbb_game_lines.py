"""CBB game-log lines: box math, and each figure ranked within its Monday-Sunday week."""
import unittest

from pipeline.cbb_public import game_lines as gl

A = {"fgm": 25, "fga": 60, "tpm": 8, "tpa": 24, "ftm": 12, "fta": 16, "orb": 10, "drb": 25, "poss": 70}
B = {"fgm": 22, "fga": 58, "tpm": 5, "tpa": 20, "ftm": 10, "fta": 15, "orb": 12, "drb": 26, "poss": 68}


class GameLineTests(unittest.TestCase):
    def test_line_math(self):
        row = gl.line(A, B, 45)
        self.assertAlmostEqual(row["orb_pct"], 10 / 36)
        self.assertAlmostEqual(row["drb_pct"], 25 / 37)
        self.assertAlmostEqual(row["efg_pct"], 29 / 60)
        self.assertAlmostEqual(row["fg2_pct"], 17 / 36)
        self.assertAlmostEqual(row["fg3a_share"] + row["fg2a_share"], 1)
        self.assertAlmostEqual(row["pace"], 69 * 40 / 45, msg="overtime is normalised to 40 minutes")
        self.assertIsNone(gl.line({**A, "fta": 0, "ftm": 0}, B, 40)["ft_pct"])

    def test_ranks_stay_inside_the_week(self):
        lines = {"x": {"1": ("2026-11-09", {"efg_pct": 0.60}), "2": ("2026-11-16", {"efg_pct": 0.40})},
                 "y": {"3": ("2026-11-15", {"efg_pct": 0.50}), "4": ("2026-11-17", {"efg_pct": 0.45})}}
        out = gl.ranked(lines)
        self.assertEqual(out["x"]["1"]["week"], "2026-11-09")
        self.assertEqual(out["x"]["1"]["box"]["efg_pct"], {"value": 0.6, "rank": 1, "of": 2})
        self.assertEqual(out["y"]["3"]["box"]["efg_pct"]["rank"], 2, "Sunday belongs to the week before")
        self.assertEqual(out["x"]["2"]["box"]["efg_pct"], {"value": 0.4, "rank": 2, "of": 2})


if __name__ == "__main__":
    unittest.main()
