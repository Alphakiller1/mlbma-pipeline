"""A phone game summary and archive carry only their own fixture and evidence."""
import json
import tempfile
import unittest
from pathlib import Path

from scripts.build_cfb_game_payloads import OUTPUT, build


class CfbGamePayloadTests(unittest.TestCase):
    def test_current_and_archived_games_keep_their_own_evidence_and_eastern_date(self):
        fixture = {
            "id": "TA&M@OU", "sport": "cfb", "season": 2026, "away": "TA&M", "home": "OU",
            "away_name": "Texas A&M", "home_name": "Oklahoma",
            "away_form": {"season": 2026, "source": "espn", "rates": {
                "off_ypc": {"value": 5.7}, "off_pass_ypg": {"value": 277.5}
            }},
            "away_game_log": {"games": [{"opponent": "Florida"}]},
            "away_injuries": {"players": [{"position": "QB", "player": "A Starter"},
                                         {"position": "WR", "player": "A Receiver"}]},
            "kickoff_utc": "2026-11-29T01:30:00Z",
            "game_state": "scheduled",
        }
        final = {**fixture, "kickoff_utc": "2026-11-22T01:30:00Z", "game_state": "final", "home_score": 27}
        slate = {"season": 2026, "week": 13, "generated_at_utc": "2026-11-23T08:00Z", "games": [fixture]}
        archived = {**slate, "week": 12, "games": [final]}
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.assertEqual(build(root, slate, archived), 2)
            node = root / OUTPUT
            index = json.loads((node / "index.json").read_text(encoding="utf-8"))
            self.assertEqual([g["slate_date"] for g in index["games"]], ["2026-11-21", "2026-11-28"])
            fast = json.loads((node / "2026-11-28/TA&M@OU.json").read_text(encoding="utf-8"))["games"][0]
            self.assertNotIn("away_game_log", fast)
            self.assertEqual(list(fast["away_form"]["rates"]), ["off_ypc"])
            self.assertEqual(len(fast["away_injuries"]["players"]), 1)
            older = json.loads((node / "2026-11-21/TA&M@OU-evidence.json").read_text(encoding="utf-8"))
            self.assertEqual(older["week"], 12)
            self.assertEqual(older["games"], [final])
