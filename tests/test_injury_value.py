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
        nfl_injury_value.team_values = lambda season: {"NYG": {"maliknabers": {
            "value": 0.49, "value_recent": 0.33, "missed": 1, "share": 0.77, "group": "WR"}}}
        try:
            injuries = {"NYG": [{"name": "Malik Nabers", "status": "Questionable"},
                                {"name": "Somebody Else", "status": "Out"}]}
            self.assertEqual(slate.attach_nfl_values(injuries, 2026), 1)
            nabers, other = injuries["NYG"]
            self.assertEqual((nabers["value"], nabers["value_recent"], nabers["missed"]), (0.49, 0.33, 1))
            self.assertIsNone(other["value"])
            self.assertNotIn("missed", other)
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


class CfbValueTests(unittest.TestCase):
    """A QB who started weeks 1-2 then sat, the QB who replaced him, a defender."""

    def setUp(self):
        import cfb_depth
        self.depth = cfb_depth
        lines = {1: {"1": {"name": "Ace Passer", "att": 30.0, "pyds": 240.0}},
                 2: {"1": {"name": "Ace Passer", "att": 30.0, "pyds": 210.0}},
                 3: {"2": {"name": "Ben Backup", "att": 25.0, "pyds": 150.0}},
                 4: {"2": {"name": "Ben Backup", "att": 25.0, "pyds": 160.0}},
                 5: {"2": {"name": "Ben Backup", "att": 25.0, "pyds": 170.0},
                     "3": {"name": "Cal Tackler", "tkl": 8.0}}}
        def event(week):
            return {"id": f"e{week}", "status": {"type": {"completed": True}},
                    "competitions": [{"competitors": [{"team": {"abbreviation": "PITT", "id": "221"}}]}]}
        self.saved = (cfb_depth._week_events, cfb_depth._box_usage)
        cfb_depth._week_events = lambda season, week: [event(week)] if week in lines else []
        cfb_depth._box_usage = lambda eid: {"221": lines[int(eid[1:])]}
        self.usage = cfb_depth.recent_usage(2026, 6, {"PITT": "PITT"})["PITT"]

    def tearDown(self):
        self.depth._week_events, self.depth._box_usage = self.saved

    def test_usage_reads_his_role_and_how_long_he_has_been_out(self):
        ace, ben = self.usage["1"], self.usage["2"]
        self.assertEqual(ace["missed"], 3)
        self.assertEqual(ace["shares"]["att"], 1.0)   # his own appearances
        self.assertEqual(ace["recent"]["att"], 0.0)   # the school's last three games
        self.assertEqual((ben["missed"], ben["shares"]["att"], ben["recent"]["att"]), (0, 1.0, 1.0))

    def test_a_long_absence_keeps_his_value_but_not_his_recent_value(self):
        import cfb_injury_value
        coef = cfb_injury_value.coefficients()
        entries = [{"player": "Ace Passer", "status": "Out For Season"},
                   {"player": "C. Tackler", "status": "Out"},
                   {"player": "Nobody Listed", "status": "Out"}]
        self.assertEqual(cfb_injury_value.attach(entries, self.usage, coef), 1)
        ace, cal, nobody = entries
        self.assertEqual(ace["value"], round(coef["QB"], 2))
        self.assertEqual((ace["value_recent"], ace["missed"]), (0.0, 3))
        self.assertIsNone(cal["value"])              # defenders are not rated
        self.assertEqual(cal["missed"], 0)           # but his tackles say he played
        self.assertIsNone(nobody["value"])
        self.assertNotIn("missed", nobody)

    def test_the_fit_beats_team_strength_held_out(self):
        fit = json.loads((ROOT / "outputs/cfb_injury_value.json").read_text(encoding="utf-8"))
        rmse = fit["heldout_rmse"]
        self.assertLess(rmse["+".join(fit["terms"])], rmse["teams_only"])
        self.assertGreater(fit["games"], 1500)
        for term in ("QB", "RB", "WR"):
            self.assertGreater(fit["points_per_share"][term], 0, term)

    def test_rotowire_table_tags_read_as_the_report_words(self):
        import cfb_injuries
        rows = json.dumps([{"RotoSchoolName": "Pittsburgh", "player": "Mason Heintschel", "position": "QB",
                            "IR": "OFS", "injury_type": "Knee"},
                           {"RotoSchoolName": "Pittsburgh", "player": "Holden Geriner", "position": "QB",
                            "IR": "Doubtful"}])
        listed = cfb_injuries.parse_rotowire(rows)["pittsburgh"]
        self.assertEqual([e["status"] for e in listed], ["Out For Season", "Doubtful"])

    def test_page_play_rates_are_the_nfl_record(self):
        rates = nfl_injury_value.fit()["play_rates"]["by_status"]
        m = re.search(r"CFB_PLAY_RATES = \{ Questionable: \[([\d.]+), (\d+)\], Doubtful: \[([\d.]+), (\d+)\], "
                      r"Out: \[([\d.]+), (\d+)\] \}", JS)
        self.assertIsNotNone(m)
        for i, status in enumerate(("Questionable", "Doubtful", "Out")):
            self.assertAlmostEqual(float(m.group(2 * i + 1)), round(rates[status]["played"], 4), places=4)
            self.assertEqual(int(m.group(2 * i + 2)), rates[status]["n"])


if __name__ == "__main__":
    unittest.main()
