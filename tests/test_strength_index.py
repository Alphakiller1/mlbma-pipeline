"""Strength indices (outputs/strength_index.py) and the CBB T-Rank carry-forward."""
import json
import tempfile
import unittest
from pathlib import Path

from outputs import strength_index as si

ROOT = Path(__file__).resolve().parents[1]


def team(off, dfn, m1, prior=0.0):
    return {"off": off, "off_adj": off, "p_off": prior, "def": dfn, "def_adj": dfn, "p_def": -prior, "m1": m1}


class StrengthIndexTests(unittest.TestCase):
    def test_published_weights_are_non_negative_and_cover_every_week(self):
        for path, weeks in ((ROOT / "outputs" / "nfl_strength_weights.json", 16),
                            (ROOT / "scripts" / "cfb_strength_weights.json", 13)):
            spec = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(len(spec["weights"]["net"]), weeks, path.name)
            for name in ("net", "off"):
                for week, w in spec["weights"][name].items():
                    coefficients = w[1:] if name == "off" else w
                    self.assertTrue(all(x >= 0 for x in coefficients), (path.name, name, week, w))
            self.assertGreater(spec["fit"]["validation_mean_r2"]["later_game_margin"]["nsi"],
                               spec["fit"]["validation_mean_r2"]["later_game_margin"]["margin_so_far"])

    def test_indices_order_and_scale(self):
        spec = json.loads((ROOT / "outputs" / "nfl_strength_weights.json").read_text(encoding="utf-8"))
        inputs = {"A": team(0.15, -0.10, 9.0, 0.10), "B": team(0.0, 0.0, 0.0), "C": team(-0.15, 0.10, -9.0, -0.10)}
        out = si.indices(inputs, spec, 10)
        self.assertEqual([out[t]["nsi"]["rank"] for t in "ABC"], [1, 2, 3])
        self.assertEqual(out["A"]["osi"]["rank"], 1)
        self.assertEqual(out["A"]["dsi"]["rank"], 1, "the defense allowing least is first")
        self.assertGreater(out["A"]["dsi"]["index"], 100)
        self.assertAlmostEqual(sum(out[t]["nsi"]["value"] for t in "ABC"), 0.0, places=6)
        self.assertAlmostEqual(out["B"]["nsi"]["index"], 100.0, places=1)
        self.assertEqual(si.week_key(spec, 40), "16")
        self.assertEqual(si.week_key(spec, 0), "1")


class TRankCarryTests(unittest.TestCase):
    def test_previous_torvik_keeps_the_oldest_retrieval_date(self):
        from pipeline.cbb_public import resume
        with tempfile.TemporaryDirectory() as tmp:
            teams = Path(tmp) / "2027" / "teams"
            teams.mkdir(parents=True)
            (teams / "1.json").write_text(json.dumps({"resume": {"torvik": {"trank": {"value": 3}},
                                                                 "torvik_through": "2026-11-18"}}))
            (teams / "2.json").write_text(json.dumps({"resume": {"torvik": {"trank": {"value": 9}},
                                                                 "torvik_through": "2026-11-19"}}))
            (teams / "3.json").write_text(json.dumps({"rates": {}}))
            carried, through = resume.previous_torvik(2027, Path(tmp))
        self.assertEqual(sorted(carried), [1, 2])
        self.assertEqual(through, "2026-11-18")


if __name__ == "__main__":
    unittest.main()
