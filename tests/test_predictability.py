"""Predictability reads each unit's spread around expectation against its league's curve."""
import random
import unittest

from pipeline import predictability as pr


def league_games(seed=7, teams=24, rounds=14, wild_offense="T0", calm_defense="T1"):
    rng = random.Random(seed)
    names = [f"T{i}" for i in range(teams)]
    level = {t: rng.gauss(0, 4) for t in names}
    stop = {t: rng.gauss(0, 4) for t in names}
    games = []
    for r in range(rounds):
        order = names[:]
        rng.shuffle(order)
        for home, away in zip(order[::2], order[1::2]):
            row = {"home": home, "away": away}
            for side, other in (("home", away), ("away", home)):
                me = home if side == "home" else away
                noise = 10.0
                if me == wild_offense:
                    noise *= 2.5
                if other == calm_defense:
                    noise *= 0.35
                row[side + "_off"] = 110 + level[me] - stop[other] + rng.gauss(0, noise)
            games.append(row)
    return games


class PredictabilityTests(unittest.TestCase):
    def setUp(self):
        self.out = pr.score(league_games(), pr.NBA)

    def test_volatile_offense_ranks_least_predictable(self):
        offense = {t: v["offense"] for t, v in self.out.items()}
        worst = max(offense, key=lambda t: offense[t]["volatility"])
        self.assertEqual(worst, "T0")
        self.assertEqual(offense["T0"]["place"], offense["T0"]["of"])
        self.assertLess(offense["T0"]["predictability"], 10)
        self.assertGreater(offense["T0"]["off_curve"], 0.25)

    def test_variance_preventing_defense_ranks_most_predictable(self):
        defense = {t: v["defense"] for t, v in self.out.items()}
        self.assertEqual(defense["T1"]["place"], 1)
        self.assertEqual(defense["T1"]["predictability"], 100)
        self.assertLess(defense["T1"]["off_curve"], 0.10)

    def test_league_average_unit_sits_on_the_normal_tail(self):
        curve = next(iter(self.out.values()))["curve"]
        self.assertAlmostEqual(curve["league_off_curve"], 0.1336, places=3)
        typical = sorted(v["offense"]["off_curve"] for t, v in self.out.items() if t not in ("T0", "T1"))
        median = typical[len(typical) // 2]
        self.assertLess(abs(median - 0.1336), 0.06)

    def test_scores_are_percentiles_and_places_are_complete(self):
        for unit in ("team", "offense", "defense"):
            rows = [v[unit] for v in self.out.values()]
            self.assertEqual({r["of"] for r in rows}, {len(rows)})
            self.assertEqual(min(r["place"] for r in rows), 1)
            self.assertTrue(all(0 <= r["predictability"] <= 100 for r in rows))

    def test_thin_samples_lean_on_the_league_and_outsiders_are_excluded(self):
        games = league_games(rounds=3)
        out = pr.score(games, pr.NBA)
        self.assertEqual(out, {}, "NBA needs five games before a unit is scored")
        out = pr.score(league_games(), pr.CBB, teams={f"T{i}" for i in range(12)})
        self.assertTrue(set(out) <= {f"T{i}" for i in range(12)})


if __name__ == "__main__":
    unittest.main()
