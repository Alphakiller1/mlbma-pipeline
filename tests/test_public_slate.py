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

    def test_nfl_starting_units_survive_the_public_allowlist(self):
        import sys
        sys.path.insert(0, str(ROOT / "scripts"))
        from project_public_slate import project_slate

        lineups = {
            "source": "ESPN depth chart",
            "offense": {"package": "3WR 1TE", "players": [
                {"name": "A Passer", "position": "QB", "group": "Backfield",
                 "depth_rank": 1, "headshot_url": None},
            ]},
            "defense": {"package": "Base 4-3 D", "players": [
                {"name": "A Corner", "position": "LCB", "group": "Secondary",
                 "depth_rank": 1, "headshot_url": None},
            ]},
        }
        out = project_slate("nfl", {"games": [{
            "id": "nfl-x", "away": "AAA", "home": "BBB",
            "away_lineups": lineups, "home_lineups": lineups,
        }]})
        self.assertEqual(out["games"][0]["away_lineups"]["defense"]["players"][0]["name"],
                         "A Corner")

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

    def test_nav_and_shell_age_public_research_from_public_slate(self):
        nav = (ROOT / "dashboard" / "chase_nav.js").read_text(encoding="utf-8")
        shell = (ROOT / "dashboard" / "chase_shell.js").read_text(encoding="utf-8")
        self.assertIn("publicResearch || sport !== 'mlb' ? 'public-slate' : 'sheet'", nav)
        self.assertIn("data-ca-product') === 'research' || sport !== 'mlb' ? 'public-slate' : 'sheet'", shell)
        self.assertNotIn("source: sport === 'mlb' ? 'sheet' : 'board'", nav)
        self.assertNotIn("source: sport === 'mlb' ? 'sheet' : 'board'", shell)

    def test_nested_freshness_cannot_smuggle_model_fields(self):
        import sys
        sys.path.insert(0, str(ROOT / "scripts"))
        from project_public_slate import assert_clean, project_slate

        producer = {
            "generated_at_utc": "2026-09-09T00:00:00Z",
            "games": [{
                "id": "x",
                "away": "AAA",
                "home": "BBB",
                "freshness": {"state": "ok", "model_margin": -1.2},
            }],
        }
        out = project_slate("mlb", producer)
        assert_clean(out)
        self.assertEqual(out["games"][0]["freshness"], "ok")
        self.assertNotIn("model_margin", json.dumps(out))

    def test_mlb_matchup_csv_projects_without_private_metrics(self):
        import sys
        import tempfile
        sys.path.insert(0, str(ROOT))
        from outputs.publish_public_slate import mlb_producer
        sys.path.insert(0, str(ROOT / "scripts"))
        from project_public_slate import assert_clean, project_slate

        tmp = Path(tempfile.mkdtemp())
        (tmp / "today_matchups.csv").write_text(
            "Slate_Date,Time,Away,Home,Away_SP,Away_Hand,Home_SP,Home_Hand,Away_OSI,Lineup_Edge\n"
            "2026-09-09,7:05 PM ET,NYY,BOS,Cole,R,Bello,R,110,NYY +4.0\n",
            encoding="utf-8",
        )
        (tmp / "today_weather.csv").write_text(
            "away_team,home_team,stadium_name,temperature_f,conditions\n"
            "NYY,BOS,Fenway Park,72,clear\n",
            encoding="utf-8",
        )
        producer = mlb_producer(tmp)
        out = project_slate("mlb", producer)
        assert_clean(out)
        blob = json.dumps(out)
        self.assertNotIn("110", blob)
        self.assertNotIn("Lineup_Edge", blob)
        self.assertNotIn("Away_OSI", blob)
        self.assertEqual(out["games"][0]["away"], "NYY")
        self.assertEqual(out["games"][0]["venue"], "Fenway Park")

    def test_empty_producer_does_not_overwrite_known_good(self):
        import sys
        import tempfile
        sys.path.insert(0, str(ROOT))
        from outputs.publish_public_slate import write_if_better

        tmp = Path(tempfile.mkdtemp()) / "slate.json"
        tmp.write_text('{"schema":"chase-public-slate/1","games":[{"id":"keep"}]}', encoding="utf-8")
        before = tmp.read_text(encoding="utf-8")
        self.assertFalse(write_if_better("mlb", {"games": []}, tmp))
        self.assertEqual(tmp.read_text(encoding="utf-8"), before)


