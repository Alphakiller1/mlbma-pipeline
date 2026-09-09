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
        for sport in ("mlb", "nfl"):
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
            self.assertIn("sports/chase_public_slate.js", text)
            self.assertIn("matchup_card.js", text)
            self.assertNotIn("sports/chase_board.js", text)

    def test_cfb_and_wnba_are_parked_off_the_public_desk(self):
        nav = (ROOT / "dashboard" / "chase_nav.html").read_text(encoding="utf-8")
        home = (ROOT / "index.html").read_text(encoding="utf-8")
        select = (ROOT / "dashboard" / "chase_sport_select.js").read_text(encoding="utf-8")
        self.assertNotIn('data-nav="wnba"', nav)
        self.assertNotIn('data-nav="cfb"', nav)
        self.assertNotIn("/wnba/", nav)
        self.assertNotIn("/cfb/", nav)
        self.assertNotIn("CFB", home)
        self.assertNotIn("WNBA", home)
        self.assertNotIn("id: 'wnba'", select)
        self.assertNotIn("id: 'cfb'", select)
        for sport in ("wnba", "cfb"):
            text = (ROOT / sport / "index.html").read_text(encoding="utf-8")
            self.assertIn("noindex", text)
            self.assertIn("not on the public desk", text)
            self.assertNotIn(f"sports/{sport}.js", text)
            self.assertNotIn("ChaseSportSelect", text)

    def test_every_sport_has_matchups_and_results(self):
        for sport in ("mlb", "nfl"):
            matchups = (ROOT / sport / "matchups.html").read_text(encoding="utf-8")
            results = (ROOT / sport / "results.html").read_text(encoding="utf-8")
            self.assertIn("ChaseShell", matchups)
            self.assertIn("sport: sport", matchups)
            self.assertNotIn("sport: 'nfl'", matchups)
            self.assertNotIn("record.json", results)
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
        cards = (ROOT / "dashboard" / "platform_dashboard.js").read_text(encoding="utf-8")
        self.assertNotIn("href='team_rankings.html'", opening)
        self.assertNotIn('href="team_rankings.html"', opening)
        self.assertIn("matchup_compare.html", cards)

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
        self.assertIn("caContextBar", src)
        self.assertNotIn("section-research-lab", src)
        text = (ROOT / "nfl" / "matchups.html").read_text(encoding="utf-8")
        slate = (ROOT / "dashboard" / "sports" / "chase_public_slate.js").read_text(encoding="utf-8")
        self.assertNotIn("ca-nfl-channels", text)
        self.assertNotIn("edge_withheld_reason", text)
        self.assertNotIn("marginAxisHtml", text)
        self.assertNotIn("ChaseModelStatus", text)
        self.assertIn("kickoffWindow", slate)
        self.assertIn("matchup_card.js", text)
        self.assertIn("chase_public_slate.js", text)
        self.assertIn("hamburgerBtn", text)
        self.assertIn("ChaseShell", text)
        self.assertIn("chase_entity.js", text)
        self.assertNotIn("RECORD_URL", text)
        self.assertNotIn("sports/mlb.js", text)
        self.assertNotIn("= None;", text)
        self.assertIn("CHASE_SPORT_GEMS_LABEL = null", text)

    def test_public_nav_has_no_compare_item(self):
        nav = (ROOT / "dashboard" / "chase_nav.html").read_text(encoding="utf-8")
        opening = (ROOT / "dashboard" / "index.html").read_text(encoding="utf-8")
        js = (ROOT / "dashboard" / "chase_nav.js").read_text(encoding="utf-8")
        self.assertNotIn('data-nav="compare"', nav)
        self.assertNotIn(">Compare</a>", nav)
        self.assertNotIn('data-nav="compare"', opening)
        self.assertNotIn('ca-tool-card__title">Compare<', opening)
        self.assertIn("matchup_compare.html') return 'matchups'", js)

    def test_sport_home_is_the_matchup_card_slate(self):
        src = (ROOT / "scripts" / "build_sport_routes.py").read_text(encoding="utf-8")
        card = (ROOT / "dashboard" / "matchup_card.js").read_text(encoding="utf-8")
        self.assertIn("body_js = RESULTS_JS if results else MATCHUPS_JS", src)
        mlb_home = (ROOT / "mlb" / "index.html").read_text(encoding="utf-8")
        self.assertIn("matchup_card.js", mlb_home)
        self.assertIn("chase_public_slate.js", mlb_home)
        self.assertIn("data/public/mlb/slate.json", (ROOT / "dashboard" / "sports" / "mlb.js").read_text(encoding="utf-8"))
        self.assertIn("ca-matchup-card", card)
        self.assertIn("View matchup", card)
        self.assertIn("Expand matchup", card)
        self.assertNotIn("Board overview", mlb_home)
        patterns = (ROOT / "dashboard" / "styles" / "chase-patterns.css").read_text(
            encoding="utf-8"
        )
        self.assertIn(".ca-matchup-card {", patterns)
        self.assertIn("background: var(--surface-panel);", patterns)
        self.assertIn(".ca-slate-card[data-href] {", patterns)
        self.assertIn(".ca-team-abbr {", patterns)

    def test_generated_pages_do_not_emit_python_none(self):
        for path in self._GENERATED:
            text = path.read_text(encoding="utf-8")
            self.assertNotIn("= None;", text, path)
            if path.parent.name in ("mlb", "nfl"):
                self.assertIn("chase_shell.js", text, path)
            else:
                self.assertIn("noindex", text, path)

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
        self.assertNotIn("sports/chase_board.js", html)
        self.assertNotIn("board.json", html)
        self.assertIn("sports/chase_public_slate.js", html)
        self.assertNotIn("var(--text, #F4F4F7)", html)


