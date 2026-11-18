"""CFB pass catchers and defenders, and the desk without the model board
(2026-11-18 audit)."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import cfb_depth  # noqa: E402


class RankedPlayersTests(unittest.TestCase):
    def setUp(self):
        self.saved = cfb_depth._player_lines_cached
        lines = {
            "defensive": {("osu", "1"): {"player": "A", "position": "LB", "TOT": 60, "SACKS": 5, "TFL": 9, "PD": 2},
                          ("osu", "2"): {"player": "B", "position": "S", "TOT": 50, "SACKS": 0, "TFL": 0, "PD": 6},
                          ("neb", "3"): {"player": "C", "position": "LB", "TOT": 40, "SACKS": 1, "TFL": 3, "PD": 0}},
            "interceptions": {("osu", "2"): {"INT": 3}},
            "receiving": {("osu", "4"): {"player": "D", "position": "WR", "REC": 80, "YDS": 1300, "TD": 15, "LONG": 72},
                          ("neb", "5"): {"player": "E", "position": "WR", "REC": 20, "YDS": 200, "TD": 0, "LONG": 30}},
        }
        cfb_depth._player_lines_cached = lambda season, category: lines[category]

    def tearDown(self):
        cfb_depth._player_lines_cached = self.saved

    def test_defenders_rank_real_figures_and_leave_zeros_unranked(self):
        out = cfb_depth.defenders(2026, {"osu", "neb"})
        a, b = out["osu"]
        self.assertEqual((a["player_name"], a["sacks"]["rank"]), ("A", 1))
        self.assertEqual(b["interceptions"]["value"], 3)
        self.assertNotIn("rank", b["sacks"])           # zero sacks: printed, not placed
        self.assertNotIn("rank", out["neb"][0]["passes_defended"])

    def test_receivers_sort_by_yards(self):
        out = cfb_depth.receivers(2026, {"osu", "neb"})
        self.assertEqual(out["osu"][0]["yards"]["rank"], 1)
        self.assertEqual(out["osu"][0]["catches"], 80)
        self.assertNotIn("rank", out["neb"][0]["touchdowns"])


class BoardFallbackTests(unittest.TestCase):
    def test_cards_come_from_the_public_slate_when_the_board_fails(self):
        js = (ROOT / "dashboard" / "sports" / "cfb.js").read_text(encoding="utf-8")
        self.assertIn("loadJson(BOARD_URL).catch(function () { return null; })", js)
        self.assertIn("function boardFromPublic(slate)", js)
        self.assertIn("boardFromPublic(parts[2])", js)
        status = (ROOT / "dashboard" / "chase_datastatus.js").read_text(encoding="utf-8")
        self.assertIn("cfb: '/data/public/cfb/slate.json'", status)


if __name__ == "__main__":
    unittest.main()
