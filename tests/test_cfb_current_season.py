from __future__ import annotations

import unittest
from unittest.mock import patch

from scripts import publish_public_cfb_slate as cfb


class CfbCurrentSeasonTests(unittest.TestCase):
    def test_espn_response_must_match_requested_regular_season(self):
        stale = {
            "requestedSeason": {"year": 2025, "type": {"type": 2}},
            "categories": [],
            "teams": [],
        }
        with patch.object(cfb, "fetch_json", return_value=stale):
            with self.assertRaisesRegex(RuntimeError, "season mismatch"):
                cfb.load_espn_stats(2026)

    def test_team_form_rejects_a_prior_season_row(self):
        team = {"season": 2025, "own": {}, "opp": {}, "plays": 12}
        self.assertIsNone(cfb.form_for(team, {}, 2026))


if __name__ == "__main__":
    unittest.main()
