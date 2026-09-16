"""League baselines: the centre is the league average, the spread is the graded population.

Each case here is a miscalibration that was live on chase-analytics.com until
2026-09-15:

  * the public projection named baseline keys that do not exist ("k", "bb"
    instead of kpct / bbpct) and omitted xfip, so the starter splits table graded
    three of its columns against hand-typed first-paint numbers;
  * nothing recomputed the baselines in the pipeline at all, so every chip on the
    site was graded against a July league until this run;
  * batters were graded against the thirty clubs' spread, which is three to four
    times tighter than the spread of individual hitters;
  * relievers entered the starter pool carrying "starts" (the publisher counts
    appearances when an arm has none), which pulled league QS% from 35% to 18%;
  * NFL situational EPA was graded against zero, when the league gives back 0.41
    of a point per play under pressure and converts 46% of dropbacks.
"""
from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path

import pandas as pd

from core import compute_baselines as cb
from outputs import nfl_public_context as nfl

ROOT = Path(__file__).resolve().parent.parent


def _load(script: str):
    spec = importlib.util.spec_from_file_location(script, ROOT / "scripts" / f"{script}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _hitting_frame(rows):
    return pd.DataFrame(rows, columns=["split", "id", "pa", "ab", "h", "bb", "hbp", "sf", "tb",
                                       "avg", "obp", "slg", "ops"])


class LeagueRateTest(unittest.TestCase):
    def test_the_centre_is_the_leagues_own_rate_not_a_mean_of_lines(self):
        """Two hitters, one with ten times the sample: the league hit .200, not .350."""
        frame = _hitting_frame([
            ["vl", 1, 1000, 900, 180, 90, 0, 10, 300, 0.200, 0.270, 0.333, 0.603],
            ["vl", 2, 10, 10, 5, 0, 0, 0, 8, 0.500, 0.500, 0.800, 1.300],
        ])
        rates = cb.league_hitting_rates(frame)
        self.assertAlmostEqual(rates["avg"], 185 / 910, places=4)
        self.assertLess(rates["avg"], 0.21)

    def test_batter_pools_are_split_specific_and_declare_direction(self):
        rows = []
        for i in range(60):
            ops = 0.600 + i * 0.005
            rows.append(["vl", i, 300, 270, 70, 25, 1, 2, 120, 0.259, 0.320, 0.444, ops])
        out = cb.batter_split_baselines(_hitting_frame(rows))
        self.assertIn("bat_vl_ops", out)
        self.assertTrue(out["bat_vl_ops"]["hi"])
        self.assertGreater(out["bat_vl_ops"]["std"], 0)
        # A club pool of the same stat is a different context entirely.
        self.assertNotIn("tm_vl_ops", out)

    def test_qualification_scales_with_the_season(self):
        """A fixed cut empties a vs-LHP pool in April and admits cameos in September."""
        april = cb._adaptive_floor([20, 25, 30, 35, 40], 30)
        september = cb._adaptive_floor([200, 300, 400, 500, 600], 30)
        self.assertEqual(april, 30)
        self.assertGreater(september, 100)


class StarterPoolTest(unittest.TestCase):
    def _payload(self):
        starters = {}
        for i in range(40):
            starters[str(i)] = {"name": f"Starter {i}", "splits": {
                "home": {"whip": 1.10 + i * 0.01, "ops": 0.650 + i * 0.004, "ops_plus": 110 - i,
                         "k_pct": 20 + i * 0.1, "bb_pct": 7 + i * 0.05, "xfip": 3.5 + i * 0.02,
                         "qs_pct": 30.0 + i * 0.5, "pitch_score": 40.0 + i * 0.5,
                         "starts": 15, "ip_per_start": 5.8},
                "away": {"whip": 1.15 + i * 0.01, "ops": 0.660 + i * 0.004, "ops_plus": 108 - i,
                         "k_pct": 20 + i * 0.1, "bb_pct": 7 + i * 0.05, "xfip": 3.6 + i * 0.02,
                         "qs_pct": 30.0 + i * 0.5, "pitch_score": 40.0 + i * 0.5,
                         "starts": 15, "ip_per_start": 5.6}}}
        # A reliever the publisher credits with "starts" because he has appearances.
        starters["rp"] = {"name": "Reliever", "splits": {
            "home": {"whip": 0.90, "ops": 0.500, "ops_plus": 150, "k_pct": 33.0, "bb_pct": 6.0,
                     "xfip": 2.5, "qs_pct": 0.0, "pitch_score": 80.0,
                     "starts": 40, "ip_per_start": 1.1},
            "away": {"whip": 0.95, "ops": 0.510, "ops_plus": 148, "k_pct": 32.0, "bb_pct": 6.1,
                     "xfip": 2.6, "qs_pct": 0.0, "pitch_score": 78.0,
                     "starts": 38, "ip_per_start": 1.0}}}
        return {"starters": starters}

    def test_relievers_are_kept_out_of_the_starter_pools(self):
        out = cb.starter_split_baselines(self._payload())
        # The forty starters run 30.0 to 49.5, averaging 39.75. The reliever's
        # 0% over seventy-eight "starts" never enters, so the league rate is the
        # starters' own - which is the difference between 35% and 18% on the
        # real board.
        self.assertAlmostEqual(out["sp_qs_pct"]["mean"], 39.75, places=2)
        self.assertEqual(out["sp_qs_pct"]["n"], 40)
        self.assertEqual(out["sp_pitch_score"]["n"], 40)
        self.assertEqual(out["sp_home_whip"]["n"], 40)

    def test_ops_plus_is_centred_on_one_hundred_by_construction(self):
        out = cb.starter_split_baselines(self._payload())
        self.assertEqual(out["sp_home_ops_plus"]["mean"], 100.0)
        self.assertTrue(out["sp_home_ops_plus"]["hi"])

    def test_allowed_rates_declare_that_lower_is_better(self):
        out = cb.starter_split_baselines(self._payload())
        self.assertFalse(out["sp_home_ops"]["hi"])
        self.assertFalse(out["sp_home_whip"]["hi"])
        self.assertTrue(out["sp_home_kpct"]["hi"])

    def test_pitching_rates_are_centred_on_the_innings_weighted_league_rate(self):
        """One 200-inning arm at a 3.00 ERA and nine cameos at 9.00 is not a 8.40 league."""
        mean = cb._weighted_mean([3.00] + [9.00] * 9, [200] + [2] * 9)
        self.assertLess(mean, 3.6)


class MergeTest(unittest.TestCase):
    def test_a_partial_run_carries_context_forward_with_its_own_date(self):
        merged = cb.merge_with_previous(
            {"osi": {"mean": 50, "std": 12}},
            {"osi": {"mean": 1, "std": 1}, "woba": {"mean": 0.31, "std": 0.01}},
            "2026-09-15T00:00:00+00:00", "2026-07-19T00:00:00+00:00")
        self.assertEqual(merged["osi"]["mean"], 50)
        self.assertEqual(merged["osi"]["as_of"], "2026-09-15T00:00:00+00:00")
        # Not recomputed this run: kept, and honest about when it was measured.
        self.assertEqual(merged["woba"]["mean"], 0.31)
        self.assertEqual(merged["woba"]["as_of"], "2026-07-19T00:00:00+00:00")


class PublicProjectionTest(unittest.TestCase):
    def setUp(self):
        self.publisher = _load("publish_public_context")

    def test_the_allowlist_names_keys_that_exist(self):
        """"k" and "bb" were in the list; the baselines are called kpct and bbpct."""
        produced = set(cb.OFFENSE) | set(cb.PITCH_SP) | set(cb.TEAM_STAFF) | set(cb.BP_UNIT) \
            | set(cb.RP_IND) | set(cb.PITCH_SP_ALLOWED) | set(cb.starter_split_baselines(
                json.loads((ROOT / "data" / "public" / "starter_splits.json").read_text(
                    encoding="utf-8")) if (ROOT / "data" / "public" / "starter_splits.json").is_file()
                else {})) | {"pitching", "bp_score", "sp_qs_pct", "sp_pitch_score",
                             "sp_ops_allowed"}
        unknown = {k for k in self.publisher.PUBLIC_BASELINES if k not in produced}
        self.assertEqual(unknown, set(), f"allowlisted keys nothing produces: {unknown}")

    def test_the_graded_contexts_reach_the_public_file(self):
        for key in ("kpct", "bbpct", "xfip", "sp_qs_pct", "sp_pitch_score",
                    "sp_vs_lhh_whip", "sp_home_ops_plus", "bat_vl_ops", "tm_h_ops"):
            self.assertTrue(self.publisher.is_public_baseline(key), key)

    def test_the_forecast_is_still_withheld(self):
        self.assertFalse(self.publisher.is_public_baseline("projosi"))

    def test_the_published_file_carries_no_forecast_and_grades_the_page(self):
        path = ROOT / "data" / "public" / "league_baselines.json"
        if not path.is_file():
            self.skipTest("no published baselines on disk")
        payload = json.loads(path.read_text(encoding="utf-8"))
        self.assertNotIn("projosi", payload["baselines"])
        for key in ("era", "kpct", "bat_vl_ops", "tm_h_ops", "sp_vs_lhh_ops"):
            self.assertIn(key, payload["baselines"], key)


class NflResponseBaselineTest(unittest.TestCase):
    def _schemes(self, count=12):
        schemes = {}
        for i in range(count):
            schemes[f"T{i}"] = {
                "offense": {"response": {"pass_epa": 0.05 + i * 0.01,
                                         "pass_success_rate": 0.44 + i * 0.002}},
                "defense": {"response": {"pass_epa": 0.05 - i * 0.01,
                                         "pass_success_rate": 0.46 - i * 0.002}},
            }
        return schemes

    def test_each_situation_gets_its_own_league_mean_and_spread(self):
        league = nfl.response_baselines(self._schemes())
        self.assertIn("pass_epa", league["offense"])
        self.assertIn("pass_success_rate", league["defense"])
        self.assertEqual(league["offense"]["pass_epa"]["n"], 12)
        self.assertGreater(league["offense"]["pass_epa"]["std"], 0)
        # Success rates are shares near 45%, not margins around zero - which is
        # exactly why grading them on an EPA ramp centred on zero read elite for
        # every club in the league.
        self.assertGreater(league["offense"]["pass_success_rate"]["mean"], 0.4)

    def test_too_few_clubs_publishes_nothing_rather_than_a_thin_league(self):
        self.assertEqual(nfl.response_baselines(self._schemes(4)), {})

    def test_the_slate_carries_the_league_the_page_grades_against(self):
        path = ROOT / "data" / "public" / "nfl" / "slate.json"
        if not path.is_file():
            self.skipTest("no NFL slate on disk")
        slate = json.loads(path.read_text(encoding="utf-8"))
        graded = 0
        for game in slate.get("games") or []:
            for side in ("away", "home"):
                scheme = game.get(f"{side}_scheme") or {}
                if not scheme:
                    continue
                league = scheme.get("league_response") or {}
                self.assertIn("pass_epa_pressure", league.get("offense", {}),
                              "situational EPA has no league to grade against")
                graded += 1
        self.assertTrue(graded, "no charted scheme in the published slate")


if __name__ == "__main__":
    unittest.main()
