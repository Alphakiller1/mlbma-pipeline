"""The X Factor Score (owner 2026-11-28): what a school's week is worth.

Two inputs are scored because they are the two that predict; the other three
are measured, printed and marked. The offence and defence lines come from the
same fit against points scored and allowed and must add back to the score.
"""
import json
import math
import unittest
from pathlib import Path

from scripts import cfb_trip

ROOT = Path(__file__).resolve().parents[1]
FIT = json.loads((ROOT / "outputs" / "trip_difficulty_cfb.json").read_text(encoding="utf-8"))


def week(miles=None, lookahead=None, rest=7.0, tz=0.0, letdown=0.0):
    return {"rest": rest, "miles": miles, "tz": tz, "letdown": letdown, "lookahead": lookahead}


class ScoreTests(unittest.TestCase):
    def test_a_long_trip_costs_points_and_a_home_game_gains_them(self):
        away = cfb_trip.priced(FIT, week(miles=1000, lookahead=0.0))["points"]["margin"]
        home = cfb_trip.priced(FIT, week(miles=0, lookahead=0.0))["points"]["margin"]
        self.assertLess(away, 0)
        self.assertGreater(home, 0)
        self.assertAlmostEqual(away, -2.0, delta=0.3)

    def test_the_unit_lines_add_back_to_the_score(self):
        """Points scored minus points allowed is the margin, so the two unit
        lines must reconcile with the score a reader sees beside them."""
        points = cfb_trip.priced(FIT, week(miles=1200, lookahead=8.0))["points"]
        self.assertAlmostEqual(points["offense"] - points["defense"], points["margin"], delta=0.25)

    def test_a_tougher_game_next_week_scores_above_zero_not_below(self):
        """Measured over 2021-2026, not assumed: a school between tougher
        games beats expectation, so this must never read as a trap."""
        ahead = cfb_trip.priced(FIT, week(miles=0, lookahead=15.0))["points"]["margin"]
        flat = cfb_trip.priced(FIT, week(miles=0, lookahead=0.0))["points"]["margin"]
        self.assertGreater(ahead, flat)
        self.assertIn("beats expectation", FIT["sequence_note"])

    def test_only_the_two_fitted_inputs_carry_points(self):
        priced = cfb_trip.priced(FIT, week(miles=500, lookahead=3.0, rest=14, tz=3, letdown=25))
        self.assertEqual(set(priced["by_input"]), {"sqrt_miles", "lookahead"})

    def test_the_unscored_inputs_are_printed_and_marked(self):
        values = week(miles=500, lookahead=3.0, rest=14.0, tz=2.0, letdown=9.0)
        priced = cfb_trip.priced(FIT, values)
        rows = [cfb_trip._entry(FIT, key, label, unit, values, priced["by_input"])
                for key, label, unit in cfb_trip.ROWS]
        scored = {r["label"] for r in rows if r["scored"]}
        self.assertEqual(scored, {"Travel", "Next Opponent"})
        for row in rows:
            self.assertIsNotNone(row["value"])
            if not row["scored"]:
                self.assertIsNone(row["points"])
                # The held-out number it was rejected on travels with it; the
                # panel phrases the sentence, because a free-text note on a
                # published row classifies as a model label.
                self.assertIsNotNone(row["held_out_r2_with_it"])
                self.assertNotIn("note", row)

    def test_distance_is_priced_on_its_square_root(self):
        """A linear mile priced a 3,000-mile flight at nine points; the first
        few hundred miles of a trip are most of it."""
        self.assertIn("sqrt_miles", FIT["features"])
        one = abs(cfb_trip.priced(FIT, week(miles=1000, lookahead=0.0))["points"]["margin"])
        four = abs(cfb_trip.priced(FIT, week(miles=4000, lookahead=0.0))["points"]["margin"])
        self.assertLess(four, 3 * one)

    def test_a_missing_input_is_not_counted_as_zero(self):
        neutral = cfb_trip.priced(FIT, week(miles=None, lookahead=4.0))
        self.assertNotIn("sqrt_miles", neutral["by_input"])
        self.assertIsNotNone(neutral["points"]["margin"])
        nothing = cfb_trip.priced(FIT, week(miles=None, lookahead=None))
        self.assertIsNone(nothing["points"]["margin"])

    def test_the_week_is_ranked_so_a_score_is_read_against_its_own_week(self):
        blocks = {"a": {"score": 1.5}, "b": {"score": -2.0}, "c": {"score": 1.5}}
        cfb_trip.ranked(blocks)
        self.assertEqual(blocks["a"]["place"], {"rank": 1, "of": 3})
        self.assertEqual(blocks["c"]["place"], {"rank": 1, "of": 3})
        self.assertEqual(blocks["b"]["place"], {"rank": 3, "of": 3})


class EvidenceTests(unittest.TestCase):
    def test_the_fit_is_held_out_and_beats_a_shuffled_response(self):
        margin = FIT["fit"]["margin"]
        self.assertGreater(margin["held_out_r2"], 0)
        self.assertLessEqual(margin["shuffled_p"], 0.01)
        self.assertGreaterEqual(FIT["games"], 2000)

    def test_the_rejected_inputs_carry_the_record_of_why(self):
        base = FIT["not_scored"]["scored_alone"]
        for key in ("rest", "letdown"):
            self.assertFalse(FIT["not_scored"][key]["helps"])
            self.assertLessEqual(FIT["not_scored"][key]["held_out_r2_with_it"], base)

    def test_a_published_block_passes_the_boundary_classifier(self):
        """The publisher refuses an unclassified or model-classed key, and an
        unclassified key stops the whole CFB slate. Run the real classifier
        over a real block rather than a list of names (2026-11-28)."""
        import sys
        sys.path.insert(0, str(ROOT / "scripts"))
        import validate_public_fields as guard
        spec = json.loads(guard.CLASSIFICATION.read_text(encoding="utf-8"))
        values = {"rest": 7.0, "miles": 900.0, "tz": 1.0, "letdown": 4.0, "lookahead": 6.0}
        prices = cfb_trip.priced(FIT, values)
        block = {
            "schema": cfb_trip.SCHEMA, "score": prices["points"]["margin"],
            "home_game": False, "neutral": False,
            "inputs": [cfb_trip._entry(FIT, key, label, unit, values, prices["by_input"])
                       for key, label, unit in cfb_trip.ROWS],
            "units": {r: {"points": prices["points"][r], "stands_alone": True,
                          "held_out_r2": FIT["fit"][r]["held_out_r2"],
                          "shuffled_p": FIT["fit"][r]["shuffled_p"]} for r in ("offense", "defense")},
            "basis": "empirical", "place": {"rank": 3, "of": 108},
            "fit": {k: FIT["fit"]["margin"][k] for k in ("held_out_r2", "shuffled_p", "response_sd")},
            "method": FIT["method"], "sequence_note": FIT["sequence_note"],
        }
        for side in ("away", "home"):
            issues = guard.classify_artifact(spec, {"games": [{side + "_x_factor": block}]}, "slate.json")
            self.assertEqual(issues, [], issues)

    def test_the_published_keys_are_classified(self):
        spec = json.loads((ROOT / "design" / "public_metric_classification.json").read_text(encoding="utf-8"))
        classified = {k for v in spec.values() if isinstance(v, list) for k in v}
        self.assertLessEqual({"away_x_factor", "home_x_factor", "score", "stands_alone",
                              "held_out_r2", "shuffled_p", "sequence_note", "home_game", "unit"},
                             classified)


if __name__ == "__main__":
    unittest.main()
