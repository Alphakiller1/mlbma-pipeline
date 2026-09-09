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

    def test_public_matchups_group_by_kickoff_not_weekday_labels(self):
        src = (ROOT / "scripts" / "build_sport_routes.py").read_text(encoding="utf-8")
        blob = src.split("MATCHUPS_JS = r\"\"\"", 1)[1].split("\"\"\"", 1)[0]
        self.assertIn("kickoffGroup", blob)
        self.assertNotIn("Thursday", blob)
        self.assertNotIn("Sunday Night", blob)
        self.assertIn("matchup_compare.html?away=", blob)
        self.assertIn("Open this matchup in Model Center", blob)
        self.assertIn("Open Compare", blob)
        self.assertNotIn("Open scouting desk", blob)
        self.assertIn("ca-slate-card", blob)
        self.assertIn("ca-btn--primary", blob)
        self.assertNotIn("ca-btn-primary", blob)

    def test_map_game_copies_final_scores(self):
        js = (ROOT / "dashboard" / "sports" / "chase_board.js").read_text(encoding="utf-8")
        self.assertIn("function pickScore", js)
        self.assertIn("away_score: pickScore", js)
        self.assertIn("home_score: pickScore", js)
