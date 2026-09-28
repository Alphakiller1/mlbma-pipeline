"""The pools behind Lineup Versus Pitch Mix and the deeper bullpen section."""
from __future__ import annotations

import csv
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_publisher():
    spec = importlib.util.spec_from_file_location(
        "publish_public_matchup_depth", ROOT / "scripts" / "publish_public_matchup_depth.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


class BatterPitchTypeTests(unittest.TestCase):
    def test_percentiles_face_the_hitter_and_stay_inside_a_pitch_type(self):
        publisher = load_publisher()
        publisher.MIN_POOL = 3
        rows = []
        for i in range(10):
            rows.append({"player_id": str(i), "player_name": f"Last{i}, First{i}", "team": "NYY",
                         "pitch_type": "SL", "pitch_name": "Slider", "pitches": 200, "pa": 40,
                         "xwoba": 0.200 + i * 0.02, "whiff_percent": 20 + i,
                         "hard_hit_percent": 30 + i, "run_value_per_100": 0})
        # A four-seam line far above every slider must not move a slider percentile.
        rows.append({"player_id": "0", "player_name": "Last0, First0", "team": "NYY",
                     "pitch_type": "FF", "pitch_name": "4-Seam Fastball", "pitches": 300,
                     "pa": 60, "xwoba": 0.900, "whiff_percent": 5, "hard_hit_percent": 70,
                     "run_value_per_100": 0})
        with tempfile.TemporaryDirectory() as tmp:
            write_csv(Path(tmp) / publisher.BATTER_SOURCE, rows)
            hitters = publisher.batter_pitch_types(Path(tmp))
        best, worst = hitters["9"]["pitches"]["SL"], hitters["0"]["pitches"]["SL"]
        self.assertEqual(hitters["0"]["name"], "First0 Last0")
        self.assertEqual(best["xwoba"]["percentile"], 90.0)
        self.assertEqual(worst["xwoba"]["percentile"], 0.0)
        # The highest whiff rate is the WORST line for a hitter.
        self.assertEqual(best["whiff_percent"]["percentile"], 0.0)
        self.assertEqual(worst["whiff_percent"]["percentile"], 90.0)
        self.assertIsNone(hitters["0"]["pitches"]["FF"]["xwoba"]["percentile"],
                          "a one-hitter pool is too small to rank against")


class BullpenBoardTests(unittest.TestCase):
    def reliever_rows(self):
        rows = []
        for team in range(30):
            for arm in range(15):
                pid = f"{team}-{arm}"
                starter = arm == 0  # one rotation arm per club
                for split in ("season", "h", "a", "vl", "vr", "lc", "risp"):
                    rows.append({
                        "split": split, "player_id": pid, "name": pid, "team_id": team,
                        "games": 30, "games_started": 28 if starter else 0,
                        "saves": 0, "holds": 0, "outs": 120, "bf": 170, "ab": 150,
                        "h": 30 + team, "bb": 15, "ibb": 0, "hbp": 2, "so": 45, "hr": 4,
                        "tb": 50 + team, "sf": 1, "er": 15 + (99 if starter else 0),
                    })
        return rows

    def test_units_and_relievers_pool_relief_arms_only(self):
        publisher = load_publisher()
        with tempfile.TemporaryDirectory() as tmp:
            write_csv(Path(tmp) / publisher.RELIEVER_SOURCE, self.reliever_rows())
            board = publisher.bullpen_board(Path(tmp))
        self.assertEqual(len(board["units"]["season"]["era"]), 30)
        self.assertEqual(len(board["relievers"]["season"]["era"]), 30 * 14,
                         "rotation arms stay out of the reliever pool")
        # The rotation arm's 99 extra earned runs never reach a pen's ERA.
        self.assertAlmostEqual(max(board["units"]["season"]["era"]), 15 * 27 / 120, places=3)
        for split in ("vl", "lc", "risp"):
            self.assertNotIn("era", board["units"][split], "no earned runs on that split")
            self.assertEqual(len(board["units"][split]["fip"]), 30)
        self.assertEqual(board["units"]["season"]["ops"],
                         sorted(board["units"]["season"]["ops"]))
        self.assertNotIn("pen_pitches", board)

    def test_short_pull_publishes_nothing(self):
        publisher = load_publisher()
        with tempfile.TemporaryDirectory() as tmp:
            write_csv(Path(tmp) / publisher.RELIEVER_SOURCE, self.reliever_rows()[:70])
            self.assertIsNone(publisher.bullpen_board(Path(tmp)))

    def test_runs_by_hand_windows_are_the_last_n_games(self):
        publisher = load_publisher()
        rows = []
        for team in range(30):
            for day in range(70):
                rows.append({"date": f"2026-{6 + day // 28:02d}-{day % 28 + 1:02d}",
                             "game_pk": 1000 * team + day, "game_type": "R", "team_id": team,
                             "opp_id": (team + 1) % 30, "home": day % 2, "runs": team % 7,
                             "allowed": 3, "won": 1 if day % 3 else 0,
                             "opp_starter_id": 1, "opp_starter_hand": "L" if day % 4 == 0 else "R"})
        with tempfile.TemporaryDirectory() as tmp:
            write_csv(Path(tmp) / publisher.GAMES_SOURCE, rows)
            cells = publisher.team_runs_by_hand(Path(tmp))
        club = cells["6"]
        self.assertEqual(club["ytd"]["all"]["any"]["games"], 70)
        self.assertEqual(club["l7"]["all"]["any"]["games"], 7)
        split = club["ytd"]["all"]
        self.assertEqual(split["vs_lhp"]["games"] + split["vs_rhp"]["games"], 70)
        self.assertEqual(club["ytd"]["home"]["any"]["games"] + club["ytd"]["away"]["any"]["games"], 70)
        # Club 6 scores the most runs of the thirty (team % 7 peaks at 6, 13, 20, 27).
        self.assertEqual(club["ytd"]["all"]["any"]["runs_per_game"]["rank"], 1)

    def test_published_files_carry_no_forecast(self):
        for name in ("batter_pitch_types.json", "bullpen_board.json"):
            path = ROOT / "data" / "public" / name
            if not path.is_file():
                continue
            blob = path.read_text(encoding="utf-8")
            for key in ("projOSI", "ppGap", "win_probability", "projected_"):
                self.assertNotIn(key, blob, f"{name} publishes {key}")
            json.loads(blob)


if __name__ == "__main__":
    unittest.main()
