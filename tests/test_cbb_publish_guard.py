"""scripts/publish_public_cbb.py: a team's game count may not go backwards,
except when a count over all finals becomes the team's D-I count."""
import unittest

from scripts import publish_public_cbb as pub


def team(games_all, finals):
    return {"identity": {"name": "School"}, "season": 2027, "rates": {"games_all": games_all}, "shots": {},
            "data_through": "2026-11-18",
            "games": [{"date": "2026-11-1" + str(i), "points": 70, "opponent_id": opp} for i, opp in enumerate(finals)]}


class PublishGuardTests(unittest.TestCase):
    def test_count_may_not_go_backwards(self):
        division = {"1", "2", "3"}
        with self.assertRaises(ValueError):
            pub.validate_context(team(2, ["1", "2", "3"]), team(3, ["1", "2", "3"]), division)
        with self.assertRaises(ValueError):
            pub.validate_context(team(2, ["1", "2", "3"]), team(3, ["1", "2", "3"]))

    def test_a_count_over_all_finals_may_become_the_d1_count(self):
        # Missouri State, 2026-11-19: four finals, one against a D-I school.
        division = {"1", "2"}
        pub.validate_context(team(1, ["1", "x", "y", "z"]), team(4, ["1", "x", "y", "z"]), division)
        with self.assertRaises(ValueError):  # below even the D-I count: a real regression
            pub.validate_context(team(0, ["1", "x"]), team(2, ["1", "x"]), division)


if __name__ == "__main__":
    unittest.main()
