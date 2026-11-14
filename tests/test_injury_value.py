"""Every player on an injury report carries his value to the spread and how
often a player listed his way has played (owner 2026-11-13)."""
import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from outputs import nfl_injury_value, publish_public_slate as slate  # noqa: E402
import project_public_slate  # noqa: E402

JS = (ROOT / "dashboard/public_game_detail.js").read_text(encoding="utf-8")


class NflFitTests(unittest.TestCase):
    def setUp(self):
        self.fit = nfl_injury_value.fit()

    def test_absences_beat_team_strength_on_held_out_closing_lines(self):
        v = self.fit["value"]
        self.assertLess(v["heldout_rmse"]["with_absences"], v["heldout_rmse"]["teams_only"])
        self.assertGreater(v["games"], 1500)
        for group in ("QB", "RB", "WR", "TE", "OL", "EDGE", "DL", "LB", "CB", "S"):
            self.assertGreater(v["points_per_share"][group], 0, group)
        self.assertGreater(v["points_per_share"]["QB"], 2 * v["points_per_share"]["WR"])

    def test_play_rates_rest_on_real_listings(self):
        rates = self.fit["play_rates"]
        q = rates["by_status"]["Questionable"]
        self.assertGreater(q["n"], 1000)
        self.assertTrue(0.5 < q["played"] < 0.8)
        self.assertLess(rates["by_status"]["Out"]["played"], 0.01)
        self.assertLess(rates["by_status_practice"]["Questionable|DNP"]["played"],
                        rates["by_status_practice"]["Questionable|Full"]["played"])


class NflAttachTests(unittest.TestCase):
    def test_values_attach_by_name(self):
        original = nfl_injury_value.team_values
        nfl_injury_value.team_values = lambda season: {"NYG": {"maliknabers": {"value": 0.49, "share": 0.77, "group": "WR"}}}
        try:
            injuries = {"NYG": [{"name": "Malik Nabers", "status": "Questionable"},
                                {"name": "Somebody Else", "status": "Out"}]}
            self.assertEqual(slate.attach_nfl_values(injuries, 2026), 1)
            self.assertEqual(injuries["NYG"][0]["value"], 0.49)
            self.assertIsNone(injuries["NYG"][1]["value"])
        finally:
            nfl_injury_value.team_values = original

    def test_names_match_across_feeds(self):
        self.assertEqual(nfl_injury_value.name_key("Morez Johnson Jr."), nfl_injury_value.name_key("Morez Johnson"))
        self.assertEqual(nfl_injury_value.name_key("D'Andre Swift"), nfl_injury_value.name_key("DAndre Swift"))

    def test_official_rows_carry_the_last_practice(self):
        page = (ROOT / "tests/fixtures/nfl_official_injury_report.html").read_text(encoding="utf-8")
        report = slate.parse_nfl_official_report(page)
        commanders = {e["name"]: e for e in report[("WSH", "NYG")]["WSH"]}
        self.assertEqual(commanders["Treylon Burks"]["practice"], "DNP")
        self.assertEqual(commanders["Amik Robertson"]["practice"], "Limited")

    def test_the_slate_carries_the_play_rate_table(self):
        out = project_public_slate.project_slate("nfl", {"games": [], "designation_play_rates": {"by_status": {}}})
        self.assertEqual(out["designation_play_rates"], {"by_status": {}})


class CbbConstantsTests(unittest.TestCase):
    def test_page_uses_the_fitted_points(self):
        fit = json.loads((ROOT / "outputs/cbb_injury_value.json").read_text(encoding="utf-8"))
        m = re.search(r"CBB_INJURY_VALUE = \{ role: ([\d.]+), star: ([\d.]+) \}", JS)
        self.assertIsNotNone(m)
        self.assertEqual(float(m.group(1)), fit["points"]["role"])
        self.assertEqual(float(m.group(2)), fit["points"]["lite2"])
        self.assertLess(fit["heldout_rmse"]["role+lite2"], fit["heldout_rmse"]["teams_only"])


if __name__ == "__main__":
    unittest.main()
