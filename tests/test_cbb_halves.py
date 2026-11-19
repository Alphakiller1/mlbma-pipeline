"""CBB first- and second-half figures (pipeline/cbb_public/halves.py)."""
import unittest

from pipeline.cbb_public import espn_boxes, export, halves


def shot(team, period, made, points=2):
    return {"team": {"id": team}, "period": {"number": period}, "shootingPlay": True, "scoringPlay": made,
            "pointsAttempted": points, "text": ("makes" if made else "misses") + (" three point jumper" if points == 3 else " jumper"),
            "type": {"text": "JumpShot"}}


def event(team, period, kind):
    return {"team": {"id": team}, "period": {"number": period}, "type": {"text": kind}, "text": kind}


def payload(h1_a, h2_a, plays):
    return {"header": {"competitions": [{"competitors": [
        {"team": {"id": "1"}, "linescores": [{"displayValue": str(h1_a[0])}, {"displayValue": str(h2_a[0])}]},
        {"team": {"id": "2"}, "linescores": [{"displayValue": str(h1_a[1])}, {"displayValue": str(h2_a[1])}]}]}]},
        "plays": plays}


PLAYS = [shot("1", 1, True), shot("1", 1, True, 3), shot("1", 1, False), event("1", 1, "Offensive Rebound"),
         shot("2", 1, True), event("2", 1, "Lost Ball Turnover"), event("2", 1, "Defensive Rebound"),
         shot("1", 2, True), shot("2", 2, True, 3), shot("2", 2, False), event("1", 2, "Defensive Rebound"),
         shot("1", 3, True)]  # overtime is not a half


class HalfTests(unittest.TestCase):
    def test_counts_reconcile_to_the_line_score(self):
        out = halves.game_halves(payload((5, 2), (2, 3), PLAYS), ["1", "2"])
        self.assertEqual(out["1"]["h1"], {"pts": 5, "fga": 3, "fgm": 2, "tpa": 1, "tpm": 1, "fta": 0, "ftm": 0,
                                          "orb": 1, "drb": 0, "tov": 0})
        self.assertEqual(out["2"]["h1"]["tov"], 1)
        self.assertEqual(out["2"]["h2"]["tpm"], 1)
        # One side's half off the line score: neither side's halves are used for that game.
        self.assertEqual(halves.game_halves(payload((5, 2), (4, 3), PLAYS), ["1", "2"]), {"1": None, "2": None})

    def test_rates_and_pace(self):
        out = halves.game_halves(payload((5, 2), (2, 3), PLAYS), ["1", "2"])
        r = halves.rates([(out["1"], out["2"])])
        self.assertEqual(r["halves_games_all"], 1)
        self.assertEqual(r["h1_pts_o"], 5)
        self.assertEqual(r["h1_pts_d"], 2)
        self.assertAlmostEqual(r["h1_efg_o"], (2 + 0.5) / 3)
        poss = ((3 - 1 + 0) + (1 - 0 + 1)) / 2
        self.assertAlmostEqual(r["h1_poss"], poss)
        self.assertAlmostEqual(r["h1_ppp_o"], 5 / poss)
        self.assertAlmostEqual(r["h1_spp"], 1200 / (2 * poss))
        self.assertAlmostEqual(r["h1_orb_o"], 1 / (1 + 1))
        self.assertAlmostEqual(r["h2_drb_d"], 1 / (1 + 0))

    def test_half_keys_are_published_rate_fields(self):
        self.assertLessEqual(set(halves.KEYS), set(export.RATE_FIELDS))
        self.assertLessEqual(set(halves.KEYS), set(espn_boxes.rate_rows([])))


if __name__ == "__main__":
    unittest.main()
