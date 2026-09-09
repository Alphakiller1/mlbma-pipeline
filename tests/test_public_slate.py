from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class PublicSlateProjectionTests(unittest.TestCase):
    def test_leak_fixture_is_rejected_until_projected(self):
        import sys
        sys.path.insert(0, str(ROOT / "scripts"))
        from project_public_slate import assert_clean, project_slate

        leak = json.loads((ROOT / "tests" / "fixtures" / "restricted_board_leak.json").read_text(encoding="utf-8"))
        with self.assertRaises(SystemExit):
            assert_clean(leak)
        out = project_slate("mlb", leak)
        assert_clean(out)
        blob = json.dumps(out)
        self.assertNotIn("model_margin", blob)
        self.assertNotIn("player_projections", blob)
        self.assertEqual(out["games"][0]["id"], "leak-game")
        self.assertEqual(out["games"][0]["venue"], "Test Park")

    def test_committed_public_slates_are_allowlisted(self):
        import sys
        sys.path.insert(0, str(ROOT / "scripts"))
        from project_public_slate import assert_clean

        for sport in ("mlb", "nfl"):
            slate = json.loads((ROOT / "data" / "public" / sport / "slate.json").read_text(encoding="utf-8"))
            assert_clean(slate)
            self.assertEqual(slate["schema"], "chase-public-slate/1")
            self.assertTrue(slate["games"])

    def test_public_slates_are_tracked_not_gitignored(self):
        import subprocess

        path = ROOT / "data" / "public" / "mlb" / "slate.json"
        proc = subprocess.run(
            ["git", "check-ignore", "-q", str(path)],
            cwd=ROOT,
        )
        self.assertNotEqual(proc.returncode, 0, "data/public slates must ship with the site")
        ignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        self.assertIn("!data/public/", ignore)

    def test_nav_and_shell_age_non_mlb_from_public_slate(self):
        nav = (ROOT / "dashboard" / "chase_nav.js").read_text(encoding="utf-8")
        shell = (ROOT / "dashboard" / "chase_shell.js").read_text(encoding="utf-8")
        self.assertIn("source: sport === 'mlb' ? 'sheet' : 'public-slate'", nav)
        self.assertIn("source: sport === 'mlb' ? 'sheet' : 'public-slate'", shell)
        self.assertNotIn("source: sport === 'mlb' ? 'sheet' : 'board'", nav)
        self.assertNotIn("source: sport === 'mlb' ? 'sheet' : 'board'", shell)
