"""Schedule strength by unit (owner 2026-11-28): the matchup section showed
only an overall SP+/FPI/win-rate schedule, with no read on which side of the
ball it taxed. The offenses a school met are the test its defense faced; the
defenses it met are the test its offense faced, as the CBB desk already reads
them (pipeline/power.py "Vs Offenses" / "Vs Defenses").
"""
import unittest
from unittest import mock

from scripts import cfb_depth

SP = {"alabama": 20.0, "auburn": 5.0, "georgia": 25.0, "lsu": 2.0}
OFFENSE = {"alabama": 35.0, "auburn": 28.0, "georgia": 40.0, "lsu": 24.0}
DEFENSE = {"alabama": 18.0, "auburn": 24.0, "georgia": 15.0, "lsu": 30.0}
GAMES = [
    {"homeTeam": "Alabama", "awayTeam": "Georgia", "completed": True, "homePoints": 20, "awayPoints": 17,
     "homeClassification": "fbs", "awayClassification": "fbs", "week": 1},
    {"homeTeam": "Auburn", "awayTeam": "LSU", "completed": True, "homePoints": 10, "awayPoints": 30,
     "homeClassification": "fbs", "awayClassification": "fbs", "week": 1},
    {"homeTeam": "Alabama", "awayTeam": "Auburn", "completed": False,
     "homeClassification": "fbs", "awayClassification": "fbs", "week": 2},
]


def build(**kwargs):
    with mock.patch.object(cfb_depth, "season_games", lambda season: GAMES), \
         mock.patch.object(cfb_depth, "espn_fpi", lambda season: {k: 1.0 for k in SP}):
        return cfb_depth.schedule_strength(2026, SP, **kwargs)


class UnitScheduleTests(unittest.TestCase):
    def test_the_hardest_schedule_met_the_best_offenses(self):
        played = build(sp_offense=OFFENSE, sp_defense=DEFENSE)["alabama"]["played"]
        self.assertEqual(played["sp_off"]["value"], 40.0)       # Georgia's offense
        self.assertEqual(played["sp_off"]["better"], "high")
        self.assertEqual((played["sp_off"]["rank"], played["sp_off"]["of"]), (1, 4))

    def test_the_hardest_schedule_met_the_stingiest_defenses(self):
        """SP+ defense allows points, so first place is the lowest number."""
        out = build(sp_offense=OFFENSE, sp_defense=DEFENSE)
        tide, tigers = out["alabama"]["played"]["sp_def"], out["auburn"]["played"]["sp_def"]
        self.assertEqual((tide["value"], tigers["value"]), (15.0, 30.0))  # Georgia, LSU
        self.assertEqual(tide["better"], "low")
        self.assertEqual(tide["rank"], 1)
        self.assertEqual(tigers["rank"], 4)

    def test_each_figure_names_its_window_and_counts_its_games(self):
        played = build(sp_offense=OFFENSE, sp_defense=DEFENSE)["alabama"]["played"]
        self.assertEqual(played["sp_off"]["label"], "Opponents' average SP+ offense (played)")
        self.assertEqual(played["sp_off"]["games"], 1)
        remaining = build(sp_offense=OFFENSE, sp_defense=DEFENSE)["alabama"]["remaining"]
        self.assertEqual(remaining["sp_def"]["value"], DEFENSE["auburn"])

    def test_the_overall_schedule_is_unchanged_without_the_unit_tables(self):
        """A season with no SP+ units published still reads as it did."""
        out = build()
        self.assertEqual(set(out["alabama"]["played"]), {"sp", "fpi", "win_rate"})
        self.assertEqual(out["alabama"]["played"]["sp"]["value"], 25.0)
        self.assertEqual(out["alabama"]["played"]["sp"]["better"], "high")

    def test_a_school_without_a_unit_rating_is_left_out_not_zeroed(self):
        out = build(sp_offense={"georgia": 40.0}, sp_defense={})
        self.assertEqual(out["alabama"]["played"]["sp_off"]["value"], 40.0)
        self.assertNotIn("sp_def", out["alabama"]["played"])
        self.assertNotIn("sp_off", out["auburn"]["played"])  # LSU has no offense rating


class ClassificationTests(unittest.TestCase):
    def test_every_schedule_figure_the_slate_publishes_is_classified(self):
        """The publisher refuses an unclassified key, so a new column that is
        not in the spec stops the whole CFB slate (2026-11-28)."""
        import json
        from pathlib import Path
        root = Path(__file__).resolve().parents[1]
        spec = json.loads((root / "design" / "public_metric_classification.json").read_text(encoding="utf-8"))
        classified = {k for v in spec.values() if isinstance(v, list) for k in v}
        published = set()
        for block in build(sp_offense=OFFENSE, sp_defense=DEFENSE).values():
            for window in block.values():
                published |= set(window)
        self.assertTrue(published)
        self.assertLessEqual(published, classified, sorted(published - classified))


if __name__ == "__main__":
    unittest.main()
