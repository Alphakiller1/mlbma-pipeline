"""Bullpen load is relief work by relievers, and never tonight's starter.

On 2026-09-16 the White Sox card and matchup page showed a pen that had thrown
hundreds of pitches in the week before the game. The box scores were right, and
the reading was wrong: the club had been running openers, so Sean Burke (25
starts) threw 94 pitches behind one, Davis Martin (26 starts) 71, Luis Castillo
(23 starts) 61 and Erick Fedde (14 of 31) 81 - all credited as relief
appearances, none of them bullpen availability. And Sean Newcomb, the starter
that night, sat in his own club's bullpen table labelled Set-Up.
"""
from __future__ import annotations

import unittest
from unittest import mock

from outputs import publish_public_slate as slate

TEAM = 145


def _pitcher(pid, pitches, started, season_g, season_gs, name="Arm"):
    return pid, {
        "person": {"fullName": f"{name} {pid}"},
        "stats": {"pitching": {"gamesStarted": 1 if started else 0,
                               "numberOfPitches": pitches}},
        "seasonStats": {"pitching": {"gamesPlayed": season_g, "gamesStarted": season_gs}},
    }


def _box(*pitchers):
    return {"teams": {
        "away": {"team": {"id": TEAM},
                 "pitchers": [pid for pid, _ in pitchers],
                 "players": {f"ID{pid}": body for pid, body in pitchers}},
        "home": {"team": {"id": 999}, "pitchers": [], "players": {}},
    }}


def _run(box, exclude=None):
    schedule = {"dates": [{"date": "2026-09-15", "games": [
        {"gamePk": 1, "status": {"abstractGameState": "Final"}}]}]}

    def fake_json(url):
        return schedule if "schedule" in url else box

    with mock.patch.object(slate, "_json", side_effect=fake_json):
        return slate.bullpen_load(TEAM, "2026-09-16", {}, exclude=exclude)


class RotationArmTest(unittest.TestCase):
    def test_the_season_line_decides(self):
        self.assertTrue(slate.is_rotation_arm({"gamesPlayed": 30, "gamesStarted": 25}))   # Burke
        self.assertTrue(slate.is_rotation_arm({"gamesPlayed": 31, "gamesStarted": 14}))   # Fedde, swingman
        self.assertFalse(slate.is_rotation_arm({"gamesPlayed": 57, "gamesStarted": 4}))   # Taylor, opener
        self.assertFalse(slate.is_rotation_arm({"gamesPlayed": 65, "gamesStarted": 8}))   # Hudson
        self.assertFalse(slate.is_rotation_arm({"gamesPlayed": 3, "gamesStarted": 3}))    # too few to call
        self.assertFalse(slate.is_rotation_arm({}))


class BullpenLoadTest(unittest.TestCase):
    def test_bulk_innings_behind_an_opener_are_not_bullpen_load(self):
        box = _box(
            _pitcher(1, 13, True, 53, 4),     # the opener - excluded as a starter
            _pitcher(2, 94, False, 30, 25),   # rotation arm in bulk relief
            _pitcher(3, 26, False, 13, 1),    # a real reliever
            _pitcher(4, 9, False, 49, 0),     # a real reliever
        )
        self.assertEqual(_run(box), "2/35")

    def test_tonights_starter_is_not_in_his_own_bullpen(self):
        box = _box(
            _pitcher(10, 42, False, 53, 4),   # relieved on Wednesday, starts tonight
            _pitcher(11, 26, False, 49, 0),
        )
        self.assertEqual(_run(box), "2/68")
        self.assertEqual(_run(box, exclude=10), "1/26")

    def test_a_reliever_who_has_opened_a_few_games_stays_in_the_pen(self):
        box = _box(_pitcher(5, 27, False, 57, 4))
        self.assertEqual(_run(box), "1/27")

    def test_the_cache_separates_the_two_starters_of_a_doubleheader(self):
        cache = {}
        box = _box(_pitcher(20, 30, False, 40, 0), _pitcher(21, 20, False, 40, 0))
        schedule = {"dates": [{"date": "2026-09-15", "games": [
            {"gamePk": 1, "status": {"abstractGameState": "Final"}}]}]}
        with mock.patch.object(slate, "_json",
                               side_effect=lambda u: schedule if "schedule" in u else box):
            first = slate.bullpen_load(TEAM, "2026-09-16", cache, exclude=20)
            second = slate.bullpen_load(TEAM, "2026-09-16", cache, exclude=21)
        self.assertEqual((first, second), ("1/20", "1/30"))


if __name__ == "__main__":
    unittest.main()
