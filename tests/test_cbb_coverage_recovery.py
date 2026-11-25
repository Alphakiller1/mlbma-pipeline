import json
from datetime import datetime
from pathlib import Path
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from pipeline.cbb_public.espn_boxes import parse_box, rate_rows
from scripts import publish_public_cbb_availability as cbb_availability

ROOT = Path(__file__).resolve().parents[1]


class CbbCoverageRecoveryTests(unittest.TestCase):
    def test_partial_source_outage_preserves_same_day_out_designation(self):
        row = {"team_id": "135", "player_id": "5254164", "status": "Out",
               "source": "Action Network", "retrieved_at_utc": "2026-11-09T23:09:37Z"}
        prior = {"season": 2027, "slate_date": "2026-11-09", "reports": [row]}
        teams = {"135": {}}
        key = (row["team_id"], row["player_id"])
        reports = {}
        carry = cbb_availability.carry_unavailable_reports
        self.assertEqual(carry(reports, prior, {"Covers": 10}, teams, 2027, "2026-11-09"), 1)
        self.assertEqual(reports[key], row)
        current = {key: {**row, "status": "Available", "source": "Covers"}}
        self.assertEqual(carry(current, prior, {"Covers": 10}, teams, 2027, "2026-11-09"), 0)
        self.assertEqual(current[key]["status"], "Available")
        self.assertEqual(carry({}, prior, {"Action Network": 0}, teams, 2027, "2026-11-09"), 0)
        self.assertEqual(carry({}, prior, {}, teams, 2027, "2026-11-10"), 0)

    def test_covers_fixture_report_requires_the_correct_day_and_pairing(self):
        event = {
            "@type": "SportsEvent", "startDate": "11/09/2026 23:00:00 &#x2B;00:00",
            "awayTeam": {"name": "Marshall"}, "homeTeam": {"name": "Ohio State"},
        }
        source = '<script type="application/ld+json">' + json.dumps(event) + '\n{}</script>'
        source += "".join(
            f'<section class="{side}-team-section"><h3>{school} Injuries</h3>'
            '<table><tbody><tr><td>No injuries to report.</td></tr></tbody></table></section>'
            for side, school in (("away", "Marshall"), ("home", "Ohio State"))
        )
        game = {"id": "401916315", "away": "276", "home": "194"}
        pairing = (game, {"marshall"}, {"ohiostate"})
        now = datetime(2026, 11, 9, 14, tzinfo=cbb_availability.ET)
        url = cbb_availability.COVERS_GAME + "390159"
        with patch.object(cbb_availability, "get", return_value=SimpleNamespace(content=source.encode())):
            check, rows = cbb_availability.covers_fixture(url, [pairing], now)
            self.assertEqual((check["game_id"], check["away_listings"], check["home_listings"]),
                             ("401916315", 0, 0))
            self.assertEqual(rows, [])
            self.assertIsNone(cbb_availability.covers_fixture(url, [pairing], now.replace(day=10)))
            self.assertIsNone(cbb_availability.covers_fixture(url, [(game, {"ohiostate"}, {"marshall"})], now))

    def test_box_rates_require_a_reconciled_final(self):
        names = ("fieldGoalsMade-fieldGoalsAttempted", "threePointFieldGoalsMade-threePointFieldGoalsAttempted",
                 "freeThrowsMade-freeThrowsAttempted", "offensiveRebounds", "defensiveRebounds", "assists", "totalTurnovers")

        def team(team_id, fields):
            return {"team": {"id": team_id}, "statistics": [
                {"name": k, "displayValue": v} for k, v in zip(names, fields)
            ]}

        game = {"game_id": 50, "game_date": "2026-11-09", "home_id": 1, "away_id": 2, "home_score": 70, "away_score": 60}
        competitors = [
            {"id": str(game[side + "_id"]), "score": str(game[side + "_score"]),
             "homeAway": side, "linescores": [{}, {}, {}]} for side in ("home", "away")
        ]
        payload = {"header": {"competitions": [
            {"id": "50", "status": {"type": {"completed": True}}, "competitors": competitors}
        ]}, "boxscore": {"teams": [
            team("1", ["25-55", "8-23", "12-14", "10", "18", "17", "14"]),
            team("2", ["22-57", "6-20", "10-17", "11", "19", "11", "13"]),
        ]}}
        box = parse_box(payload, game)
        self.assertEqual(box["minutes"], 45)
        self.assertAlmostEqual(rate_rows([(box["teams"]["1"], box["teams"]["2"])])["efg_o_all"], 29 / 55)
        with self.assertRaises(ValueError):
            parse_box(payload, {**game, "away_score": 59})

    def test_scheduled_board_drops_extra_model_fields(self):
        source = (ROOT / "functions/_shared/cbb-model-center.js").read_text(encoding="utf-8")
        harness = """
const now=Date.parse('2026-11-09T19:00Z');
const fallback={as_of_date:'2026-11-08',generated_at_utc:'2026-11-08T19:00Z'};
const game={id:'1',slate_date:'2026-11-09',kickoff_utc:'2026-11-10T00:00Z',
    projected_away:70,projected_home:75,projected_total:145,model_margin:5,
    away:'A',home:'B',away_name:'Away',home_name:'Home',private_diagnostics:{ppp:1}};
const raw={schema:'chase-board/1',sport:'cbb',as_of_date:'2026-11-09',
    generated_at_utc:'2026-11-09T18:00Z',data_through_utc:'2026-11-09T05:00Z',
    method:'chase-cbb-score-ridge-v1',may_bet:false,games:[game],secret_scores:{x:1}};
console.log(JSON.stringify([validateScoreBoard(raw,fallback,now),
    validateScoreBoard({...raw,as_of_date:'2026-11-07'},fallback,now)]));
"""
        process = subprocess.run(["node", "--input-type=module", "-e", source + harness],
                                 text=True, capture_output=True, check=True)
        board, stale = json.loads(process.stdout)
        self.assertEqual(board["games"][0]["model_margin"], 5)
        self.assertNotIn("secret_scores", board)
        self.assertNotIn("private_diagnostics", board["games"][0])
        self.assertIsNone(stale)

    def test_scheduled_board_carries_validated_draftkings_lines_and_lean(self):
        source = (ROOT / "functions/_shared/cbb-model-center.js").read_text(encoding="utf-8")
        harness = """
const now=Date.parse('2026-11-24T19:00Z');
const fallback={as_of_date:'2026-11-08',generated_at_utc:'2026-11-08T19:00Z'};
const base={slate_date:'2026-11-24',kickoff_utc:'2026-11-25T00:00Z',projected_away:70,projected_home:75,
    projected_total:145,model_margin:5,away:'A',home:'B',away_name:'Away',home_name:'Home'};
const games=[
  {...base,id:'1',market:{home_spread:-3.5,total:147.5},lean:'Strong: B -3.5 at the opener (57.6%)',
   edges:{spread:{probability:0.576}},market_moneyline:-150},
  {...base,id:'2',market:{home_spread:99,total:400},edge_note:'Total moved to 152.5, toward the model.'},
  {...base,id:'3'}];
const raw={schema:'chase-board/1',sport:'cbb',as_of_date:'2026-11-24',generated_at_utc:'2026-11-24T18:00Z',
    data_through_utc:'2026-11-24T05:00Z',method:'chase-cbb-score-sharp-v3',method_note:'Possession ratings.',
    may_bet:false,games};
console.log(JSON.stringify(validateScoreBoard(raw,fallback,now)));
"""
        process = subprocess.run(["node", "--input-type=module", "-e", source + harness],
                                 text=True, capture_output=True, check=True)
        board = json.loads(process.stdout)
        priced, bad, plain = board["games"]
        self.assertEqual(board["method_note"], "Possession ratings.")
        self.assertEqual((priced["market_margin"], priced["market_total"], priced["priced"]), (3.5, 147.5, True))
        self.assertEqual(priced["book"]["name"], "DraftKings")
        self.assertEqual(priced["lean"], "Strong: B -3.5 at the opener (57.6%)")
        self.assertNotIn("edges", priced)
        self.assertNotIn("market", priced)
        self.assertNotIn("market_moneyline", priced)
        self.assertNotIn("market_margin", bad)
        self.assertFalse(bad["priced"])
        self.assertEqual(bad["edge_withheld_reason"], "Total moved to 152.5, toward the model.")
        self.assertNotIn("lean", plain)


