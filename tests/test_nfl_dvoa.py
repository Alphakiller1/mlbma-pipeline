import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "outputs"))
sys.path.insert(0, str(ROOT / "scripts"))

from project_public_slate import project_slate  # noqa: E402
from publish_public_slate import (  # noqa: E402
    _dvoa_value, _lost_evidence, attach_nfl_dvoa, fetch_ftn_dvoa,
)


class _Response:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class NflDvoaTests(unittest.TestCase):
    def test_percentage_conversion(self):
        self.assertEqual(_dvoa_value("+12.3%"), 0.123)
        self.assertEqual(_dvoa_value("-4.5%"), -0.045)
        self.assertIsNone(_dvoa_value(""))

    @patch("urllib.request.urlopen")
    def test_fetch_attach_and_project_preserve_public_metrics(self, urlopen):
        rows = {}
        for index in range(32):
            club = "WAS" if index == 0 else ("DAL" if index == 1 else f"T{index:02d}")
            rows[club] = {
                "year": 2026, "week": 3,
                "total_dvoa": "+12.3%", "total_dvoa_rank": index + 1,
                "offense_dvoa": "+7.0%", "offense_rank": index + 1,
                "defense_dvoa": "-4.0%", "defense_rank": index + 1,
                "special_teams_dvoa": "+1.3%", "special_teams_rank": index + 1,
            }
        urlopen.return_value = _Response({"2026": rows})
        rankings = fetch_ftn_dvoa(2026)
        producer = {"games": [{"id": "x", "away": "WSH", "home": "DAL"}]}
        self.assertEqual(attach_nfl_dvoa(producer, rankings), 2)
        public = project_slate("nfl", producer)
        away = public["games"][0]["away_dvoa"]
        self.assertEqual(away["source"], "FTN public Team Total DVOA")
        self.assertEqual(away["total_dvoa"], {"value": 0.123, "rank": 1, "of": 32})
        self.assertEqual(public["games"][0]["home_dvoa"]["offense_dvoa"]["rank"], 2)

    def test_publisher_rejects_total_dvoa_loss(self):
        previous = {
            "games": [
                {"away_dvoa": {"total_dvoa": {"value": 0.1}}},
                {"home_dvoa": {"total_dvoa": {"value": -0.1}}},
            ]
        }
        fresh = {"games": [{"away": "WAS", "home": "DAL"}, {"away": "NYG", "home": "PHI"}]}
        with tempfile.TemporaryDirectory() as directory:
            published = Path(directory) / "slate.json"
            published.write_text(json.dumps(previous), encoding="utf-8")
            self.assertIn("published slate carries dvoa", _lost_evidence(fresh, published))


if __name__ == "__main__":
    unittest.main()
