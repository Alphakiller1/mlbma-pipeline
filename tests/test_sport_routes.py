from __future__ import annotations

import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class SportRouteBuilderTests(unittest.TestCase):
    _GENERATED = tuple(
        ROOT / sport / name
        for sport in ("mlb", "nfl", "wnba", "cfb")
        for name in ("index.html", "matchups.html", "results.html")
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
            if original is not None:
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

    def test_every_sport_has_matchups_and_results(self):
        for sport in ("mlb", "nfl", "wnba", "cfb"):
            matchups = (ROOT / sport / "matchups.html").read_text(encoding="utf-8")
            results = (ROOT / sport / "results.html").read_text(encoding="utf-8")
            self.assertIn("ChaseShell", matchups)
            self.assertIn("sport: sport", matchups)
            self.assertNotIn("sport: 'nfl'", matchups)
            self.assertIn("record.json", results)
            self.assertNotIn("RECORD_URL", results)
            self.assertIn('data-mode="evidence"', results)

    def test_root_home_is_not_a_relative_redirect_stub(self):
        home = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn('data-mode="entry"', home)
        self.assertIn("/dashboard/index.html", home)
        self.assertNotIn("location.replace('dashboard/", home)
        self.assertNotIn("http-equiv=\"refresh\"", home)

    def test_opening_no_longer_links_public_team_rankings(self):
        opening = (ROOT / "dashboard" / "index.html").read_text(encoding="utf-8")
        self.assertNotIn("href='team_rankings.html'", opening)
        self.assertNotIn('href="team_rankings.html"', opening)
        self.assertIn("matchup_compare.html", opening)

    def test_matchup_scopebar_is_two_control(self):
        view = (ROOT / "dashboard" / "lineup_view.js").read_text(encoding="utf-8")
        self.assertIn("renderMatchupScope", view)
        self.assertIn("matchupStatedContext", view)
        self.assertIn("ChaseScopeBar.render", view)

    def test_glossary_formulas_and_ramp(self):
        js = (ROOT / "dashboard" / "glossary.js").read_text(encoding="utf-8")
        self.assertIn("OSI = 0.43·RCV + 0.37·ABQ + 0.20·OBR", js)
        self.assertIn("PitchScore = 0.40·K% + 0.35·inv(BB%) + 0.25·inv(HR/9)", js)
        self.assertIn("gradeRampHtml", js)
        engine = (ROOT / "outputs" / "content_engine.py").read_text(encoding="utf-8")
        self.assertIn('"glossary_term"', engine)
        self.assertIn('"page": "glossary.html"', engine)

    def test_nav_integrator_does_not_restore_demoted_surfaces(self):
        src = (ROOT / "scripts" / "integrate_chase_nav.py").read_text(encoding="utf-8")
        self.assertNotIn("data-nav=\\\"team-rankings\\\"", src)
        self.assertNotIn("section-research-lab", src)
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
        self.assertIn("Team context", view)
        self.assertNotIn("family('status', 'Projection')", view)
        self.assertIn("lv-matchup-heading", view)
        self.assertIn('<h2 class="mc-pane-title">Lineup vs Lineup</h2>', compare)
        self.assertIn('<h1 class="mc-header-matchup">', compare)
        pane = compare.split("function renderPaneLvL", 1)[1].split("function renderPaneLvP", 1)[0]
        self.assertLess(pane.index("mcTeamRankings"), pane.index("MatchupLineupCompare"))
        self.assertLess(pane.index("MatchupLineupCompare"), pane.index("renderTeamCompareRadar"))

    def test_public_team_rankings_is_not_a_standalone_section(self):
        html = (ROOT / "dashboard" / "team_rankings.html").read_text(encoding="utf-8")
        nav = (ROOT / "dashboard" / "chase_nav.html").read_text(encoding="utf-8")
        lab = (ROOT / "dashboard" / "research_lab.js").read_text(encoding="utf-8")
        view = (ROOT / "dashboard" / "lineup_view.js").read_text(encoding="utf-8")
        render = (ROOT / "dashboard" / "render" / "team_rankings.html").read_text(encoding="utf-8")
        self.assertIn("index.html#section-matchups-hero", html)
        self.assertIn("__MLBMA_PUBLIC_RANKINGS_REDIRECT", html)
        self.assertNotIn('data-nav="team-rankings"', nav)
        self.assertNotIn("Team Rankings", nav)
        self.assertNotIn("href: 'team_rankings.html'", lab)
        self.assertNotIn('href: "team_rankings.html"', lab)
        self.assertIn("caSectionHeadHtml(icon || 'bar-chart-3', 'Team Rankings'", view)
        self.assertIn("title>Chase Analytics - Team Rankings v20260604", render)
        self.assertNotIn("__MLBMA_PUBLIC_RANKINGS_REDIRECT", render)
        self.assertNotIn("location.replace('index.html#section-matchups-hero')", render)

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

    def test_demoted_public_pages_are_noindex_and_smoke_uses_render(self):
        for name in (
            "team_rankings.html",
            "team_profile.html",
            "pitcher_profile.html",
            "bullpen_report.html",
            "reliever_profile.html",
        ):
            html = (ROOT / "dashboard" / name).read_text(encoding="utf-8")
            self.assertIn("noindex", html, name)
        robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
        self.assertIn("Disallow: /dashboard/team_rankings", robots)
        workflow = (ROOT / ".github" / "workflows" / "pages.yml").read_text(encoding="utf-8")
        self.assertIn("render/team_rankings.html", workflow)
        self.assertIn("dashboard/index.html", workflow)
        self.assertNotIn("scope=team&team=NYY", workflow)
        self.assertNotIn("branches: [master]", workflow.split("pull_request:", 1)[1][:80])
        deploy_job = workflow.split("\n  deploy:", 1)[1][:400]
        self.assertIn("if: false", deploy_job)
        audit = (ROOT / "scripts" / "mobile_overflow_audit.py").read_text(encoding="utf-8")
        self.assertIn("render/team_rankings.html", audit)
        self.assertNotIn("scope=team&team=NYY", audit)

    def test_brand_assets_resolve_from_dashboard_root(self):
        assets = (ROOT / "dashboard" / "mlbma_assets.js").read_text(encoding="utf-8")
        self.assertIn("DASHBOARD_ASSET_ROOT", assets)
        self.assertIn("brandAsset(", assets)
        self.assertNotIn("iconFilled: 'assets/chase-icon-filled.png'", assets)
        ui = (ROOT / "dashboard" / "mlbma_ui.js").read_text(encoding="utf-8")
        self.assertIn("/dashboard/assets/chase-icon-filled.png", ui)
        self.assertIn('querySelector(\'script[src*="mlbma_icons.js"]\')', ui)
        self.assertNotIn("s.src = 'mlbma_icons.js", ui)

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
