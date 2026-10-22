"""The NBA desk: routes, adapter, publisher, and both renderers on the real slate."""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import publish_public_nba_slate as pub  # noqa: E402

SLATE = ROOT / "data" / "public" / "nba" / "slate.json"
BANNED = ("model projection", "projected score", "projected points", "win probability", "model edge",
          "betting edge", "recommended pick", "model vs. market")


def _slate(**over):
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    base = {"schema": "chase-public-slate/1", "sport": "nba", "slate_date": "2026-10-21",
            "generated_at_utc": now, "games": [
                {"id": "401", "away": "IND", "home": "NO", "game_state": "scheduled"},
                {"id": "402", "away": "GS", "home": "LAL", "game_state": "scheduled"}]}
    base.update(over)
    return base


class NbaRouteTests(unittest.TestCase):
    def test_routes_load_only_the_nba_adapter(self):
        for name in ("index.html", "matchups.html", "matchup.html"):
            html = (ROOT / "nba" / name).read_text(encoding="utf-8")
            self.assertIn("/dashboard/sports/nba.js", html)
            self.assertIn("window.CHASE_SPORT_PAGE = ChaseSportNBA", html.replace("    ", ""))
            for other in ("sports/cfb.js", "sports/nfl.js", "sports/mlb.js", "chase_board.js"):
                self.assertNotIn(other, html)
            self.assertIn('data-nav="nba"', html)

    def test_nav_carries_nba_everywhere_cfb_is(self):
        for path in ("dashboard/chase_nav.html", "index.html", "nfl/index.html", "mlb/index.html"):
            html = (ROOT / path).read_text(encoding="utf-8")
            self.assertIn('<a href="/nba/" class="chase-sport-tab" data-nav="nba"', html, path)
        js = (ROOT / "dashboard" / "chase_nav.js").read_text(encoding="utf-8")
        self.assertIn("(mlb|nfl|wnba|cfb|nba)", js)

    def test_adapter_reads_only_the_published_slate(self):
        js = (ROOT / "dashboard" / "sports" / "nba.js").read_text(encoding="utf-8")
        self.assertIn("var SLATE_URL = '/data/public/nba/slate.json';", js)
        self.assertNotIn("github.io", js)
        self.assertNotIn("board.json", js)
        registry = (ROOT / "dashboard" / "sports" / "public_sport_registry.js").read_text(encoding="utf-8")
        self.assertIn("{ id: 'nba', enabled: true, href: '/nba/'", registry)

    def test_model_center_and_proxy_know_nba(self):
        proxy = (ROOT / "functions" / "api" / "model-center" / "board.js").read_text(encoding="utf-8")
        self.assertIn("nba: ['NBA_MODEL_BOARD_URL', 'https://alphakiller1.github.io/nba-model/board.json']", proxy)
        mc = (ROOT / "dashboard" / "model_center.js").read_text(encoding="utf-8")
        self.assertIn("['nba', 'NBA']", mc)
        self.assertIn("['mlb', 'nfl', 'nba', 'wnba', 'cfb']", mc)
        # NBA player props render in Model Center beside NFL and CFB, keyed by event id.
        mc = (ROOT / "dashboard" / "model_center.js").read_text(encoding="utf-8")
        self.assertIn("['points', 'Pts', 45, 'untoned']", mc)
        self.assertIn("if (sport === 'nba') return p.game_id == null ? null : String(p.game_id);", mc)
        status = (ROOT / "dashboard" / "chase_datastatus.js").read_text(encoding="utf-8")
        self.assertIn("nba: '/data/public/nba/slate.json'", status)

    def test_publish_workflow_validates_before_committing(self):
        wf = (ROOT / ".github" / "workflows" / "publish-nba-slate.yml").read_text(encoding="utf-8")
        self.assertIn("python scripts/publish_public_nba_slate.py", wf)
        self.assertLess(wf.index("validate_public_fields.py"), wf.index("git commit"))