class MlbScheduleParityTests(unittest.TestCase):
    """Handoff phase 1: the published slate must describe the same games the
    schedule does, and must not claim to know more than it observed."""

    def test_producer_builds_every_scheduled_game(self):
        from outputs.publish_public_slate import mlb_producer_from_statsapi

        schedule = {"dates": [{"games": [
            {"gamePk": 1, "gameDate": "2026-09-10T17:10:00Z",
             "status": {"abstractGameState": "Final", "detailedState": "Final"},
             "teams": {
                 "away": {"team": {"abbreviation": "MIN", "name": "Minnesota Twins", "id": 142},
                          "leagueRecord": {"wins": 69, "losses": 76}, "score": 3,
                          "probablePitcher": {"id": 11, "fullName": "A Arm"}},
                 "home": {"team": {"abbreviation": "DET", "name": "Detroit Tigers", "id": 116},
                          "leagueRecord": {"wins": 66, "losses": 79}, "score": 5,
                          "probablePitcher": {"id": 12, "fullName": "B Arm"}}},
             "venue": {"id": 2394, "name": "Comerica Park",
                       "location": {"city": "Detroit", "stateAbbrev": "MI"}},
             "lineups": {"awayPlayers": [
                 {"id": 21, "fullName": "One Hitter",
                  "primaryPosition": {"abbreviation": "RF"}}]}},
            {"gamePk": 2, "gameDate": "2026-09-10T23:05:00Z",
             "status": {"abstractGameState": "Preview", "detailedState": "Scheduled"},
             "teams": {
                 "away": {"team": {"abbreviation": "SD", "name": "San Diego Padres"}},
                 "home": {"team": {"abbreviation": "SF", "name": "San Francisco Giants"}}}},
        ]}]}
        arms = {11: {"hand": "R", "era": "4.98", "whip": "1.27"},
                12: {"hand": "L", "era": "3.55", "whip": "1.03"}}
        out = mlb_producer_from_statsapi(schedule, arms)

        self.assertEqual(len(out["games"]), 2, "every scheduled game must be published")
        first, second = out["games"]

        # The real state, not a hardcoded "scheduled" for everything.
        self.assertEqual(first["game_state"], "final")
        self.assertEqual(second["game_state"], "scheduled")
        # A score only where there is a game to describe.
        self.assertEqual((first["away_score"], first["home_score"]), (3, 5))
        self.assertIsNone(second["away_score"])
        # Name and hand are separate fields, not one concatenated string.
        self.assertEqual(first["away_starter"], "A Arm")
        self.assertEqual(first["away_hand"], "R")
        self.assertNotIn("·", first["away_starter"])
        self.assertEqual(first["away_starter_id"], 11)
        # A game with no probable starter says so explicitly.
        self.assertIsNone(second["away_starter"])
        self.assertIsNone(second["away_starter_id"])
        # The batting order survives instead of collapsing to one word.
        self.assertEqual(first["away_lineup"],
                         [{"slot": 1, "person_id": 21, "name": "One Hitter", "position": "RF"}])
        self.assertEqual(first["away_lineup_state"], "Confirmed")
        self.assertEqual(first["home_lineup_state"], "Expected")
        self.assertEqual(first["venue_city"], "Detroit, MI")

    def test_publication_time_and_observation_time_can_differ(self):
        from outputs.publish_public_slate import mlb_producer_from_statsapi

        schedule = {"dates": [{"games": [
            {"gamePk": 3, "gameDate": "2050-01-01T00:00:00Z",
             "status": {"abstractGameState": "Preview", "detailedState": "Scheduled"},
             "teams": {"away": {"team": {"abbreviation": "AAA"}},
                       "home": {"team": {"abbreviation": "BBB"}}}}]}]}
        out = mlb_producer_from_statsapi(schedule)
        # A schedule carries future kickoffs; the newest OBSERVATION is still
        # the fetch, so data_through must never run ahead of publication.
        self.assertLessEqual(out["data_through_utc"], out["generated_at_utc"])

    def test_merge_lets_the_schedule_decide_which_games_exist(self):
        from outputs.publish_public_slate import merge_producers

        official = {"generated_at_utc": "2026-09-10T00:00:00Z", "games": [
            {"away": "MIN", "home": "DET", "game_state": "scheduled"}]}
        curated = {"games": [
            {"away": "MIN", "home": "DET", "away_bullpen": "Two arms unavailable"},
            {"away": "GHOST", "home": "TEAM", "away_bullpen": "should not appear"}]}
        merged = merge_producers(official, curated)
        self.assertEqual(len(merged["games"]), 1)
        self.assertEqual(merged["games"][0]["away_bullpen"], "Two arms unavailable")
