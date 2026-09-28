"""Every starter the slate shows must be in the split population.

AJ Blubaugh (2026-09-29, HOU) was a reliever with no starts whom RotoWire listed
to start before MLB announced a probable. Neither MLB source put him in the
population, so his matchup card showed a name, an ERA, and no splits.
"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scrapers import scrape_sp_hand_splits as sp


class SlateStartersTest(unittest.TestCase):
    def _with_slate(self, payload):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        path = Path(tmp.name) / "public" / "mlb" / "slate.json"
        path.parent.mkdir(parents=True)
        path.write_text(payload if isinstance(payload, str) else json.dumps(payload), encoding="utf-8")
        return mock.patch.object(sp, "DATA_DIR", tmp.name)

    def test_a_rotowire_listed_reliever_is_looked_up(self):
        slate = {"games": [{"away": "CWS", "home": "HOU", "away_starter": "Erick Fedde",
                            "home_starter": "Aj Blubaugh", "away_starter_id": 607200,
                            "home_starter_id": 805123}]}
        with self._with_slate(slate), \
                mock.patch.object(sp, "_probable_starters", return_value=[]), \
                mock.patch.object(sp, "_leaderboard_starters", return_value=[]):
            ids = {row["id"] for row in sp.target_pitchers()}
        self.assertEqual(ids, {607200, 805123})

    def test_an_unnamed_side_or_broken_file_adds_nobody(self):
        with self._with_slate({"games": [{"away_starter_id": None, "home_starter_id": "x"}]}):
            self.assertEqual(sp._slate_starters(), [])
        with self._with_slate("{not json"):
            self.assertEqual(sp._slate_starters(), [])


if __name__ == "__main__":
    unittest.main()
