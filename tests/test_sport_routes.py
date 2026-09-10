from __future__ import annotations

import subprocess
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


MAIN_RE = re.compile(r"<main[^>]*>(.*?)</main>", re.S | re.I)
SCRIPT_RE = re.compile(r"<script.*?</script>", re.S | re.I)


def visible_main(html: str) -> str:
    """The page's <main> region with scripts stripped - what a reader sees."""
    m = MAIN_RE.search(html)
    return SCRIPT_RE.sub("", m.group(1)) if m else ""


class SportRouteBuilderTests(unittest.TestCase):
    _GENERATED = tuple(
        ROOT / sport / name
        for sport in ("mlb", "nfl", "wnba", "cfb")
        for name in (("index.html", "matchups.html", "matchup.html") if sport in ("mlb", "nfl") else ("index.html", "matchups.html"))
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
            self.assertIn(f"sports/{sport}.js", text)
            self.assertNotIn("http-equiv=\"refresh\"", text)
            others = {"mlb", "nfl", "wnba", "cfb"} - {sport}
            for o in others:
                self.assertNotIn(f"sports/{o}.js", text)
            self.assertIn('class="ca-public-page__lede"', text)
            # The eyebrow was removed 2026-09-10: the nav wordmark, the active
            # sport tab and the H1 already said "Chase Analytics" and the sport,
            # so it was the fourth mention of both on one screen. The controls
            # host that replaced it is what the toolbar mounts into.
            self.assertNotIn(f">Chase Analytics · {sport.upper()}</p>", text)
            self.assertIn("data-desk-toolbar-host", text)
            self.assertIn(f">{sport.upper()} Matchups</h1>", text)
            self.assertIn("sports/chase_public_slate.js", text)
            self.assertIn("matchup_card.js", text)
            self.assertIn("styles/chase-public.css", text)
            self.assertNotIn("mlbma_design_system.css", text)
            self.assertNotIn("responsive.css", text)
            self.assertNotIn("sports/chase_board.js", text)

    def test_cfb_and_wnba_are_parked_off_the_public_desk(self):
        nav = (ROOT / "dashboard" / "chase_nav.html").read_text(encoding="utf-8")
        home = (ROOT / "index.html").read_text(encoding="utf-8")
        select = (ROOT / "dashboard" / "chase_sport_select.js").read_text(encoding="utf-8")
        # The switcher shows all four sports, per the reference chrome. WNBA
        # and CFB carry data-state="upcoming" so they read as not-yet-live, and
        # validate_public_fields.py still blocks promoting them inside page
        # CONTENT - appearing in the switcher is not a claim of published data.
        # Handoff section 10: WNBA and CFB stay in design documentation only.
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

    def test_every_sport_has_matchups(self):
        for sport in ("mlb", "nfl"):
            matchups = (ROOT / sport / "matchups.html").read_text(encoding="utf-8")
            self.assertIn("ChaseShell", matchups)
            self.assertIn("sport: sport", matchups)
            self.assertNotIn("sport: 'nfl'", matchups)

    def test_past_results_are_not_a_public_destination(self):
        """Completed games belong inside a matchup breakdown, nowhere else.

        The route, its generator branch and any link to it are all gone, so
        this asserts the absence three ways rather than trusting one.
        """
        for sport in ("mlb", "nfl", "wnba", "cfb"):
            self.assertFalse((ROOT / sport / "results.html").exists(),
                             f"{sport}/results.html is a public results destination")
        src = (ROOT / "scripts" / "build_sport_routes.py").read_text(encoding="utf-8")
        self.assertNotIn("results.html", src)
        self.assertNotIn("RESULTS_JS", src)
        for sport in ("mlb", "nfl"):
            for name in ("index.html", "matchups.html", "matchup.html"):
                page = (ROOT / sport / name).read_text(encoding="utf-8")
                self.assertNotIn("results.html", page, f"{sport}/{name} links a results route")

    def test_root_home_is_not_a_relative_redirect_stub(self):
        home = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn('data-mode="entry"', home)
        self.assertIn('id="matchupDesk"', home)
        self.assertIn('id="openingMlbSlate"', home)
        self.assertIn('id="openingNflSlate"', home)
        self.assertNotIn("location.replace('dashboard/", home)
        self.assertNotIn("http-equiv=\"refresh\"", home)

    def test_opening_no_longer_links_public_team_rankings(self):
        opening = (ROOT / "dashboard" / "index.html").read_text(encoding="utf-8")
        cards = (ROOT / "dashboard" / "platform_dashboard.js").read_text(encoding="utf-8")
        self.assertNotIn("href='team_rankings.html'", opening)
        self.assertNotIn('href="team_rankings.html"', opening)
        self.assertIn("window.location.replace('/'", opening)
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
        self.assertNotIn("RECORD_URL", text)
        self.assertNotIn("sports/mlb.js", text)
        self.assertNotIn("= None;", text)
        self.assertIn("ChaseMatchupCard.mount", text)

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
        mlb_home = (ROOT / "mlb" / "index.html").read_text(encoding="utf-8")
        self.assertIn("matchup_card.js", mlb_home)
        self.assertIn("chase_public_slate.js", mlb_home)
        self.assertIn("data/public/mlb/slate.json", (ROOT / "dashboard" / "sports" / "mlb.js").read_text(encoding="utf-8"))
        self.assertIn("ca-matchup-card", card)
        self.assertIn("Expand matchup", card)
        self.assertIn("Full matchup analysis", card)
        self.assertIn("ca-desk-toolbar", card)
        self.assertIn("var officialRequest", card)
        self.assertNotIn("Board overview", mlb_home)
        patterns = (ROOT / "dashboard" / "styles" / "chase-public.css").read_text(
            encoding="utf-8"
        )
        self.assertIn(".ca-matchup-card {", patterns)
        self.assertIn("background: var(--surface-panel);", patterns)
        self.assertIn(".ca-matchup-card__expand", patterns)
        self.assertIn(".ca-detail-page", patterns)

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

    def test_legacy_matchup_compare_redirects_to_public_detail(self):
        html = (ROOT / "dashboard" / "matchup_compare.html").read_text(encoding="utf-8")
        self.assertIn("location.replace('/mlb/matchup.html'", html)
        self.assertIn("'gamePk'", html)
        self.assertIn("'away'", html)
        self.assertNotIn("matchup_compare.js", html)
        self.assertNotIn("mlbma_design_system.css", html)


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
        self.assertIn("matchupFromLive", compare)
        self.assertIn("requestedGamePk", compare)
        self.assertIn("mc-overview-packet", compare)
        self.assertIn("usageBarsHtml", compare)
        self.assertIn("mcDeskBpAway", compare)
        self.assertIn('<h1 class="mc-header-matchup">', compare)
        overview = compare.split("function renderPaneOverview", 1)[1].split("function renderPaneSplits", 1)[0]
        packet = overview.split("mc-overview-packet", 1)[1]
        self.assertLess(packet.index("mcTeamRankings"), packet.index("lineups"))
        self.assertLess(packet.index("lineups"), packet.index("renderTeamCompareRadar"))
        lineups = compare.split("function renderPaneLvL", 1)[1].split("function renderPaneLvP", 1)[0]
        self.assertIn("MatchupLineupCompare.renderSection", lineups)
        self.assertNotIn('id="mcTeamRankings"', lineups)

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

    def test_opening_is_matchup_centered_and_legacy_dashboard_redirects(self):
        opening = (ROOT / "index.html").read_text(encoding="utf-8")
        legacy = (ROOT / "dashboard" / "index.html").read_text(encoding="utf-8")
        status = (ROOT / "dashboard" / "chase_datastatus.js").read_text(encoding="utf-8")
        nav = (ROOT / "dashboard" / "chase_nav.js").read_text(encoding="utf-8")
        shell = (ROOT / "dashboard" / "chase_shell.js").read_text(encoding="utf-8")
        self.assertEqual(opening.count("<h1"), 1)
        self.assertIn("Every game. The context that matters.", opening)
        self.assertIn('id="openingMlbSlate"', opening)
        self.assertIn('id="openingNflSlate"', opening)
        self.assertIn('id="matchupDesk"', opening)
        self.assertIn("styles/chase-public.css", opening)
        self.assertNotIn("mlbma_design_system.css", opening)
        self.assertNotIn("projected score", opening.lower())
        self.assertNotIn("win probability", opening.lower())
        self.assertIn("window.location.replace('/'", legacy)
        self.assertIn("#matchupDesk", legacy)
        self.assertIn("source === 'public-slate'", status)
        self.assertIn("function contextLabel", status)
        self.assertIn("aria-current", nav)
        self.assertIn("shellMain", shell)
        self.assertIn("id=\"caContextBar\"", opening)
        self.assertIn("matchup_card.js", opening)
        # 2026-09-10 owner decision: the reference top chrome carries a header
        # search, and it drives the same slate filter as the old toolbar field
        # (matchup_card.js binds #chaseNavSearch), so it is a real control
        # rather than the dead ornament the original rule guarded against.
        self.assertIn("chase-nav-search", opening)
        self.assertIn("chaseNavSearch", opening)
        self.assertNotIn("Search teams, players, or topics", opening)
        # chase_nav.html is the synced template, so it carries the search too -
        # scripts/apply_desk_shell.py writes the same block into every page.
        self.assertIn(
            "chase-nav-search",
            (ROOT / "dashboard" / "chase_nav.html").read_text(encoding="utf-8"),
        )
        diag = (ROOT / "scripts" / "dashboard_runtime_diag.py").read_text(encoding="utf-8")
        self.assertIn("openingMlbSlate", diag)

    def test_public_game_detail_script_is_design_stamped(self):
        stamp = (ROOT / "design" / "DESIGN_LAYER_VERSION").read_text(encoding="utf-8").strip()
        for sport in ("mlb", "nfl"):
            html = (ROOT / sport / "matchup.html").read_text(encoding="utf-8")
            self.assertIn("public_game_detail.js?v=" + stamp, html)
            self.assertNotIn("matchup_compare.js", html)
            self.assertIn("context: false", html)
        shell = (ROOT / "dashboard" / "chase_shell.js").read_text(encoding="utf-8")
        self.assertIn("opts.context !== false", shell)

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

    def test_public_home_and_team_profile_use_shared_last_updated_fetch(self):
        opening = (ROOT / "index.html").read_text(encoding="utf-8")
        profile = (ROOT / "dashboard" / "team_profile.html").read_text(encoding="utf-8")
        self.assertIn("chase_datastatus.js", opening)
        self.assertIn("chase_nav.js", opening)
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
        self.assertIn("public_site_runtime_diag.py", workflow)
        self.assertIn('base-url "http://127.0.0.1:8765/index.html"', workflow)
        self.assertNotIn("scope=team&team=NYY", workflow)
        self.assertNotIn("branches: [master]", workflow.split("pull_request:", 1)[1][:80])
        deploy_job = workflow.split("\n  deploy:", 1)[1][:400]
        self.assertIn("if: false", deploy_job)
        audit = (ROOT / "scripts" / "mobile_overflow_audit.py").read_text(encoding="utf-8")
        self.assertIn('"mlb/index.html"', audit)
        self.assertIn('"nfl/index.html"', audit)
        self.assertIn('"mlb/matchup.html?', audit)
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
        opening = (ROOT / "dashboard" / "index.html").read_text(encoding="utf-8")
        compare = (ROOT / "dashboard" / "matchup_compare.html").read_text(encoding="utf-8")
        self.assertIn("window.location.replace('/'", opening)
        self.assertIn("location.replace('/mlb/matchup.html'", compare)
        self.assertNotIn("mlbma_design_system.css", opening + compare)
        self.assertNotIn("matchup_compare.js", compare)
        redirects = (ROOT / "_redirects").read_text(encoding="utf-8")
        self.assertIn("/dashboard/chase_analytics_mlb_oem_v7.html  /  301", redirects)
        self.assertIn("/dashboard/matchup_sheet.html     /mlb/matchup.html  301", redirects)
        self.assertIn("/dashboard/matchup_compare        /mlb/matchup.html  301", redirects)
        root = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn('id="matchupDesk"', root)
        self.assertIn("styles/chase-public.css", root)
        self.assertNotIn("chase_sport_select.js", root)
        diag = (ROOT / "scripts" / "run_full_diagnostic.py").read_text(encoding="utf-8")
        self.assertIn("render/team_rankings.html", diag)
        self.assertNotIn("chase_analytics_mlb_oem_v7.html", diag)
        nav_src = (ROOT / "dashboard" / "chase_nav.html").read_text(encoding="utf-8")
        self.assertNotIn("chase-dropdown-menu", nav_src)
        self.assertNotIn(">Tools<", nav_src)
        self.assertIn('data-nav="nfl"', nav_src)
        self.assertIn('data-nav="models"', nav_src)
        self.assertNotIn("fonts.googleapis.com/css2", root)
        self.assertNotIn("@import url('responsive.css", (ROOT / "dashboard" / "mlbma_design_system.css").read_text(encoding="utf-8"))
        self.assertIn("var(--mark-positive)", (ROOT / "dashboard" / "mlbma_assets.js").read_text(encoding="utf-8"))
        cfg = (ROOT / "core" / "config.py").read_text(encoding="utf-8")
        self.assertIn('"file": "index.html"', cfg)
        self.assertNotIn("chase_analytics_mlb_oem_v7.html", cfg)
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
