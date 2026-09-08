from __future__ import annotations

import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class SportRouteBuilderTests(unittest.TestCase):
    _GENERATED = (
        ROOT / "mlb" / "index.html",
        ROOT / "nfl" / "index.html",
        ROOT / "wnba" / "index.html",
        ROOT / "cfb" / "index.html",
        ROOT / "nfl" / "matchups.html",
    )

    @classmethod
    def setUpClass(cls):
        cls._snapshots = {
            path: path.read_bytes() if path.is_file() else None for path in cls._GENERATED
        }
        subprocess.check_call(["python3", str(ROOT / "scripts" / "build_sport_routes.py")], cwd=ROOT)

    @classmethod
    def tearDownClass(cls):
        for path, original in cls._snapshots.items():
            if original is None:
                if path.exists():
                    path.unlink()
            else:
                path.write_bytes(original)

    def test_four_indexes_and_nfl_matchups(self):
        for sport in ("mlb", "nfl", "wnba", "cfb"):
            path = ROOT / sport / "index.html"
            self.assertTrue(path.is_file(), path)
            text = path.read_text(encoding="utf-8")
            self.assertIn("hamburgerBtn", text)
            self.assertIn("ChaseSportSelect", text)
            self.assertIn(f"sports/{sport}.js", text)
            self.assertNotIn("http-equiv=\"refresh\"", text)
            others = {"mlb", "nfl", "wnba", "cfb"} - {sport}
            for o in others:
                self.assertNotIn(f"sports/{o}.js", text)
            self.assertIn("sports/chase_board.js", text)

    def test_nfl_matchups_pilot_b_copy(self):
        text = (ROOT / "nfl" / "matchups.html").read_text(encoding="utf-8")
        self.assertIn("not Picks", text)
        self.assertIn("ca-nfl-channels", text)
        self.assertIn("edge_withheld_reason", text)
        self.assertIn("hamburgerBtn", text)
        self.assertIn("ChaseModelStatus", text)
        self.assertIn("ChaseShell", text)
        self.assertIn("ChaseEntity", text)
        self.assertIn("marginAxisHtml", text)
        self.assertNotIn("RECORD_URL", text)
        self.assertNotIn("sports/mlb.js", text)
        self.assertNotIn("= None;", text)
        self.assertIn("CHASE_SPORT_GEMS_LABEL = null", text)

    def test_generated_pages_do_not_emit_python_none(self):
        for path in self._GENERATED:
            text = path.read_text(encoding="utf-8")
            self.assertNotIn("= None;", text, path)
            self.assertIn("chase_shell.js", text)

    def test_scope_bar_omits_defaults(self):
        js = (ROOT / "dashboard" / "chase_scope.js").read_text(encoding="utf-8")
        self.assertIn("function omitDefaults", js)
        self.assertIn("function searchFrom", js)
        view = (ROOT / "dashboard" / "lineup_view.js").read_text(encoding="utf-8")
        self.assertIn("ChaseScopeBar.omitDefaults", view)
        self.assertIn("scope-reset", view)

    def test_entity_escapes_name(self):
        js = (ROOT / "dashboard" / "chase_entity.js").read_text(encoding="utf-8")
        self.assertIn("replace(/</g, '&lt;')", js)
        self.assertIn("ca-entity-fallback", js)

    def test_matchup_compare_declares_evidence_mode(self):
        html = (ROOT / "dashboard" / "matchup_compare.html").read_text(encoding="utf-8")
        self.assertIn('data-mode="evidence"', html)
        self.assertIn("chase_scope.js", html)
        self.assertIn("sports/chase_board.js", html)
        self.assertNotIn("var(--text, #F4F4F7)", html)


class AdapterHoleTests(unittest.TestCase):
    def test_chase_board_helper_present(self):
        js = (ROOT / "dashboard" / "sports" / "chase_board.js").read_text(encoding="utf-8")
        self.assertIn("chase-board/1", js)
        self.assertIn("kickoff_utc", js)
        self.assertIn("edge_withheld_reason", js)
        self.assertIn("market_gap", js)
        self.assertIn("sport === 'mlb' ? 2.5 : 6", js)

    def test_public_adapters_do_not_fetch_performance_ledgers(self):
        for sport in ("mlb", "nfl", "wnba", "cfb"):
            js = (ROOT / "dashboard" / "sports" / f"{sport}.js").read_text(encoding="utf-8")
            self.assertNotIn("RECORD_URL", js)

    def test_mlb_matchup_uses_lineup_model_ranker(self):
        adapter = (ROOT / "dashboard" / "sports" / "mlb.js").read_text(encoding="utf-8")
        view = (ROOT / "dashboard" / "lineup_view.js").read_text(encoding="utf-8")
        compare = (ROOT / "dashboard" / "matchup_compare.js").read_text(encoding="utf-8")
        self.assertIn("mountMatchupRankings", adapter)
        self.assertIn("LM.rankAll(matchupFilter", view)
        self.assertIn("mcTeamRankings", compare)

    def test_no_formatclock_in_nav(self):
        nav = (ROOT / "dashboard" / "chase_nav.js").read_text(encoding="utf-8")
        self.assertNotIn("function formatClock", nav)
        self.assertIn("ChaseDataStatus", nav)

    def test_mlbma_ui_footer_uses_datastatus(self):
        ui = (ROOT / "dashboard" / "mlbma_ui.js").read_text(encoding="utf-8")
        self.assertIn("ChaseDataStatus.fetchLastUpdated", ui)
        self.assertNotIn("Last Updated", ui)

    def test_opening_and_team_profile_use_shared_last_updated_fetch(self):
        opening = (ROOT / "dashboard" / "index.html").read_text(encoding="utf-8")
        profile = (ROOT / "dashboard" / "team_profile.html").read_text(encoding="utf-8")
        self.assertIn("ChaseDataStatus.fetchLastUpdated", opening)
        self.assertIn("function prefetchSheetSync", opening)
        self.assertNotIn("encodeURIComponent(TABS.last_updated)", opening)
        self.assertIn("ChaseDataStatus.fetchLastUpdated", profile)
        self.assertNotIn("gvizUrl('Last_Updated')", profile)

    def test_starters_rankings_registry_uses_render_route(self):
        engine = (ROOT / "outputs" / "content_engine.py").read_text(encoding="utf-8")
        self.assertIn('"page": "render/pitcher_intelligence.html"', engine)
        starters = engine.split('"starters_rankings":', 1)[1].split('"trends_heatmap":', 1)[0]
        self.assertNotIn('"page": "index.html"', starters)

    def test_slate_age_is_separate_from_publication_age(self):
        status = (ROOT / "dashboard" / "chase_datastatus.js").read_text(encoding="utf-8")
        self.assertIn("parseNewestSlateDateCsv", status)
        self.assertIn("Slate shown:", status)
        self.assertIn("slateAgeDays", status)
        self.assertIn("Retry slate", status)


class CaptureGuardTests(unittest.TestCase):
    def test_shared_relaxes_on_hubdebug(self):
        js = (ROOT / "dashboard" / "matchup_shared.js").read_text(encoding="utf-8")
        self.assertIn("function captureSlateRelax", js)
        self.assertIn("hubdebug", js)
        self.assertIn("127.0.0.1", js)
