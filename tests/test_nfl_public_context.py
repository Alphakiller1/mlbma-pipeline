"""The public NFL projection must carry facts and only facts.

nfl-model/board.json mixes observed rates with model output inside the same
objects, so these tests pin the two ways that boundary gets crossed by
accident: a model rank borrowed for a descriptive label, and a model field that
arrives because it happened to sit next to a publishable one.
"""
from __future__ import annotations

import json
import unittest
from pathlib import Path

from outputs import nfl_public_context as ctx

ROOT = Path(__file__).resolve().parent.parent

# A board shaped like the real one, small enough to reason about. Team A is
# deliberately the best by rating and mid-table on off_epa, so a rank that was
# copied rather than recomputed shows up immediately.
BOARD = {
    "schema": "nfl-model/board/3",
    "generated_at_utc": "2026-09-09T04:18:42+00:00",
    "season": 2026,
    "week": 1,
    "teams": [
        {
            "rank": 1, "team": "AAA", "rating": 9.9, "projected_wins": 13.2,
            "win_division": 0.71, "make_playoffs": 0.93, "top_seed": 0.4,
            "form": {
                "off_epa": 0.010, "off_first_down": 0.30, "off_explosive": 0.06,
                "off_sack": 0.07, "off_turnover": 0.02,
                "def_epa": -0.10, "def_first_down": 0.25, "def_explosive": 0.05,
                "def_sack": 0.08, "def_turnover": 0.03, "plays": 60.0,
                "offense_index": 1.2, "defense_index": 3.1, "efficiency_rating": 4.4,
            },
        },
        {
            "rank": 2, "team": "BBB", "rating": 8.1, "projected_wins": 11.0,
            "form": {
                "off_epa": 0.150, "off_first_down": 0.34, "off_explosive": 0.08,
                "off_sack": 0.04, "off_turnover": 0.01,
                "def_epa": 0.020, "def_first_down": 0.29, "def_explosive": 0.07,
                "def_sack": 0.05, "def_turnover": 0.01, "plays": 63.0,
                "offense_index": 4.1, "defense_index": 1.0, "efficiency_rating": 5.1,
            },
        },
        {
            "rank": 3, "team": "LA", "rating": 1.0, "projected_wins": 7.0,
            "form": {
                "off_epa": -0.200, "off_first_down": 0.24, "off_explosive": 0.04,
                "off_sack": 0.10, "off_turnover": 0.03,
                "def_epa": 0.080, "def_first_down": 0.30, "def_explosive": 0.06,
                "def_sack": 0.055, "def_turnover": 0.007, "plays": 58.0,
                "offense_index": -4.2, "defense_index": -2.7, "efficiency_rating": -6.9,
            },
        },
    ],
    "scheme_profiles": [
        {
            "team": "AAA", "source_seasons": [2025], "charting_samples": 1105,
            "coverage_samples": 660, "offense_plays": 1042, "defense_plays": 1111,
            "confidence": 0.62, "staff_continuity": 0.8, "carryover_weight": 0.55,
            "model_version": "scheme-4",
            "offense": {
                "man_rate": 0.25, "zone_rate": 0.75, "personnel_11_rate": 0.6,
                "pass_epa_man": 0.1, "target_share_wr_all": 0.6,
            },
            "defense": {
                "man_rate": 0.29, "zone_rate": 0.71, "cover_0_rate": 0.03,
                "cover_1_rate": 0.19, "cover_2_rate": 0.31, "cover_3_rate": 0.25,
                "cover_4_rate": 0.07, "cover_6_rate": 0.07, "cover_2_man_rate": 0.08,
                "blitz_rate": 0.26, "pressure_rate": 0.34,
            },
        },
    ],
    "scheme_matchups": [{"team": "AAA", "expected_zone_rate": 0.8, "target_multipliers": {}}],
    "player_projections": [
        {
            "team": "AAA", "player_name": "A Passer", "position": "QB", "depth_rank": 1,
            "headshot_url": "https://static.www.nfl.com/image/upload/f_auto,q_auto/league/abc",
            "confidence": 0.7, "implied_team_points": 24.5, "sportsbook_line": 1.5,
            "edge": 0.3, "action": "bet", "authority": "model", "metrics": {"x": 1},
        },
        {
            "team": "AAA", "player_name": "Deep Reserve", "position": "WR", "depth_rank": 9,
            "headshot_url": None,
        },
    ],
}

