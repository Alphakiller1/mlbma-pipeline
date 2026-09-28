"""The team run game: designed runs only, and only current ball carriers."""
import unittest

import pandas as pd

from outputs import nfl_run_game as rg


def run(game, team, opp, rusher, yards, season=2026, scramble=0, kneel=0, epa=0.1, success=1, td=0):
    return {"game_id": game, "season": season, "posteam": team, "defteam": opp,
            "rush_attempt": 1, "qb_scramble": scramble, "qb_kneel": kneel,
            "rusher_player_id": rusher, "rusher_player_name": rusher,
            "yards_gained": yards, "epa": epa, "success": success, "touchdown": td}


class RunGameTests(unittest.TestCase):
    def clubs(self):
        # 30 clubs so the unit is placed; AAA and BBB carry the checks.
        rows = []
        for i in range(30):
            t, o = f"T{i:02d}", f"T{(i + 1) % 30:02d}"
            rows.append(run(f"g{i}", t, o, f"p{i}", 4))
        rows += [
            run("x1", "AAA", "BBB", "rb1", 12),
            run("x1", "AAA", "BBB", "rb1", -1, success=0, epa=-0.5),
            run("x1", "AAA", "BBB", "qb1", 20, scramble=1),   # scramble: not a designed run
            run("x1", "AAA", "BBB", "qb1", -1, kneel=1),      # kneel: not a designed run
            run("x1", "AAA", "BBB", "rb2", 5, td=1),
            run("x1", "BBB", "AAA", "bb1", 3),
        ]
        prior = [run("y1", "AAA", "BBB", "old", 8, season=2025),
                 run("y1", "AAA", "BBB", "rb1", 3, season=2025)]
        return rg.build(pd.DataFrame(rows), pd.DataFrame(prior), 2026,
                        {"rb1": "RB", "rb2": "RB"}, {"rb1": "Back One"})

    def test_unit_counts_designed_runs_only(self):
        unit = self.clubs()["AAA"]["current"]["offense"]
        self.assertEqual(unit["carries"], 3)
        self.assertEqual(unit["yards_per_carry"], round(16 / 3, 2))
        self.assertAlmostEqual(unit["explosive_rate"], round(1 / 3, 4))
        self.assertAlmostEqual(unit["stuff_rate"], round(1 / 3, 4))
        self.assertEqual(unit["touchdowns"], 1)
        # The defense is placed on what it allowed on the same plays.
        self.assertEqual(self.clubs()["BBB"]["current"]["defense"]["carries"], 3)
        place = self.clubs()["AAA"]["current"]["offense"]["ranks"]["yards_per_carry"]
        self.assertEqual(set(place), {"place", "of"})

    def test_carriers_are_current_players_with_shares(self):
        out = self.clubs()["AAA"]
        now = {c["player_id"]: c for c in out["current"]["carriers"]}
        self.assertEqual(set(now), {"rb1", "rb2"})
        self.assertEqual(now["rb1"]["player_name"], "Back One")
        self.assertAlmostEqual(now["rb1"]["carry_share"], round(2 / 3, 4))
        both = {c["player_id"] for c in out["combined"]["carriers"]}
        # A 2025 back with no 2026 carry is not listed; the unit still counts him.
        self.assertNotIn("old", both)
        self.assertEqual(out["combined"]["offense"]["carries"], 5)
        self.assertEqual(out["seasons"]["combined"], [2025, 2026])


if __name__ == "__main__":
    unittest.main()
