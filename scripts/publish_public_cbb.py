"""Validate and port a cbb-model factual export. Raw inputs and forecasts are refused."""
from pathlib import Path
from datetime import datetime
import argparse,json,math,sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import validate_public_fields as guard

def validate_context(value,old=None):
    if not isinstance(value.get('identity',{}).get('name'),str):raise ValueError('Missing team identity')
    for k,n in value['rates'].items():
        if n is not None and (not isinstance(n,(int,float)) or not math.isfinite(n) or n<0):raise ValueError('Invalid CBB rate: '+k)
        if n is not None and k.startswith('efg_') and n>1.5:raise ValueError('eFG uses a fraction, not a 0–100 percentage')
        if n is not None and k.startswith(('fg2_pct','fg3_pct')) and n>1:raise ValueError('FG percentage uses a fraction')
    if (box:=value.get('official_box')):
        if value['season']!=2027 or box['games']<1:raise ValueError('Invalid supplemental box score sample')
        if box.get('rates') and (set(box['rates'])!=set(value['rates']) or box['rates']['games_all']!=box['games']):
            raise ValueError('Supplemental team-rate contract mismatch')
        for n in (box.get('pace') or {}).values():
            if not 20<=n<=120:raise ValueError('Box-estimated pace outside range')
    for family in value['shots'].values():
        for p in family.values():
            if {z['id'] for z in p['zones']}!={'atr2','paint2','mid2','c3','atb3','heave3'}:raise ValueError('Incomplete zone schema')
            if sum(z['attempts'] for z in p['zones'])!=p['totals']['attempts']:raise ValueError('Shot count reconciliation failed')
            for z in p['zones']:
                if not 0<=z['made']<=z['attempts']:raise ValueError('Invalid zone counts')
                expected=z['made']/z['attempts'] if z['attempts'] else None
                if expected is None and z['fg_pct'] is not None:raise ValueError('Zero-attempt zone must be null')
                if expected is not None and abs(z['fg_pct']-expected)>1e-9:raise ValueError('Zone FG% does not match its counts')
    tactics=value.get('observed_tactics')
    if tactics:
        if tactics.get('season')!=value['season']:raise ValueError('Tactical season mismatch')
        for family in ('personnel','situations','restart_contexts'):
            for row in tactics.get(family,[]):
                n=row['possessions'];points=row['points']
                if n<0 or points<0 or (n and abs(row['ppp']-points/n)>1e-9):raise ValueError('Invalid tactical efficiency')
                if not n and row['ppp'] is not None:raise ValueError('Zero tactical sample must be null')
                if row.get('ppp_grade') and not row['sample_qualified']:raise ValueError('Thin tactical sample graded')
        for row in tactics['position_size']:
            if row['players']<1 or not 55<=row['mean_height_inches']<=100:raise ValueError('Invalid roster height')
    if old:
        if (value['rates'].get('games_all') or 0)<(old['rates'].get('games_all') or 0):raise ValueError('Team game count regressed; existing publication retained')
        if old.get('players') and not value.get('players'):raise ValueError('Player coverage regressed; existing publication retained')
        prior=old.get('observed_tactics') or {}
        if tactics and prior.get('data_through') and (tactics.get('data_through') or '')<prior['data_through']:
            raise ValueError('Tactical evidence regressed; existing publication retained')

def publish(source):
    source=Path(source).resolve();manifest=json.loads((source/'manifest.json').read_text(encoding='utf-8'))
    if manifest.get('sport')!='cbb' or set(manifest.get('seasons',[]))!={2026,2027}:raise ValueError('Wrong competition or seasons')
    spec=json.loads(guard.CLASSIFICATION.read_text(encoding='utf-8'));restricted=json.loads(guard.RESTRICTED.read_text(encoding='utf-8'))
    files=sorted(source.rglob('*.json'));staged=[]
    for file in files:
        value=json.loads(file.read_text(encoding='utf-8'));issues=guard.classify_artifact(spec,value,str(file.relative_to(source)))
        def check(v):
            if isinstance(v,dict):
                for k,x in v.items():
                    if k in restricted['forbidden_keys']:raise ValueError('Restricted CBB field: '+k)
                    check(x)
            elif isinstance(v,list):
                for x in v:check(x)
        check(value)
        if issues:raise ValueError('\n'.join(issues[:40]))
        if file.parent.name=='teams':
            old=ROOT/'data/public/cbb'/file.relative_to(source)
            previous=json.loads(old.read_text(encoding='utf-8')) if old.is_file() else None
            validate_context(value,previous)
            if previous and value['season']<manifest['season']:
                before=previous.get('observed_tactics') or {}
                after=value.get('observed_tactics') or {}
                if before and after and previous=={**value,'observed_tactics':{
                    **after,'retrieved_at_utc':before.get('retrieved_at_utc')}}:
                    continue
        staged.append((file.relative_to(source),value))
    for year in [2026,2027]:
        if len(list((source/f'{year}/teams').glob('*.json')))!=365:raise ValueError('Incomplete CBB cohort; retaining existing publication')
    target=ROOT/'data/public/cbb';old=target/'manifest.json'
    if old.exists():
        previous_cutoff=json.loads(old.read_text(encoding='utf-8')).get('data_through_utc')
        cutoff=manifest.get('data_through_utc')
        if previous_cutoff and (not cutoff or datetime.fromisoformat(previous_cutoff)>datetime.fromisoformat(cutoff)):
            raise ValueError('Older evidence would replace newer evidence')
    # Validate every file first; each destination replacement is atomic.
    for rel,value in staged:
        dest=target/rel;dest.parent.mkdir(parents=True,exist_ok=True);temp=dest.with_suffix('.json.tmp')
        temp.write_text(json.dumps(value,ensure_ascii=False,allow_nan=False,separators=(',',':')),encoding='utf-8');temp.replace(dest)
    print(f'Published {len(staged)} factual CBB files; no model outputs.')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);publish(p.parse_args().source)
