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


def test_publisher_refuses_a_short_pull(tmp_path, monkeypatch):
    """A slate where most games lack unit profiles is a broken pull, not a quiet
    week: the published slate must be kept, not overwritten."""
    out = tmp_path / "slate.json"
    out.write_text('{"games": ["previous"]}', encoding="utf-8")
    monkeypatch.setattr(cfb, "OUT", out)
    monkeypatch.setattr(cfb, "load_board_games",
                        lambda: ([{"id": 1}, {"id": 2}], {"season": cfb.datetime.now(cfb.timezone.utc).year}))
    monkeypatch.setattr(cfb, "load_espn_stats", lambda season: {})
    monkeypatch.setattr(cfb, "load_espn_events", lambda: [])
    monkeypatch.setattr(cfb, "event_index", lambda events: {})
    monkeypatch.setattr(cfb, "public_game", lambda raw, *a: {"id": raw["id"]})
    assert cfb.main() == 1
    assert out.read_text(encoding="utf-8") == '{"games": ["previous"]}'
