"""Scoreboard projection keeps score zero, handles delays, and drops upstream extras."""
from pathlib import Path
import json
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]


class PublicGameStatusTests(unittest.TestCase):
    def test_returns_only_factual_status_and_scores(self):
        source = (ROOT / "functions/api/game-status.js").read_text(encoding="utf-8")
        source = source.replace("import { json } from '../_shared/http.js';",
                                "const json = (body, status = 200) => ({body, status});")
        harness = """
const sides = [{homeAway:'away',score:'0',records:[{type:'total',summary:'3-5'}]},
               {homeAway:'home',score:'24',records:[{type:'ats',summary:'2-6'}]}];
const event = (id,type) => ({id,status:{type},odds:[{spread:9}],competitions:[{competitors:sides}]});
globalThis.fetch = async () => ({ok:true,json:async () => ({events:[
  event('1',{name:'STATUS_FINAL',state:'post',completed:true}),
  event('2',{name:'STATUS_POSTPONED',state:'post',completed:false})
]})});
const request = query => onRequestGet({request:new Request('https://chase.test/api/game-status?' + query)});
const valid = await request('sport=nfl');
const invalid = await request('sport=nba&date=2026-02-30');
globalThis.fetch = async () => ({ok:false, status:503});
console.log(JSON.stringify([valid,invalid,await request('sport=nfl')]));
"""
        process = subprocess.run(["node", "--input-type=module", "-e", source + harness],
                                 text=True, capture_output=True, check=True)
        valid, invalid, outage = json.loads(process.stdout)
        self.assertEqual(valid, {"status": 200, "body": {"games": [
            {"id": "1", "state": "final", "away": {"score": 0, "record": "3-5"},
             "home": {"score": 24, "record": None}},
            {"id": "2", "state": "postponed", "away": {"score": None, "record": "3-5"},
             "home": {"score": None, "record": None}},
        ]}})
        self.assertEqual(invalid, {"status": 400, "body": {"error": "invalid_date"}})
        self.assertEqual(outage, {"status": 200, "body": {"games": [], "status": "unavailable"}})
