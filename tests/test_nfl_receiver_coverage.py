"""Receiver splits by coverage, shell and pass rush (outputs/nfl_advanced_context)."""
from __future__ import annotations

import unittest

try:
    import pandas as pd
except ImportError:  # pragma: no cover - the pipeline always has pandas
    pd = None

from outputs import nfl_advanced_context as adv
from outputs import nfl_public_context as ctx


def _plays():
    rows = []
    # Six targets to one receiver: four against man, two against zone; one
    # under pressure. A sack (no receiver) and a run must not count as targets.
    for i, (man_zone, cover, pressure, complete, yards, epa) in enumerate([
        ("MAN_COVERAGE", "COVER_1", False, 1, 12, 0.8),
        ("MAN_COVERAGE", "COVER_1", True, 0, 0, -0.6),
        ("MAN_COVERAGE", "COVER_0", False, 1, 30, 2.1),
        ("MAN_COVERAGE", "COVER_1", False, 1, 8, 0.2),
        ("ZONE_COVERAGE", "COVER_3", False, 1, 6, 0.1),
        ("ZONE_COVERAGE", "COVER_4", False, 0, 0, -0.4),
    ]):
        rows.append({
            "game_id": "g1", "play_id": i, "posteam": "LAC", "pass_attempt": 1,
            "receiver_player_id": "wr1", "receiver_player_name": "A.Receiver",
            "complete_pass": complete, "receiving_yards": yards if complete else None,
            "pass_touchdown": 0, "epa": epa, "defense_man_zone_type": man_zone,
            "defense_coverage_type": cover, "was_pressure": pressure,
        })
    rows.append({"game_id": "g1", "play_id": 90, "posteam": "LAC", "pass_attempt": 1,
                 "receiver_player_id": None, "complete_pass": 0, "epa": -1.5,
                 "defense_man_zone_type": "MAN_COVERAGE", "defense_coverage_type": "COVER_1"})
    rows.append({"game_id": "g1", "play_id": 91, "posteam": "LAC", "pass_attempt": 0,
                 "receiver_player_id": None, "complete_pass": 0, "epa": 0.1})
    return pd.DataFrame(rows)


@unittest.skipIf(pd is None, "pandas is required")
class ReceiverCoverageTests(unittest.TestCase):
    def test_targets_split_by_coverage_shell_and_pressure(self):
        profiles = adv._receiver_profiles(_plays(), 2025, {"wr1": "Alpha Receiver"}, {"wr1": "WR"})
        self.assertEqual(len(profiles), 1)
        splits = profiles[0]["splits"]
        self.assertEqual(profiles[0]["player_name"], "Alpha Receiver")
        self.assertEqual(splits["all"]["targets"], 6)
        self.assertEqual(splits["man"]["targets"], 4)
        self.assertEqual(splits["zone"]["targets"], 2)
        self.assertEqual(splits["man"]["receiving_yards"], 50)
        self.assertAlmostEqual(splits["man"]["yards_per_target"], 12.5)
        self.assertEqual(splits["single_high"]["targets"], 4)   # cover 1 x3 + cover 3
        self.assertEqual(splits["pressure"]["targets"], 1)
        self.assertEqual(splits["clean"]["targets"], 5)

    def test_only_receiving_positions_are_published(self):
        self.assertEqual(adv._receiver_profiles(_plays(), 2025, {}, {"wr1": "QB"}), [])

    def test_public_context_publishes_and_ranks_the_new_looks(self):
        for look in ("single_high", "two_high", "blitz", "pressure", "clean"):
            self.assertIn(look, ctx.PLAYER_COVERAGE_SPLITS)
        board = {"player_coverage_profiles": [
            {"team": "LAC", "position": "WR", "player_name": f"R{i}", "player_id": f"r{i}",
             "source_season": 2025, "splits": {
                 "all": {"targets": 10 + i, "yards_per_target": 5.0 + i, "catch_rate": 0.6,
                         "epa_per_target": 0.1 * i},
                 "man": {"targets": 5, "yards_per_target": 6.0 + i, "catch_rate": 0.5,
                         "epa_per_target": 0.0}}}
            for i in range(4)]}
        out = ctx.player_coverage(board)
        man = next(s for s in out["LAC"][3]["splits"] if s["coverage"] == "man")
        self.assertEqual(man["league_ranks"]["yards_per_target"], {"place": 1, "of": 4})


if __name__ == "__main__":
    unittest.main()


