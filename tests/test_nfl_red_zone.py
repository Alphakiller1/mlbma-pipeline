from __future__ import annotations

import unittest

import pandas as pd

from outputs import nfl_red_zone as rz

POSITIONS = {"qb1": "QB", "wr1": "WR", "wr2": "WR", "te1": "TE", "rb1": "RB", "qb2": "QB"}


def play(game, drive, off, deff, yl, kind="run", **kw):
    """One play-by-play row with every column the module reads."""
    row = {
        "game_id": game, "play_id": kw.pop("play_id", 0), "season": 2026, "season_type": "REG",
        "posteam": off, "defteam": deff, "play_type": kind, "fixed_drive": drive,
        "fixed_drive_result": kw.pop("result", "Punt"), "yardline_100": yl,
        "two_point_attempt": 0, "qb_dropback": 0, "pass_attempt": 0, "rush_attempt": 0,
        "qb_scramble": 0, "qb_kneel": 0, "sack": 0, "complete_pass": 0, "interception": 0,
        "pass_touchdown": 0, "rush_touchdown": 0, "epa": 0.0, "success": 0,
        "passer_player_id": None, "passer_player_name": None,
        "receiver_player_id": None, "receiver_player_name": None,
        "rusher_player_id": None, "rusher_player_name": None,
        "field_goal_result": None, "touchdown": 0, "td_team": None,
    }
    if kind == "run":
        row.update(rush_attempt=1)
    if kind == "pass":
        row.update(qb_dropback=1, pass_attempt=1)
    row.update(kw)
    return row


def frame(rows):
    for i, row in enumerate(rows):
        row["play_id"] = i
    return pd.DataFrame(rows)


class RedZoneTripTests(unittest.TestCase):
    def build(self, rows):
        return rz.red_zone_from_frame(frame(rows), POSITIONS)

    def test_a_snap_at_the_20_is_a_trip_and_the_drive_is_counted_once(self):
        out = self.build([
            play("g1", 1, "AAA", "BBB", 45),
            play("g1", 1, "AAA", "BBB", 20),
            play("g1", 1, "AAA", "BBB", 12),
            play("g1", 2, "AAA", "BBB", 70),  # never close
        ])
        off = out["AAA"]["offense"]
        self.assertEqual((off["drives"], off["trips"]), (2, 1))
        self.assertEqual(off["trip_rate"], 0.5)
        self.assertEqual(off["trips_per_game"], 1.0)
        # The defense is the same trips seen from the other side.
        self.assertEqual(out["BBB"]["defense"]["trips"], 1)

    def test_kneels_two_point_tries_and_no_plays_are_not_trips(self):
        out = self.build([
            play("g1", 1, "AAA", "BBB", 30),
            play("g1", 1, "AAA", "BBB", 18, kind="qb_kneel", rush_attempt=1, qb_kneel=1),
            play("g1", 2, "AAA", "BBB", 40, result="Touchdown"),
            play("g1", 2, "AAA", "BBB", 2, two_point_attempt=1),
            play("g1", 3, "AAA", "BBB", 50),
            play("g1", 3, "AAA", "BBB", 15, kind="no_play"),
        ])
        self.assertEqual(out["AAA"]["offense"]["trips"], 0)

    def test_a_conversion_is_a_score_snapped_from_inside_the_red_zone(self):
        out = self.build([
            # Touchdown from the 8.
            play("g1", 1, "AAA", "BBB", 8, touchdown=1, td_team="AAA", rush_touchdown=1,
                 result="Touchdown"),
            # Field goal from the 3 after reaching the 11.
            play("g1", 2, "AAA", "BBB", 11),
            play("g1", 2, "AAA", "BBB", 3, kind="field_goal", field_goal_result="made",
                 result="Field goal"),
            # Reached the 18, sacked back to the 27, field goal from there.
            play("g1", 3, "AAA", "BBB", 18),
            play("g1", 3, "AAA", "BBB", 27, kind="field_goal", field_goal_result="made",
                 result="Field goal"),
            # Reached the 5, turned the ball over.
            play("g1", 4, "AAA", "BBB", 5, result="Turnover"),
        ])
        off = out["AAA"]["offense"]
        self.assertEqual(off["trips"], 4)
        self.assertEqual((off["td_trips"], off["score_trips"]), (1, 2))
        self.assertEqual((off["td_rate"], off["score_rate"]), (0.25, 0.5))

    def test_a_defensive_touchdown_is_not_the_offense_converting(self):
        out = self.build([
            play("g1", 1, "AAA", "BBB", 9, kind="pass", interception=1, touchdown=1,
                 td_team="BBB", result="Opp touchdown"),
        ])
        self.assertEqual(out["AAA"]["offense"]["trips"], 1)
        self.assertEqual(out["AAA"]["offense"]["td_trips"], 0)

    def test_pass_rate_counts_scrambles_as_dropbacks_and_excludes_kneels(self):
        out = self.build([
            play("g1", 1, "AAA", "BBB", 15, kind="pass", passer_player_id="qb1",
                 receiver_player_id="wr1"),
            play("g1", 1, "AAA", "BBB", 12, kind="run", qb_dropback=1, qb_scramble=1,
                 rusher_player_id="qb1"),
            play("g1", 1, "AAA", "BBB", 9, kind="run", rusher_player_id="rb1"),
            play("g1", 1, "AAA", "BBB", 9, kind="qb_kneel", rush_attempt=1, qb_kneel=1),
        ])
        self.assertEqual(out["AAA"]["offense"]["pass_rate"], round(2 / 3, 4))


