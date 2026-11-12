"""NFL designations follow the league's official injury report.

Owner 2026-11-12: the Commanders-Giants card listed Cam Skattebo as Out while
he played. ESPN's feed still carried the Week 9 "Out"; the Giants' official
Week 10 report listed him a full participant with no designation.
"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from outputs import publish_public_slate as slate  # noqa: E402

PAGE = (ROOT / "tests/fixtures/nfl_official_injury_report.html").read_text(encoding="utf-8")


def espn(name, status, position="RB", detail=""):
    return {"name": name, "position": position, "status": status, "detail": detail}


class OfficialReportParsingTests(unittest.TestCase):
    def setUp(self):
        self.report = slate.parse_nfl_official_report(PAGE)

    def test_games_use_espn_club_codes_and_skip_unissued_reports(self):
        self.assertIn(("WSH", "NYG"), self.report, "nfl.com's WAS is ESPN's WSH")
        self.assertIn(("NE", "DET"), self.report)
        self.assertNotIn(("LAC", "BAL"), self.report,
                         "'No Injuries Reported' before the first practice report is not a clean bill")

    def test_game_status_wins_and_full_participants_are_left_off(self):
        giants = {e["name"]: e for e in self.report[("WSH", "NYG")]["NYG"]}
        self.assertEqual(giants["Malik Harrison"]["status"], "Questionable")
        self.assertEqual(giants["Malik Harrison"]["detail"], "groin")
        for cleared in ("Cam Skattebo", "Colton Hood", "J.J. McCarthy"):
            self.assertNotIn(cleared, giants)

    def test_practice_status_stands_in_until_a_game_status_is_issued(self):
        commanders = {e["name"]: e["status"] for e in self.report[("WSH", "NYG")]["WSH"]}
        self.assertEqual(commanders["Lucas Patrick"], "Out")
        self.assertEqual(commanders["Treylon Burks"], "Did Not Practice")
        self.assertEqual(commanders["Amik Robertson"], "Limited Practice")
        self.assertNotIn("Jayden Daniels", commanders)


class MergeTests(unittest.TestCase):
    def setUp(self):
        self.report = slate.parse_nfl_official_report(PAGE)
        self.espn = {
            "NYG": [espn("Cam Skattebo", "Out", detail="hamstring"), espn("Colton Hood", "Out", "CB"),
                    espn("J.J. McCarthy", "Questionable", "QB"), espn("Tyrone Tracy Jr.", "Injured Reserve")],
            "LAC": [espn("Justin Herbert", "Questionable", "QB"), espn("David Njoku", "Injured Reserve", "TE"),
                    espn("Joe Alt", "Out", "T")],
        }

    def test_official_report_replaces_lingering_espn_designations(self):
        merged = slate.merge_nfl_injuries(self.espn, self.report, {("WSH", "NYG"), ("LAC", "BAL")})
        giants = {e["name"]: e["status"] for e in merged["NYG"]}
        self.assertNotIn("Cam Skattebo", giants)
        self.assertNotIn("Colton Hood", giants)
        self.assertNotIn("J.J. McCarthy", giants)
        self.assertEqual(giants["Malik Harrison"], "Questionable")
        self.assertEqual(giants["Tyrone Tracy Jr."], "Injured Reserve", "roster statuses stay")
        self.assertEqual(slate.availability_summary(merged["NYG"]), "1 questionable")

    def test_before_the_report_questionable_expires_and_out_holds(self):
        merged = slate.merge_nfl_injuries(self.espn, self.report, {("WSH", "NYG"), ("LAC", "BAL")})
        chargers = {e["name"]: e["status"] for e in merged["LAC"]}
        self.assertNotIn("Justin Herbert", chargers, "last week's Questionable is not this week's")
        self.assertEqual(chargers["Joe Alt"], "Out")
        self.assertEqual(chargers["David Njoku"], "Injured Reserve")

    def test_a_report_for_a_game_not_on_the_slate_is_ignored(self):
        merged = slate.merge_nfl_injuries(self.espn, self.report, {("LAC", "BAL")})
        self.assertNotIn("Malik Harrison", {e["name"] for e in merged["NYG"]})
        self.assertEqual({e["name"] for e in merged["NYG"]}, {"Cam Skattebo", "Colton Hood", "Tyrone Tracy Jr."})

    def test_summary_counts_practice_statuses(self):
        merged = slate.merge_nfl_injuries({}, self.report, {("WSH", "NYG")})
        self.assertEqual(slate.availability_summary(merged["WSH"]), "2 out · 1 DNP · 1 limited")


if __name__ == "__main__":
    unittest.main()
