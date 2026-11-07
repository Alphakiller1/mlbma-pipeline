"""Season selection and public-source failure isolation for basketball evidence."""
import copy
import json
import subprocess
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import publish_public_nba_slate as pub


def evidence():
    year = datetime.now(timezone.utc).year + (datetime.now(timezone.utc).month >= 10)
    return {'schema':'chase-basketball-evidence/1','sport':'nba',
            'generated_at_utc':datetime.now(timezone.utc).isoformat(),
            'seasons':{str(y):{'season':y,'teams':{t:{'form':{'season':y}} for t in pub.TEAMS}}
                       for y in (year-1,year)}}


class BasketballEvidenceTests(unittest.TestCase):
    def test_complete_season_cohorts_and_nested_private_fields(self):
        good = evidence()
        now = datetime.now(timezone.utc)
        self.assertEqual(pub.validate_evidence(good,now),[])
        bad = copy.deepcopy(good)
        year = next(iter(bad['seasons']))
        bad['seasons'][year]['teams']['ATL']['form']['season'] = 1900
        self.assertTrue(any('wrong season' in p for p in pub.validate_evidence(bad,now)))
        bad = copy.deepcopy(good)
        bad['seasons'][year]['teams']['ATL']['form']['win_probability'] = .8
        self.assertTrue(pub.validate_evidence(bad,now))
        bad = copy.deepcopy(good)
        del bad['seasons'][year]['teams']['ATL']
        self.assertTrue(any('incomplete' in p for p in pub.validate_evidence(bad,now)))

    def test_adapter_keeps_selected_year_roster_and_rates_separate(self):
        script = r'''
const fs=require('fs'),vm=require('vm');
const w={};vm.runInNewContext(fs.readFileSync('dashboard/sports/nba.js','utf8'),{window:w});
const game={season:2027,away:'BOS',home:'CHA',away_injuries:{players:[{player:'Current only'}]},__nbaEvidence:{seasons:{}}};
for(const year of [2026,2027])game.__nbaEvidence.seasons[year]={player_baselines:{},teams:{BOS:{form:{games:year===2026?82:8,rates:{off_rtg:{value:year}}},players:[{player_name:'Roster '+year}],profile:{basis:String(year)},measured_coverage:{season:year},databallr:{season:year}}}};
w.ChaseSportNBA.selectSeason(game,2026);
const prior=[game.away_rates.off_rtg.value,game.away_rotation[0].player_name,game.away_measured_coverage.season];
w.ChaseSportNBA.selectSeason(game,2027);
console.log(JSON.stringify({prior,current:game.away_rates.off_rtg.value,injuries:game.away_injuries.players[0].player,missing:w.ChaseSportNBA.selectSeason(game,1900)}));
'''
        result=json.loads(subprocess.check_output(['node','-e',script],cwd=ROOT,text=True))
        self.assertEqual(result['prior'],[2026,'Roster 2026',2026])
        self.assertEqual(result['current'],2027)
        self.assertEqual(result['injuries'],'Current only')
        self.assertFalse(result['missing'])