class RecentRotationTests(unittest.TestCase):
    """Minutes over the team's last five games, beside the season rate."""

    def games(self):
        from collections import Counter  # noqa: F401  (documents the shape below)

        def game(date, lines):
            return (date, 200, {"player_lines": [
                {"athlete_id": pid, "Name": name, "minutes": mins,
                 "Pts": 0, "Reb": 0, "Ast": 0, "FGA": 0, "FTA": 0}
                for pid, name, mins in lines], "box_context": {}, "poss": 70},
                {"player_lines": [], "box_context": {}, "poss": 70}, 70)

        # Eight games. The starter plays throughout; the freshman is promoted
        # for the last five; the senior stops playing after the first three.
        early = [("1", "Starter", 30), ("2", "Freshman", 6), ("3", "Senior", 24)]
        late = [("1", "Starter", 30), ("2", "Freshman", 26)]
        return ([game(f"2026-11-0{d}", early) for d in (1, 2, 3)] +
                [game(f"2026-11-0{d}", late) for d in (4, 5, 6, 7, 8)])

    def rotation(self):
        # Rotation is built for every team beside box pace, not in the fallback
        # that fills a team whose counted source is missing.
        from pipeline.cbb_public.espn_boxes import add_player_context
        box = {}
        add_player_context(box, self.games())
        return box["rotation"]

    def test_recent_minutes_are_per_team_game_not_per_game_played(self):
        rotation = self.rotation()
        by_id = {r["athlete_id"]: r for r in rotation["players"]}
        self.assertEqual(rotation["window_games"], 5)
        self.assertEqual(rotation["games"], 8)
        # The freshman played 26 in each of the last five.
        self.assertAlmostEqual(by_id["2"]["minutes_recent"], 26.0)
        # Season rate spreads his 3x6 + 5x26 across all eight games.
        self.assertAlmostEqual(by_id["2"]["minutes_season"], (3 * 6 + 5 * 26) / 8)
        self.assertEqual(by_id["2"]["games_recent"], 5)

    def test_a_player_who_stopped_playing_leaves_the_recent_window(self):
        by_id = {r["athlete_id"]: r for r in self.rotation()["players"]}
        # The senior appears in no recent game, so he carries no recent minutes
        # at all rather than a stale season average.
        self.assertNotIn("3", by_id)
        self.assertAlmostEqual(by_id["1"]["minutes_recent"], 30.0)

    def test_players_are_ordered_by_the_minutes_they_are_playing_now(self):
        order = [r["athlete_id"] for r in self.rotation()["players"]]
        self.assertEqual(order, ["1", "2"])