class ReceiverTrackingTest(unittest.TestCase):
    """NGS cushion/separation and PFR charted receiving attach to the profile.

    These are the only CURRENT-season read on the coverage a receiver faces:
    the charted man/zone tag ships a season late (2026 participation is still
    404), so the splits beside them are the prior year's.
    """

    def setUp(self):
        if pd is None:
            self.skipTest("pandas is required")

    def test_tracking_joins_by_gsis_and_by_bare_name(self):
        ngs = {"wr1": {"avg_cushion": 6.1, "avg_separation": 2.8,
                       "yac_above_expectation": 0.7, "targets": 42}}
        # PFR keys on its own ids, so the join is by bare name -- and the name
        # on the profile carries a suffix the PFR spelling does not.
        pfr = {"areceiver": {"adot": 11.4, "yards_before_catch_per_rec": 8.2,
                             "yards_after_catch_per_rec": 3.2, "drop_rate": 0.031,
                             "passer_rating_when_targeted": 104.8, "targets": 42}}
        profiles = adv._receiver_profiles(
            _plays(), 2026, {"wr1": "A.Receiver Jr."}, {"wr1": "WR"},
            ngs, pfr)
        self.assertEqual(len(profiles), 1)
        tracking = profiles[0]["tracking"]
        self.assertEqual(tracking["avg_separation"], 2.8)
        self.assertEqual(tracking["adot"], 11.4)
        self.assertEqual(tracking["passer_rating_when_targeted"], 104.8)

    def test_a_profile_without_tracking_omits_the_key(self):
        """A missing tracking row must not become a zeroed one: an absent
        cushion is not a receiver pressed at the line."""
        profiles = adv._receiver_profiles(
            _plays(), 2026, {"wr1": "A.Receiver"}, {"wr1": "WR"}, {}, {})
        self.assertNotIn("tracking", profiles[0])

    def test_prior_season_profiles_carry_no_current_tracking(self):
        """The prior-season split window must not be labelled with this
        season's cushion and separation."""
        ngs = {"wr1": {"avg_separation": 2.8, "targets": 42}}
        profiles = adv._receiver_profiles(
            _plays(), 2025, {"wr1": "A.Receiver"}, {"wr1": "WR"})
        self.assertNotIn("tracking", profiles[0])
        self.assertTrue(ngs)


class QuarterbackLookDepthTest(unittest.TestCase):
    """A coverage split must say HOW the look was played, not only how well."""

    def setUp(self):
        if pd is None:
            self.skipTest("pandas is required")

    def _qb_plays(self):
        rows = []
        for i, (air, ttt, pocket, worthy, sack, scramble) in enumerate([
            (12.0, 2.7, False, False, 0, 0),
            (4.0, 2.1, True, False, 0, 1),
            (18.0, 3.4, False, True, 0, 0),
            (None, 3.9, True, False, 1, 0),
        ]):
            rows.append({
                "game_id": "g1", "play_id": i, "posteam": "BUF", "defteam": "KC",
                "passer_player_id": "qb1", "passer_player_name": "A.Passer",
                "qb_dropback": 1, "pass_attempt": 0 if sack else 1,
                "complete_pass": 0, "passing_yards": 0, "pass_touchdown": 0,
                "interception": 0, "sack": sack, "qb_scramble": scramble,
                "epa": 0.1, "success": 1, "air_yards": air, "time_to_throw": ttt,
                "is_qb_out_of_pocket": pocket, "is_interception_worthy": worthy,
            })
        return pd.DataFrame(rows)

    def test_look_stats_carry_depth_speed_and_pocket(self):
        stats = adv._player_stats(self._qb_plays(), "QB")
        self.assertEqual(stats["dropbacks"], 4)
        self.assertEqual(stats["attempts"], 3)        # the sack is not an attempt
        self.assertEqual(stats["sack_rate"], 0.25)
        self.assertEqual(stats["scramble_rate"], 0.25)
        # aDOT averages the thrown balls only; the sack has no air yards.
        self.assertAlmostEqual(stats["adot"], 11.33, places=2)
        self.assertAlmostEqual(stats["avg_time_to_throw"], 3.03, places=2)
        self.assertEqual(stats["out_of_pocket_rate"], 0.5)
        self.assertEqual(stats["interception_worthy_rate"], 0.25)

    def test_absent_columns_are_omitted_not_zeroed(self):
        """A season with no participation file has no time to throw. Reporting
        0.0 there would read as the fastest release in the league."""
        frame = self._qb_plays().drop(
            columns=["time_to_throw", "is_qb_out_of_pocket", "is_interception_worthy"])
        stats = adv._player_stats(frame, "QB")
        self.assertNotIn("avg_time_to_throw", stats)
        self.assertNotIn("out_of_pocket_rate", stats)
        self.assertNotIn("interception_worthy_rate", stats)
        self.assertIn("adot", stats)
