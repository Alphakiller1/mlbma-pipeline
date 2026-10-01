"""The noise-adjusted score: what it removes, and what it leaves alone."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from outputs import nfl_game_log as log  # noqa: E402

LUCK = {
    "fg_make_rate_by_distance": {30: 0.9, 50: 0.5},
    "xp_make_rate": 1.0,
    "fumble_mean_epa": -2.0,
    "non_offensive_td_per_team_game": 0.0,
}


def play(**kw):
    base = {"game_id": "2026_01_AAA_BBB", "season_type": "REG", "week": 1, "home_team": "BBB",
            "away_team": "AAA", "home_score": 10, "away_score": 3, "posteam": "AAA",
            "defteam": "BBB", "play_type": "run", "epa": 0.0, "success": 0, "yards_gained": 4,
            "field_goal_result": None, "kick_distance": None, "extra_point_result": None,
            "fumble": 0, "fumble_lost": 0, "interception": 0, "touchdown": 0, "td_team": None,
            "third_down_converted": 0, "third_down_failed": 0, "sack": 0, "pass": 0, "rush": 1}
    base.update(kw)
    return base


class NoiseAdjustedScoreTests(unittest.TestCase):
    def rows(self, plays):
        return {r["team"]: r for r in log._game_rows(pd.DataFrame(plays), LUCK)}

    def test_a_made_long_field_goal_counts_at_the_league_rate(self):
        rows = self.rows([play(play_type="field_goal", field_goal_result="made", kick_distance=52)])
        # 3 points made, 1.5 expected from 50+ yards: 1.5 of the 3 was luck.
        self.assertEqual(rows["AAA"]["points"], 3)
        self.assertEqual(rows["AAA"]["adj_points"], 1.5)

    def test_fumble_luck_is_split_across_both_scores(self):
        # A fumble the offense kept (EPA 0) against a league fumble average of
        # -2: +2 of luck, half off the offense's score, half onto the defense's.
        rows = self.rows([play(fumble=1, epa=0.0)])
        self.assertEqual(rows["AAA"]["adj_points"], 3 - 1.0)
        self.assertEqual(rows["BBB"]["adj_points"], 10 + 1.0)

    def test_a_defensive_touchdown_is_replaced_by_the_league_rate(self):
        rows = self.rows([play(touchdown=1, td_team="BBB", posteam="AAA", play_type="pass")])
        # Seven points (6 + a certain extra point here) off BBB's score.
        self.assertEqual(rows["BBB"]["adj_points"], 10 - 7)

    def test_offensive_play_is_left_alone(self):
        rows = self.rows([play(epa=1.5, success=1)])
        self.assertEqual(rows["AAA"]["adj_points"], 3)
        self.assertEqual(rows["BBB"]["adj_points"], 10)

    def test_club_codes_match_the_slate(self):
        self.assertEqual(log._canon("WAS"), "WSH")
        self.assertEqual(log._canon("LA"), "LAR")

    def test_percentiles_face_the_better_side(self):
        pool = [0.1, 0.2, 0.3]
        self.assertEqual(log._percentile(pool, 0.3, True), 100.0)
        self.assertEqual(log._percentile(pool, 0.3, False), 0.0)


if __name__ == "__main__":
    unittest.main()
