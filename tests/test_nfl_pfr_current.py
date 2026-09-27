"""2026 pressure and coverage-by-defender come from PFR charting (nflverse
pfr_advstats) because the participation file is not published mid-season."""
import unittest

from outputs import nfl_advanced_context as adv
from outputs import nfl_public_context as ctx


class PfrCurrentSeason(unittest.TestCase):
    def test_passer_rating_allowed_matches_nfl_formula(self):
        # 20 targets, 13 caught, 150 yards, 1 TD, 1 INT -> 83.3
        self.assertEqual(adv._passer_rating(20, 13, 150, 1, 1), 83.3)
        self.assertEqual(adv._passer_rating(10, 10, 300, 4, 0), 158.3)
        self.assertIsNone(adv._passer_rating(0, 0, 0, 0, 0))

    def test_quarterback_join_ignores_suffixes(self):
        self.assertEqual(adv._bare_name("Michael Penix Jr."), adv._bare_name("Michael Penix"))
        self.assertEqual(adv._bare_name("Marvin Harrison II"), adv._bare_name("Marvin Harrison"))

    def test_club_maps_use_slate_codes(self):
        # nflverse writes WAS and LA; a map keyed that way left Washington and
        # the Rams without 2026 scheme, defenders and line stats.
        self.assertEqual(set(ctx._canon_keys({"WAS": 1, "LA": 2, "KC": 3})), {"WSH", "LAR", "KC"})


if __name__ == "__main__":
    unittest.main()
