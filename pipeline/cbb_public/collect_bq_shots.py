"""Collect public Basketball Quant shots in indexed home-team partitions.

The public team chart itself filters by home_team_id / away_team_id. Partitioning
by scheduled home team avoids the prior-season unfiltered query timeout and
collects both teams' shots exactly once per home partition. No login is used.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Event
import argparse,gzip,json,time,hashlib
from collect_cbb_sources import public_bq_client,get_json,save_json,save_shots,utc

FIELDS='source,season,game_id,game_date,season_type,team_id,home_team_id,away_team_id,athlete_id_1,coordinate_x,coordinate_y,scoring_play,score_value,points_attempted,type_text,period_number,time,shot_zone,shot_seq'
ORDER='game_date.asc,game_id.asc,source.asc,shot_seq.asc,period_number.asc,time.asc,team_id.asc,athlete_id_1.asc,coordinate_x.asc,coordinate_y.asc'

def main():
    p=argparse.ArgumentParser();p.add_argument('--out',type=Path,default=Path(__file__).resolve().parent);p.add_argument('--seasons',type=int,nargs='+',default=[2027,2026]);p.add_argument('--workers',type=int,default=2);a=p.parse_args()
    out=a.out.resolve();base,auth=public_bq_client();stop=Event();jobs=[]
    priority_names=['Duke','Kansas','Kentucky','Michigan St.','Arizona','Purdue']
    for season in a.seasons:
        teams=json.loads((out/f'data/bq-mbb_team_seasons-{season}.json').read_text(encoding='utf-8'))
        ids={int(t['team_id']) for t in teams}
        schedule=json.loads((out/f'data/bq-mbb_sched-{season}.json').read_text(encoding='utf-8'))
        homes={int(g['home_id']) for g in schedule if g.get('home_id') is not None and (g.get('home_id') in ids or g.get('away_id') in ids)}
        names={int(t['team_id']):t.get('torvik_team_name') or str(t['team_id']) for t in teams}
        sort=lambda tid:(priority_names.index(names[tid]) if names.get(tid) in priority_names else 999,tid)
        jobs.extend((season,tid,names.get(tid,str(tid))) for tid in sorted(homes,key=sort))
    prior_path=out/'bq-shot-partition-manifest.json'
    old=json.loads(prior_path.read_text(encoding='utf-8')) if prior_path.exists() else {'resources':[]}
    cached={r['file']:r for r in old.get('resources',[]) if r.get('file') and not r.get('error')}
    results=[];start=utc()
    def collect(job):
        season,tid,name=job
        target=out/f'data/bq-shots/{season}/home-{tid}.ndjson.gz';rel=str(target.relative_to(out))
        meta_path=target.with_suffix('.meta.json')
        if target.exists() and meta_path.exists():return json.loads(meta_path.read_text(encoding='utf-8'))
        if stop.is_set():return {'season_ending_year':season,'home_team_id':tid,'error':'Collection stopped after rate/access limit'}
        rows=[];pages=[];offset=0
        while True:
            if stop.is_set():raise RuntimeError('Stopped after rate/access limit')
            params={'select':FIELDS,'season':'eq.'+str(season),'home_team_id':'eq.'+str(tid),'order':ORDER,'limit':1000,'offset':offset}
            try:data,meta=get_json(base+'/mbb_shots_unified',params,{**auth,'Range':f'{offset}-{offset+999}'})
            except Exception as e:
                if 'Rate limited' in str(e) or 'Access required' in str(e):stop.set()
                raise
            if not isinstance(data,list):raise RuntimeError('Expected public shot array')
            if any(r.get('season')!=season or r.get('home_team_id')!=tid for r in data):raise RuntimeError('Partition scope mismatch')
            rows.extend(data);pages.append(meta)
            if len(data)<1000:break
            offset+=1000;time.sleep(.25)
        save_shots(target,rows)
        result={'source':'Basketball Quant','resource':'public shot events','season_ending_year':season,'home_team_id':tid,'home_team':name,'rows':len(rows),'file':rel,'requests':pages,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
        save_json(meta_path,result)
        time.sleep(.2)
        return result
    def checkpoint():
        save_json(prior_path,{'started_utc':start,'updated_utc':utc(),'scope':'Scheduled games involving the season D-I team cohort; both teams’ shots; public anonymous access.','expected_partitions':len(jobs),'completed_partitions':sum('error' not in r for r in results),'rows':sum(r.get('rows',0) for r in results),'resources':results})
    with ThreadPoolExecutor(max_workers=min(2,max(1,a.workers))) as pool:
        futures={pool.submit(collect,j):j for j in jobs}
        for future in as_completed(futures):
            j=futures[future]
            try:r=future.result()
            except Exception as e:r={'source':'Basketball Quant','resource':'public shot events','season_ending_year':j[0],'home_team_id':j[1],'home_team':j[2],'error':str(e)}
            results.append(r)
            if len(results)%10==0 or j[2] in priority_names or 'error' in r:
                checkpoint();print(f'Partitions {len(results)}/{len(jobs)}; shots {sum(x.get("rows",0) for x in results)}; last {j[0]} {j[2]} '+('ERROR '+r['error'] if 'error' in r else str(r['rows'])),flush=True)
    checkpoint();print(json.dumps({'partitions':len(results),'errors':sum('error' in r for r in results),'rows':sum(r.get('rows',0) for r in results),'manifest':str(prior_path)},indent=2),flush=True)

if __name__=='__main__':main()
