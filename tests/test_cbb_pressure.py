"""Backcourt pressure counts turnovers in the first 10 seconds after a score."""
import unittest

from pipeline.cbb_public import pressure as pr

H, A = "1", "2"


def play(clock, kind, team, scoring=False, shooting=False, period=1):
    return {"period": period, "clock": clock, "type": kind, "team": team, "scoring": scoring, "shooting": shooting}


def made(clock, team, period=1):
    return play(clock, "JumpShot", team, scoring=True, shooting=True, period=period)


def ft(clock, team, scored):
    return play(clock, "MadeFreeThrow", team, scoring=scored, shooting=True)


class GamePressureTests(unittest.TestCase):
    def run_game(self, plays):
        return pr.game_pressure(plays, (H, A))

    def test_turnover_inside_the_window_is_forced_and_the_steal_is_credited(self):
        out = self.run_game([made("15:00", H), play("14:54", pr.TURNOVER, A), play("14:54", pr.STEAL, H)])
        self.assertEqual(out[H]["defense"], {"after_score": 1, "forced": 1, "steals": 1})
        self.assertEqual(out[A]["offense"], {"after_score": 1, "lost": 1, "stolen": 1})

    def test_turnover_after_the_window_or_after_a_shot_is_not_pressure(self):
        late = self.run_game([made("15:00", H), play("14:48", pr.TURNOVER, A)])
        self.assertEqual(late[H]["defense"]["forced"], 0)
        shot_first = self.run_game([made("15:00", H), play("14:55", "JumpShot", A, shooting=True),
                                    play("14:53", pr.TURNOVER, A)])
        self.assertEqual(shot_first[H]["defense"]["forced"], 0)
        self.assertEqual(shot_first[H]["defense"]["after_score"], 1)

    def test_free_throw_trips_count_once_and_a_missed_last_throw_is_live(self):
        and_one = self.run_game([made("10:00", H), ft("10:00", H, True), play("9:55", pr.TURNOVER, A)])
        self.assertEqual(and_one[H]["defense"], {"after_score": 1, "forced": 1, "steals": 0})
        missed_last = self.run_game([ft("8:00", H, True), ft("8:00", H, False), play("7:57", pr.TURNOVER, A)])
        self.assertEqual(missed_last[H]["defense"]["after_score"], 0)

    def test_late_regulation_and_overtime_are_game_state(self):
        out = self.run_game([made("3:59", H, period=2), play("3:55", pr.TURNOVER, A, period=2),
                             made("4:00", A, period=3), play("3:58", pr.TURNOVER, H, period=3)])
        self.assertEqual(out[H]["defense"]["after_score"], 0)
        self.assertEqual(out[A]["defense"]["after_score"], 0)

    def test_espn_payload_normalises(self):
        payload = {"plays": [{"period": {"number": 1}, "clock": {"displayValue": "0:45.3"}, "type": {"text": "JumpShot"},
                              "team": {"id": 1}, "scoringPlay": True, "shootingPlay": True}]}
        rows = pr.espn_plays(payload)
        self.assertEqual(rows[0]["team"], "1")
        self.assertAlmostEqual(pr.seconds(rows[0]["clock"]), 45.3)


class SummaryTests(unittest.TestCase):
    def test_rates_are_per_100_post_score_possessions(self):
        block = pr.summarise({"defense": {"after_score": 200, "forced": 9, "steals": 4},
                              "offense": {"after_score": 0, "lost": 0, "stolen": 0}}, 6, "2026-11-09")
        self.assertEqual(block["defense"]["forced_per100"], 4.5)
        self.assertEqual(block["defense"]["steals_per100"], 2.0)
        self.assertIsNone(block["offense"]["lost_per100"])
        self.assertEqual(block["window_seconds"], 10)
        self.assertIsNone(pr.summarise({}, 0, None))

    def test_thin_sides_stay_out_of_the_rank_pool(self):
        blocks = [{"defense": {"after_score": 19, "forced_per100": 9.0}},
                  {"defense": {"after_score": 20, "forced_per100": 3.0}}, None]
        self.assertEqual(pr.rank_values(blocks, "pressure_forced_per100"), [3.0])


if __name__ == "__main__":
    unittest.main()
