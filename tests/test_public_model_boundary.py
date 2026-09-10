from __future__ import annotations

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

    def test_classification_lists_projos_i_as_private(self):
        text = (ROOT / "design" / "public_metric_classification.json").read_text(encoding="utf-8")
        self.assertIn('"projOSI"', text)
        self.assertIn('"OSI"', text)

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
        self.assertIn("Expand matchup", card)
        self.assertIn("Full matchup analysis", card)
        self.assertIn("ca-matchup-card", card)
        self.assertIn("aria-expanded", card)
        # 2026-09-09 owner decision: club identity on the slate is a
        # colour-coded abbreviation tab rather than a crest. The rule that
        # survives is that the abbreviation must never REPLACE the official full
        # name (style lock, design/GPT_IMAGE_PROMPTS_CHASE_DESK.md), so the tab
        # and the full name are rendered in the same block and the tab is
        # aria-hidden - assistive tech reads the full name only.
        self.assertIn("teamTabHtml", card)
        self.assertIn("ca-matchup-card__name", card)
        self.assertIn("esc(name)", card)
        self.assertNotIn("BOARD_URL", blob)

    def test_team_context_reads_only_descriptive_families(self):
        """The team-rankings snapshot has a `status` family carrying projOSI and
        ppGap, both model_private. The card enrichment must never read it."""
        js = (ROOT / "dashboard" / "matchup_card.js").read_text(encoding="utf-8")
        self.assertIn("PUBLIC_RANK_FAMILIES", js)
        families = js.split("PUBLIC_RANK_FAMILIES = ", 1)[1].split("]", 1)[0]
        self.assertIn("scoring", families)
        self.assertIn("difficulty", families)
        self.assertNotIn("status", families)
        # The private metric keys must not be read anywhere in the enrichment.
        self.assertNotIn("PUBLIC_RANK_METRICS.projOSI", js)
        self.assertNotIn("projOSI:", js)
        self.assertNotIn("ppGap:", js)
        # Ranks must be recomputed from the descriptive value, never taken from
        # a field that ranks something modelled.
        self.assertIn("rank: index + 1", js)

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