FORBIDDEN_ANYWHERE = (
    "rating", "projected_wins", "win_division", "make_playoffs", "top_seed",
    "offense_index", "defense_index", "efficiency_rating", "confidence",
    "staff_continuity", "carryover_weight", "model_version", "scheme_matchups",
    "expected_zone_rate", "target_multipliers", "implied_team_points",
    "sportsbook_line", "edge", "action", "authority", "metrics", "depth_slot",
)


class NflPublicContextTests(unittest.TestCase):
    def setUp(self):
        self.ctx = ctx.build(BOARD)

    def test_ranks_are_recomputed_not_borrowed(self):
        """teams[].rank ranks a model rating; a descriptive rank must not."""
        form = self.ctx["form"]
        # AAA is the board's rank 1 but has the middle offensive EPA of three.
        self.assertEqual(form["AAA"]["rates"]["off_epa"]["rank"], 2)
        self.assertEqual(form["BBB"]["rates"]["off_epa"]["rank"], 1)
        # Every rank carries the pool it was computed against.
        for team in form.values():
            for metric in team["rates"].values():
                self.assertEqual(metric["of"], 3)
                self.assertIn(metric["rank"], (1, 2, 3))

    def test_sack_and_turnover_rates_invert_between_phases(self):
        """Taking a sack is bad; generating one is good."""
        form = self.ctx["form"]
        # BBB takes the fewest sacks, so it ranks first on sack rate taken.
        self.assertEqual(form["BBB"]["rates"]["off_sack"]["rank"], 1)
        # AAA generates the most, so it ranks first on sack rate generated.
        self.assertEqual(form["AAA"]["rates"]["def_sack"]["rank"], 1)
        # EPA allowed ranks best when lowest.
        self.assertEqual(form["AAA"]["rates"]["def_epa"]["rank"], 1)

    def test_the_three_form_indices_never_appear(self):
        blob = json.dumps(self.ctx)
        for key in ("offense_index", "defense_index", "efficiency_rating"):
            self.assertNotIn(key, blob)

    def test_scheme_keeps_provenance_and_drops_forecasts(self):
        scheme = self.ctx["scheme"]["AAA"]
        self.assertEqual(scheme["source_seasons"], [2025])
        self.assertEqual(scheme["charting_samples"], 1105)
        self.assertEqual(scheme["coverage_samples"], 660)
        for key in ("confidence", "staff_continuity", "carryover_weight", "model_version"):
            self.assertNotIn(key, scheme)

    def test_coverage_shells_sum_to_one(self):
        cov = self.ctx["scheme"]["AAA"]["defense"]["coverage"]
        shells = sum(v for k, v in cov.items() if k.startswith("cover_"))
        self.assertAlmostEqual(shells, 1.0, places=2)
        self.assertAlmostEqual(cov["man_rate"] + cov["zone_rate"], 1.0, places=2)

    def test_players_are_identity_only_and_depth_limited(self):
        players = self.ctx["players"]["AAA"]
        self.assertEqual([p["name"] for p in players], ["A Passer"])
        self.assertEqual(set(players[0]), {"name", "position", "depth_rank", "headshot_url"})

    def test_headshots_are_requested_at_display_size(self):
        url = self.ctx["players"]["AAA"][0]["headshot_url"]
        self.assertIn("w_160,h_160,c_fill,g_face", url)
        self.assertTrue(url.endswith("/league/abc"))

    def test_team_codes_match_the_public_schedule(self):
        """The board writes LA; the schedule writes LAR."""
        self.assertIn("LAR", self.ctx["form"])
        self.assertNotIn("LA", self.ctx["form"])

    def test_no_model_key_survives_anywhere_in_the_projection(self):
        blob = json.dumps(self.ctx)
        for key in FORBIDDEN_ANYWHERE:
            self.assertNotIn(f'"{key}"', blob, f"{key} reached the public projection")

    def test_a_missing_board_fails_soft(self):
        empty = ctx.build({})
        self.assertEqual(empty["form"], {})
        self.assertEqual(empty["scheme"], {})
        self.assertIsNone(empty["source"])

    def test_the_published_slate_carries_no_restricted_key(self):
        """The artifact on disk, not just the projection that builds it."""
        path = ROOT / "data" / "public" / "nfl" / "slate.json"
        if not path.is_file():
            self.skipTest("no published NFL slate")
        blob = path.read_text(encoding="utf-8")
        spec = json.loads((ROOT / "design" / "public_restricted_fields.json")
                          .read_text(encoding="utf-8"))
        for key in spec["forbidden_keys"]:
            self.assertNotIn(f'"{key}"', blob, f"{key} is published in the NFL slate")


if __name__ == "__main__":
    unittest.main()
