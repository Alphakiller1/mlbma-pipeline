"""The card line endpoint passes posted spreads and totals only."""
from pathlib import Path
import json
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
SHARED = ROOT / 'functions/_shared/market-lines.js'
LINK = {'href': 'https://sportsbook.draftkings.com/x', 'text': 'Bet'}


def odds(provider, spread, total, ml='-148'):
    return {'provider': {'name': provider}, 'details': 'X', 'overUnder': total, 'spread': spread,
            'moneyline': {'home': {'close': {'odds': ml, 'link': LINK}}},
            'pointSpread': {'home': {'close': {'line': str(spread), 'odds': '-110', 'link': LINK},
                                     'open': {'line': str(spread - 0.5)}}},
            'total': {'over': {'close': {'line': 'o' + str(total), 'odds': '-110', 'link': LINK},
                               'open': {'line': 'o' + str(total + 1)}}}}


def event(eid, away, home, quotes):
    return {'id': eid, 'date': '2026-11-13T01:15Z', 'win_probability': 0.6,
            'competitions': [{'odds': quotes, 'competitors': [
                {'homeAway': 'home', 'team': {'abbreviation': home, 'displayName': home + ' Club', 'location': home, 'ranking': 3}},
                {'homeAway': 'away', 'team': {'abbreviation': away, 'displayName': away + ' Club', 'location': away}}]}]}


class MarketLinesContractTests(unittest.TestCase):
    def run_handler(self, payload, *queries):
        source = (ROOT / 'functions/api/market-lines.js').read_text(encoding='utf-8')
        source = source.replace("import { json } from '../_shared/http.js';", "const json=(body,status=200)=>({body,status});")
        source = source.replace("'../_shared/market-lines.js'", repr(SHARED.as_uri()))
        harness = source + '\nconst calls=[];\nglobalThis.fetch=async(url)=>{calls.push(url);return {ok:true,json:async()=>(' + \
            json.dumps(payload) + ')};};\nconst out=[];\nfor (const q of ' + json.dumps(list(queries)) + \
            ') out.push(await onRequestGet({request:new Request("https://chase.test/api/market-lines?"+q)}));\n' + \
            'console.log(JSON.stringify({out,calls}));\n'
        proc = subprocess.run(['node', '--input-type=module', '-e', harness], text=True, capture_output=True, check=True)
        return json.loads(proc.stdout)

    def test_posted_numbers_only_and_draftkings_first(self):
        payload = {'events': [event('401', 'WSH', 'NYG', [odds('ESPN BET', -3.0, 41.5), odds('DraftKings', -2.5, 40.5)]),
                              event('402', 'NE', 'DET', [odds('DraftKings', -2.5, 151.5)]),
                              event('403', 'KC', 'BUF', [])]}
        result = self.run_handler(payload, 'sport=nfl&dates=20261112,20261115,20261112')
        reply = result['out'][0]
        self.assertEqual(reply['status'], 200)
        self.assertEqual(len(result['calls']), 2, 'each distinct day is fetched once')
        games = {g['id']: g for g in reply['body']['games']}
        self.assertEqual(set(games), {'401', '402'}, 'a game with no posted line is left out')
        self.assertEqual(games['401']['lines'], {'provider': 'DraftKings', 'home_open': -3.0, 'home_current': -2.5,
                                                 'total_open': 41.5, 'total_current': 40.5})
        self.assertEqual(games['401']['away'], {'abbr': 'WSH', 'name': 'WSH Club', 'location': 'WSH'})
        self.assertIsNone(games['402']['lines']['total_current'], 'a basketball total is no football total')
        body = json.dumps(reply['body'])
        for key in ['odds', 'moneyline', 'link', 'href', 'win_probability', 'ranking', 'spread', 'details']:
            self.assertNotIn('"' + key + '"', body)

    def test_rejects_bad_requests(self):
        result = self.run_handler({'events': []}, 'sport=mlb&dates=20261112', 'sport=nfl&dates=20261131',
                                  'sport=nfl', 'sport=cfb&dates=' + ','.join('202611%02d' % d for d in range(1, 10)))
        self.assertEqual([r['status'] for r in result['out']], [400, 400, 400, 400])
        self.assertEqual(result['calls'], [])


if __name__ == '__main__':
    unittest.main()
