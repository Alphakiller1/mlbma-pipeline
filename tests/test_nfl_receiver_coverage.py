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
