"""Penalties by unit (NFL nflverse, CFB scorer text) and the NFL Elo (2026-11-19)."""
import unittest

import pandas as pd

from outputs import nfl_elo, nfl_special_teams
from scripts import cfb_penalties


class CfbFoulTests(unittest.TestCase):
    def test_accepted_declined_offsetting_and_unyarded(self):
        f = cfb_penalties.fouls
        one = f("(08:35) PENALTY UGA False Start (#71 E.Greene III) 5 yards from MIZ37 to MIZ42. NO PLAY")
        self.assertEqual([(x["tok"], x["kind"], x["yds"]) for x in one], [("UGA", "false start", 5)])
        self.assertEqual(f("... for 6 yards to the WMU07 PENALTY AKR Offside declined"), [])
        self.assertEqual(f("PENALTY KSU Pass Interference offsetting SAM Ineligible Downfield on Pass offsetting. NO PLAY"), [])
        self.assertEqual([(x["kind"], x["yds"]) for x in f("PENALTY AKR Offside (#55 J.Williams). NO PLAY")],
                         [("offside", 0)])
        two = f("rush for 3 yards PENALTY OSU Holding (#8 K.Lewis) 10 yards from OSU49 to OSU39 "
                "PENALTY TTU Face Mask (#2 A.B) 15 yards from OSU39 to TTU46, 1ST DOWN")
        self.assertEqual([(x["tok"], x["kind"], x["yds"], x["first"]) for x in two],
                         [("OSU", "holding", 10, False), ("TTU", "face mask", 15, True)])

    def test_game_units_and_a_restated_foul_counted_once(self):
        def play(text, team, end=None):
            return {"text": text, "start": {"team": {"id": team}}, "end": {"yardsToEndzone": end}, "type": {"text": "Rush"}}
        plays = [
            # Team 2 has the ball 30 yards out at MIZ30: MIZ is team 1's end of the field.
            play("(1:00) #5 A.B rush left for 4 yards to the MIZ30", "2", 30),
            # Team 1 has the ball 40 yards out at UGA40: UGA is team 2's.
            play("(0:50) #5 A.B rush left for 4 yards to the UGA40", "1", 40),
            play("PENALTY UGA Holding (#71 C) 10 yards from MIZ30 to MIZ40. NO PLAY", "2"),
            play("pass incomplete PENALTY MIZ Pass Interference (#2 D) 15 yards from UGA40 to MIZ45, 1ST DOWN. NO PLAY", "2"),
            play("PENALTY MIZ UNS: Unsportsmanlike Conduct 15 yards from MIZ45 to MIZ30. NO PLAY", "2"),
            play("PENALTY MIZ UNS: Unsportsmanlike Conduct  15 yards from MIZ45 to MIZ30. NO PLAY", "2"),
        ]
        payload = {"drives": {"previous": [{"plays": plays}]},
                   "header": {"competitions": [{"competitors": [{"team": {"id": "1"}}, {"team": {"id": "2"}}]}]}}
        out = cfb_penalties.parse_game(payload)["teams"]
        self.assertEqual(out["1"]["pen_n"], 2, "MIZ: pass interference and one unsportsmanlike, not two")
        self.assertEqual(out["1"]["def_n"], 2)
        self.assertEqual(out["1"]["def_dpi"], 1)
        self.assertEqual(out["1"]["def_fd"], 1)
        self.assertEqual(out["1"]["def_personal"], 1)
        self.assertEqual(out["2"]["off_n"], 1)
        self.assertEqual(out["2"]["off_holding"], 1)


class NflPenaltyTests(unittest.TestCase):
    def test_units_sum_to_the_club(self):
        rows = [
            # (posteam, defteam, penalty_team, type, yards, play_type, first_down)
            ("KC", "BUF", "KC", "False Start", 5, "no_play", 0),
            ("KC", "BUF", "BUF", "Defensive Pass Interference", 30, "pass", 1),
            ("BUF", "KC", "KC", "Roughing the Passer", 15, "pass", 1),
            ("BUF", "KC", "BUF", "Offensive Holding", 10, "run", 0),
            ("KC", "BUF", "KC", "Offensive Holding", 0, "run", 0),          # declined: no yards, not counted
            ("BUF", "KC", "BUF", "Illegal Block Above the Waist", 10, "punt", 0),
        ]
        frame = pd.DataFrame([{"game_id": "g1", "season_type": "REG", "home_team": "KC", "away_team": "BUF",
                               "posteam": p, "defteam": d, "penalty": 1, "penalty_team": t, "penalty_type": k,
                               "penalty_yards": y, "play_type": pt, "first_down_penalty": fd,
                               "special_teams_play": 1 if pt == "punt" else 0} for p, d, t, k, y, pt, fd in rows])
        out = nfl_special_teams.penalty_figures(frame, ["KC", "BUF"], {"KC": 1, "BUF": 1})
        kc, buf = out["KC"], out["BUF"]
        self.assertEqual((kc["penalties_pg"], kc["off_pen_pg"], kc["def_pen_pg"], kc["st_pen_pg"]), (2, 1, 1, 0))
        self.assertEqual((kc["off_presnap_pg"], kc["def_personal_pg"], kc["def_pen_fd_pg"]), (1, 1, 1))
        self.assertEqual((buf["penalties_pg"], buf["def_dpi_pg"], buf["off_holding_pg"], buf["st_pen_pg"]), (3, 1, 1, 1))
        self.assertEqual(kc["off_dpi_drawn_yds_pg"], 30)
        self.assertEqual(kc["def_drawn_pg"], 1)
        self.assertEqual(kc["net_pen_yds_pg"], 50 - 20)


class NflEloTests(unittest.TestCase):
    def test_winner_gains_and_seasons_regress(self):
        games = pd.DataFrame([
            {"season": 2025, "week": 1, "gameday": "2025-09-07", "game_type": "REG", "home_team": "KC",
             "away_team": "BUF", "home_score": 30, "away_score": 10, "location": "Home"},
            {"season": 2026, "week": 1, "gameday": "2026-09-10", "game_type": "REG", "home_team": "BUF",
             "away_team": "KC", "home_score": None, "away_score": None, "location": "Home"},
        ])
        r25 = nfl_elo.ratings(2025, 18, games)
        self.assertGreater(r25["KC"], 1505)
        self.assertAlmostEqual(r25["KC"] + r25["BUF"], 2 * 1505, places=6)
        r26 = nfl_elo.ratings(2026, 1, games)
        self.assertAlmostEqual(r26["KC"] - 1505, (r25["KC"] - 1505) * (1 - nfl_elo.REVERT), places=6)
        self.assertEqual(nfl_elo._code("OAK"), "LV")


if __name__ == "__main__":
    unittest.main()
