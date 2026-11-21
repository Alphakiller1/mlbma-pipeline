"""Matchup cards drop a game once it has ended (owner, 2026-11-21):
dashboard/matchup_card.js gameEnded() and the board it filters."""
import json
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SLATE = ROOT / "data" / "public" / "nfl" / "slate.json"

HARNESS = r"""
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const [root, slatePath] = process.argv.slice(1);
const noop = () => {};
const el = () => ({ innerHTML: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; },
  getAttribute(k) { return this.attrs[k] || null; }, addEventListener: noop, querySelector: () => null,
  querySelectorAll: () => [], dataset: {}, classList: { toggle: noop, add: noop, remove: noop },
  contains: () => false });
global.window = global;
global.document = { addEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
  getElementById: () => null, readyState: 'complete', title: '', createElement: el };
global.location = { search: '', hash: '', pathname: '/nfl/' };
global.history = { replaceState: noop };
global.addEventListener = noop;
global.matchMedia = () => ({ matches: false });
global.fetch = () => Promise.reject(new Error('offline'));
for (const f of ['dashboard/sports/public_sport_registry.js', 'dashboard/sports/chase_public_slate.js',
                 'dashboard/player_availability_shared.js', 'dashboard/matchup_card.js']) {
  vm.runInThisContext(fs.readFileSync(root + '/' + f, 'utf8'), { filename: f });
}
const C = ChaseMatchupCard, now = Date.now(), hour = 3600000;
const at = h => new Date(now + h * hour).toISOString();
// The rule.
assert.equal(C.gameEnded('nba', { game_state: 'final' }, now), true);
assert.equal(C.gameEnded('nba', { game_state: 'canceled' }, now), true);
assert.equal(C.gameEnded('nba', { game_state: 'live', kickoff_utc: at(-9) }, now), false);    // overtime, a long night
assert.equal(C.gameEnded('mlb', { game_state: 'delayed', kickoff_utc: at(-9) }, now), false); // rain delay
assert.equal(C.gameEnded('nba', { game_state: 'scheduled', kickoff_utc: at(-4) }, now), true); // feed silent, long over
assert.equal(C.gameEnded('nfl', { game_state: 'scheduled', kickoff_utc: at(-4) }, now), false); // still inside an NFL game
assert.equal(C.gameEnded('cfb', { game_state: 'scheduled', kickoff_utc: at(2) }, now), false);
assert.equal(C.gameEnded('cbb', { game_state: 'scheduled' }, now), false);                     // no time: never guessed over
// The board: real slate games, one over, one under way, one ahead.
const slate = JSON.parse(fs.readFileSync(slatePath, 'utf8'));
const games = ChasePublicSlate.normalize('nfl', slate).games.slice(0, 3);
Object.assign(games[0], { game_state: 'final', away_score: 20, home_score: 17, kickoff_utc: at(-3) });
Object.assign(games[1], { game_state: 'live', away_score: 7, home_score: 3, kickoff_utc: at(-1) });
Object.assign(games[2], { game_state: 'scheduled', kickoff_utc: at(3) });
function board(list) {
  const host = el();
  const adapter = { load: () => Promise.resolve({ games: list.map(g => Object.assign({}, g)),
    generatedAt: slate.generated_at_utc, source: 'Published slate' }) };
  return C.mount({ sport: 'cfb', adapter: adapter, host: host }).then(() => host);
}
board(games).then(host => {
  const ids = [...host.innerHTML.matchAll(/matchup\.html\?game=([^&"]+)/g)].map(m => decodeURIComponent(m[1]));
  const ended = list => list.every(g => !ids.includes(String(g.id)));
  return board(games.slice(0, 1)).then(empty => ({
    shown: [...new Set(ids)], ended: ended([games[0]]), kept: [games[1].id, games[2].id].map(String),
    count: (host.innerHTML.match(/(\d+) games<\/span>/) || [])[1],
    emptyState: empty.attrs['data-state'], emptyText: empty.innerHTML
  }));
}).then(out => {
  // A day-by-day desk whose games are all over opens on the next day, once.
  const asked = [];
  const adapter = { load: day => { asked.push(day); return Promise.resolve({ dateIso: day || '2026-11-20',
    games: [Object.assign({}, games[0], { sport: 'cbb' })] }); } };
  return C.mount({ sport: 'cbb', adapter: adapter, host: el() }).then(() => Object.assign(out, { asked: asked }));
}).then(out => process.stdout.write(JSON.stringify(out)))
  .catch(err => { process.stderr.write(String(err && err.stack || err)); process.exit(1); });
"""


@unittest.skipUnless(shutil.which("node") and SLATE.exists(), "requires Node and a published NFL slate")
class EndedGamesLeaveTheBoardTests(unittest.TestCase):
    def run_harness(self):
        done = subprocess.run([shutil.which("node"), "-e", HARNESS, str(ROOT), str(SLATE)],
                              capture_output=True, text=True, encoding="utf-8", timeout=60)
        self.assertEqual(done.returncode, 0, done.stderr[-2000:])
        return json.loads(done.stdout)

    def test_a_final_game_leaves_and_live_and_upcoming_games_stay(self):
        out = self.run_harness()
        self.assertTrue(out["ended"], out["shown"])
        for gid in out["kept"]:
            self.assertIn(gid, out["shown"])
        self.assertEqual(out["count"], "2")

    def test_a_date_desk_whose_day_is_over_opens_on_the_next_day(self):
        self.assertEqual(self.run_harness()["asked"], [None, "2026-11-21"])

    def test_a_board_whose_games_have_all_ended_says_so(self):
        out = self.run_harness()
        self.assertEqual(out["emptyState"], "empty")
        self.assertIn("Every game on this slate has finished", out["emptyText"])
        self.assertIn('data-empty="ended"', out["emptyText"])


if __name__ == "__main__":
    unittest.main()
