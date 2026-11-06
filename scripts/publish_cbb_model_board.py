"""Publish score estimates exclusively to the separate Model Center surface."""
from pathlib import Path
from datetime import date,datetime,timedelta,timezone
import argparse,json,math
ROOT=Path(__file__).resolve().parents[1]

def publish(source):
    source=Path(source);pred=json.loads((source/'predictions.json').read_text(encoding='utf-8'));model=json.loads((source/'model.json').read_text(encoding='utf-8'))
    if pred['as_of_date']!=model['as_of_date'] or model['training_through']>=pred['as_of_date']:raise ValueError('Model cutoff mismatch')
    raw=json.loads((ROOT/'data/public/cbb/slate.json').read_text(encoding='utf-8'));fixtures={g['id']:g for g in raw['games']}
    end=(date.fromisoformat(pred['as_of_date'])+timedelta(days=14)).isoformat();games=[]
    for p in pred['forecasts']:
        if not pred['as_of_date']<=p['game_date']<=end:continue
        g=fixtures.get(str(p['game_id']))
        if not g:continue
        if not all(math.isfinite(p[k]) and 0<p[k]<250 for k in ['away_points','home_points']):raise ValueError('Invalid score estimate')
        if abs((p['home_points']-p['away_points'])-p['home_margin'])>1e-7:raise ValueError('Margin sign mismatch')
        def name(side):
            f=ROOT/f'data/public/cbb/2027/teams/{g[side]}.json'
            return json.loads(f.read_text(encoding='utf-8'))['identity']['short_name']
        games.append({'id':g['id'],'slate_date':g['slate_date'],'kickoff_utc':g['kickoff_utc'],
            'away':name('away'),'home':name('home'),'away_name':g['away_name'],'home_name':g['home_name'],
            'away_logo':g['away_logo'],'home_logo':g['home_logo'],'away_color':g['away_color'],'home_color':g['home_color'],
            'away_record':g['away_record'],'home_record':g['home_record'],
            'projected_away':p['away_points'],'projected_home':p['home_points'],'projected_total':p['total_points'],
            'model_margin':p['home_margin'],'priced':False,'evidence':'Experimental score-based estimate; roster and availability adjustments are not included.'})
    value={'board':{'schema':'chase-board/1','sport':'cbb','generated_at_utc':datetime.now(timezone.utc).isoformat(),
           'data_through_utc':model['training_through']+'T23:59:59-05:00','as_of_date':pred['as_of_date'],
           'method':'chase-cbb-score-ridge-v1','method_note':'Experimental score-based estimates. Roster and availability adjustments are not included.',
           'may_bet':False,'games':games}}
    path=ROOT/'functions/api/model-center/cbb-board.json';path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,allow_nan=False,separators=(',',':')),encoding='utf-8')
    print(f'Published {len(games)} CBB score estimates to Model Center only.')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);publish(p.parse_args().source)
