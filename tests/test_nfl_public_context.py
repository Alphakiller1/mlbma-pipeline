"""The public NFL projection must carry facts and only facts.

nfl-model/board.json mixes observed rates with model output inside the same
objects, so these tests pin the two ways that boundary gets crossed by
accident: a model rank borrowed for a descriptive label, and a model field that
arrives because it happened to sit next to a publishable one.
"""
from __future__ import annotations

import json
import copy
import unittest
from pathlib import Path
from unittest import mock

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
    "player_coverage_profiles": [{
        "player_id": "wr-1", "player_name": "Wide One", "team": "AAA",
        "position": "WR", "source_season": 2025,
        "splits": {
            "man": {"targets": 20, "receptions": 12, "receiving_yards": 180.0,
                    "touchdowns": 2, "catch_rate": 0.6, "yards_per_target": 9.0,
                    "epa_per_target": 0.14},
            "unknown_future_field": {"targets": 999, "private_score": 1.0},
        },
        "confidence": 0.99,
    }],
    "player_scheme_profiles": [{
        "player_id": "qb-1", "player_name": "A Passer", "team": "AAA",
        "position": "QB", "source_season": 2025, "play_family": "passing",
        "splits": {
            "zone": {"dropbacks": 120, "attempts": 112, "completions": 76,
                     "passing_yards": 940, "passing_tds": 7, "interceptions": 2,
                     "completion_rate": 0.6786, "yards_per_attempt": 8.39,
                     "epa_per_dropback": 0.16, "success_rate": 0.51},
            "invented": {"dropbacks": 999, "private_score": 1.0},
        },
    }],
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

