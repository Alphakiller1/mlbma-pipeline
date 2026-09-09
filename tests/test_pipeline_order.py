from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class PipelineOrderTests(unittest.TestCase):
    def test_slate_publishes_before_statcast_mix(self) -> None:
        src = (ROOT / "pipeline" / "main.py").read_text(encoding="utf-8")
        self.assertLess(src.find("SCRIPTS_SLATE"), src.find("SCRIPTS_HEAVY"))
        run_fn = src.split("def run(", 1)[1]
        self.assertLess(run_fn.find("run_lineups()"), run_fn.find("SCRIPTS_HEAVY"))
        self.assertLess(run_fn.find("run_matchups()"), run_fn.find("SCRIPTS_HEAVY"))
        self.assertIn("scrapers.scrape_pitch_mix", src.split("SCRIPTS_HEAVY", 1)[1][:400])
        self.assertNotIn("scrapers.scrape_pitch_mix", src.split("SCRIPTS_OPTIONAL", 1)[1].split("SCRIPTS_HEAVY", 1)[0])

    def test_ci_workflow_keeps_reusable_statcast_cache(self) -> None:
        yml = (ROOT / ".github" / "workflows" / "run-pipeline.yml").read_text(encoding="utf-8")
        self.assertNotIn("${{ github.run_id }}", yml)
        self.assertIn("timeout-minutes: 90", yml)
        self.assertIn("python -u -m pipeline.main --skip-fangraphs", yml)
