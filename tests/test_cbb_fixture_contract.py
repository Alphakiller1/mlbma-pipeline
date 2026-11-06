"""Exercise the server allow-list, including adversarial upstream extras."""
from pathlib import Path
import json
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]

class CbbFixtureContractTests(unittest.TestCase):
    def test_fixture_response_drops_upstream_markets_and_model_fields(self):
        source = (ROOT / 'functions/api/cbb-fixtures.js').read_text(encoding='utf-8')
        source = source.replace("import { json } from '../_shared/http.js';", "const json=(body,status=200)=>({body,status});")
        harness = source + '''
const event={id:'123',date:'2026-11-06T22:00Z',odds:[{spread:4}],win_probability:.7,
  status:{type:{state:'in',name:'STATUS_IN_PROGRESS'},private:'hidden'},competitions:[{
    neutralSite:true,venue:{fullName:'Arena',address:{city:'City',private:'hidden'}},
    odds:[{overUnder:150}],competitors:[{homeAway:'home',score:'19',team:{id:'150',displayName:'Duke',ranking:1},
      records:[{type:'total',summary:'2-0',againstTheSpread:'1-1'},{type:'ats',summary:'1-1'}]},
      {homeAway:'away',score:'18',team:{id:'127',displayName:'Michigan State'}}]}]};
globalThis.fetch=async()=>({ok:true,json:async()=>({events:[event],odds:['hidden']})});
const result=await onRequestGet({request:new Request('https://chase.test/api/cbb-fixtures?date=20261106')});
const invalid=await onRequestGet({request:new Request('https://chase.test/api/cbb-fixtures?date=20260230')});
console.log(JSON.stringify({result,invalid}));
'''
        proc = subprocess.run(['node','--input-type=module','-e',harness], text=True, capture_output=True, check=True)
        result = json.loads(proc.stdout)
        self.assertEqual(result['result']['status'],200)
        self.assertEqual(result['invalid']['status'],400)
        body = result['result']['body']
        self.assertEqual(body['events'][0]['competitions'][0]['competitors'][0]['records'],[{'type':'total','summary':'2-0'}])
        for key in ['odds','spread','win_probability','ranking','private','againstTheSpread']:
            self.assertNotIn('"'+key+'"',json.dumps(body))

if __name__ == '__main__': unittest.main()