class PlayerShotProfileTests(unittest.TestCase):
    """Per-player shot location, finishing and creation, from the same play
    feed the team zone profile is built from."""

    def plays(self):
        def shot(team, kind, coordinate, text, scoring, people):
            return {"team": {"id": team}, "type": {"text": kind}, "shootingPlay": True,
                    "scoringPlay": scoring, "coordinate": coordinate, "text": text,
                    "participants": [{"athlete": {"id": p}} for p in people]}

        return {"plays": [
            # Wing takes the threes; Big finishes at the rim off his passes.
            shot("1", "JumpShot", {"x": 25, "y": 27}, "Wing makes three point jumper", True, ["10"]),
            shot("1", "JumpShot", {"x": 3, "y": 6}, "Wing misses three point jumper", False, ["10"]),
            shot("1", "LayUpShot", {"x": 25, "y": 5}, "Big makes layup", True, ["20", "10"]),
            shot("1", "DunkShot", {"x": 25, "y": 5}, "Big makes dunk", True, ["20", "10"]),
            shot("1", "LayUpShot", {"x": 25, "y": 5}, "Big misses layup", False, ["20"]),
            # No coordinate: a real attempt that belongs to no zone.
            shot("1", "JumpShot", None, "Big misses jumper", False, ["20"]),
            # Free throws are not field goals, and the other side is not ours.
            shot("1", "FreeThrow", None, "Wing makes free throw", True, ["10"]),
            shot("2", "JumpShot", {"x": 25, "y": 20}, "Guard makes jumper", True, ["30"]),
            {"team": {"id": "1"}, "type": {"text": "Rebound"}, "text": "Big rebound",
             "participants": [{"athlete": {"id": "20"}}]}]}

    def test_shots_land_in_one_zone_scheme_and_free_throws_are_left_out(self):
        from pipeline.cbb_public.espn_boxes import player_shots
        rows = player_shots(self.plays(), {"1", "2"})
        wing, big = rows["1"]["10"], rows["1"]["20"]
        self.assertEqual((wing["fga"], wing["fgm"]), (2, 1))
        self.assertEqual({z: tuple(c) for z, c in wing["zones"].items()}, {"atb3": (1, 1), "c3": (1, 0)})
        # Four attempts, three of them located; the uncharted one is in no zone.
        self.assertEqual((big["fga"], big["fgm"]), (4, 2))
        self.assertEqual(sum(a for a, _ in big["zones"].values()), 3)
        self.assertEqual({z: tuple(c) for z, c in big["zones"].items()}, {"atr2": (3, 2)})

    def test_an_assist_credits_the_passer_and_marks_the_make_as_created(self):
        from pipeline.cbb_public.espn_boxes import player_shots
        rows = player_shots(self.plays(), {"1", "2"})
        self.assertEqual(rows["1"]["20"]["assisted"], 2)
        self.assertEqual(rows["1"]["10"]["assists"], 2)
        # The passer's own attempts are never counted as assisted makes.
        self.assertEqual(rows["1"]["10"]["assisted"], 0)

    def test_the_other_side_keeps_its_own_players(self):
        from pipeline.cbb_public.espn_boxes import player_shots
        rows = player_shots(self.plays(), {"1", "2"})
        self.assertEqual(list(rows["2"]), ["30"])
        self.assertEqual(rows["2"]["30"]["zones"], {"mid2": [1, 1]})

    def test_espn_play_coordinates_map_onto_the_chase_scheme(self):
        from pipeline.cbb_public.espn_boxes import chase_coordinates
        self.assertEqual(chase_coordinates({"x": 25, "y": 5}), (42.0, 0.0))
        self.assertEqual(chase_coordinates({"x": 3, "y": 6}), (41.0, -22.0))
        self.assertEqual(chase_coordinates(None), (None, None))

    def season(self):
        from pipeline.cbb_public.espn_boxes import add_player_context, player_shots
        shots = player_shots(self.plays(), {"1", "2"})["1"]
        lines = [{"athlete_id": pid, "Name": name, "minutes": 30,
                  "Pts": 0, "Reb": 0, "Ast": 0, "FGA": 0, "FTA": 0}
                 for pid, name in (("10", "Wing"), ("20", "Big"))]
        games = [(f"2026-11-0{d}", 200,
                  {"player_lines": lines, "player_shots": shots, "box_context": {}, "poss": 70},
                  {"player_lines": [], "box_context": {}, "poss": 70}, 70) for d in (1, 2)]
        box = {}
        add_player_context(box, games)
        return box["player_shots"]

    def test_season_totals_add_the_games_and_name_the_players(self):
        profile = self.season()
        by_id = {r["athlete_id"]: r for r in profile["players"]}
        self.assertEqual(profile["games"], 2)
        self.assertEqual(by_id["20"]["Name"], "Big")
        self.assertEqual((by_id["20"]["fga"], by_id["20"]["fgm"]), (8, 4))
        rim = next(z for z in by_id["20"]["zones"] if z["zone"] == "atr2")
        self.assertEqual((rim["attempts"], rim["made"]), (6, 4))

    def test_created_share_is_of_makes_and_zone_share_is_of_located_attempts(self):
        by_id = {r["athlete_id"]: r for r in self.season()["players"]}
        # Both of the big's four makes were assisted.
        self.assertAlmostEqual(by_id["20"]["assisted_share"], 1.0)
        # Six located attempts of eight taken; the share is of the located ones.
        self.assertAlmostEqual(sum(z["share"] for z in by_id["20"]["zones"]), 1.0)
        self.assertAlmostEqual(next(z["fg_pct"] for z in by_id["20"]["zones"]), 100 * 4 / 6)

    def test_players_are_ordered_by_the_shots_they_take(self):
        self.assertEqual([r["athlete_id"] for r in self.season()["players"]], ["20", "10"])


