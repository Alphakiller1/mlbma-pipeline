"""CBB shot kinds (drives, floaters, pull-ups on the games whose feed names
them) and shot quality (xeFG, predicted eFG) from ESPN play text."""
import unittest

from pipeline.cbb_public import espn_boxes, shot_quality


def play(team, text, made=False, points=2):
    return {"team": {"id": team}, "text": text, "shootingPlay": True, "scoringPlay": made,
            "scoreValue": points if made else 0}


TAGGED = {"plays": [play("1", "A makes driving layup", True), play("1", "A misses pullup jump shot"),
                    play("1", "A makes 9-foot floating jump shot", True), play("1", "A makes three point jumper", True, 3),
                    play("2", "B misses driving layup"), play("2", "B makes driving dunk", True),
                    play("2", "B misses pull-up jump shot"), play("2", "B makes free throw 1 of 2", True, 1),
                    play("2", "B makes layup", True)]}
PLAIN = {"plays": [play("1", "A makes layup", True), play("1", "A misses 7-foot jumper"),
                   play("2", "B makes three point jumper", True, 3), play("2", "B makes dunk", True)]}


class ShotKindTests(unittest.TestCase):
    def test_a_feed_that_names_kinds_is_read_and_a_plain_one_is_not(self):
        kinds = espn_boxes.shot_kinds(TAGGED, ["1", "2"])
        self.assertEqual(kinds["1"]["fga"], 4)
        self.assertEqual(kinds["1"]["driving"], [1, 2])
        self.assertEqual(kinds["1"]["floater"], [1, 2])
        self.assertEqual(kinds["1"]["pullup"], [1, 0])
        self.assertEqual(kinds["2"]["fga"], 4, "free throws are not field-goal attempts")
        self.assertEqual(espn_boxes.shot_kinds(PLAIN, ["1", "2"]), {"1": None, "2": None})

    def test_kind_rates_count_only_named_games(self):
        kinds = espn_boxes.shot_kinds(TAGGED, ["1", "2"])
        rates = espn_boxes.kind_rates([(kinds["1"], kinds["2"])])
        self.assertEqual(rates["shot_kinds_games_all"], 1)
        self.assertAlmostEqual(rates["driving_freq_off_all"], 0.25)
        self.assertAlmostEqual(rates["driving_freq_def_all"], 0.5)
        self.assertAlmostEqual(rates["driving_ppa_def_all"], 1.0)
        self.assertIsNone(rates["floater_ppa_def_all"], "no attempts reads None, never 0 points a shot")
        empty = espn_boxes.kind_rates([])
        self.assertEqual(empty["shot_kinds_games_all"], 0)
        self.assertIsNone(empty["driving_freq_off_all"])


class RateContractTests(unittest.TestCase):
    def test_every_rate_the_supplement_writes_is_a_published_rate_field(self):
        # scripts/publish_public_cbb.py refuses a team whose box rates and rates
        # carry different keys; box rates are built from RATE_FIELDS.
        from pipeline.cbb_public import export
        written = set(espn_boxes.kind_rates([])) | {"xefg_o_all", "xefg_d_all", "pefg_o_all", "pefg_d_all"}
        self.assertLessEqual(written, set(export.RATE_FIELDS))
        box = espn_boxes.rate_rows([])
        self.assertTrue(written <= set(box), sorted(written - set(box)))


class ShotQualityTests(unittest.TestCase):
    def test_classes_and_expected_efg(self):
        classes = shot_quality.game_classes(PLAIN, ["1", "2"])
        self.assertEqual(classes["1"], {"rim": [1, 1], "two": [1, 0], "three": [0, 0]})
        self.assertEqual(classes["2"], {"rim": [1, 1], "two": [0, 0], "three": [1, 1]})
        price = shot_quality.PRICE
        self.assertAlmostEqual(shot_quality.xefg([classes["1"]]), (price["rim"] + price["two"]) / 2)
        self.assertIsNone(shot_quality.xefg([]))

    def test_predicted_efg_reads_the_games_weights_and_orders_teams(self):
        spec = shot_quality.SPEC
        self.assertEqual(spec["fit"]["features"], ["c", "o_efg", "o_xefg", "d_efg", "d_xefg"])
        for cut, w in spec["weights"].items():
            self.assertTrue(all(x >= 0 for x in w[1:]), cut)
        self.assertIsNone(shot_quality.weights_for(1))
        self.assertEqual(shot_quality.weights_for(9), spec["weights"]["8"])
        teams = {"A": {"games": 6, "o_efg": .56, "o_xefg": .53, "d_efg": .46, "d_xefg": .47},
                 "B": {"games": 6, "o_efg": .48, "o_xefg": .49, "d_efg": .54, "d_xefg": .52},
                 "C": {"games": 1, "o_efg": .50, "o_xefg": .50, "d_efg": .50, "d_xefg": .50}}
        out = shot_quality.predicted(teams)
        self.assertNotIn("C", out, "one game is below the first fitted cut")
        self.assertGreater(out["A"]["pefg_o_all"], out["B"]["pefg_o_all"])
        self.assertLess(out["A"]["pefg_d_all"], out["B"]["pefg_d_all"])
        for r in out.values():
            for v in r.values():
                self.assertTrue(0.35 < v < 0.65, v)


if __name__ == "__main__":
    unittest.main()
