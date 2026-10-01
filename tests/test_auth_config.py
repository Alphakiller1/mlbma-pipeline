"""The header account menu's Supabase fallback must match the pipeline config."""
from __future__ import annotations

import re
import unittest
from pathlib import Path

from core.config import SUPABASE_DASHBOARD

ROOT = Path(__file__).resolve().parent.parent


class AuthConfigTest(unittest.TestCase):
    def test_auth_fallback_matches_core_config(self):
        js = (ROOT / "dashboard" / "mlbma_auth.js").read_text(encoding="utf-8")
        block = re.search(r"DEFAULT_SUPABASE\s*=\s*\{(.*?)\};", js, re.S)
        self.assertIsNotNone(block, "DEFAULT_SUPABASE missing from mlbma_auth.js")
        url = re.search(r"url:\s*'([^']+)'", block.group(1)).group(1)
        key = re.search(r"publishable_key:\s*'([^']+)'", block.group(1)).group(1)
        self.assertEqual(url, SUPABASE_DASHBOARD["url"])
        self.assertEqual(key, SUPABASE_DASHBOARD["publishable_key"])

    def test_account_menu_loads_auth_on_demand(self):
        nav = (ROOT / "dashboard" / "chase_nav.js").read_text(encoding="utf-8")
        self.assertIn("/dashboard/mlbma_auth.js", nav)
        self.assertIn("/dashboard/mlbma_auth_ui.js", nav)
        self.assertIn("data-mlbma-auth-panel", nav)
        # No public route links the auth scripts statically; they load on demand.
        for page in ("index.html", "mlb/index.html", "nfl/index.html"):
            html = (ROOT / page).read_text(encoding="utf-8")
            self.assertNotIn("mlbma_auth.js", html, page)


if __name__ == "__main__":
    unittest.main()
