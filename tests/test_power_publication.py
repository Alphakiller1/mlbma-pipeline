"""Power ranking, noise-adjusted logs and CFB predictability as published."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

import cfb_power  # noqa: E402


def load(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


class CfbPlayParsingTests(unittest.TestCase):
    def test_field_goal_distance_reads_both_feeds(self):
        self.assertEqual(cfb_power.fg_distance("#32 R.Villela field goal attempt from 50 yards GOOD"), 50)
        self.assertEqual(cfb_power.fg_distance("Jose Pizano 42 Yd Field Goal"), 42)
        self.assertIsNone(cfb_power.fg_distance("Punt for 42 yds"))

    def test_extra_point_outcomes(self):
        self.assertEqual(cfb_power.extra_point("Isaac Brown 53 Yd Run (Cooper Ranvier PAT blocked)"), 0)
        self.assertEqual(cfb_power.extra_point("E.J. Warner pass to R. Anderson III for 2 yds (Joe Smith Kick)"), 1)
        self.assertEqual(cfb_power.extra_point("TOUCHDOWN, clock 10:02 #39 D.Dellenbach kick attempt failed (H: #42)"), 0)
        self.assertIsNone(cfb_power.extra_point("Adam Jones 7 Yd Run (Two-Point Pass Conversion Failed)"))

    def test_return_touchdown_credits_the_defense_and_fumbles_are_tracked(self):
        plays = [
            {"gameId": 1, "offense": "A", "defense": "B", "playType": "Interception Return Touchdown",
             "playText": "Joey Pope 75 Yd Interception Return (Palmer Domschke Kick)", "ppa": -8.0},
            {"gameId": 1, "offense": "A", "defense": "B", "playType": "Fumble Recovery (Opponent)",
             "playText": "rush for 2 yards fumbled", "ppa": -4.0},
            {"gameId": 1, "offense": "A", "defense": "B", "playType": "Rush", "playText": "rush for 5", "ppa": 0.5},
        ]
        game = cfb_power.aggregate(plays)["1"]
        self.assertEqual(game["B"]["xp"], [1, 1], "the intercepting side kicked the extra point")
        self.assertEqual(game["A"]["n"], 3)
        self.assertEqual(game["A"]["fum_n"], 1)
        self.assertAlmostEqual(game["A"]["ppa"], -11.5)


class PublishedPowerTests(unittest.TestCase):
    def check_table(self, teams, cohort):
        self.assertGreaterEqual(len(teams), cohort)
        places = sorted(t["net"]["rank"] for t in teams.values())
        self.assertEqual(places[0], 1)
        for t in teams.values():
            rec, exp = t["record"], t["expected_record"]
            self.assertAlmostEqual(exp["wins"] + exp["losses"], rec["games"], delta=0.2)
            self.assertLessEqual(t["defense"]["rank"], t["defense"]["of"])

    def test_nba(self):
        power = load("data/public/nba/power.json")
        self.check_table(power["teams"], 30)
        self.assertEqual(set(power["logs"]), set(power["teams"]))
        for games in power["logs"].values():
            for g in games:
                self.assertLess(abs(g["adj_points"] - g["points"]), 30)
                self.assertLessEqual(g["off_rtg"]["rank"], g["off_rtg"]["of"])

    def test_nfl(self):
        log = load("data/public/nfl/game_logs.json")
        self.check_table(log["adjusted"]["teams"], 32)
        self.assertNotIn("non_offensive_td_per_team_game", log["luck_rates"])

    def test_cbb_both_seasons(self):
        for year, floor in ((2026, 360), (2027, 300)):
            teams = {}
            adjusted = total = 0
            for f in (ROOT / f"data/public/cbb/{year}/teams").glob("*.json"):
                c = json.loads(f.read_text(encoding="utf-8"))
                if c.get("adjusted"):
                    teams[f.stem] = c["adjusted"]
                for g in c.get("games") or []:
                    if g.get("points") is not None:
                        total += 1
                        adjusted += g.get("adj_points") is not None
            self.check_table(teams, floor)
            self.assertGreaterEqual(adjusted, 0.95 * total, year)

    def test_cfb(self):
        slate = load("data/public/cfb/slate.json")
        rated = [g for g in slate["games"] if g.get("away_power") and g.get("home_power")]
        self.assertGreaterEqual(len(rated), 0.9 * len(slate["games"]))
        scored = [g for g in slate["games"] if g.get("away_predictability") and g.get("home_predictability")]
        self.assertGreaterEqual(len(scored), 0.9 * len(slate["games"]))
        self.assertIn("through_week", slate["power"])
        for g in rated:
            self.assertEqual(g["away_power"]["net"]["of"], g["home_power"]["net"]["of"])


if __name__ == "__main__":
    unittest.main()
