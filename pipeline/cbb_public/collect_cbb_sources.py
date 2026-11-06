"""Read-only CBB source collector. Writes local files; never writes to either source or Chase.

Basketball Quant: public anonymous client, the same table families used by the public UI.
CBB Analytics: public competition metadata, published shortcut teams and the six visible demo charts.
No account cookies, private keys, login bypass, paid endpoints, or production changes.
"""
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urljoin
from concurrent.futures import ThreadPoolExecutor, as_completed
import argparse, base64, gzip, hashlib, json, re, time
import requests

HEAD={'User-Agent':'ChaseAnalyticsResearch/0.1 (read-only public CBB statistics review)'}

def utc(): return datetime.now(timezone.utc).isoformat()

def get_json(url, params=None, headers=None):
    r=requests.get(url,params=params,headers={**HEAD,**(headers or {})},timeout=45)
    if r.status_code in (401,403):
        raise RuntimeError(f'Access required: HTTP {r.status_code} at {url}; no bypass attempted')
    if r.status_code==429:
        raise RuntimeError(f'Rate limited at {url}; collection stopped for this resource')
    r.raise_for_status()
    data=r.json()
    if isinstance(data,str):data=json.loads(data)
    return data,{'url':r.url,'retrieved_utc':utc(),'http_status':r.status_code,'content_range':r.headers.get('Content-Range')}

def public_bq_client():
    page=requests.get('https://basketballquant.com/',headers=HEAD,timeout=35)
    page.raise_for_status()
    srcs=re.findall(r'<script[^>]+src=["\x27]([^"\x27]+)',page.text)
    for src in srcs:
        if not src.endswith('.js'):continue
        entry=requests.get(urljoin(page.url,src),headers=HEAD,timeout=35)
        entry.raise_for_status()
        for name in sorted(set(re.findall(r'supabase-[A-Za-z0-9_-]+\.js',entry.text))):
            chunk=requests.get(urljoin(entry.url,name),headers=HEAD,timeout=35)
            chunk.raise_for_status()
            project=re.search(r'https://[a-z0-9]+\.supabase\.co',chunk.text)
            token=re.search(r'eyJ[A-Za-z0-9_.-]+',chunk.text)
            if not project or not token:continue
            payload=json.loads(base64.urlsafe_b64decode(token[0].split('.')[1]+'==='))
            if payload.get('role')!='anon':raise RuntimeError('Refusing non-public client credential')
            return project[0]+'/rest/v1',{'apikey':token[0],'Authorization':'Bearer '+token[0]}
    raise RuntimeError('Public anonymous client configuration was not found in current site assets')

