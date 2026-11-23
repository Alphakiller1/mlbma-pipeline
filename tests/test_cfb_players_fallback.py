"""CFB pass catchers and defenders, and the desk without the model board
(2026-11-18 audit)."""
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import cfb_depth  # noqa: E402


class RankedPlayersTests(unittest.TestCase):
    def setUp(self):
        self.saved = cfb_depth._player_lines_cached
        lines = {
            "defensive": {("osu", "1"): {"player": "A", "position": "LB", "TOT": 60, "SACKS": 5, "TFL": 9, "PD": 2},
                          ("osu", "2"): {"player": "B", "position": "S", "TOT": 50, "SACKS": 0, "TFL": 0, "PD": 6},
                          ("neb", "3"): {"player": "C", "position": "LB", "TOT": 40, "SACKS": 1, "TFL": 3, "PD": 0}},
            "interceptions": {("osu", "2"): {"INT": 3}},
            "receiving": {("osu", "4"): {"player": "D", "position": "WR", "REC": 80, "YDS": 1300, "TD": 15, "LONG": 72},
                          ("neb", "5"): {"player": "E", "position": "WR", "REC": 20, "YDS": 200, "TD": 0, "LONG": 30}},
        }
        cfb_depth._player_lines_cached = lambda season, category: lines[category]

    def tearDown(self):
        cfb_depth._player_lines_cached = self.saved

    def test_defenders_rank_real_figures_and_leave_zeros_unranked(self):
        out = cfb_depth.defenders(2026, {"osu", "neb"})
        a, b = out["osu"]
        self.assertEqual((a["player_name"], a["sacks"]["rank"]), ("A", 1))
        self.assertEqual(b["interceptions"]["value"], 3)
        self.assertNotIn("rank", b["sacks"])           # zero sacks: printed, not placed
        self.assertNotIn("rank", out["neb"][0]["passes_defended"])

    def test_receivers_sort_by_yards(self):
        out = cfb_depth.receivers(2026, {"osu", "neb"})
        self.assertEqual(out["osu"][0]["yards"]["rank"], 1)
        self.assertEqual(out["osu"][0]["catches"], 80)
        self.assertNotIn("rank", out["neb"][0]["touchdowns"])


class BoardFallbackTests(unittest.TestCase):
    def test_cards_come_from_the_public_slate_when_the_board_fails(self):
        js = (ROOT / "dashboard" / "sports" / "cfb.js").read_text(encoding="utf-8")
        self.assertIn("loadJson(BOARD_URL).catch(function () { return null; })", js)
        self.assertIn("function boardFromPublic(slate)", js)
        self.assertIn("boardFromPublic(parts[2])", js)
        status = (ROOT / "dashboard" / "chase_datastatus.js").read_text(encoding="utf-8")
        self.assertIn("cfb: '/data/public/cfb/slate.json'", status)

    @unittest.skipUnless(shutil.which("node"), "requires Node")
    def test_new_week_cards_precede_the_model_and_pick_up_current_projections(self):
        program = r"""
const assert = require('node:assert/strict');
global.window = global;
require('./dashboard/sports/cfb.js');
const season = new Date().getUTCFullYear();
const staleKick = season + '-11-21T20:30:00Z';
const nextKick = season + '-11-28T20:30:00Z';
const old = { season, week: 12, games: [
  { id: 'A@B', away_name: 'Away', home_name: 'Home', kickoff_utc: staleKick,
    game_state: 'final', away_score: 17, home_score: 14 }
] };
const publicWeek = { season, week: 13, games: [
  { id: 'A@B', away: 'A', home: 'B', away_name: 'Away', home_name: 'Home', kickoff_utc: nextKick,
    game_state: 'scheduled', away_form: { source: 'espn', season } }
] };
let model = { season, week: 12, games: [
  { key: 'A@B', away: { school: 'Away' }, home: { school: 'Home' }, kickoff: staleKick, projected_total: 36 }
] };
global.fetch = async url => ({ ok: true, json: async () =>
  url === ChaseSportCFB.BOARD_URL ? model :
  url === ChaseSportCFB.SLATE_URL ? old :
  url === '/data/public/cfb/slate.json' ? publicWeek : {}
});
(async () => {
  let result = await ChaseSportCFB.load();
  assert.equal(result.meta.week, 13);
  assert.equal(result.games[0].kickoff_utc, nextKick);
  assert.equal(result.games[0].game_state, 'scheduled');
  assert.equal(result.games[0].away_score, undefined);
  assert.equal(result.games[0].proj_total, null);
  assert.equal(result.games[0].away_form.source, 'espn');
  model = { ...model, week: 13, games: [
    { ...model.games[0], kickoff: nextKick, projected_total: 53 }
  ] };
  result = await ChaseSportCFB.load();
  assert.equal(result.games[0].proj_total, 53);
  assert.equal(result.games[0].game_state, 'scheduled');
})().catch(error => { console.error(error); process.exitCode = 1; });
"""
        subprocess.run(["node", "-e", program], cwd=ROOT, check=True, timeout=20)


if __name__ == "__main__":
    unittest.main()
