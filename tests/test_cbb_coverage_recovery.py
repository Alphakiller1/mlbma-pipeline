import json
from pathlib import Path
import subprocess
import unittest

from pipeline.cbb_public.espn_boxes import parse_box, rate_rows

ROOT = Path(__file__).resolve().parents[1]


class CbbCoverageRecoveryTests(unittest.TestCase):
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
