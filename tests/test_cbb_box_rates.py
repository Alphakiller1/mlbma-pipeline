"""CBB evidence stays current when Basketball Quant's team rates stall
(2026-11-18 audit), and the freshness report sees a stall."""

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from pipeline.cbb_public import export  # noqa: E402
import check_public_freshness as freshness  # noqa: E402


def final(day, home, away):
    return {"status_type_name": "STATUS_FINAL", "game_date": day, "home_id": home, "away_id": away}


class LatestFinalTests(unittest.TestCase):
    def test_only_finals_between_two_division_teams_count(self):
        schedule = [final("2026-11-12", 1, 2), final("2026-11-17", 1, 99), final("2026-11-16", 2, 1),
                    {"status_type_name": "STATUS_SCHEDULED", "game_date": "2026-11-18", "home_id": 1, "away_id": 2}]
        self.assertEqual(export.latest_division_final(schedule, {1, 2}, "2026-11-18"), "2026-11-16")
        self.assertIsNone(export.latest_division_final(schedule, {1, 2}, "2026-11-01"))


class LayBoxRatesTests(unittest.TestCase):
    def context(self):
        bq = {k: 0.5 for k in export.RATE_FIELDS}
        bq["games_all"] = 3
        return {"rates": bq, "official_box": {"data_through": "2026-11-17", "rates": {
            "games_all": 5, "efg_o_all": 0.55, "fb_pts_per100_all": None, "not_a_rate": 9}}}

    def test_box_rates_replace_what_boxes_measure_and_keep_the_rest(self):
        c = self.context()
        self.assertTrue(export.lay_box_rates(c, "2026-11-12"))
        self.assertEqual(c["rates"]["games_all"], 5)
        self.assertEqual(c["rates"]["efg_o_all"], 0.55)
        self.assertEqual(c["rates"]["fb_pts_per100_all"], 0.5)   # boxes cannot measure it: Basketball Quant's stays
        self.assertNotIn("not_a_rate", c["rates"])
        self.assertEqual(c["rates_basis"], {"box_scores_through": "2026-11-17",
                                            "basketball_quant_through": "2026-11-12"})

    def test_box_rates_never_count_fewer_games_than_the_row(self):
        # Missouri State, 2026-11-18: its shot chart had one game, the row four.
        c = self.context()
        c["official_box"]["rates"]["games_all"] = 2
        self.assertFalse(export.lay_box_rates(c, "2026-11-12"))
        self.assertEqual(c["rates"]["games_all"], 3)

    def test_a_team_without_box_rates_is_left_alone(self):
        c = self.context()
        c["official_box"] = {}
        self.assertFalse(export.lay_box_rates(c, "2026-11-12"))
        self.assertEqual(c["rates"]["games_all"], 3)
        self.assertNotIn("rates_basis", c)


class AlignmentTests(unittest.TestCase):
    def team(self, games, shots, pace):
        return {"rates": {"games_all": games}, "shots": {"coordinates": {"offense": {"totals": {"games": shots}}}},
                "official_box": {"pace": {"games": pace}}}

    def test_alignment_is_the_deploy_gates_measure(self):
        teams = [self.team(5, 5, 5), self.team(5, 5, 4), self.team(5, 6, 6), self.team(None, 3, 3)]
        self.assertAlmostEqual(export.sample_alignment(teams), 2 / 3)
        self.assertEqual(export.sample_alignment([]), 1.0)


class FreshnessTests(unittest.TestCase):
    def test_the_five_day_cbb_stall_is_reported(self):
        stale = {"generated_at_utc": "2026-11-17T22:29:18+00:00", "data_through_utc": "2026-11-13T04:59:59+00:00"}
        found = freshness.check("cbb", stale, datetime(2026, 11, 17, 23, 0, tzinfo=timezone.utc))
        self.assertEqual(len(found), 1)
        self.assertIn("2026-11-13", found[0])

    def test_a_current_slate_and_a_weekly_sport_pass(self):
        now = datetime(2026, 11, 18, 4, 0, tzinfo=timezone.utc)
        self.assertEqual(freshness.check("nba", {"generated_at_utc": "2026-11-18T03:09:00Z",
                                                 "data_through_utc": "2026-11-18T00:30:00Z"}, now), [])
        self.assertEqual(freshness.check("cfb", {"generated_at_utc": "2026-11-17T21:09:25Z",
                                                 "data_through_utc": "2026-11-15T20:31:39Z"}, now), [])

    def test_a_job_that_stopped_running_is_reported(self):
        found = freshness.check("nba", {"generated_at_utc": "2026-11-15T03:00:00Z"},
                                datetime(2026, 11, 18, 4, 0, tzinfo=timezone.utc))
        self.assertIn("published 3.0 days ago", found[0])


if __name__ == "__main__":
    unittest.main()
