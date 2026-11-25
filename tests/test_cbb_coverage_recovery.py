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
        from pipeline.cbb_public.espn_boxes import add_box_context
        context = {"observed_tactics": {"situations": {"x": 1}, "restart_contexts": {"x": 1},
                                        "personnel": [{"x": 1}]},
                   "players": [{"G": 5}]}
        box = {}
        add_box_context(context, box, self.games())
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
