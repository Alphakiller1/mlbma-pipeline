"""Every section a desk builds must sit in exactly one of its tabs.

The X Factor Score shipped, published on 53 of 69 games, rendered correctly
and was reachable only by deep link: it was registered as a section and in no
tab, so nothing in the page's navigation ever showed it (2026-11-28). The CBB
desk had a test for this; the other three did not.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JS = (ROOT / "dashboard" / "public_game_detail.js").read_text(encoding="utf-8")
DESKS = {"cfb": "CFB_TABS", "nba": "NBA_TABS", "cbb": "CBB_TABS"}


def tab_sections(name: str) -> list:
    start = JS.index("var " + name + " = [")
    body = JS[start:JS.index("\n  ];", start)]
    return re.findall(r"'([a-z]+-[a-z0-9-]+)'", body)


def built_sections(prefix: str) -> set:
    return set(re.findall(r"section\('(" + prefix + r"-[a-z0-9-]+)'", JS))


class DeskTabTests(unittest.TestCase):
    def test_every_built_section_sits_in_a_tab(self):
        for prefix, tabs in DESKS.items():
            built, listed = built_sections(prefix), tab_sections(tabs)
            missing = sorted(built - set(listed))
            self.assertEqual(missing, [], f"{prefix}: built but in no tab: {missing}")

    def test_no_section_is_listed_in_two_tabs(self):
        for prefix, tabs in DESKS.items():
            listed = [s for s in tab_sections(tabs) if s.startswith(prefix + "-")]
            doubled = sorted({s for s in listed if listed.count(s) > 1})
            self.assertEqual(doubled, [], f"{prefix}: listed twice: {doubled}")

    def test_the_x_factor_is_one_of_them(self):
        """The section this test exists for."""
        self.assertIn("cfb-x-factor", built_sections("cfb"))
        self.assertIn("cfb-x-factor", tab_sections("CFB_TABS"))


if __name__ == "__main__":
    unittest.main()
