"""Every per-side block the CFB publisher writes must reach the matchup page.

The X Factor Score published on every game and the desk still read "not
published for this matchup yet" (2026-11-28): dashboard/sports/cfb.js merges
the published row into the page's game through its own allowlist of per-side
suffixes, and a key missing from that list is silently dropped. The publisher,
the renderer and the client merge all have to agree, so this checks them
against each other rather than trusting three hand-kept lists.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLISHER = (ROOT / "scripts" / "publish_public_cfb_slate.py").read_text(encoding="utf-8")
CLIENT = (ROOT / "dashboard" / "sports" / "cfb.js").read_text(encoding="utf-8")
DESK = (ROOT / "dashboard" / "public_game_detail.js").read_text(encoding="utf-8")

# Written straight onto the row, not through the per-side depth loop.
FIXTURE_KEYS = {"_starter", "_form", "_adjusted_efficiency", "_scheme_profile", "_travel",
                "_name", "_conference", "_logo", "_color", "_record", "_score", "_injuries",
                "_availability", "_split_record"}


def published_side_keys() -> set:
    return {m for m in re.findall(r'row\[side \+ "(_[a-z_]+)"\]', PUBLISHER)}


class SideBlockTests(unittest.TestCase):
    def test_every_published_side_block_is_merged_by_the_client(self):
        missing = sorted(key for key in published_side_keys() - FIXTURE_KEYS
                         if f"'{key}'" not in CLIENT)
        self.assertEqual(missing, [], f"dashboard/sports/cfb.js drops {missing}")

    def test_the_x_factor_is_one_of_them(self):
        """The block this test exists for."""
        self.assertIn("_x_factor", published_side_keys())
        self.assertIn("'_x_factor'", CLIENT)
        self.assertIn("_x_factor", DESK)

    def test_a_cache_stamp_moves_when_the_client_does(self):
        """A merge change that keeps the old ?v= ships to nobody holding the
        cached file (AGENTS.md: keep ?v= in sync when you change a JS file)."""
        stamps = set(re.findall(r"sports/cfb\.js\?v=([A-Za-z0-9]+)", 
                                "\n".join((ROOT / "cfb" / name).read_text(encoding="utf-8")
                                          for name in ("index.html", "matchup.html", "matchups.html"))))
        self.assertEqual(len(stamps), 1, f"the three CFB pages disagree on the stamp: {stamps}")


if __name__ == "__main__":
    unittest.main()
