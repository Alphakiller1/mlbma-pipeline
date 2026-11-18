"""Coverage by position group (outputs/nfl_position_coverage.py)."""
import unittest

import pandas as pd

from outputs import nfl_position_coverage as pc


def frame(rows):
    base = {"season": 2025, "pass_attempt": 1, "complete_pass": 1, "receiving_yards": 10, "epa": 0.5,
            "success": 1, "defense_coverage_type": "COVER_3", "defense_man_zone_type": "ZONE_COVERAGE",
            "n_blitzers": 0}
    return pd.DataFrame([{**base, **r} for r in rows])


class PositionCoverageTests(unittest.TestCase):
    def test_mirror_looks_and_rank_direction(self):
        rows = []
        clubs = [f"T{i:02d}" for i in range(20)]
        for i, team in enumerate(clubs):
            opp = clubs[(i + 1) % len(clubs)]
            for k in range(10):
                rows.append({"posteam": team, "defteam": opp, "receiver_player_id": f"wr{i}",
                             "receiving_yards": i, "epa": i / 10})
            rows.append({"posteam": team, "defteam": opp, "receiver_player_id": f"te{i}",
                         "defense_coverage_type": "COVER_1", "defense_man_zone_type": "MAN_COVERAGE"})
        positions = {f"wr{i}": "WR" for i in range(20)} | {f"te{i}": "TE" for i in range(20)}
        window = pc._window(frame(rows), positions)
        off = sum(c["offense"]["WR"]["all"]["targets"] for c in window.values())
        dfn = sum(c["defense"]["WR"]["all"]["targets"] for c in window.values())
        self.assertEqual(off, dfn)
        self.assertIn("cover_3", window["T00"]["offense"]["WR"])
        self.assertIn("man", window["T00"]["offense"]["TE"])
        self.assertNotIn("middle_field_closed", window["T00"]["offense"]["WR"], "aliases are not published")
        pc._rank(window)
        best_offense = window["T19"]["offense"]["WR"]["all"]["league_ranks"]["yards_per_target"]
        self.assertEqual(best_offense["place"], 1)
        # T19's WRs feed T00's defense: the most allowed is last, not first.
        worst_defense = window["T00"]["defense"]["WR"]["all"]["league_ranks"]["yards_per_target"]
        self.assertEqual(worst_defense["place"], worst_defense["of"])
        # One TE target per club is under the floor: the pool steps down rather
        # than leaving every TE cell unplaced.
        self.assertIn("league_ranks", window["T00"]["offense"]["TE"]["man"])
        self.assertEqual(window["T00"]["offense"]["TE"]["man"]["league_ranks"]["catch_rate"]["of"], 20)


if __name__ == "__main__":
    unittest.main()
