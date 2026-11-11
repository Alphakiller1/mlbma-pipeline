"""Adjusted power ranking engine (pipeline/power.py)."""
import math
import random
import unittest

from pipeline import power


def league(seed=7, teams=12, games=160, home=1.5):
    rng = random.Random(seed)
    names = [f"T{i}" for i in range(teams)]
    true_o = {t: rng.gauss(0, 4) for t in names}
    true_d = {t: rng.gauss(0, 3) for t in names}
    rows, played = [], []
    for _ in range(games):
        h, a = rng.sample(names, 2)
        neutral = rng.random() < 0.1
        loc = 0 if neutral else 1
        hp = 100 + true_o[h] + true_d[a] + home * loc + rng.gauss(0, 8)
        ap = 100 + true_o[a] + true_d[h] - home * loc + rng.gauss(0, 8)
        rows += [power.Row(h, a, loc, hp), power.Row(a, h, -loc, ap)]
        played += [power.Played(h, a, loc, hp > ap, 1.0, hp - ap), power.Played(a, h, -loc, ap > hp, 1.0, ap - hp)]
    return rows, played, true_o, true_d


class RidgeTests(unittest.TestCase):
    def test_matches_the_closed_form_solution(self):
        rows, _, _, _ = league()
        fit = power.ridge(rows, penalty=3.0)
        # Normal equations: every team's offense residual sums to penalty * effect.
        for team, effect in fit.offense.items():
            resid = sum(r.value - fit.expect(r.offense, r.defense, r.location) for r in rows if r.offense == team)
            self.assertAlmostEqual(resid, 3.0 * effect, places=5)
        for team, effect in fit.defense.items():
            resid = sum(r.value - fit.expect(r.offense, r.defense, r.location) for r in rows if r.defense == team)
            self.assertAlmostEqual(resid, 3.0 * effect, places=5)
        self.assertAlmostEqual(sum(r.value - fit.expect(r.offense, r.defense, r.location) for r in rows), 0.0, places=5)

    def test_recovers_team_strength_and_home_edge(self):
        rows, _, true_o, true_d = league(games=2000)
        fit = power.ridge(rows, penalty=1.0)
        for t in true_o:
            self.assertLess(abs(fit.offense[t] - (true_o[t] - sum(true_o.values()) / len(true_o))), 1.2)
        self.assertLess(abs(fit.home - 1.5), 0.4)

    def test_penalty_pulls_thin_samples_to_average(self):
        rows = [power.Row("A", "B", 0, 130.0), power.Row("B", "A", 0, 70.0)]
        loose, tight = power.ridge(rows, 0.01), power.ridge(rows, 10.0)
        self.assertGreater(abs(loose.offense["A"]), abs(tight.offense["A"]))


class PriorTests(unittest.TestCase):
    def test_a_thin_sample_starts_from_last_season(self):
        rows = [power.Row("A", "B", 0, 100.0), power.Row("B", "A", 0, 100.0)]
        prior = power.season_prior({"A": 120.0, "B": 100.0}, {"A": 100.0, "B": 110.0}, 0.5)
        self.assertEqual(prior[0]["A"], 5.0)
        fit = power.ridge(rows, 4.0, prior=prior)
        self.assertGreater(fit.offense["A"], fit.offense["B"], "an even game leaves last season's order")
        many = [power.Row("A", "B", 0, 90.0), power.Row("B", "A", 0, 110.0)] * 60
        self.assertLess(power.ridge(many, 4.0, prior=prior).offense["A"], 0, "this season's games take over")


class TableTests(unittest.TestCase):
    def test_places_record_and_expected_wins(self):
        rows, played, _, _ = league()
        fit = power.ridge(rows, 2.0)
        out = power.table(fit, played, {f"T{i}" for i in range(12)})
        teams = out["teams"]
        self.assertEqual(len(teams), 12)
        nets = sorted(teams.values(), key=lambda r: r["net"]["rank"])
        self.assertEqual([r["net"]["rank"] for r in nets], list(range(1, 13)))
        self.assertGreaterEqual(nets[0]["net"]["value"], nets[-1]["net"]["value"])
        # Defense: fewest allowed ranks first.
        best_d = min(teams.values(), key=lambda r: r["defense"]["value"])
        self.assertEqual(best_d["defense"]["rank"], 1)
        for r in teams.values():
            rec, exp = r["record"], r["expected_record"]
            self.assertEqual(rec["wins"] + rec["losses"], rec["games"])
            self.assertAlmostEqual(exp["wins"] + exp["losses"], rec["games"], places=0)
            self.assertAlmostEqual(r["luck"]["value"], (rec["wins"] - exp["wins"]) / rec["games"], places=1)
        # Expected wins across the league sum to the games played over two.
        self.assertAlmostEqual(sum(r["expected_record"]["wins"] for r in teams.values()), len(played) / 2, delta=2)


class BasketballLuckTests(unittest.TestCase):
    def test_half_the_shooting_luck_comes_out(self):
        rates = power.shooting_rates({"A": {"tpm": 300, "tpa": 1000, "ftm": 700, "fta": 1000}})
        three, free = rates["A"]
        self.assertAlmostEqual(three, 0.3)  # the only team is the league
        self.assertAlmostEqual(free, 0.7)
        hot = power.shooting_rates({"A": {"tpm": 50, "tpa": 100, "ftm": 0, "fta": 0},
                                    "B": {"tpm": 300, "tpa": 1000, "ftm": 0, "fta": 0}})
        self.assertTrue(0.3 < hot["A"][0] < 0.36, "a hot 100 attempts are regressed hard")
        # 6 of 10 threes against a 30% expectation: +3 threes = +9 points of luck, half removed.
        pts = power.basketball_points(80, 6, 10, 10, 10, (0.3, 0.7))
        self.assertAlmostEqual(pts, 80 - 0.5 * (3 * 3 + 3))
        self.assertEqual(rates[""], (0.3, 0.7))


if __name__ == "__main__":
    unittest.main()