class SecondChanceTests(unittest.TestCase):
    """Offensive rebounding read against the zone of the miss it answers."""

    def plays(self):
        out = []

        def add(team, kind, text, scoring=False, coordinate=None, shooting=False, value=0):
            out.append({"team": {"id": team}, "type": {"text": kind}, "text": text,
                        "shootingPlay": shooting, "scoringPlay": scoring,
                        "coordinate": coordinate, "scoreValue": value})

        rim, arc = {"x": 25, "y": 5}, {"x": 25, "y": 27}
        # A missed three the shooter's team rebounds, then scores at the rim.
        add("1", "JumpShot", "Wing misses three point jumper", coordinate=arc, shooting=True)
        add("1", "Offensive Rebound", "Big Offensive Rebound.")
        add("1", "LayUpShot", "Big makes layup", scoring=True, coordinate=rim, shooting=True, value=2)
        # A missed layup the other team rebounds: a miss, no second chance.
        add("1", "LayUpShot", "Big misses layup", coordinate=rim, shooting=True)
        add("2", "Defensive Rebound", "Guard Defensive Rebound.")
        # Two offensive rebounds inside one possession, then a made three.
        add("1", "JumpShot", "Wing misses three point jumper", coordinate=arc, shooting=True)
        add("1", "Offensive Rebound", "Big Offensive Rebound.")
        add("1", "LayUpShot", "Big misses layup", coordinate=rim, shooting=True)
        add("1", "Offensive Rebound", "Wing Offensive Rebound.")
        add("1", "JumpShot", "Wing makes three point jumper", scoring=True, coordinate=arc,
            shooting=True, value=3)
        # A missed free throw and its rebound are not field-goal business.
        add("1", "MissedFreeThrow", "Big misses free throw", shooting=True)
        add("1", "Offensive Rebound", "Big Offensive Rebound.")
        # A miss the feed never rebounds: the period simply ends.
        add("1", "JumpShot", "Wing misses three point jumper", coordinate=arc, shooting=True)
        add("", "End Period", "End of the 1st Half")
        return {"plays": out}

    def chances(self):
        from pipeline.cbb_public.espn_boxes import second_chances
        return second_chances(self.plays(), {"1", "2"})["1"]

    def test_a_rebound_is_credited_to_the_zone_of_the_miss_it_answers(self):
        row = self.chances()
        # Three three-point misses the feed rebounds, two of them by the shooters.
        self.assertEqual(row["misses"], {"three": 2, "rim": 2})
        self.assertEqual(row["orb"], {"three": 2, "rim": 1})

    def test_free_throws_and_unrebounded_misses_are_left_out(self):
        row = self.chances()
        # Five field goals were missed and a free throw with them; the feed
        # rebounds four of the five, and the free throw is not a field goal.
        # So four misses are read, and the free throw's offensive rebound is
        # neither a second chance nor a rebound of any zone.
        self.assertEqual(sum(row["misses"].values()), 4)
        self.assertEqual(sum(row["orb"].values()), 3)

    def test_points_are_counted_once_per_possession_not_once_per_rebound(self):
        row = self.chances()
        # Two possessions reached a second chance: the layup (2) and, after two
        # offensive rebounds on one possession, the three (3).
        self.assertEqual(row["chances"], 2)
        self.assertEqual(row["second_chance_points"], 5)

    def test_the_defending_side_keeps_its_own_row(self):
        from pipeline.cbb_public.espn_boxes import second_chances
        self.assertEqual(second_chances(self.plays(), {"1", "2"})["2"],
                         {"misses": {}, "orb": {}, "second_chance_points": 0, "chances": 0})

    def test_season_rates_read_offense_and_what_it_allowed(self):
        from pipeline.cbb_public.espn_boxes import second_chance_rates
        own = {"misses": {"rim": 10, "three": 20}, "orb": {"rim": 4, "three": 5},
               "second_chance_points": 12, "chances": 9}
        opp = {"misses": {"rim": 10, "three": 10}, "orb": {"rim": 2, "three": 2},
               "second_chance_points": 4, "chances": 4}
        rates = second_chance_rates([(own, opp), (own, opp)])
        self.assertEqual(rates["second_chance_games_all"], 2)
        self.assertAlmostEqual(rates["orb_rim_off_all"], 0.4)
        self.assertAlmostEqual(rates["orb_three_off_all"], 0.25)
        self.assertAlmostEqual(rates["orb_fg_off_all"], 9 / 30)
        self.assertAlmostEqual(rates["sc_points_off_all"], 12.0)
        self.assertAlmostEqual(rates["sc_points_per_chance_off_all"], 12 / 9)
        # The defense side reads what the opponents did to it, not its own.
        self.assertAlmostEqual(rates["orb_fg_def_all"], 4 / 20)
        self.assertAlmostEqual(rates["sc_points_def_all"], 4.0)
        # A zone neither side missed in is None, never a zero rate.
        self.assertIsNone(rates["orb_paint_off_all"])