class NbaPublisherTests(unittest.TestCase):
    def test_accepts_a_clean_current_slate(self):
        self.assertEqual(pub.validate(_slate(), datetime.now(timezone.utc)), [])

    def test_refuses_model_fields_anywhere(self):
        bad = _slate()
        bad["games"][0]["away_form"] = {"rates": {"x": {"value": 1}}, "win_probability": 0.6}
        problems = pub.validate(bad, datetime.now(timezone.utc))
        self.assertTrue(any("win_probability" in p for p in problems), problems)

    def test_refuses_a_stale_or_foreign_source(self):
        old = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
        self.assertTrue(pub.validate(_slate(generated_at_utc=old), datetime.now(timezone.utc)))
        self.assertTrue(pub.validate(_slate(sport="wnba"), datetime.now(timezone.utc)))
        unknown = _slate()
        unknown["games"][0]["away"] = "SEA"
        self.assertTrue(pub.validate(unknown, datetime.now(timezone.utc)))

    def test_live_state_updates_score_only_for_the_same_pairing(self):
        slate = _slate()
        live = {"401": {"game_state": "final", "status_detail": "Final", "away_code": "IND", "home_code": "NO",
                        "away_score": 118, "home_score": 109, "away_record": "1-0", "home_record": "0-1"},
                "402": {"game_state": "final", "away_code": "LAC", "home_code": "LAL", "away_score": 1,
                        "home_score": 2}}
        with mock.patch.object(pub, "live_state", return_value=live):
            out = pub.merge_live(slate)
        self.assertEqual((out["games"][0]["away_score"], out["games"][0]["game_state"]), (118, "final"))
        self.assertEqual(out["games"][0]["away_record"], "1-0")
        self.assertNotIn("away_score", out["games"][1])  # ESPN named a different pairing


@unittest.skipUnless(SLATE.exists(), "no published NBA slate")
class PublishedNbaSlateTests(unittest.TestCase):
    def test_published_slate_is_public_only(self):
        slate = json.loads(SLATE.read_text(encoding="utf-8"))
        self.assertEqual(slate["sport"], "nba")
        self.assertEqual(pub.leaked(slate, pub.restricted_keys()), set())
        for g in slate["games"]:
            self.assertIn(g["away"], pub.TEAMS)
            self.assertIn(g["home"], pub.TEAMS)


HARNESS = r"""
const fs = require('fs'), vm = require('vm');
const [root, slatePath] = process.argv.slice(2);
const noop = () => {};
const el = () => ({ innerHTML: '', setAttribute: noop, getAttribute: () => null, addEventListener: noop,
  querySelector: () => null, querySelectorAll: () => [], dataset: {}, classList: { toggle: noop, add: noop,
  remove: noop }, contains: () => false });
global.window = global;
global.document = { addEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
  getElementById: () => null, readyState: 'complete', title: '', createElement: el };
global.location = { search: '', hash: '', pathname: '/nba/matchup.html' };
global.history = { replaceState: noop };
global.addEventListener = noop;
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = noop;
global.matchMedia = () => ({ matches: false });
global.setTimeout = noop;
for (const f of ['dashboard/sports/public_sport_registry.js', 'dashboard/sports/chase_public_slate.js',
                 'dashboard/matchup_card.js', 'dashboard/sports/nba.js', 'dashboard/public_game_detail.js']) {
  vm.runInThisContext(fs.readFileSync(root + '/' + f, 'utf8'), { filename: f });
}
const slate = JSON.parse(fs.readFileSync(slatePath, 'utf8'));
const games = slate.games.map(g => ChaseSportNBA.mapGame(g, slate));
const cards = games.map(g => ChaseMatchupCard.cardHtml('nba', g));
const host = el();
location.search = '?game=' + encodeURIComponent(games[0].id);
ChaseMatchupCard.loadGames = () => Promise.resolve({ games: games, generatedAt: slate.generated_at_utc,
  dataThrough: slate.data_through_utc, source: 'Published slate' });
ChasePublicGameDetail.mount({ sport: 'nba', adapter: ChaseSportNBA, host: host }).then(game => {
  process.stdout.write(JSON.stringify({ cards: cards, detail: host.innerHTML, game: games[0],
    title: document.title }));
}).catch(err => { process.stderr.write(String(err && err.stack || err)); process.exit(1); });
"""


def _node():
    return shutil.which("node")


