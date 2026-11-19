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

    def test_weight_vectors_match_their_named_features(self):
        for path in (ROOT / "outputs" / "nfl_strength_weights.json", ROOT / "scripts" / "cfb_strength_weights.json"):
            spec = json.loads(path.read_text(encoding="utf-8"))
            fit = spec["fit"]
            n_off = 1 + len(fit["offense_features"]) + len(fit["defense_features"])
            for week in spec["weights"]["off"]:
                self.assertEqual(len(spec["weights"]["off"][week]), n_off, (path.name, week))
                self.assertEqual(len(spec["weights"]["net"][week]), 1 + len(fit["net_features"]), (path.name, week))
            v = fit["validation_mean_r2"]["later_game_margin"]
            self.assertGreater(v["nsi"], v["nsi_before_preseason_reads"], path.name)

    def test_preseason_reads_move_the_index_the_way_they_read(self):
        nfl = json.loads((ROOT / "outputs" / "nfl_strength_weights.json").read_text(encoding="utf-8"))
        base = {t: dict(team(0.0, 0.0, 0.0), qb_league=0.0) for t in "AB"}
        base["A"]["qb_epa"], base["B"]["qb_epa"] = 0.15, -0.15
        out = si.indices(base, nfl, 3)
        self.assertEqual(out["A"]["nsi"]["rank"], 1, "the better quarterback rates higher, all else equal")
        self.assertEqual(out["A"]["inputs"]["qb_epa"]["rank"], 1)
        cfb = json.loads((ROOT / "scripts" / "cfb_strength_weights.json").read_text(encoding="utf-8"))
        rows = {t: dict(team(0.0, 0.0, 0.0), ret=0.6, talent=t_) for t, t_ in (("A", 950.0), ("B", 600.0), ("C", None))}
        out = si.indices(rows, cfb, 1)
        self.assertEqual(out["A"]["nsi"]["rank"], 1)
        self.assertGreaterEqual(out["C"]["nsi"]["rank"], out["B"]["nsi"]["rank"],
                                "a school with no talent row reads at the pool's lower quartile")
        self.assertNotIn("talent", out["C"]["inputs"])
        # Returning share scales last season: more coming back keeps more of a strong prior.
        rows = {"A": dict(team(0.0, 0.0, 0.0, 0.2), ret=0.9), "B": dict(team(0.0, 0.0, 0.0, 0.2), ret=0.2),
                "C": dict(team(0.0, 0.0, 0.0, -0.2), ret=0.5)}
        out = si.indices(rows, cfb, 1)
        self.assertLess(out["A"]["nsi"]["rank"], out["B"]["nsi"]["rank"])

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
