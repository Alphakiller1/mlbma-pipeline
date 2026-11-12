"""Colour follows what each unit wants (owner 2026-11-12).

A defense preventing yardage, EPA or volume is good; allowing more of what it
wants less of is bad. Style (shot mix, tempo) carries no verdict. A crawl of
every matchup page (40,967 ranked cells) found these departures; these tests
keep them fixed.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
JS = (ROOT / "dashboard/public_game_detail.js").read_text(encoding="utf-8")


class UnitConnotationTests(unittest.TestCase):
    def test_volume_a_defense_faces_ranks_fewest_first(self):
        pace = JS.split("function nflPacePanel", 1)[1].split("function nflDefTendencyPanel", 1)[0]
        self.assertIn("cell('defense', dScheme, 'plays_per_game' + sit[0], 'num1', true)", pace)
        self.assertIn("cell('defense', dScheme, 'time_of_possession' + row[0], 'clock', true)", pace)
        self.assertIn("cell('offense', oScheme, 'plays_per_game' + sit[0], 'num1', false)", pace)

    def test_complementary_shot_mix_shares_carry_no_verdict(self):
        rows = {m.group(1): m.group(0) for m in re.finditer(r"\['(\dPA rate \(\dPA/FGA\))'[^\n]*", JS)}
        self.assertIn("'least','tpr_d_all','least'", rows["2PA rate (2PA/FGA)"])
        self.assertIn("'most','tpr_d_all','most'", rows["3PA rate (3PA/FGA)"])
        self.assertIn("better: neutral ? 'neutral' : undefined", JS)

    def test_shot_type_share_follows_the_shot_s_value(self):
        body = JS.split("function cbbShotWanted", 1)[1].split("function cbbShotTypes", 1)[0]
        self.assertIn("rankSamples(year, 'team', key)", body)
        self.assertIn("pps / (2 * efg)", body)
        types = JS.split("function cbbShotTypes", 1)[1].split("return cbbPanel(heading,cbbRateCaption", 1)[0]
        # An offense wants more of a shot worth more than the average one; a
        # defense wants to allow less of it - and more of a cheap one.
        self.assertIn("side==='off'?wanted==='more':wanted==='less'", types)


if __name__ == "__main__":
    unittest.main()