@unittest.skipIf(_node() is None or not SLATE.exists(), "node or the NBA slate is unavailable")
class NbaRenderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        harness = ROOT / "tests" / "_nba_harness.js"
        harness.write_text(HARNESS, encoding="utf-8")
        try:
            result = subprocess.run([_node(), str(harness), str(ROOT), str(SLATE)],
                                    capture_output=True, text=True, timeout=60, encoding="utf-8")
        finally:
            harness.unlink(missing_ok=True)
        if result.returncode:
            raise AssertionError(f"harness failed: {result.stderr}")
        cls.out = json.loads(result.stdout)

    def test_every_game_renders_a_card_with_both_clubs(self):
        slate = json.loads(SLATE.read_text(encoding="utf-8"))
        self.assertEqual(len(self.out["cards"]), len(slate["games"]))
        for card, g in zip(self.out["cards"], sorted(slate["games"], key=lambda x: (x["kickoff_utc"], x["id"]))):
            self.assertIn(g["away_name"], card)
            self.assertIn(g["home_name"], card)
            self.assertIn("Leading Scorers", card)
            self.assertIn("/nba/matchup.html?game=", card)

    def test_cards_and_detail_state_facts_only(self):
        text = (" ".join(self.out["cards"]) + self.out["detail"]).lower()
        for phrase in BANNED:
            self.assertNotIn(phrase, text)

    def test_detail_renders_the_nba_desk(self):
        html = self.out["detail"]
        for tab in ("data-nfl-tab=\"units\"", "data-nfl-tab=\"shots\"", "data-nfl-tab=\"rotation\"",
                    "data-nfl-tab=\"availability\"", "data-nfl-tab=\"games\"", "data-nfl-tab=\"context\""):
            self.assertIn(tab, html)
        for sec in ("nba-ratings", "nba-efficiency", "nba-shooting", "nba-rotation", "nba-availability",
                    "nba-game-log", "team-context", "nba-shot-chart", "nba-shot-kinds", "nba-play-types",
                    "nba-defenders", "nba-size", "nba-tracking", "nba-style", "nba-regression",
                    "nba-shooter-regression", "nba-player-types", "nba-player-zones", "nba-player-bio",
                    "nba-schedule"):
            self.assertIn('id="' + sec + '"', html)
        for tab in ("shots", "playtypes", "defense", "athletic", "style", "regression", "players"):
            self.assertIn('data-nfl-tab="' + tab + '"', html)

    def test_depth_sections_render_published_figures(self):
        html = self.out["detail"]
        g = self.out["game"]
        self.assertIn("ca-court-zone", html)                        # shot chart drawn
        self.assertIn("P&amp;R Ball Handler", html)                 # play-type ledger
        self.assertIn("As Closest Defender", html)                  # defender dashboard
        self.assertIn("Regression Watch", html)
        coach = ((g.get("away_profile") or {}).get("coach") or {}).get("head_coach")
        if coach:
            self.assertIn(coach, html)
        self.assertNotIn("NaN", html)
        self.assertNotIn("undefined", html)

    def test_coach_and_scheme_render(self):
        html = self.out["detail"]
        self.assertIn('id="nba-scheme"', html)
        self.assertIn("ca-coach-hero", html)
        self.assertRegex(html, r"(First Season|Season \d+) With The ")
        self.assertIn("Coaching Fingerprint", html)
        self.assertIn("ca-pctl__fill", html)
        self.assertIn("The Figures Behind It", html)

    def test_illustrations_render_and_lead_the_desk(self):
        html = self.out["detail"]
        for sec in ("nba-edge-map", "nba-fingerprint", "nba-tape", "nba-aging", "nba-shot-maps", "nba-onfloor"):
            self.assertIn('id="' + sec + '"', html)
        first = html.index('class="ca-detail-section" id="')
        self.assertTrue(html[first:].startswith('class="ca-detail-section" id="nba-edge-map"'))
        self.assertIn("ca-edge-row", html)        # dumbbell rows
        self.assertIn("ca-fly__bar", html)        # mirrored bars
        self.assertIn("ca-aging__curve", html)    # league age curve
        self.assertIn("ca-dist-seg", html)
        self.assertGreater(html.count('data-tip="'), 50)  # every mark explains itself
        g = self.out["game"]
        self.assertRegex(html, r"<h3>[^<]+ Offense vs [^<]+ Defense</h3>")
        self.assertIn("eFG%", html)
        self.assertIn("Ranked Of 30 Clubs", html)
        self.assertIn("ca-cfb-ledger-table", html)
        self.assertIn(g["away_name"] + " at " + g["home_name"], self.out["title"])

    def test_early_season_reads_last_season_and_says_so(self):
        g = self.out["game"]
        if g["away_season_games"] < 5:
            self.assertIn("Season", g["away_rates_basis"])
            self.assertTrue(g["away_rates"], "no rates on the early-season fallback")
            self.assertFalse(g["away_rates_current"])


if __name__ == "__main__":
    unittest.main()
