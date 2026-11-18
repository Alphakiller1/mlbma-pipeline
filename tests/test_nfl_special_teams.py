"""NFL special teams, situational figures, Next Gen season rows and the
kickoff forecast (2026-11-18 audit)."""
import sys
import unittest
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from outputs import nfl_advanced_context as adv, nfl_special_teams as st, nfl_venues  # noqa: E402


def play(**kw):
    base = {c: None for c in st.ST_PBP_COLUMNS}
    base.update({"game_id": "g1", "season": 2026, "season_type": "REG", "home_team": "BUF", "away_team": "MIA",
                 "posteam": "BUF", "defteam": "MIA"})
    base.update(kw)
    return base


class SpecialTeamsTests(unittest.TestCase):
    def setUp(self):
        rows = [
            play(play_id=1, play_type="field_goal", field_goal_attempt=1, kick_distance=35, field_goal_result="made"),
            play(play_id=2, play_type="field_goal", field_goal_attempt=1, kick_distance=52, field_goal_result="missed"),
            play(play_id=3, play_type="extra_point", extra_point_attempt=1, extra_point_result="good"),
            # A 50-yard punt returned 10, and a touchback: nets 40 and 30.
            play(play_id=4, play_type="punt", punt_attempt=1, kick_distance=50, return_yards=10, return_team="MIA"),
            play(play_id=5, play_type="punt", punt_attempt=1, kick_distance=50, touchback=1, return_yards=0),
            # Fourth downs: one go converted, one punt.
            play(play_id=6, play_type="run", down=4, fourth_down_converted=1, yardline_100=40, fixed_drive=3, epa=1.0),
            play(play_id=7, play_type="punt", down=4, punt_attempt=1, kick_distance=40, punt_fair_catch=1,
                 return_yards=0, return_team="MIA"),
            # Two-minute snaps and a drive start at the own 25.
            play(play_id=8, play_type="pass", down=1, yardline_100=75, fixed_drive=4, half_seconds_remaining=90, epa=0.5),
            play(play_id=9, play_type="pass", down=1, yardline_100=70, fixed_drive=5, posteam="MIA", defteam="BUF",
                 half_seconds_remaining=60, epa=-0.5),
            # Two accepted fouls on Buffalo, one declined (no yards).
            play(play_id=10, play_type="no_play", penalty=1, penalty_team="BUF", penalty_yards=10),
            play(play_id=11, play_type="no_play", penalty=1, penalty_team="BUF", penalty_yards=5),
            play(play_id=12, play_type="pass", penalty=1, penalty_team="MIA", penalty_yards=0),
        ]
        self.figures = st.club_figures(pd.DataFrame(rows))

    def test_kicking(self):
        buf = self.figures["BUF"]
        self.assertEqual((buf["fg_short"], buf["fg_short_att"]), (1.0, 1))
        self.assertEqual((buf["fg_long"], buf["fg_long_att"]), (0.0, 1))
        self.assertEqual(buf["xp_pct"], 1.0)

    def test_net_punt_counts_touchbacks_back_to_the_20(self):
        self.assertAlmostEqual(self.figures["BUF"]["net_punt"], (40 + 30 + 40) / 3, places=3)
        self.assertAlmostEqual(self.figures["MIA"]["opp_net_punt"], (40 + 30 + 40) / 3, places=3)
        self.assertEqual(self.figures["MIA"]["pr_avg"], 10.0)   # the fair catch is not a return

    def test_fourth_down_two_minute_and_penalties(self):
        buf, mia = self.figures["BUF"], self.figures["MIA"]
        self.assertEqual((buf["fourth_go_rate"], buf["fourth_conv"], buf["fourth_go"]), (0.5, 1.0, 1))
        self.assertEqual(mia["fourth_conv_allowed"], 1.0)
        self.assertEqual((buf["two_min_epa"], mia["two_min_epa"]), (0.5, -0.5))
        self.assertEqual(buf["two_min_epa_allowed"], -0.5)
        self.assertEqual((buf["penalties_pg"], buf["penalty_yds_pg"], mia["drawn_pg"]), (2.0, 15.0, 2.0))
        self.assertEqual(buf["start_own"], 42.5)  # drives from its own 60 and own 25

    def test_ranks_follow_the_better_direction_and_name_their_tries(self):
        ranked = st.rank(self.figures)
        self.assertEqual(ranked["BUF"]["penalties_pg"]["rank"], 2)     # more fouls is worse
        self.assertEqual(ranked["MIA"]["penalties_pg"]["rank"], 1)
        self.assertEqual(ranked["BUF"]["fg_long"]["label"], "FG% 50+ (1 try)")
        self.assertEqual(ranked["BUF"]["fourth_go_rate"]["better"], "neutral")


class NextGenSeasonRowTests(unittest.TestCase):
    def test_the_season_row_wins_over_the_latest_game(self):
        frame = pd.DataFrame([
            {"player_gsis_id": "qb", "week": 10, "attempts": 35},
            {"player_gsis_id": "qb", "week": 0, "attempts": 298},
            {"player_gsis_id": "qb", "week": 9, "attempts": 31},
            {"player_gsis_id": "backup", "week": 2, "attempts": 17},
        ])
        rows = adv._season_rows(frame).set_index("player_gsis_id")
        self.assertEqual(rows.loc["qb", "attempts"], 298)
        self.assertEqual(rows.loc["backup", "attempts"], 17)    # no season row: his latest game


class KickoffForecastTests(unittest.TestCase):
    def test_reads_the_kickoff_hour(self):
        payload = {"hourly": {"time": ["2026-11-23T17:00", "2026-11-23T18:00"],
                              "temperature_2m": [44.2, 43.4], "wind_speed_10m": [10.1, 12.4],
                              "wind_gusts_10m": [18.0, 20.2], "precipitation_probability": [5, 1]}}
        out = nfl_venues.kickoff_forecast("Soldier Field", "2026-11-23T18:00Z", fetch=lambda url: payload)
        self.assertEqual(out, {"temp_f": 43, "wind_mph": 12, "gust_mph": 20, "precip_pct": 1})

    def test_unknown_venue_or_hour_is_none(self):
        self.assertIsNone(nfl_venues.kickoff_forecast("Nowhere Field", "2026-11-23T18:00Z", fetch=lambda url: {}))
        self.assertIsNone(nfl_venues.kickoff_forecast("Soldier Field", "2026-11-23T18:00Z",
                                                      fetch=lambda url: {"hourly": {"time": []}}))


if __name__ == "__main__":
    unittest.main()
