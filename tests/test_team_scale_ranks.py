"""No place runs past the number of teams in the cohort (owner 2026-11-13).

Game logs place each game among that week's team-games (796 CBB, up to 150
CFB) and printed "700th"; they now print on the league's team scale.
"""
from pathlib import Path
import json
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
JS = (ROOT / "dashboard/public_game_detail.js").read_text(encoding="utf-8")


class TeamScaleTests(unittest.TestCase):
    def scale(self, *cases):
        body = JS.split("function teamScaled(", 1)[1].split("function teamScaledLabel", 1)[0]
        src = "function teamScaled(" + body + "\nconsole.log(JSON.stringify(" + json.dumps(cases) + \
            ".map(c => teamScaled(c[0], c[1], c[2]))));"
        out = subprocess.run(["node", "-e", src], text=True, capture_output=True, check=True)
        return json.loads(out.stdout)

    def test_a_pool_larger_than_the_league_prints_on_the_league_scale(self):
        first, last, mid, small, none = self.scale([1, 796, 365], [796, 796, 365], [535, 796, 365],
                                                   [112, 121, 138], [3, 1, 365])
        self.assertEqual(first, {"rank": 1, "of": 365, "pool": 796})
        self.assertEqual(last, {"rank": 365, "of": 365, "pool": 796})
        self.assertEqual(mid["rank"], 245)
        self.assertEqual(small, {"rank": 112, "of": 121, "pool": None}, "a smaller pool prints as it is")
        self.assertIsNone(none)

    def test_both_game_logs_use_it(self):
        self.assertIn("teamScaled(e.rank,e.of,teams)", JS)
        self.assertIn("cbbLogCell(g,c[0],teams)", JS)
        self.assertIn("teamScaled(entry.rank, entry.of, teams)", JS)


if __name__ == "__main__":
    unittest.main()
