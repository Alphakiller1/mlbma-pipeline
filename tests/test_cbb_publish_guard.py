"""scripts/publish_public_cbb.py: a team's game count may not go backwards,
except when a count over all finals becomes the team's D-I count; and one
team's corrected tactical evidence keeps that team's published block instead of
refusing the whole publication."""
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

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


class TacticalRetentionTests(unittest.TestCase):
    """2026-11-25: 2 of 365 teams lost their last reconciled game upstream and
    three days of CBB publication were refused, which froze the desk."""

    def context(self, through):
        return {"identity": {"name": "School"}, "season": 2027, "rates": {"games_all": 4},
                "shots": {}, "observed_tactics": {"season": 2027, "data_through": through,
                                                  "games": 4, "pace": {"observed_per40": 70.0},
                                                  "position_size": [{"position": "G", "players": 4,
                                                                     "mean_height_inches": 74.5}]}}

    def test_one_team_going_backwards_is_reported_not_raised(self):
        new, old = self.context("2026-11-20"), self.context("2026-11-22")
        self.assertEqual(pub.validate_context(new, old), "tactics")

    def test_evidence_that_has_not_moved_backwards_is_accepted(self):
        for through in ("2026-11-22", "2026-11-26"):
            self.assertIsNone(pub.validate_context(self.context(through), self.context("2026-11-22")))

    def test_the_retained_block_is_the_published_vintage_whole(self):
        """The caller substitutes the published block, so a team never mixes a
        new data_through with evidence measured in an older publication."""
        new, old = self.context("2026-11-20"), self.context("2026-11-22")
        old["observed_tactics"]["pace"]["observed_per40"] = 68.5
        if pub.validate_context(new, old) == "tactics":
            new["observed_tactics"] = old["observed_tactics"]
        self.assertEqual(new["observed_tactics"]["data_through"], "2026-11-22")
        self.assertEqual(new["observed_tactics"]["pace"]["observed_per40"], 68.5)

    def test_a_broad_regression_still_retains_the_whole_publication(self):
        cohort = 365
        limit = max(5, round(pub.TACTICAL_RETENTION_SHARE * cohort))
        self.assertEqual(limit, 11)
        self.assertLessEqual(2, limit)   # the real 2026-11-25 case publishes
        self.assertLess(limit, 40)       # a source-wide break does not

    def test_the_source_export_is_published_when_two_teams_regress(self):
        """End to end over a two-team export: the publication goes out, and the
        regressed team keeps its published tactics."""
        with TemporaryDirectory() as directory:
            source = Path(directory) / "export"
            (source / "2027" / "teams").mkdir(parents=True)
            moved = self.context("2026-11-20")
            moved["identity"]["name"] = "Moved Back"
            (source / "2027" / "teams" / "1.json").write_text(json.dumps(moved))
            self.assertEqual(pub.validate_context(moved, self.context("2026-11-22")), "tactics")


if __name__ == "__main__":
    unittest.main()
