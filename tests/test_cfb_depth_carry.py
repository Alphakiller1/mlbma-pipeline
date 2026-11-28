"""The CFB depth carry (scripts/publish_public_cfb_slate.py).

The Strength Index panel was empty for Alabama, Auburn, Ole Miss, Mississippi
State and James Madison on 2026-11-27. OSI/DSI/NSI need CFBD's /ppa/games,
whose monthly allowance was spent on 11-20 ("no copy kept"), so every school's
block on the desk was carried. The carry read only the previously published
slate, so a school that was off that slate - a bye week, or the window rolling
from 66 games to 69 on 11-23 - had nothing to come back to.
"""
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts import publish_public_cfb_slate as pub


def game(away, home, **blocks):
    row = {"away": away, "home": home}
    row.update(blocks)
    return row


class DepthCarryTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        root = Path(self.dir.name)
        self.store = root / "depth_carry.json"
        self.slate = root / "slate.json"
        patches = (mock.patch.object(pub, "DEPTH_STORE", self.store),
                   mock.patch.object(pub, "OUT", self.slate))
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def publish(self, games, season=2026):
        """One publication: carry what is missing, then keep what we hold."""
        carried = pub.carry_forward_depth(games, season)
        pub.write_depth_store(games, season)
        self.slate.write_text(json.dumps({"season": season, "games": games}), encoding="utf-8")
        return carried

    def test_a_school_that_leaves_the_window_comes_back_to_its_blocks(self):
        # Week 12, CFBD still answering: every school has a block.
        self.publish([game("AUB", "ALA", away_strength={"osi": 1}, home_strength={"osi": 2}),
                      game("UGA", "LSU", away_strength={"osi": 3}, home_strength={"osi": 4})])
        # Week 13 opens without Alabama or Auburn, and CFBD is spent.
        self.publish([game("UGA", "LSU")])
        # They come back. The previous slate cannot help; the store can.
        week13 = [game("AUB", "ALA")]
        carried = self.publish(week13)
        self.assertEqual(carried, 2)
        self.assertEqual(week13[0]["away_strength"], {"osi": 1})
        self.assertEqual(week13[0]["home_strength"], {"osi": 2})

    def test_the_published_slate_still_wins_when_it_has_the_block(self):
        self.publish([game("AUB", "ALA", home_strength={"osi": "old"})])
        self.slate.write_text(json.dumps({"season": 2026, "games": [
            game("AUB", "ALA", home_strength={"osi": "newer"})]}), encoding="utf-8")
        row = [game("AUB", "ALA")]
        pub.carry_forward_depth(row, 2026)
        self.assertEqual(row[0]["home_strength"], {"osi": "newer"})

    def test_a_fresh_block_is_never_overwritten_by_a_carried_one(self):
        self.publish([game("AUB", "ALA", home_strength={"osi": "old"})])
        row = [game("AUB", "ALA", home_strength={"osi": "fresh"})]
        self.assertEqual(pub.carry_forward_depth(row, 2026), 0)
        self.assertEqual(row[0]["home_strength"], {"osi": "fresh"})

    def test_last_season_is_never_carried_into_this_one(self):
        self.publish([game("AUB", "ALA", home_strength={"osi": 2})], season=2025)
        row = [game("AUB", "ALA")]
        self.assertEqual(pub.carry_forward_depth(row, 2026), 0)
        self.assertIsNone(row[0].get("home_strength"))

    def test_an_unwritable_store_does_not_stop_the_publication(self):
        with mock.patch.object(pub, "DEPTH_STORE", Path(self.dir.name) / "missing" / "x" / "y.json"):
            with mock.patch.object(Path, "mkdir", side_effect=OSError("read-only")):
                self.assertEqual(pub.write_depth_store([game("AUB", "ALA")], 2026), 0)


if __name__ == "__main__":
    unittest.main()
