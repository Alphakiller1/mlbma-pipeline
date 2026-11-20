"""Regression Watch (pipeline/regression.py): luck in each team's margin by
source, reconciling with the desks' noise-adjusted scores."""
import unittest

from pipeline import power, regression


def box(pts, tpm, tpa, ftm, fta):
    return {"pts": pts, "tpm": tpm, "tpa": tpa, "ftm": ftm, "fta": fta}


class BasketballTests(unittest.TestCase):
    def test_parts_sum_to_the_margin_the_adjusted_score_removes(self):
        rates = {"A": (0.36, 0.75), "B": (0.34, 0.70)}
        games = [(box(110, 15, 35, 20, 25), box(100, 10, 33, 18, 22)),
                 (box(98, 9, 30, 15, 24), box(101, 14, 31, 16, 20))]
        tally = regression.Tally()
        adjusted = 0.0
        for own, opp in games:
            regression.basketball_game(tally, own, opp, rates["A"], rates["B"], 5)
            adjusted += (power.basketball_points(own["pts"], own["tpm"], own["tpa"], own["ftm"], own["fta"], rates["A"])
                         - power.basketball_points(opp["pts"], opp["tpm"], opp["tpa"], opp["ftm"], opp["fta"], rates["B"]))
        self.assertAlmostEqual(tally.adjusted, adjusted)
        self.assertAlmostEqual(sum(p[3] for p in tally.parts.values()), tally.margin - tally.adjusted)
        # Hot own shooting adds to the margin; hot opponent shooting takes from it.
        self.assertAlmostEqual(tally.parts["three"][3], 0.5 * 3 * ((15 + 9) - (35 + 30) * 0.36))
        self.assertAlmostEqual(tally.parts["opp_three"][3], -0.5 * 3 * ((10 + 14) - (33 + 31) * 0.34))
        # 110-100 is not close; 98-101 is, and it was lost.
        self.assertEqual((tally.close_wins, tally.close_losses, tally.close_games), (0, 1, 1))

    def test_close_game_record(self):
        tally = regression.Tally()
        for margin in (3, -2, 5, -6, 0):
            tally.game(margin, margin, 5)
        self.assertEqual((tally.close_wins, tally.close_losses, tally.close_games), (2, 1, 4))


class FootballTests(unittest.TestCase):
    def test_kicks_and_fumbles_count_on_the_margin(self):
        tally = regression.Tally()
        kicks = {"fg": (2, 2.5, 3), "xp": (3, 2.85, 3), "opp_fg": (1, 0.8, 1), "opp_xp": (2, 1.9, 2),
                 "fumbles": (-6.0, -4.2, 2), "opp_fumbles": (-1.0, -2.1, 1)}
        luck = 3 * (2 - 2.5) + (3 - 2.85) - 3 * (1 - 0.8) - (2 - 1.9) + (-6.0 + 4.2) - (-1.0 + 2.1)
        regression.football_game(tally, 4, 4 - luck, kicks, 8)
        self.assertAlmostEqual(sum(p[3] for p in tally.parts.values()), luck)
        self.assertAlmostEqual(tally.parts["fg"][3], -1.5)
        self.assertAlmostEqual(tally.parts["opp_fumbles"][3], -1.1)  # opponents fumbled better than average
        self.assertEqual(tally.close_wins, 1)


class PublishTests(unittest.TestCase):
    def tallies(self):
        out = {}
        for team, luck, margins in (("A", 2.0, (10, 3)), ("B", -1.0, (-8, -20)), ("C", 0.5, (1, 1))):
            t = regression.Tally()
            for m in margins:
                t.game(m, m - luck, 5)
                t.part("three", 10, 9, 30, luck)
            out[team] = t
        return out

    def test_luck_ranks_fewest_first_and_margin_highest_first(self):
        out = regression.publish(self.tallies(), {"A", "B", "C"}, 5, ("three",))
        self.assertEqual(out["B"]["luck"], {"value": -1.0, "rank": 1, "of": 3})
        self.assertEqual(out["A"]["luck"]["rank"], 3)
        self.assertEqual(out["A"]["margin"]["rank"], 1)
        self.assertEqual(out["A"]["parts"][0]["luck"]["rank"], 3)
        self.assertEqual(out["A"]["parts"][0]["kind"], "rate")
        # B played no close game: no figure and no place, and the pool is the two that did.
        self.assertIsNone(out["B"]["close"]["value"])
        self.assertEqual(out["C"]["close"], {"wins": 2, "losses": 0, "value": 1.0, "rank": 2, "of": 2})
        self.assertIsNone(regression.check(out, {"A": 2, "B": 2, "C": 2}))

    def test_check_refuses_blocks_that_do_not_reconcile(self):
        out = regression.publish(self.tallies(), {"A", "B", "C"}, 5, ("three",))
        self.assertIn("reads 2 games", regression.check(out, {"A": 3, "B": 2, "C": 2}))
        self.assertIn("missing", regression.check(out, {"A": 2, "B": 2, "C": 2, "D": 4}))
        out["A"]["parts"][0]["luck"]["value"] = 0.0
        self.assertIn("luck parts", regression.check(out, {"A": 2, "B": 2, "C": 2}))


class CfbSlateKeyTests(unittest.TestCase):
    def test_every_cfb_side_block_is_classified(self):
        # 2026-11-20: the first CFB publish with away_regression was refused by
        # the public-field gate. Every per-side block the slate can carry must
        # resolve to a class before it is published.
        import ast
        import json
        from pathlib import Path
        root = Path(__file__).resolve().parents[1]
        tree = ast.parse((root / "scripts" / "publish_public_cfb_slate.py").read_text(encoding="utf-8"))
        keys = next(ast.literal_eval(n.value) for n in ast.walk(tree) if isinstance(n, ast.Assign)
                    and any(getattr(t, "id", "") == "DEPTH_KEYS" for t in n.targets))
        spec = json.loads((root / "design" / "public_metric_classification.json").read_text(encoding="utf-8"))
        classified = {k for v in spec.values() if isinstance(v, list) for k in v}
        self.assertIn("_regression", keys)
        missing = [side + key for key in keys for side in ("away", "home") if side + key not in classified]
        self.assertEqual(missing, [])


if __name__ == "__main__":
    unittest.main()
