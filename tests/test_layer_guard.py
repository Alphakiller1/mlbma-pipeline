"""Layer-guard predicates must fail closed.

check_tokens.py now blocks hex / --ca-* / sub-12px / route IDs under
dashboard/styles/. These tests call the same helpers against fixtures so a
green gate cannot mean a broken predicate (the Phase 1 smoke trap).
"""
from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MOD_PATH = ROOT / "scripts" / "check_tokens.py"


def _load():
    spec = importlib.util.spec_from_file_location("check_tokens", MOD_PATH)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


class LayerGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = _load()

    def test_hex_in_component_file_is_a_violation(self):
        path = ROOT / "dashboard" / "styles" / "chase-components.css"
        hits = self.mod.layer_violations_for(path, ".ca-btn{color:#fff;}")
        self.assertTrue(any("hex" in h for h in hits), hits)

    def test_primitive_outside_semantic_is_a_violation(self):
        path = ROOT / "dashboard" / "styles" / "chase-shell.css"
        hits = self.mod.layer_violations_for(path, ".x{color:var(--ca-ink-950);}")
        self.assertTrue(any("primitive" in h for h in hits), hits)

    def test_semantic_file_may_reference_primitives(self):
        path = ROOT / "dashboard" / "styles" / "chase-semantic.css"
        hits = self.mod.layer_violations_for(path, ":root{--x:var(--ca-ink-950);}")
        self.assertFalse(any("primitive" in h for h in hits), hits)

    def test_route_id_in_components_is_a_violation(self):
        path = ROOT / "dashboard" / "styles" / "chase-components.css"
        hits = self.mod.layer_violations_for(path, "#mlb .ca-btn{color:var(--text-primary);}")
        self.assertTrue(any("id selector" in h for h in hits), hits)

    def test_sub_12px_is_a_violation(self):
        path = ROOT / "dashboard" / "styles" / "chase-shell.css"
        hits = self.mod.layer_violations_for(path, ".x{font-size:11px;}")
        self.assertTrue(any("below 12px" in h for h in hits), hits)

    def test_12px_is_allowed(self):
        path = ROOT / "dashboard" / "styles" / "chase-shell.css"
        hits = self.mod.layer_violations_for(path, ".x{font-size:12px;}")
        self.assertFalse(any("below 12px" in h for h in hits), hits)

    def test_shipped_layer_files_are_clean(self):
        styles = ROOT / "dashboard" / "styles"
        for css in sorted(styles.glob("*.css")):
            hits = self.mod.layer_violations_for(css, css.read_text(encoding="utf-8"))
            self.assertEqual(hits, [], f"{css.name}: {hits}")

    def test_shared_shell_has_no_oswald(self):
        for rel in (
            "dashboard/chase_nav.css",
            "dashboard/styles/chase-shell.css",
            "dashboard/styles/chase-primitives.css",
        ):
            text = (ROOT / rel).read_text(encoding="utf-8")
            self.assertNotIn("Oswald", text, rel)

    def test_chase_nav_is_a_noop_after_migration(self):
        text = (ROOT / "dashboard" / "chase_nav.css").read_text(encoding="utf-8")
        self.assertNotRegex(text, r"\{[^}]+\}")


if __name__ == "__main__":
    unittest.main()
