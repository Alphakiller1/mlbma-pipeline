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
}


def play(**kw):
    base = {"game_id": "2026_01_AAA_BBB", "season_type": "REG", "week": 1, "home_team": "BBB",
            "away_team": "AAA", "home_score": 10, "away_score": 3, "posteam": "AAA",
            "defteam": "BBB", "play_type": "run", "epa": 0.0, "success": 0, "yards_gained": 4,
            "field_goal_result": None, "kick_distance": None, "extra_point_result": None,
            "fumble": 0, "fumble_lost": 0, "interception": 0, "touchdown": 0, "td_team": None,
            "third_down_converted": 0, "third_down_failed": 0, "sack": 0, "pass": 0, "rush": 1,
            "location": "Home"}
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

    def test_a_defensive_touchdown_stays_as_scored(self):
        # Neutralising defensive and return touchdowns made later results harder
        # to predict (2026-11-11): they count as scored.
        rows = self.rows([play(touchdown=1, td_team="BBB", posteam="AAA", play_type="pass")])
        self.assertEqual(rows["BBB"]["adj_points"], 10)

    def test_regression_watch_splits_the_removed_luck_by_source(self):
        rows = self.rows([play(play_type="field_goal", field_goal_result="made", kick_distance=52),
                          play(fumble=1, epa=0.0)])
        watch = log.regression_watch(list(rows.values()))
        away = watch["AAA"]
        parts = {p["key"]: p for p in away["parts"]}
        # The 52-yard make is +1.5 of luck; the kept fumble +2 (EPA 0 against -2).
        self.assertEqual((parts["fg"]["actual"], parts["fg"]["expected"], parts["fg"]["attempts"]), (1, 0.5, 1))
        self.assertEqual(parts["fg"]["luck"]["value"], 1.5)
        self.assertEqual(parts["fumbles"]["luck"]["value"], 2.0)
        self.assertEqual({p["key"]: p["luck"]["value"] for p in watch["BBB"]["parts"]}["opp_fumbles"], -2.0)
        # Final 3-10 (-7), adjusted 0.5-11 (-10.5): the 3.5 between them is the parts.
        self.assertAlmostEqual(away["margin"]["value"] - away["adjusted_margin"]["value"], away["luck"]["value"])
        self.assertAlmostEqual(sum(p["luck"]["value"] for p in away["parts"]), away["luck"]["value"])
        self.assertEqual(away["close"]["wins"] + away["close"]["losses"], 1)  # a 7-point game is one score

    def test_power_ranking_reads_points_and_fumble_neutral_plays(self):
        rows = self.rows([play(fumble=1, epa=-5.0)])
        # The lost fumble's EPA is replaced by the league mean (-2) for the power read.
        self.assertEqual(rows["AAA"]["_plays"], (1, -2.0))

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