class RedZonePlayerTests(unittest.TestCase):
    def test_target_share_and_inside_ten_targets(self):
        rows = [
            play("g1", 1, "AAA", "BBB", 18, kind="pass", passer_player_id="qb1",
                 receiver_player_id="wr1", receiver_player_name="W.One"),
            play("g1", 1, "AAA", "BBB", 8, kind="pass", passer_player_id="qb1",
                 receiver_player_id="wr1", receiver_player_name="W.One", complete_pass=1,
                 pass_touchdown=1, touchdown=1, td_team="AAA"),
            play("g1", 2, "AAA", "BBB", 14, kind="pass", passer_player_id="qb1",
                 receiver_player_id="te1", receiver_player_name="T.End"),
            play("g1", 3, "AAA", "BBB", 60, kind="pass", passer_player_id="qb1",
                 receiver_player_id="wr2", receiver_player_name="W.Two"),
        ]
        out = rz.red_zone_from_frame(frame(rows), POSITIONS, {"wr1": "Wide One"})
        players = {p["player_id"]: p for p in out["AAA"]["players"]}
        wr1 = players["wr1"]
        self.assertEqual(wr1["player_name"], "Wide One")
        self.assertEqual((wr1["targets"], wr1["targets_inside10"], wr1["receiving_tds"]), (2, 1, 1))
        self.assertEqual(wr1["target_share"], round(2 / 3, 4))
        # Targeted only outside the 20: no red zone line at all.
        self.assertNotIn("wr2", players)
        by_pos = out["AAA"]["offense_by_position"]
        self.assertEqual((by_pos["WR"]["targets"], by_pos["TE"]["targets"]), (2, 1))
        self.assertEqual(by_pos["all"]["targets"], 3)
        self.assertEqual(out["BBB"]["defense_by_position"]["WR"]["receiving_tds"], 1)

    def test_share_counts_only_games_the_player_took_part_in(self):
        rows = [
            # Game 1: wr1 absent; te1 takes both red zone targets.
            play("g1", 1, "AAA", "BBB", 10, kind="pass", passer_player_id="qb1",
                 receiver_player_id="te1"),
            play("g1", 1, "AAA", "BBB", 5, kind="pass", passer_player_id="qb1",
                 receiver_player_id="te1"),
            # Game 2: one red zone target each.
            play("g2", 1, "AAA", "CCC", 10, kind="pass", passer_player_id="qb1",
                 receiver_player_id="te1"),
            play("g2", 1, "AAA", "CCC", 6, kind="pass", passer_player_id="qb1",
                 receiver_player_id="wr1"),
        ]
        players = {p["player_id"]: p for p in rz.red_zone_from_frame(frame(rows), POSITIONS)["AAA"]["players"]}
        self.assertEqual(players["wr1"]["target_share"], 0.5)
        self.assertEqual(players["wr1"]["games"], 1)
        self.assertEqual(players["te1"]["target_share"], 0.75)

    def test_quarterback_line_counts_scrambles_and_keeps_sacks_off_attempts(self):
        rows = [
            play("g1", 1, "AAA", "BBB", 15, kind="pass", passer_player_id="qb1",
                 passer_player_name="Q.Back", receiver_player_id="wr1", complete_pass=1),
            play("g1", 1, "AAA", "BBB", 12, kind="pass", passer_player_id="qb1", sack=1),
            play("g1", 1, "AAA", "BBB", 19, kind="run", qb_dropback=1, qb_scramble=1,
                 rusher_player_id="qb1", rusher_player_name="Q.Back"),
        ]
        qb = [p for p in rz.red_zone_from_frame(frame(rows), POSITIONS)["AAA"]["players"]
              if p["player_id"] == "qb1"][0]
        self.assertEqual((qb["dropbacks"], qb["attempts"], qb["completions"], qb["sacks"]), (3, 1, 1, 1))
        self.assertEqual(qb["completion_rate"], 1.0)
        self.assertEqual(qb["carries"], 1)

    def test_a_player_who_changed_clubs_keeps_both_and_lists_under_the_latest(self):
        rows = [
            play("2025_05_AAA_BBB", 1, "AAA", "BBB", 10, kind="run", rusher_player_id="rb1"),
            play("2025_05_AAA_BBB", 1, "AAA", "BBB", 4, kind="run", rusher_player_id="rb1"),
            play("2026_02_CCC_BBB", 1, "CCC", "BBB", 3, kind="run", rusher_player_id="rb1"),
            play("2026_02_CCC_BBB", 1, "CCC", "BBB", 2, kind="run", rusher_player_id="qb2"),
        ]
        out = rz.red_zone_from_frame(frame(rows), POSITIONS)
        self.assertEqual(out["AAA"]["players"], [])
        rb = [p for p in out["CCC"]["players"] if p["player_id"] == "rb1"][0]
        self.assertEqual((rb["carries"], rb["carries_inside5"], rb["games"]), (3, 2, 2))
        self.assertEqual(rb["carry_share"], 0.75)