class ArchivedBoxTopUpTests(unittest.TestCase):
    """A cached box is this season's archive of the feed as it read on the day.
    A release that adds a field tops the archive up; it never re-derives what
    the archive already holds from a feed ESPN may since have revised."""

    def archive(self, directory):
        from pipeline.cbb_public.data import write
        game = {"game_id": "401900001", "game_date": "2026-11-03",
                "home_id": "1", "away_id": "2", "home_score": 70, "away_score": 60}
        row = lambda: {"player_lines": [], "box_context": {}, "stl": 5, "kinds": None,
                       "classes": None, "halves": {"h1": 1}}
        write(directory / "401900001.json",
              {"fixture": ["2026-11-03", "1", "2", 70, 60], "minutes": 40,
               "pressure": {"1": {"defense": {"after_score": 14}}},
               "teams": {"1": row(), "2": row()}})
        return game

    def test_only_the_added_fields_are_refetched_and_the_rest_is_kept(self):
        import tempfile
        from pathlib import Path
        from unittest.mock import patch
        from pipeline.cbb_public import espn_boxes
        with tempfile.TemporaryDirectory() as scratch:
            cache = Path(scratch)
            game = self.archive(cache)
            fresh = {"teams": {t: {"player_shots": {"9": {"fga": 4}},
                                   "second_chance": {"misses": {"rim": 2}, "orb": {"rim": 1},
                                                     "second_chance_points": 2, "chances": 1},
                                   # A revised feed: these must NOT reach the archive.
                                   "stl": 99, "halves": {"h1": 99}}
                               for t in ("1", "2")},
                     "pressure": None}
            with patch.object(espn_boxes, "fetch_box", return_value=fresh) as fetched:
                box = espn_boxes.load_box(game, cache)
            self.assertEqual(fetched.call_count, 1)
            self.assertEqual(box["teams"]["1"]["player_shots"], {"9": {"fga": 4}})
            self.assertEqual(box["teams"]["1"]["second_chance"]["chances"], 1)
            # Everything the archive already held is untouched, pressure above
            # all: re-deriving it dropped a game under the threshold and had
            # the publication guard refuse the whole run (2026-11-25).
            self.assertEqual(box["teams"]["1"]["stl"], 5)
            self.assertEqual(box["teams"]["1"]["halves"], {"h1": 1})
            self.assertEqual(box["pressure"], {"1": {"defense": {"after_score": 14}}})
            # Topped up on disk, so the next run reads it without fetching again.
            with patch.object(espn_boxes, "fetch_box") as again:
                espn_boxes.load_box(game, cache)
            again.assert_not_called()

    def test_a_failed_refetch_keeps_the_archive_rather_than_dropping_it(self):
        import tempfile
        from pathlib import Path
        from unittest.mock import patch
        import requests
        from pipeline.cbb_public import espn_boxes
        with tempfile.TemporaryDirectory() as scratch:
            cache = Path(scratch)
            game = self.archive(cache)
            with patch.object(espn_boxes, "fetch_box", side_effect=requests.RequestException("502")):
                box = espn_boxes.load_box(game, cache)
            self.assertEqual(box["teams"]["1"]["stl"], 5)
            self.assertEqual(box["pressure"], {"1": {"defense": {"after_score": 14}}})
            # The added fields read empty, not absent, so the game is not
            # re-fetched on every later run.
            self.assertEqual(box["teams"]["1"]["player_shots"], {})
            self.assertEqual(box["teams"]["1"]["second_chance"]["chances"], 0)
            with patch.object(espn_boxes, "fetch_box") as again:
                espn_boxes.load_box(game, cache)
            again.assert_not_called()

    def test_a_box_missing_an_archived_field_is_fetched_whole(self):
        import tempfile
        from pathlib import Path
        from unittest.mock import patch
        from pipeline.cbb_public import espn_boxes
        from pipeline.cbb_public.data import read, write
        with tempfile.TemporaryDirectory() as scratch:
            cache = Path(scratch)
            game = self.archive(cache)
            stale = read(cache / "401900001.json")
            del stale["teams"]["1"]["halves"]
            write(cache / "401900001.json", stale)
            whole = {"fixture": ["2026-11-03", "1", "2", 70, 60], "teams": {}, "pressure": None}
            with patch.object(espn_boxes, "fetch_box", return_value=whole) as fetched:
                self.assertIs(espn_boxes.load_box(game, cache), whole)
            self.assertEqual(fetched.call_count, 1)