class AdapterHoleTests(unittest.TestCase):
    def test_chase_board_helper_present(self):
        js = (ROOT / "dashboard" / "sports" / "chase_board.js").read_text(encoding="utf-8")
        self.assertIn("chase-board/1", js)
        self.assertIn("kickoff_utc", js)
        self.assertIn("edge_withheld_reason", js)
        self.assertIn("away_score", js)
        self.assertIn("function pickScore", js)
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
        self.assertIn("mc-header-ranks", compare)
        self.assertIn("paintHeaderRanks", view)
        self.assertIn("Team context", view)
        self.assertNotIn("family('status', 'Projection')", view)
        self.assertIn("lv-matchup-heading", view)
        self.assertIn('<h2 class="mc-pane-title">Lineup vs Lineup</h2>', compare)
        self.assertIn("label: 'Overview'", compare)
        self.assertIn("label: 'Starting Pitchers'", compare)
        self.assertIn("label: 'Offensive Splits'", compare)
        self.assertIn("label: 'Pitch Mix'", compare)
        self.assertIn("mc-model-cta", compare)
        self.assertIn("mc-desk", compare)
        self.assertIn("usageBarsHtml", compare)
        self.assertIn("mcDeskBpAway", compare)
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

    def test_opening_is_one_h1_and_does_not_claim_today_on_stale_slate(self):
        opening = (ROOT / "dashboard" / "index.html").read_text(encoding="utf-8")
        dash = (ROOT / "dashboard" / "platform_dashboard.js").read_text(encoding="utf-8")
        status = (ROOT / "dashboard" / "chase_datastatus.js").read_text(encoding="utf-8")
        nav = (ROOT / "dashboard" / "chase_nav.js").read_text(encoding="utf-8")
        shell = (ROOT / "dashboard" / "chase_shell.js").read_text(encoding="utf-8")
        self.assertEqual(opening.count("<h1 "), 1)
        self.assertIn("Opening Dashboard", opening)
        self.assertNotIn("research desk", opening.lower())
        self.assertNotIn("Need to Win", opening)
        self.assertNotIn("before the market adjusts", opening)
        self.assertNotIn("before you bet", opening)
        self.assertLess(opening.find('id="section-opening-hero"'), opening.find('id="account"'))
        self.assertLess(opening.find('id="section-opening-workflows"'), opening.find('id="account"'))
        self.assertIn("games on ' + shown + ' slate", dash)
        self.assertIn("sport !== 'mlb'", status)
        self.assertIn("function contextLabel", status)
        self.assertIn("aria-current", nav)
        self.assertIn("shellMain", shell)
        self.assertIn("id=\"caContextBar\"", opening)

    def test_no_formatclock_in_nav(self):
        nav = (ROOT / "dashboard" / "chase_nav.js").read_text(encoding="utf-8")
        self.assertNotIn("function formatClock", nav)
        self.assertIn("ChaseDataStatus", nav)
        self.assertIn("return 'matchups'", nav)
        self.assertNotIn("return 'team-rankings'", nav)
        self.assertIn(r"/\/nfl(\/|$)/.test(path)", nav)

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
        self.assertIn("Disallow: /wnba", robots)
        self.assertIn("Disallow: /cfb", robots)
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

    def test_public_surface_overlap_is_collapsed(self):
        lab = (ROOT / "dashboard" / "research_lab.js").read_text(encoding="utf-8")
        self.assertNotIn("href: 'team_rankings.html'", lab)
        self.assertIn("href: 'matchup_compare.html'", lab)
        opening = (ROOT / "dashboard" / "index.html").read_text(encoding="utf-8")
        self.assertIn("https://chase-analytics.com/dashboard/", opening)
        self.assertIn("/dashboard/assets/chase-logo-horizontal.png", opening)
        self.assertNotIn("https://chase-analytics.com/assets/", opening)
        oem = (ROOT / "dashboard" / "chase_analytics_mlb_oem_v7.html").read_text(encoding="utf-8")
        self.assertIn('location.replace(target)', oem)
        self.assertIn('"/dashboard/"', oem)
        self.assertNotIn("chase_nav.js", oem)
        sheet = (ROOT / "dashboard" / "matchup_sheet.html").read_text(encoding="utf-8")
        self.assertIn("/dashboard/matchup_compare", sheet)
        self.assertNotIn("chaseHeader", sheet)
        integrator = (ROOT / "scripts" / "integrate_chase_nav.py").read_text(encoding="utf-8")
        self.assertIn("prefixed_nav", integrator)
        self.assertNotIn('"matchup_sheet.html"', integrator)
        self.assertIn("NAV_JS_STAMP = STAMP", integrator)
        render = (ROOT / "dashboard" / "render" / "team_rankings.html").read_text(encoding="utf-8")
        self.assertNotIn("chase_analytics_mlb_oem_v7.html", render)
        self.assertNotIn('data-nav="team-rankings"', render)
        robots = (ROOT / "_redirects").read_text(encoding="utf-8")
        self.assertIn("/dashboard/chase_analytics_mlb_oem_v7.html  /dashboard/  301", robots)
        self.assertIn("/dashboard/matchup_sheet.html     /dashboard/matchup_compare  301", robots)
        root = (ROOT / "index.html").read_text(encoding="utf-8")
        stamp = (ROOT / "design" / "DESIGN_LAYER_VERSION").read_text(encoding="utf-8").strip()
        self.assertIn(f"chase_sport_select.js?v={stamp}", root)
        diag = (ROOT / "scripts" / "run_full_diagnostic.py").read_text(encoding="utf-8")
        self.assertIn("render/team_rankings.html", diag)
        self.assertNotIn("chase_analytics_mlb_oem_v7.html", diag)
        nav_src = (ROOT / "dashboard" / "chase_nav.html").read_text(encoding="utf-8")
        self.assertNotIn("chase-dropdown-menu", nav_src)
        self.assertNotIn(">Tools<", nav_src)
        self.assertIn('data-nav="nfl"', nav_src)
        self.assertIn('data-nav="models"', nav_src)
        self.assertNotIn("fonts.googleapis.com/css2", opening)
        self.assertNotIn("@import url('responsive.css", (ROOT / "dashboard" / "mlbma_design_system.css").read_text(encoding="utf-8"))
        self.assertIn("var(--mark-positive)", (ROOT / "dashboard" / "mlbma_assets.js").read_text(encoding="utf-8"))
        cfg = (ROOT / "core" / "config.py").read_text(encoding="utf-8")
        self.assertIn('"file": "index.html"', cfg)
        self.assertNotIn("chase_analytics_mlb_oem_v7.html", cfg)
        ui_diag = (ROOT / "scripts" / "platform_ui_diag.py").read_text(encoding="utf-8")
        self.assertIn("dashboard/index.html", ui_diag)
        self.assertNotIn("chase_analytics_mlb_oem_v7.html", ui_diag)
        audit = (ROOT / "scripts" / "mobile_overflow_audit.py").read_text(encoding="utf-8")
        self.assertNotIn("chase_analytics_mlb_oem_v7.html", audit)

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
