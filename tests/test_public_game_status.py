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
        source = source.replace("'../_shared/market-lines.js'",
                                repr((ROOT / "functions/_shared/market-lines.js").as_uri()))
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
const nbaEvent = (id, date) => ({
  id, date, odds: [{spread: 9}], status: {type: {state: 'pre'}},
  competitions: [{venue: {fullName: 'Example Arena'}, competitors: [
    {...sides[0], team: {abbreviation: 'LAL', displayName: 'Los Angeles Lakers'}},
    {...sides[1], team: {abbreviation: 'ATL', displayName: 'Atlanta Hawks'}}
  ]}]
});
globalThis.fetch = async () => ({ok:true,json:async () => ({events:[
  nbaEvent('3', '2026-11-10T00:00Z'), nbaEvent('4', '2026-11-10T12:00Z')
]})});
const tonight = await request('sport=nba&fixtures=1&date=2026-11-09');
globalThis.fetch = async () => ({ok:false, status:503});
console.log(JSON.stringify([valid,invalid,tonight,await request('sport=nfl')]));
"""
        process = subprocess.run(["node", "--input-type=module", "-e", source + harness],
                                 text=True, capture_output=True, check=True)
        valid, invalid, tonight, outage = json.loads(process.stdout)
        self.assertEqual(valid, {"status": 200, "body": {"games": [
            {"id": "1", "state": "final", "away": {"score": 0, "record": "3-5"},
             "home": {"score": 24, "record": None}},
            {"id": "2", "state": "postponed", "away": {"score": None, "record": "3-5"},
             "home": {"score": None, "record": None}},
        ]}})
        self.assertEqual(invalid, {"status": 400, "body": {"error": "invalid_date"}})
        self.assertEqual(tonight, {"status": 200, "body": {"games": [{
            "id": "3", "kickoff_utc": "2026-11-10T00:00:00.000Z", "game_state": "scheduled",
            "away": "LAL", "home": "ATL", "away_name": "Los Angeles Lakers", "home_name": "Atlanta Hawks",
            "away_score": None, "home_score": None, "away_record": "3-5", "home_record": None,
            "venue": "Example Arena", "venue_city": None, "broadcast": None, "neutral": False,
        }]}})
        self.assertEqual(outage, {"status": 200, "body": {"games": [], "status": "unavailable"}})

    def test_cfb_week_includes_finals_with_no_market_line(self):
        source = (ROOT / "functions/api/game-status.js").read_text(encoding="utf-8")
        source = source.replace("import { json } from '../_shared/http.js';",
                                "const json = (body, status = 200) => ({body, status});")
        source = source.replace("'../_shared/market-lines.js'",
                                repr((ROOT / "functions/_shared/market-lines.js").as_uri()))
        harness = """
const calls = [];
globalThis.fetch = async url => {
  calls.push(url);
  return {ok:true, headers:new Headers({age:'5'}), json:async()=>({events:[{
    id:'401858526', date:'2026-11-14T17:00Z',
    status:{type:{name:'STATUS_FINAL', state:'post', completed:true}},
    competitions:[{competitors:[
      {homeAway:'away',score:'25',team:{abbreviation:'DUKE', displayName:'Duke Blue Devils', location:'Duke'}},
      {homeAway:'home',score:'36',team:{abbreviation:'MIA', displayName:'Miami Hurricanes', location:'Miami'}}
    ]}]
  }]})};
};
const request = query => onRequestGet({request:new Request('https://chase.test/api/game-status?' + query)});
const invalid = await request('sport=cfb&season=2026&week=0');
const valid = await request('sport=cfb&season=2026&week=11');
console.log(JSON.stringify({invalid, valid, calls}));
"""
        process = subprocess.run(["node", "--input-type=module", "-e", source + harness],
                                 text=True, capture_output=True, check=True)
        result = json.loads(process.stdout)
        self.assertEqual(result["invalid"]["status"], 400)
        self.assertEqual(len(result["calls"]), 1)
        self.assertIn("seasontype=2&week=11&dates=2026", result["calls"][0])
        payload = result["valid"]["body"]
        self.assertRegex(payload["observed_at_utc"], r"^\d{4}-\d{2}-\d{2}T.*Z$")
        self.assertEqual(payload["games"], [{
            "id": "401858526", "state": "final", "kickoff_utc": "2026-11-14T17:00Z", "lines": None,
            "away": {"score": 25, "record": None, "abbr": "DUKE", "name": "Duke Blue Devils", "location": "Duke"},
            "home": {"score": 36, "record": None, "abbr": "MIA", "name": "Miami Hurricanes", "location": "Miami"},
        }])