class PlayerContextReachesEveryTeamTests(unittest.TestCase):
    """Rotation and the shot profile are built for every team.

    They lived inside add_box_context, which supplement() calls only for a team
    whose counted source is missing, so on 2026-11-25 they published for almost
    nobody: High Point had complete Basketball Quant rates and therefore no
    rotation and no player_shots at all.
    """

    def supplement_tree(self):
        import ast
        source = (ROOT / "pipeline/cbb_public/espn_boxes.py").read_text(encoding="utf-8")
        tree = ast.parse(source)
        return next(node for node in ast.walk(tree)
                    if isinstance(node, ast.FunctionDef) and node.name == "supplement")

    def test_the_call_is_not_gated_on_a_missing_source(self):
        import ast
        supplement = self.supplement_tree()
        gated = set()
        for node in ast.walk(supplement):
            if isinstance(node, ast.If) and "fill" in ast.dump(node.test):
                for inner in ast.walk(node):
                    if isinstance(inner, ast.Call) and getattr(inner.func, "id", "") == "add_player_context":
                        gated.add(inner.lineno)
        calls = [n for n in ast.walk(supplement)
                 if isinstance(n, ast.Call) and getattr(n.func, "id", "") == "add_player_context"]
        self.assertTrue(calls, "supplement must build the player context")
        self.assertFalse(gated, "add_player_context must not sit behind a missing-source branch")

    def test_the_fallback_no_longer_owns_them(self):
        from pipeline.cbb_public.espn_boxes import add_box_context
        games = [("2026-11-01", 200,
                  {"player_lines": [{"athlete_id": "1", "Name": "A", "minutes": 30, "Pts": 0,
                                     "Reb": 0, "Ast": 0, "FGA": 0, "FTA": 0}],
                   "player_shots": {"1": {"fga": 9, "fgm": 4, "assisted": 1, "assists": 2,
                                          "zones": {"atr2": [9, 4]}}},
                   "box_context": {}, "poss": 70},
                  {"player_lines": [], "box_context": {}, "poss": 70}, 70)]
        box = {}
        add_box_context({"observed_tactics": {"situations": {"x": 1}, "restart_contexts": {"x": 1},
                                              "personnel": [{"x": 1}]},
                         "players": [{"G": 1}]}, box, games)
        self.assertNotIn("rotation", box)
        self.assertNotIn("player_shots", box)
