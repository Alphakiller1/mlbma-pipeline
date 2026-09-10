"""The classification guard: every published key must resolve to a public class.

This is the guard the rest of the boundary rests on. An allowlist says which
keys may appear; this says what each one *is*, so a field added upstream fails
the build unclassified instead of shipping because nothing named it.
"""
from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = json.loads((ROOT / "design" / "public_metric_classification.json")
                  .read_text(encoding="utf-8"))

_spec = importlib.util.spec_from_file_location(
    "validate_public_fields", ROOT / "scripts" / "validate_public_fields.py")
vpf = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(vpf)


def game(fields: dict) -> dict:
    return {"schema": "chase-public-slate/1", "games": [dict({"id": "x"}, **fields)]}


class ClassificationSpecTests(unittest.TestCase):
    def test_all_eight_classes_are_declared(self):
        self.assertEqual(
            set(SPEC["classes"]),
            {"provenance", "identity", "factual_status", "descriptive",
             "derived_descriptive", "contextual_environment",
             "model_private", "model_derived_label"})

    def test_exactly_two_classes_are_private(self):
        private = {n for n, m in SPEC["classes"].items() if not m["public"]}
        self.assertEqual(private, {"model_private", "model_derived_label"})

    def test_no_key_is_classified_twice(self):
        seen: dict[str, str] = {}
        for name in SPEC["classes"]:
            for key in SPEC.get(name, []):
                self.assertNotIn(
                    key, seen,
                    f"{key!r} is in both {seen.get(key)} and {name}")
                seen[key] = name


class ClassificationGuardTests(unittest.TestCase):
    """The four shapes the handoff names, plus the one it warns against banning."""

    def reject(self, artifact, expect_key):
        problems = vpf.classify_artifact(SPEC, artifact, "case")
        self.assertTrue(problems, f"{expect_key} was accepted")
        self.assertTrue(any(f"'{expect_key}'" in p for p in problems),
                        f"{expect_key} not named in {problems}")

    def test_a_model_power_rating_is_rejected(self):
        self.reject(game({"away_form": {"rating": 9.9}}), "rating")

    def test_a_rank_of_that_rating_is_rejected(self):
        """A bare rank on a form object is the handoff's headline failure."""
        self.reject(game({"away_form": {"rank": 1}}), "rank")

    def test_a_model_composite_inside_an_observed_object_is_rejected(self):
        self.reject(game({"away_form": {"offense_index": 4.1}}), "offense_index")

    def test_an_expected_rate_is_rejected(self):
        self.reject(game({"away_scheme": {"expected_zone_rate": 0.8}}),
                    "expected_zone_rate")

    def test_an_unknown_upstream_field_is_rejected(self):
        """The point of classifying rather than denying: new fields fail closed."""
        self.reject(game({"away_form": {"some_new_model_output": 7}}),
                    "some_new_model_output")

    def test_a_rank_beside_its_own_value_is_accepted(self):
        """The same word, recomputed from the rate it annotates, is a fact."""
        honest = game({"away_form": {"rates": {"off_epa": {
            "label": "Offensive EPA per play", "value": 0.1,
            "better": "high", "rank": 3, "of": 32}}}})
        self.assertEqual(vpf.classify_artifact(SPEC, honest, "case"), [])

    def test_the_published_artifacts_pass(self):
        for sport in ("mlb", "nfl"):
            path = ROOT / "data" / "public" / sport / "slate.json"
            if not path.is_file():
                continue
            artifact = json.loads(path.read_text(encoding="utf-8"))
            problems = vpf.classify_artifact(SPEC, artifact, sport)
            self.assertEqual(problems, [], f"{sport}: {problems}")


if __name__ == "__main__":
    unittest.main()
