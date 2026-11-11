"""Predictability reads an offense's game spread from how it scores (pipeline/predictability.py)."""
import random
import unittest

from pipeline import predictability as pr


def basketball_league(seed=7, teams=24, games=20, threes=None, slow=None):
    """Synthetic box rows: most offenses take 35% threes over 70 possessions;
    ``threes`` maps a team to its three-point share, ``slow`` to its possessions."""
    rng = random.Random(seed)
    out = {}
    for i in range(teams):
        team = f"T{i}"
        share = (threes or {}).get(team, 0.35)
        poss = (slow or {}).get(team, 70)
        rows = []
        for _ in range(games):
            fga = int(poss * 0.85)
            tpa = int(fga * share)
            tpm = sum(rng.random() < 0.35 for _ in range(tpa))
            twos = sum(rng.random() < 0.52 for _ in range(fga - tpa))
            fta = 18
            ftm = sum(rng.random() < 0.72 for _ in range(fta))
            points = 2 * twos + 3 * tpm + ftm
            rows.append(pr.basketball_game(twos + tpm, tpm, ftm, fta, points, poss))
        out[team] = rows
    return out


class PredictabilityTests(unittest.TestCase):
    def test_lumpier_scoring_and_fewer_possessions_read_as_less_predictable(self):
        out = pr.score(basketball_league(threes={"T0": 0.65}, slow={"T1": 58}), pr.NBA)
        self.assertEqual(out["T0"]["offense"]["place"], out["T0"]["offense"]["of"])
        self.assertGreater(out["T1"]["offense"]["volatility"], 1.03)
        self.assertGreater(out["T0"]["offense"]["off_curve"], 0.1336)

    def test_league_average_offense_sits_on_the_normal_tail(self):
        out = pr.score(basketball_league(), pr.NBA)
        curve = next(iter(out.values()))["curve"]
        self.assertAlmostEqual(curve["league_off_curve"], 0.1336, places=3)
        typical = sorted(v["offense"]["off_curve"] for v in out.values())
        self.assertLess(abs(typical[len(typical) // 2] - 0.1336), 0.01)

    def test_scores_are_percentiles_with_complete_places(self):
        out = pr.score(basketball_league(threes={"T3": 0.6}), pr.CBB)
        rows = [v["offense"] for v in out.values()]
        self.assertEqual({r["of"] for r in rows}, {len(rows)})
        self.assertEqual(min(r["place"] for r in rows), 1)
        self.assertTrue(all(0 <= r["predictability"] <= 100 for r in rows))
        self.assertTrue(all(set(v) == {"offense", "curve"} for v in out.values()), "defenses are never scored")

    def test_thin_samples_are_left_out(self):
        league = basketball_league(games=2)
        self.assertEqual(pr.score(league, pr.NBA), {}, "NBA needs three games")
        self.assertEqual(len(pr.score(league, pr.CBB)), 24)

    def test_free_throw_trips_add_the_partner_throw(self):
        _, _, sq = pr.basketball_game(fgm=0, tpm=0, ftm=2, fta=2, points=2, possessions=1)
        self.assertEqual(sq, 4.0)


if __name__ == "__main__":
    unittest.main()