class RedZoneRankTests(unittest.TestCase):
    def test_first_is_best_for_each_side(self):
        rows = []
        # AAA reaches the red zone on both drives, CCC on one of two; BBB and DDD defend.
        for drive, yl in ((1, 10), (2, 12)):
            rows.append(play("g1", drive, "AAA", "BBB", yl))
        for drive, yl in ((1, 10), (2, 60)):
            rows.append(play("g2", drive, "CCC", "DDD", yl))
        clubs = rz.rank(rz.red_zone_from_frame(frame(rows), POSITIONS))
        self.assertEqual(clubs["AAA"]["ranks"]["offense"]["trip_rate"], {"place": 1, "of": 2})
        self.assertEqual(clubs["CCC"]["ranks"]["offense"]["trip_rate"], {"place": 2, "of": 2})
        # Fewer trips allowed is better for a defense.
        self.assertEqual(clubs["DDD"]["ranks"]["defense"]["trip_rate"], {"place": 1, "of": 2})
        self.assertEqual(clubs["BBB"]["ranks"]["defense"]["trip_rate"], {"place": 2, "of": 2})


    def test_a_share_is_graded_only_above_its_floor(self):
        rows = []
        for i, yl in enumerate((18, 15, 11, 7)):
            rows.append(play("g1", 1, "AAA", "BBB", yl, kind="pass", passer_player_id="qb1",
                             receiver_player_id="wr1"))
        rows.append(play("g1", 2, "AAA", "BBB", 9, kind="pass", passer_player_id="qb1",
                         receiver_player_id="wr2"))
        clubs = rz.rank(rz.red_zone_from_frame(frame(rows), POSITIONS))
        players = {p["player_id"]: p for p in clubs["AAA"]["players"]}
        self.assertEqual(players["wr1"]["ranks"]["target_share"], {"place": 1, "of": 1})
        # One target: printed with its share, never placed.
        self.assertNotIn("ranks", players["wr2"])
        self.assertEqual(players["wr2"]["target_share"], 0.2)


    def test_the_published_list_is_trimmed_after_ranking(self):
        rows = []
        # Eight receivers with 3..10 red zone targets: all ranked, six published.
        for n, pid in enumerate(("r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10"), start=3):
            for i in range(n):
                rows.append(play("g1", 100 + n, "AAA", "BBB", 10, kind="pass",
                                 passer_player_id="qb1", receiver_player_id=pid))
        positions = {**POSITIONS, **{f"r{n}": "WR" for n in range(3, 11)}}
        clubs = rz.rank(rz.red_zone_from_frame(frame(rows), positions))
        ranked = {p["player_id"]: p["ranks"]["target_share"]["of"] for p in clubs["AAA"]["players"]
                  if p["position"] == "WR"}
        self.assertEqual(set(ranked.values()), {8})
        published = [p["player_id"] for p in rz.trim_players(clubs)["AAA"]["players"]
                     if p["position"] == "WR"]
        self.assertEqual(sorted(published), sorted(["r5", "r6", "r7", "r8", "r9", "r10"]))


if __name__ == "__main__":
    unittest.main()
