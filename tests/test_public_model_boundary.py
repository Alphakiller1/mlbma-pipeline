from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class PublicModelBoundaryTests(unittest.TestCase):
    def test_validator_passes(self):
        proc = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "validate_public_fields.py")],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)

    def test_osi_and_proj_osi_land_on_opposite_sides(self):
        """The pair that makes the boundary concrete.

        OSI is a constructed index over observed inputs, published with its
        weights. projOSI is the same shape of number applied to a game that has
        not happened. One word apart, opposite classes.
        """
        spec = json.loads((ROOT / "design" / "public_metric_classification.json")
                          .read_text(encoding="utf-8"))
        self.assertIn("osi", spec["derived_descriptive"])
        self.assertTrue(spec["classes"]["derived_descriptive"]["public"])
        self.assertIn("projOSI", spec["model_private"])
        self.assertFalse(spec["classes"]["model_private"]["public"])
        self.assertIn("ppGap", spec["model_private"])

    def test_model_center_stub_has_no_preview_values(self):
        html = (ROOT / "models" / "index.html").read_text(encoding="utf-8")
        self.assertIn("Model Center", html)
        self.assertIn("hamburgerBtn", html)
        self.assertIn("id=\"mobileMenu\"", html)
        self.assertNotIn("win probability", html.lower())
        self.assertNotIn("projOSI", html)
        self.assertNotIn("ca-nfl-channels", html)
        js = (ROOT / "dashboard" / "model_center.js").read_text(encoding="utf-8")
        self.assertIn("/api/model-center/board", js)
        self.assertNotIn("github.io", js)
        self.assertIn("offline", js)
        auth = (ROOT / "dashboard" / "mlbma_auth.js").read_text(encoding="utf-8")
        self.assertIn("/dashboard/vendor/supabase.min.js", auth)
        board_api = (ROOT / "functions" / "api" / "model-center" / "board.js").read_text(encoding="utf-8")
        self.assertIn("hasModelCenterAccess", board_api)
        self.assertNotIn("github.io", board_api)
        self.assertIn("hasModelCenterAccess", (ROOT / "functions" / "_shared" / "supabase.js").read_text(encoding="utf-8"))

    def test_research_lab_has_no_public_compare_tab(self):
        opening = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertNotIn("Research Lab", opening)
        self.assertNotIn(">Compare<", opening)
        self.assertIn('id="matchupDesk"', opening)
        lab = (ROOT / "dashboard" / "research_lab.js").read_text(encoding="utf-8")
        self.assertIn("var SUBTABS = ['trends', 'pitching']", lab)
        self.assertIn("Open Matchup Analysis", lab)
        self.assertNotIn("Three focused tools", lab)

    def test_public_matchups_group_by_kickoff_not_weekday_labels(self):
        src = (ROOT / "scripts" / "build_sport_routes.py").read_text(encoding="utf-8")
        blob = src.split("MATCHUPS_JS = r\"\"\"", 1)[1].split("\"\"\"", 1)[0]
        card = (ROOT / "dashboard" / "matchup_card.js").read_text(encoding="utf-8")
        slate = (ROOT / "dashboard" / "sports" / "chase_public_slate.js").read_text(encoding="utf-8")
        self.assertIn("kickoffWindow", slate)
        self.assertNotIn("Thursday", blob)
        self.assertNotIn("Sunday Night", blob)
        self.assertIn("/matchup.html?game=", card)
        self.assertIn("Expand Matchup", card)
        self.assertIn("Full Matchup Analysis", card)
        self.assertIn("ca-matchup-card", card)
        self.assertIn("aria-expanded", card)
        # 2026-09-10 owner decision, and what the matchup IA asks for: club
        # identity is the official crest plus the full team name. The club
        # colour survives only as a restrained rule on the block.
        self.assertIn("logoHtml(sport, abbr, supplied", card)
        self.assertIn("ca-matchup-card__name", card)
        self.assertIn("esc(name)", card)
        self.assertNotIn("teamTabHtml", card)
        self.assertNotIn("BOARD_URL", blob)

    def test_public_pages_never_fetch_the_private_context_artifacts(self):
        """A field that arrives unrendered has still been published.

        dashboard/team_rankings_snapshot.json carries a `status` family with
        projOSI and ppGap for all thirty clubs, and dashboard/league_baselines
        .json carries projosi, xwoba and xfip. Reading them carefully was not
        enough: serving them at all put those numbers on every visitor's
        machine. The public pages read projections instead.
        """
        for name in ("matchup_card.js", "mlbma_assets.js", "public_game_detail.js"):
            js = (ROOT / "dashboard" / name).read_text(encoding="utf-8")
            code = "\n".join(
                line for line in js.splitlines()
                if not line.lstrip().startswith(("//", "*", "/*")))
            self.assertNotIn("/dashboard/team_rankings_snapshot.json", code,
                             f"{name} fetches the private snapshot")
            self.assertNotIn("/dashboard/league_baselines.json", code,
                             f"{name} fetches the private baselines")

    def test_the_public_projections_carry_no_forecast(self):
        """The two the `status` family carries that are genuinely private.

        This test used to name five. xwOBA was classified descriptive_public in
        the first version of the classification, xFIP is the same class of
        number, and PALS describes the run of pitching a club has already
        faced - none of the three is a forecast, and withholding them was an
        error of mine that suppressed them site-wide. What must never appear is
        projOSI, which forecasts a game that has not happened, and PP-Gap.
        """
        for name in ("team_context.json", "league_baselines.json",
                     "batter_context.json", "pitch_type_board.json"):
            path = ROOT / "data" / "public" / name
            if not path.is_file():
                continue
            blob = path.read_text(encoding="utf-8")
            for key in ("projOSI", "projosi", "proj_osi", "ppGap", "PP_Gap",
                        "pp_gap", "win_probability", "projected_"):
                self.assertNotIn(key, blob, f"{name} publishes {key}")

    def test_ranks_are_recomputed_in_the_producer(self):
        """One ranking service, so the matchup page and the league board cannot
        disagree on a boundary team."""
        src = (ROOT / "scripts" / "publish_public_context.py").read_text(encoding="utf-8")
        # The `status` family IS read now - for its three descriptive rates. The
        # two forecasts inside it are excluded by name, which is the stronger
        # guarantee: a new key added to that family arrives and is classified,
        # rather than being silently dropped along with everything else.
        self.assertIn('FORECAST_KEYS = ("projOSI", "ppGap")', src)
        self.assertIn('if key in FORECAST_KEYS:', src)
        self.assertIn('"rank": index + 1', src)

    def test_batter_context_carries_the_split_the_lineup_is_read_against(self):
        """Section 3.3 is a lineup against the hand it faces, not a slash line."""
        path = ROOT / "data" / "public" / "batter_context.json"
        if not path.is_file():
            self.skipTest("batter context not published")
        data = json.loads(path.read_text(encoding="utf-8"))
        self.assertIn("vs_rhp", data["batters"])
        self.assertIn("vs_lhp", data["batters"])
        sample = next(iter(data["batters"]["vs_rhp"].values()))
        for metric in ("osi", "abq", "rcv", "obr"):
            self.assertIn(metric, sample)
        self.assertIn("bullpen", data)
        pen = next(iter(data["bullpen"].values()))
        # The leverage and inherited-runner rates the architecture asks for.
        for key in ("fip", "k_pct", "ir_scored_pct", "high_lev_era"):
            self.assertIn(key, pen)

    def test_starter_line_is_sourced_not_hydrated_on_schedule(self):
        """probablePitcher cannot be hydrated with stats on /schedule; the
        season line comes from a single bulk /people request instead."""
        js = (ROOT / "dashboard" / "matchup_card.js").read_text(encoding="utf-8")
        self.assertIn("/api/v1/people?personIds=", js)
        # The hydrate string itself must not attempt the nested form; the
        # explanatory comment naming it is fine.
        hydrates = [line for line in js.splitlines() if "&hydrate=" in line]
        self.assertTrue(hydrates)
        for line in hydrates:
            self.assertNotIn("probablePitcher(stats", line)

    def test_local_cloudflare_deploy_keeps_public_slates(self):
        src = (ROOT / "scripts" / "deploy_cloudflare.py").read_text(encoding="utf-8")
        yml = (ROOT / ".github" / "workflows" / "cloudflare-deploy.yml").read_text(encoding="utf-8")
        self.assertIn('rel.parts[1] != "public"', src)
        self.assertIn("data/public/{sport}/slate.json missing from the build", src)
        self.assertIn("test -f _site/data/public/mlb/slate.json", yml)

    def test_map_game_copies_final_scores(self):
        js = (ROOT / "dashboard" / "sports" / "chase_public_slate.js").read_text(encoding="utf-8")
        self.assertIn("function pickScore", js)
        self.assertIn("away_score: pickScore", js)
        self.assertIn("home_score: pickScore", js)
        self.assertNotIn("model_margin", js)
