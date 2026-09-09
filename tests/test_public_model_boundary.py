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
        opening = (ROOT / "dashboard" / "index.html").read_text(encoding="utf-8")
        tabs = opening.split('aria-label="Research Lab tabs"', 1)[1].split("</div>", 1)[0]
        self.assertNotIn("Compare", tabs)
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
        self.assertIn("matchup_compare.html?away=", card)
        self.assertIn("Open in Model Center", card)
        self.assertIn("Open Matchup Analysis", card)
        self.assertNotIn("Open Compare", blob)
        self.assertNotIn("Open scouting desk", blob)
        self.assertIn("ca-matchup-card", card)
        self.assertIn("ca-text-link--accent", card)
        self.assertNotIn("BOARD_URL", blob)

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
