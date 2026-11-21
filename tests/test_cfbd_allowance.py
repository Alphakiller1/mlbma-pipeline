"""The CFBD allowance (scripts/cfb_depth.py, 2026-11-21): a response is kept
and fetched again only after a game has finished since; a refused call serves
the kept copy; the games and FPI come from ESPN."""
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from scripts import cfb_depth as d

HOUR = 3600


class FreshTests(unittest.TestCase):
    def test_a_copy_stays_current_until_a_game_finishes_and_cfbd_has_taken_it_in(self):
        now = 1_000_000_000.0
        final = now - 10 * HOUR
        self.assertTrue(d._fresh(final + 4 * HOUR, final, now))          # fetched after CFBD had the final
        self.assertFalse(d._fresh(final - 1 * HOUR, final, now))         # fetched before it: fetch again
        self.assertTrue(d._fresh(final - 1 * HOUR, now - 1 * HOUR, now))  # final 1h ago: CFBD not ready, keep
        self.assertFalse(d._fresh(None, final, now))
        self.assertTrue(d._fresh(now - 5 * HOUR, None, now))             # no schedule: an age limit
        self.assertFalse(d._fresh(now - 25 * HOUR, None, now))


class GateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        patches = [mock.patch.object(d, "CACHE", Path(self.tmp.name)),
                   mock.patch.dict(d.ALLOWANCE, {"calls": 0, "kept": 0, "stale": 0, "remaining": None, "refused": False}),
                   mock.patch.object(d, "_CFBD_SEEN", {}),
                   mock.patch.dict("os.environ", {"CFBD_API_KEY": "k"})]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.addCleanup(self.tmp.cleanup)

    def answer(self, value, remaining=500):
        def fake(url, headers=None, seen=None):
            if seen is not None:
                seen["x-calllimit-remaining"] = str(remaining)
            return value
        return mock.patch.object(d, "_get", side_effect=fake)

    def test_one_call_then_the_kept_copy_until_a_new_final(self):
        with self.answer([{"team": "A"}]) as get:
            self.assertEqual(d.cfbd("/stats/x", changed=time.time() - 10 * HOUR, year=2026), [{"team": "A"}])
            d._CFBD_SEEN.clear()
            self.assertEqual(d.cfbd("/stats/x", changed=time.time() - 10 * HOUR, year=2026), [{"team": "A"}])
            self.assertEqual(get.call_count, 1)
            self.assertEqual(d.ALLOWANCE["remaining"], 500)
            d._CFBD_SEEN.clear()
            # A game finished 4 hours ago, after the copy was fetched: one more call.
            for path in Path(self.tmp.name).glob("cfbd_*.json"):
                kept = json.loads(path.read_text())
                kept["fetched_at"] = time.time() - 6 * HOUR
                path.write_text(json.dumps(kept))
            d.cfbd("/stats/x", changed=time.time() - 4 * HOUR, year=2026)
            self.assertEqual(get.call_count, 2)

    def test_a_refused_call_serves_the_kept_copy_and_stops_further_calls(self):
        with self.answer([{"team": "A"}]):
            d.cfbd("/stats/x", changed=time.time() - 30 * HOUR, year=2026)
        d._CFBD_SEEN.clear()
        for path in Path(self.tmp.name).glob("cfbd_*.json"):
            kept = json.loads(path.read_text())
            kept["fetched_at"] = time.time() - 40 * HOUR
            path.write_text(json.dumps(kept))
        refused = mock.patch.object(d, "_get", side_effect=RuntimeError("HTTP Error 429: Too Many Requests"))
        with refused as get:
            self.assertEqual(d.cfbd("/stats/x", changed=time.time() - 10 * HOUR, year=2026), [{"team": "A"}])
            self.assertIsNone(d.cfbd("/stats/y", changed=time.time() - 10 * HOUR, year=2026))
            self.assertEqual(get.call_count, 1)  # the second never went out
        self.assertTrue(d.ALLOWANCE["refused"])
        self.assertEqual(d.ALLOWANCE["stale"], 1)  # the one with a kept copy

    def test_calls_stop_at_the_reserve(self):
        with self.answer([1], remaining=d.RESERVE) as get:
            d.cfbd("/stats/x", changed=time.time() - 10 * HOUR, year=2026)
            d.cfbd("/stats/y", changed=time.time() - 10 * HOUR, year=2026)
            self.assertEqual(get.call_count, 1)


def event(eid, week, home, away, hs, as_, done, day="2026-11-15T00:00Z"):
    return {"id": eid, "date": day, "week": {"number": week},
            "status": {"type": {"completed": done}},
            "competitions": [{"neutralSite": False, "status": {"type": {"completed": done}}, "competitors": [
                {"homeAway": "home", "score": str(hs), "team": {"id": home[0], "location": home[1]}},
                {"homeAway": "away", "score": str(as_), "team": {"id": away[0], "location": away[1]}}]}]}


class EspnTests(unittest.TestCase):
    def test_season_games_in_the_cfbd_shape(self):
        weeks = {12: [event("401", 12, ("2711", "Western Michigan"), ("2199", "Eastern Michigan"), 34, 27, True),
                      event("402", 12, ("2711", "Western Michigan"), ("999", "Sacramento State"), 0, 0, False)]}
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(d, "CACHE", Path(tmp)), mock.patch.object(d, "_SEASON_GAMES", {}), \
                mock.patch.object(d, "fbs_ids", return_value={"2711", "2199"}), \
                mock.patch.object(d, "_espn", side_effect=lambda path: {"events": weeks.get(
                    int(path.split("week=")[1].split("&")[0]), [])}):
            games = d.season_games(2026)
            final, ahead = games
            self.assertEqual((final["id"], final["week"], final["homeTeam"], final["awayTeam"]),
                             (401, 12, "Western Michigan", "Eastern Michigan"))
            self.assertEqual((final["homePoints"], final["awayPoints"], final["completed"]), (34.0, 27.0, True))
            self.assertEqual((ahead["awayClassification"], ahead["homePoints"]), ("fcs", None))
            self.assertIsNotNone(final["_ended"])
            self.assertIsNone(ahead["_ended"])
            self.assertEqual(d.changed_at(2026, 12), final["_ended"])

    def test_fpi_by_school_from_espn(self):
        items = {"items": [
            {"team": {"$ref": "http://x/seasons/2026/teams/2711?lang=en"}, "predictives": [{"name": "fpi", "value": 1.5}]},
            {"team": {"$ref": "http://x/seasons/2026/teams/999?lang=en"}, "predictives": [{"name": "fpi", "value": -9}]}]}
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(d, "CACHE", Path(tmp)), \
                mock.patch.object(d, "season_games", return_value=[]), \
                mock.patch.dict(d._ESPN_NAMES, {"2711": "Western Michigan"}, clear=True), \
                mock.patch.object(d, "_get", return_value=items):
            # Every FPI school is FBS; a school's name comes from the scoreboard.
            self.assertEqual(d.fbs_ids(2026), {"2711", "999"})
            self.assertEqual(d.espn_fpi(2026), {"westernmichigan": 1.5})


if __name__ == "__main__":
    unittest.main()