DEPTH_CHART = {
    "timestamp": "2026-09-11T20:05:33Z",
    "team": {"abbreviation": "AAA"},
    "depthchart": [
        {
            "name": "Base 3-4 D",
            "positions": {
                "lde": {
                    "position": {"abbreviation": "LDE"},
                    "athletes": [
                        {"displayName": "Left End"},
                        {"displayName": "Reserve End"},
                    ],
                },
                "lilb": {
                    "position": {"abbreviation": "LILB"},
                    "athletes": [{"displayName": "Inside Backer"}],
                },
                "lcb": {
                    "position": {"abbreviation": "LCB"},
                    "athletes": [{"displayName": "Left Corner"}],
                },
                "nb": {
                    "position": {"abbreviation": "NB"},
                    "athletes": [{"displayName": "Package Nickel"}],
                },
            },
        },
        {"name": "Special Teams", "positions": {
            "pk": {"position": {"abbreviation": "PK"},
                   "athletes": [{"displayName": "Kicker"}]},
        }},
        {
            "name": "3WR 1TE",
            "positions": {
                "qb": {
                    "position": {"abbreviation": "QB"},
                    "athletes": [
                        {"displayName": "A Passer"},
                        {"displayName": "Next Passer"},
                    ],
                },
                "wr1": {
                    "position": {"abbreviation": "WR"},
                    "athletes": [{"id": "123", "displayName": "Wide One"}],
                },
                "lt": {
                    "position": {"abbreviation": "LT"},
                    "athletes": [{"displayName": "Left Tackle"}],
                },
                "fb": {
                    "position": {"abbreviation": "FB"},
                    "athletes": [{"displayName": "Package Fullback"}],
                },
            },
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
        self.ctx = ctx.build(BOARD, rooms={}, lineups={})

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

    def test_scheme_frequency_ranks_are_recomputed_from_raw_rates(self):
        board = copy.deepcopy(BOARD)
        second = copy.deepcopy(board["scheme_profiles"][0])
        second["team"] = "BBB"
        second["defense"]["blitz_rate"] = 0.40
        board["scheme_profiles"].append(second)
        schemes = ctx.team_scheme(board)
        aaa = schemes["AAA"]["league_frequency_ranks"]["defense"]["pressure"]["blitz_rate"]
        bbb = schemes["BBB"]["league_frequency_ranks"]["defense"]["pressure"]["blitz_rate"]
        self.assertEqual((aaa["place"], aaa["of"]), (2, 2))
        self.assertEqual((bbb["place"], bbb["of"]), (1, 2))

    def test_coverage_families_are_derived_from_observed_shells(self):
        coverage = self.ctx["scheme"]["AAA"]["defense"]["coverage"]
        self.assertAlmostEqual(coverage["single_high_rate"], 0.44)
        self.assertAlmostEqual(coverage["two_high_rate"], 0.53)

    def test_player_coverage_grades_against_same_position_and_coverage(self):
        board = copy.deepcopy(BOARD)
        second = copy.deepcopy(board["player_coverage_profiles"][0])
        second.update({"player_id": "wr-2", "player_name": "Wide Two", "team": "BBB"})
        second["splits"]["man"]["epa_per_target"] = 0.30
        board["player_coverage_profiles"].append(second)
        profiles = ctx.player_coverage(board)
        aaa = profiles["AAA"][0]["splits"][0]["league_ranks"]["epa_per_target"]
        bbb = profiles["BBB"][0]["splits"][0]["league_ranks"]["epa_per_target"]
        self.assertEqual((aaa["place"], aaa["of"]), (2, 2))
        self.assertEqual((bbb["place"], bbb["of"]), (1, 2))

    def test_player_scheme_is_observed_allowlisted_and_ranked(self):
        board = copy.deepcopy(BOARD)
        second = copy.deepcopy(board["player_scheme_profiles"][0])
        second.update({"player_id": "qb-2", "player_name": "Other Passer", "team": "BBB"})
        second["splits"]["zone"]["epa_per_dropback"] = 0.25
        board["player_scheme_profiles"].append(second)
        profiles = ctx.player_scheme(board)
        aaa = profiles["AAA"][0]
        self.assertEqual(set(aaa), {"player_id", "player_name", "position", "source_season",
                                    "play_family", "splits"})
        self.assertEqual([split["look"] for split in aaa["splits"]], ["zone"])
        self.assertEqual(aaa["splits"][0]["passing_yards"], 940)
        self.assertEqual(aaa["splits"][0]["passing_tds"], 7)
        self.assertEqual(aaa["splits"][0]["interceptions"], 2)
        rank = aaa["splits"][0]["league_ranks"]["epa_per_dropback"]
        self.assertEqual((rank["place"], rank["of"]), (2, 2))

    def test_advanced_context_is_allowlisted_and_carries_line_stats(self):
        advanced = {
            "player_scheme_profiles": [{
                "player_id": "qb-1", "player_name": "A Passer", "team": "AAA",
                "position": "QB", "source_season": 2026, "play_family": "passing",
                "splits": {"single_high": {"dropbacks": 12, "attempts": 10,
                    "completions": 7, "epa_per_dropback": 0.12, "private": 99}},
            }],
            "team_line": {"AAA": {"season": 2026, "offense": {
                "line_yards": {"label": "Adjusted Line Yards / Carry", "value": 3.4,
                               "rank": 8, "of": 32, "format": "num", "better": "high"}}}},
        }
        result = ctx.build(BOARD, rooms={}, lineups={}, advanced_context=advanced)
        looks = [split["look"] for profile in result["player_scheme"]["AAA"]
                 for split in profile["splits"]]
        self.assertIn("single_high", looks)
        self.assertNotIn("private", json.dumps(result))
        self.assertEqual(result["team_line"]["AAA"]["season"], 2026)

    def test_rb_next_gen_tracking_is_allowlisted(self):
        board = {"player_scheme_profiles": [{
            "player_id": "rb-1", "player_name": "Runner One", "team": "AAA",
            "position": "RB", "source_season": 2026, "play_family": "rushing",
            "splits": {"stacked_box": {"carries": 8, "rushing_yards": 30,
                "yards_per_carry": 3.75, "epa_per_carry": -.04, "success_rate": .375}},
            "tracking": {"season": 2026, "week": 3, "attempts": 31,
                "eight_plus_box_rate": .3226, "avg_time_to_los": 2.74,
                "expected_yards_per_carry": 4.1, "ryoe_per_carry": .42,
                "rush_pct_over_expected": .51, "source": "NFL Next Gen Stats via nflverse",
                "private": 99},
        }]}
        profile = ctx.player_scheme(board)["AAA"][0]
        self.assertEqual(profile["tracking"]["eight_plus_box_rate"], .3226)
        self.assertNotIn("private", profile["tracking"])

    def test_coverage_shells_sum_to_one(self):
        cov = self.ctx["scheme"]["AAA"]["defense"]["coverage"]
        shells = sum(v for k, v in cov.items() if k.startswith("cover_"))
        self.assertAlmostEqual(shells, 1.0, places=2)
        self.assertAlmostEqual(cov["man_rate"] + cov["zone_rate"], 1.0, places=2)

    def test_players_are_identity_only_and_depth_limited(self):
        players = self.ctx["players"]["AAA"]
        self.assertEqual([p["name"] for p in players], ["A Passer"])
        self.assertEqual(set(players[0]), {
            "player_id", "name", "position", "depth_rank", "headshot_url",
        })

    def test_headshots_are_requested_at_display_size(self):
        url = self.ctx["players"]["AAA"][0]["headshot_url"]
        self.assertIn("w_160,h_160,c_fill,g_face", url)
        self.assertTrue(url.endswith("/league/abc"))

    def test_depth_chart_projects_offense_and_defense_starters_only(self):
        lineup = ctx.parse_depth_chart(DEPTH_CHART)
        self.assertEqual(lineup["offense"]["package"], "3WR 1TE")
        self.assertEqual(lineup["defense"]["package"], "Base 3-4 D")
        self.assertEqual(
            [player["name"] for player in lineup["offense"]["players"]],
            ["A Passer", "Wide One", "Left Tackle"],
        )
        self.assertEqual(
            [player["group"] for player in lineup["defense"]["players"]],
            ["Front", "Linebackers", "Secondary"],
        )
        self.assertNotIn("Kicker", json.dumps(lineup))
        self.assertNotIn("Reserve End", json.dumps(lineup))
        self.assertNotIn("Package Fullback", json.dumps(lineup))
        self.assertNotIn("Package Nickel", json.dumps(lineup))

    def test_player_coverage_is_field_allowlisted_and_season_labelled(self):
        profile = self.ctx["player_coverage"]["AAA"][0]
        self.assertEqual(profile["player_name"], "Wide One")
        self.assertEqual(profile["source_season"], 2025)
        self.assertEqual(profile["splits"][0]["coverage"], "man")
        self.assertEqual(profile["splits"][0]["targets"], 20)
        self.assertNotIn("private_score", json.dumps(profile))
        self.assertNotIn("unknown_future_field", json.dumps(profile))

    def test_espn_portraits_survive_when_model_has_no_matching_portrait(self):
        lineups = {"AAA": {"offense": {"players": [{
            "name": "Wide One", "position": "WR", "group": "Receivers",
            "headshot_url": "https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/123.png&w=160&h=160",
        }]}}}
        attached = ctx.attach_known_headshots(lineups, {})
        self.assertIn("headshot_url", attached["AAA"]["offense"]["players"][0])

    def test_depth_chart_quarterback_room_keeps_published_order(self):
        room = ctx._quarterbacks_from_depth(DEPTH_CHART)
        self.assertEqual([player["name"] for player in room],
                         ["A Passer", "Next Passer"])
        self.assertTrue(all(player["headshot_url"] is None for player in room))

    def test_espn_headshot_is_only_transformed_when_source_publishes_it(self):
        self.assertIsNone(ctx.sized_espn_headshot(None))
        supplied = "https://a.espncdn.com/i/headshots/nfl/players/full/123.png"
        self.assertEqual(
            ctx.sized_espn_headshot(supplied),
            "https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/123.png&w=160&h=160",
        )
        lineup = ctx.parse_depth_chart(DEPTH_CHART)
        self.assertIn("/full/123.png", lineup["offense"]["players"][1]["headshot_url"])

    def test_team_codes_match_the_public_schedule(self):
        """The board writes LA; the schedule writes LAR."""
        self.assertIn("LAR", self.ctx["form"])
        self.assertNotIn("LA", self.ctx["form"])

    def test_nflverse_season_stats_are_allowlisted_and_fail_closed(self):
        team_row = {
            "season": "2026", "season_type": "REG", "team": "AAA",
            "games": "2", "passing_yards": "510", "passing_tds": "4",
            "rushing_yards": "211", "rushing_tds": "2", "private": "no",
        }
        player_row = {
            "season": "2026", "season_type": "REG", "recent_team": "AAA",
            "player_id": "qb-1", "player_display_name": "A Passer", "position": "QB",
            "games": "2", "attempts": "61", "completions": "42",
            "passing_yards": "510", "passing_tds": "4", "passing_interceptions": "1",
            "fantasy_points_ppr": "38.4", "private": "no",
        }
        teams = [{**team_row, "team": f"T{i:02d}"} for i in range(30)]
        teams[0]["team"] = "AAA"
        with mock.patch.object(ctx, "_nflverse_rows", side_effect=[teams, [player_row]]):
            stats = ctx.nflverse_season_stats(2026)
        self.assertEqual(stats["teams"]["AAA"]["passing_yards"], 510)
        self.assertEqual(stats["players"]["AAA"][0]["fantasy_points_ppr"], 38.4)
        self.assertNotIn("private", json.dumps(stats))

        with mock.patch.object(ctx, "_nflverse_rows", side_effect=[[team_row], [player_row]]):
            sparse = ctx.nflverse_season_stats(2026)
        self.assertEqual(sparse, {"teams": {}, "players": {}})

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
