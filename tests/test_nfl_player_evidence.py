"""Stable player identities, real snap totals and position-relative production."""
import unittest

import pandas as pd

from outputs import nfl_player_evidence as evidence


def fixtures():
    snaps, stats, identities = [], [], []
    for i in range(10):
        name = "Michael Receiver" if i == 0 else f"Receiver {i}"
        identities.append({"pfr_id": f"p{i}", "gsis_id": f"g{i}", "display_name": "Mike Receiver" if i == 0 else name,
                           "first_name": "Michael" if i == 0 else "Receiver", "last_name": "Receiver" if i == 0 else str(i),
                           "common_first_name": "Mike" if i == 0 else "Receiver", "latest_team": "CAR",
                           "last_season": 2026, "position": "WR"})
        for week in (1, 2):
            snaps.append({"pfr_player_id": f"p{i}", "player": name, "position": "WR", "season": 2026,
                          "game_type": "REG", "week": week, "game_id": f"game{week}", "team": "CAR",
                          "offense_snaps": 40, "defense_snaps": 0, "st_snaps": 5})
            stats.append({"player_id": f"g{i}", "season": 2026, "season_type": "REG", "week": week,
                          "targets": 10, "carries": 0, "rushing_yards": 0, "receiving_yards": 20 + i * 10,
                          "rushing_epa": 0, "receiving_epa": i})
    return pd.DataFrame(snaps), pd.DataFrame(stats), pd.DataFrame(identities)


class PlayerEvidenceTests(unittest.TestCase):
    def test_ids_bridge_names_and_snaps_count_every_phase(self):
        snaps, stats, players = fixtures()
        out = evidence.build(snaps, stats, players, 2026)["CAR"]
        self.assertEqual(out["mikereceiver"], out["michaelreceiver"])
        line = out["mikereceiver"]["snap_counts"]
        self.assertEqual((line["total"], line["offense"], line["special_teams"], line["games"]), (90, 80, 10, 2))

    def test_special_teams_appearance_does_not_count_as_a_missed_game(self):
        snaps, stats, players = fixtures()
        snaps.loc[snaps.pfr_player_id == "p0", ["offense_snaps", "st_snaps"]] = [0, 15]
        out = evidence.build(snaps, stats, players, 2026)["CAR"]["mikereceiver"]
        self.assertEqual(out["missed"], 0)
        self.assertEqual(out["snap_counts"]["total"], 30)
        self.assertIsNone(out["production"]["score"])

    def test_production_compares_position_peers_and_keeps_thin_samples_unrated(self):
        snaps, stats, players = fixtures()
        out = evidence.build(snaps, stats, players, 2026)["CAR"]
        ratings = [out["mikereceiver" if i == 0 else f"receiver{i}"]["production"] for i in range(10)]
        self.assertEqual(ratings[0]["score"], 0)
        self.assertEqual(ratings[-1]["score"], 100)
        self.assertEqual([r["score"] for r in ratings], sorted(r["score"] for r in ratings))
        self.assertTrue(all(r["position"] == "WR" and r["cohort_size"] == 10 for r in ratings))
        # One unit appearance plus a special-teams appearance is not two WR games.
        snaps.loc[(snaps.pfr_player_id == "p0") & (snaps.week == 2), "offense_snaps"] = 0
        self.assertIsNone(evidence.build(snaps, stats, players, 2026)["CAR"]["mikereceiver"]["production"]["score"])

    def test_transferred_player_keeps_all_club_snaps(self):
        snaps, stats, players = fixtures()
        snaps.loc[(snaps.pfr_player_id == "p0") & (snaps.week == 1), "team"] = "BAL"
        out = evidence.build(snaps, stats, players, 2026)
        self.assertEqual(out["CAR"]["mikereceiver"]["snap_counts"]["total"], 90)
        self.assertEqual(out["BAL"]["mikereceiver"]["snap_counts"]["total"], 90)

    def test_known_rostered_player_with_no_snaps_gets_zero_without_a_grade(self):
        snaps, stats, players = fixtures()
        players = pd.concat([players, pd.DataFrame([{"pfr_id": "ol0", "gsis_id": "ol0", "display_name": "No Snap Lineman",
                             "latest_team": "CAR", "last_season": 2025, "position": "G"}])], ignore_index=True)
        out = evidence.build(snaps, stats, players, 2026)["CAR"]["nosnaplineman"]
        self.assertEqual(out["snap_counts"]["total"], 0)
        self.assertIsNone(out["missed"])
        self.assertIsNone(out["production"]["score"])

    def test_duplicate_snap_rows_are_rejected(self):
        snaps, stats, players = fixtures()
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            evidence.build(pd.concat([snaps, snaps.iloc[:1]]), stats, players, 2026)


if __name__ == "__main__":
    unittest.main()