def save_json(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')

def save_shots(path,rows):
    path.parent.mkdir(parents=True,exist_ok=True)
    with gzip.open(path,'wt',encoding='utf-8') as f:
        for row in rows:f.write(json.dumps(row,ensure_ascii=False,separators=(',',':'))+'\n')

def collect_table(base,auth,out,table,season,select='*',extra=None):
    label=f'bq-{table}-{season or "all"}'
    target=out/'data'/(label+'.json')
    if target.exists():
        d=json.loads(target.read_text(encoding='utf-8'))
        return {'source':'Basketball Quant','resource':table,'season_ending_year':season,'rows':len(d),'file':str(target.relative_to(out)),'cached':True}
    params={'select':select,'limit':1000}
    if season:params['Year' if table=='basketball_players' else 'season']='eq.'+str(season)
    orders={'mbb_team_seasons':'team_id.asc','mbb_team_ratings':'team_id.asc','basketball_players':'id.asc','mbb_sched':'game_date.asc,game_id.asc','mbb_institution_crosswalk':'espn_team_id.asc','mbb_league_zone_avgs_mv':'zone.asc'}
    if table in orders:params['order']=orders[table]
    params.update(extra or {})
    rows=[];pages=[];offset=0
    while True:
        page,meta=get_json(base+'/'+table,{**params,'offset':offset},{**auth,'Range':f'{offset}-{offset+999}'})
        if not isinstance(page,list):raise RuntimeError(f'Unexpected payload for {table}')
        rows.extend(page);pages.append(meta)
        if len(page)<1000:break
        offset+=1000;time.sleep(.25)
    save_json(target,rows)
    result={'source':'Basketball Quant','resource':table,'season_ending_year':season,'rows':len(rows),'file':str(target.relative_to(out)),'requests':pages,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
    print(f'Collected {label}: {len(rows)} rows',flush=True)
    return result

def collect_cbb(out,seasons):
    api='https://api.cbbanalytics.com/api/gs/'
    comps,cm=get_json(api+'competitions')
    options,om=get_json(api+'shotcharts-top-options/ptgc/team/')
    comps=[c for c in comps if c.get('gender')=='MALE' and c.get('endYear') in seasons]
    save_json(out/'data/cbb-competitions.json',comps)
    selected=[];results=[{'source':'CBB Analytics','resource':'competitions','rows':len(comps),'requests':[cm]},{'source':'CBB Analytics','resource':'public default chart options','rows':0,'requests':[om]}]
    for comp in comps:
        year=comp['endYear'];cid=comp['competitionId']
        teams=[t for t in options if t.get('competitionId')==cid and t.get('divisionId')==1]
        # These six IDs were observed in the public tool's rendered links. Its
        # six demo charts remained visible after selecting each requested season.
        visible_demo=[(103765,'Kentucky','Wildcats'),(103549,'Duke','Blue Devils'),(103903,'Michigan St.','Spartans'),(103296,'Arizona','Wildcats'),(103757,'Kansas','Jayhawks'),(103257,'Purdue','Boilermakers')]
        by_id={t['teamId']:t for t in teams}
        for tid,market,name in visible_demo:
            by_id.setdefault(tid,{'competitionId':cid,'divisionId':1,'teamId':tid,'teamMarket':market,'teamName':name,'discovery':'visible public demo chart'})
        teams=list(by_id.values())
        selected.extend(teams)
        data,meta=get_json(api+'lg-zones',{'competitionId':cid,'divisionId':1})
        file=out/'data'/f'cbb-league-zones-{year}.json';save_json(file,data)
        results.append({'source':'CBB Analytics','resource':'D-I league zones','season_ending_year':year,'rows':len(data),'file':str(file.relative_to(out)),'requests':[meta]})
        for team in teams:
            tid=team['teamId']
            for role in ['offense','defense']:
                target=out/'data'/f'cbb-shots-{year}-{tid}-{role}.ndjson.gz'
                if target.exists():
                    with gzip.open(target,'rt',encoding='utf-8') as f:count=sum(1 for _ in f)
                    results.append({'source':'CBB Analytics','resource':'default-team shots','season_ending_year':year,'team_id':tid,'team':team['teamMarket']+' '+team['teamName'],'role':role,'rows':count,'file':str(target.relative_to(out)),'cached':True})
                    continue
                params={'competitionId':cid,'teamId':tid}
                if role=='defense':params['isOffense']='false'
                try:
                    data,meta=get_json(api+'pbp-shots',params)
                    if not isinstance(data,list):raise RuntimeError('Expected a shot array')
                    save_shots(target,data)
                    results.append({'source':'CBB Analytics','resource':'default-team shots','season_ending_year':year,'team_id':tid,'team':team['teamMarket']+' '+team['teamName'],'role':role,'rows':len(data),'file':str(target.relative_to(out)),'requests':[meta]})
                    print(f'Collected CBB {year} {team["teamMarket"]} {role}: {len(data)} shots',flush=True)
                except Exception as e:
                    results.append({'source':'CBB Analytics','resource':'default-team shots','season_ending_year':year,'team_id':tid,'role':role,'error':str(e)})
                time.sleep(.25)
    save_json(out/'data/cbb-public-default-teams.json',selected)
    results[1]['rows']=len(selected)
    return results

def main():
    p=argparse.ArgumentParser();p.add_argument('--out',type=Path,default=Path(__file__).resolve().parent);p.add_argument('--seasons',type=int,nargs='+',default=[2027,2026]);a=p.parse_args()
    out=a.out.resolve();out.mkdir(parents=True,exist_ok=True);started=utc()
    base,auth=public_bq_client()
    player_cols=['id','pid','athlete_id','Year','Name','Team','Team_name','Conf','Role','Player','Ht','G','Min_pct','Usg','ORtg','DRtg','BPM','OBPM','DBPM','eFG','TS','OR_pct','DR_pct','Ast_per','TO','ATO','Blk','Stl','FTR','FC/40','Ast','Reb','Pts','FGM','FGA','2PM','2PA','2PP','3PM','3PA','3PP','3PR','FTM','FTA','FTP','Close2_M','Close2_A','Far2_M','Far2_A','ptir','edmr','updated_at']
    schedule_cols=['game_id','season','season_type','game_date','game_date_time','date','neutral_site','conference_competition','play_by_play_available','venue_full_name','venue_address_city','venue_address_state','venue_indoor','status_type_name','status_type_state','status_type_completed','status_type_detail','home_id','away_id','home_display_name','away_display_name','home_score','away_score','home_conference_id','away_conference_id','away_non_div1_team','broadcast_name','updated_at']
    xwalk_cols=['espn_team_id','barttorvik_team_name','display_name','short_display_name','abbreviation','logo_url','primary_color','secondary_color','is_alias']
    jobs=[]
    for season in a.seasons:
        for table,select,extra in [('mbb_team_seasons','*',None),('mbb_team_ratings','*',{'model_version':'eq.bqr_v1'}),('basketball_players',','.join('"'+v+'"' for v in player_cols),None),('mbb_sched',','.join(schedule_cols),None),('mbb_league_zone_avgs_mv','*',None)]:
            jobs.append((table,season,select,extra))
    jobs.append(('mbb_institution_crosswalk',None,','.join(xwalk_cols),None))
    results=[]
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures={pool.submit(collect_table,base,auth,out,*job):job for job in jobs}
        for future in as_completed(futures):
            job=futures[future]
            try:results.append(future.result())
            except Exception as e:results.append({'source':'Basketball Quant','resource':job[0],'season_ending_year':job[1],'error':str(e)});print(f'Unavailable {job[0]} {job[1]}: {e}',flush=True)
    results.extend(collect_cbb(out,a.seasons))
    prior_path=out/'collection-manifest.json'
    if prior_path.exists():
        previous=json.loads(prior_path.read_text(encoding='utf-8'))
        by_file={r.get('file'):r for r in previous.get('resources',[]) if r.get('file')}
        results=[{**by_file.get(r.get('file'),{}),**r} for r in results]
    manifest={'started_utc':started,'completed_utc':utc(),'scope':'Men’s Division I; 2026–27 and 2025–26','production_changes':False,'access':'Public anonymous data only. CBB Analytics visible demo and published shortcut chart teams; team search remains account-gated.','resources':results}
    save_json(out/'collection-manifest.json',manifest)
    print(json.dumps({'resources':len(results),'errors':sum('error' in r for r in results),'manifest':str(out/'collection-manifest.json')},indent=2),flush=True)

if __name__=='__main__':main()
