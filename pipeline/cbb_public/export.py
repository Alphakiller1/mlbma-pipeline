"""Factual public projection. Model outputs never enter this directory."""
from __future__ import annotations
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
import gzip,json,math
from .data import ZONES,read,write,table

RATE_FIELDS=['games_all','efg_o_all','efg_d_all','tov_pct_o_all','tov_pct_d_all','orb_pct_all','drb_pct_all',
             'ftr_o_all','ftr_d_all','tpr_o_all','tpr_d_all','ppp_off_all','ppp_def_all','fg2_pct_o_all',
             'fg2_pct_d_all','fg3_pct_o_all','fg3_pct_d_all','ast_rate_o_all','ast_rate_d_all']
PLAYER_FIELDS=['id','pid','athlete_id','Name','Team','G','Min_pct','Usg','Pts','Reb','Ast','eFG','TS',
               'FGM','FGA','3PM','3PA','FTM','FTA','3PP','FTR','Ht']
FORBIDDEN={'predicted_score','predicted_margin','home_probability','home_win_probability','win_probability','confidence','pick','edge','odds','spread','moneyline','away_points','home_points','home_margin','total_points','power','rating'}

def assert_public(value):
    if isinstance(value,dict):
        for k,v in value.items():
            if k in FORBIDDEN:raise ValueError(f'Private field in public export: {k}')
            assert_public(v)
    elif isinstance(value,list):
        for v in value:assert_public(v)
    elif isinstance(value,float) and not math.isfinite(value):raise ValueError('Non-finite public value')

def profile(rows,league,schema,through,games):
    attempts=sum(r['attempts'] for r in rows);made=sum(r['made'] for r in rows)
    three=sum(r['made'] for r in rows if r['id'] in ['c3','atb3','heave3'])
    zones=[]
    for code,label in ZONES.items():
        r=next((r for r in rows if r['id']==code),{'attempts':0,'made':0});n=r['attempts'];m=r['made'];lg=league.get(code,{})
        fg=m/n if n else None;lgfg=lg['made']/lg['attempts'] if lg.get('attempts') else None
        zones.append({'id':code,'label':'Heaves' if schema=='cbb-analytics-zones6' and code=='heave3' else label,
                      'made':m,'attempts':n,'fg_pct':fg,'shot_share':n/attempts if attempts else None,
                      'league_fg_pct':lgfg,'delta_pp':100*(fg-lgfg) if fg is not None and lgfg is not None else None})
    return {'schema':schema,'zones':zones,'totals':{'made':made,'attempts':attempts,'efg_pct':(made+.5*three)/attempts if attempts else None,
            'games':games,'data_through':through},'source':'CBB Analytics' if schema=='cbb-analytics-zones6' else 'Chase zones from Basketball Quant shot coordinates'}

def export_public(snapshot,conn,out,as_of):
    out=Path(out); generated=datetime.now(timezone.utc).isoformat()
    cross=read(snapshot/'data/bq-mbb_institution_crosswalk-all.json');identity={}
    for r in cross:
        if r.get('espn_team_id') is None:continue
        tid=int(r['espn_team_id'])
        if tid not in identity or not r.get('is_alias'):identity[tid]=r
    all_context={};index={};schedules={};coverage=[]
    for year in (2026,2027):
        stats=table(snapshot,'mbb_team_seasons',year);cohort={r['team_id'] for r in stats};ratings={r['team_id']:r for r in table(snapshot,'mbb_team_ratings',year)}
        players=table(snapshot,'basketball_players',year);schedules[year]=table(snapshot,'mbb_sched',year)
        players_by_team=defaultdict(list)
        for p in players:players_by_team[p.get('Team')].append({k:p.get(k) for k in PLAYER_FIELDS})
        cbb_lg={r['zoneName']:{'made':r['fgm'],'attempts':r['fga']} for r in read(snapshot/f'data/cbb-league-zones-{year}.json') if r.get('zoneSchema')=='zones6' and r.get('divisionId')==1}
        lg=defaultdict(lambda:{'made':0,'attempts':0})
        aggregates={'offense':defaultdict(list),'defense':defaultdict(list)}
        for tid,z,n,m in conn.execute('SELECT team_id,zone,COUNT(*),SUM(made) FROM shots WHERE season=? AND zone IS NOT NULL GROUP BY team_id,zone',(year,)):
            aggregates['offense'][tid].append({'id':z,'attempts':n,'made':m})
            if tid in cohort:lg[z]['attempts']+=n;lg[z]['made']+=m
        defender='CASE WHEN team_id=home_id THEN away_id WHEN team_id=away_id THEN home_id END'
        for tid,z,n,m in conn.execute(f'SELECT {defender},zone,COUNT(*),SUM(made) FROM shots WHERE season=? AND zone IS NOT NULL GROUP BY 1,2',(year,)):
            aggregates['defense'][tid].append({'id':z,'attempts':n,'made':m})
        game_summaries={role:{tid:(n,through) for tid,n,through in conn.execute(f'SELECT {owner},COUNT(DISTINCT game_id),MAX(game_date) FROM shots WHERE season=? AND zone IS NOT NULL GROUP BY 1',(year,))} for role,owner in [('offense','team_id'),('defense',defender)]}
        for s in stats:
            tid=s['team_id'];ident=identity.get(tid,{})
            name=s.get('torvik_team_name') or ident.get('barttorvik_team_name')
            roster=players_by_team.get(name,[]);ident={'id':str(tid),'name':ident.get('display_name') or s.get('team') or name,
                'short_name':ident.get('short_display_name') or name,'abbr':ident.get('abbreviation') or str(tid),
                'logo':ident.get('logo_url') or f'https://a.espncdn.com/i/teamlogos/ncaa/500/{tid}.png',
                'color':'#'+str(ident.get('primary_color') or '9A6BFF').lstrip('#')}
            c={'identity':ident,'season':year,'rates':{k:s.get(k) for k in RATE_FIELDS},'players':roster,
               'source':'Basketball Quant','data_through':max((g['game_date'] for g in schedules[year] if g.get('status_type_name')=='STATUS_FINAL' and tid in [g.get('home_id'),g.get('away_id')] and g['game_date']<=as_of),default=None),
               'record':f'{int(s.get("wins") or 0)}–{int(s.get("losses") or 0)}','shots':{}}
            own={}
            for role in ('offense','defense'):
                rows=aggregates[role][tid];games,through=game_summaries[role].get(tid,(0,None))
                own[role]=profile(rows,lg,'chase-coordinates-v1',through,games)
            c['shots']['coordinates']=own
            logs=[]
            for g in schedules[year]:
                if tid not in (g.get('home_id'),g.get('away_id')):continue
                side='home' if g['home_id']==tid else 'away';opp='away' if side=='home' else 'home'
                logs.append({'id':str(g['game_id']),'date':g['game_date'],'opponent_id':str(g[opp+'_id']),
                             'opponent':g.get(opp+'_display_name'),'site':'Neutral' if g.get('neutral_site') else side.title(),
                             'state':g.get('status_type_state'),'points':g.get(side+'_score') if g.get('status_type_name')=='STATUS_FINAL' else None,
                             'opponent_points':g.get(opp+'_score') if g.get('status_type_name')=='STATUS_FINAL' else None})
            c['games']=sorted(logs,key=lambda g:(g['date'],g['id']))
            all_context[(year,tid)]=c
        # Published shortcut metadata maps the provider IDs to the validated institution IDs.
        reference={103765:96,103549:150,103903:127,103296:12,103757:2305,103257:2509}
        for file in (snapshot/'data').glob(f'cbb-shots-{year}-*-offense.ndjson.gz'):
            cid=int(file.name.split('-')[3]);tid=reference.get(cid)
            # Unmapped public shortcut profiles are retained in raw data, never name-guessed into production.
            if tid is None or (year,tid) not in all_context:continue
            cbb={}
            for role in ('offense','defense'):
                f=snapshot/f'data/cbb-shots-{year}-{cid}-{role}.ndjson.gz'
                with gzip.open(f,'rt',encoding='utf-8') as source:shots=[json.loads(line) for line in source]
                rows=[{'id':z,'attempts':sum(s.get('zones6')==z for s in shots),'made':sum(s.get('zones6')==z and s.get('success') is True for s in shots)} for z in ZONES]
                cbb[role]=profile(rows,cbb_lg,'cbb-analytics-zones6',max((s.get('gameDate') for s in shots),default=None),len({s['gameId'] for s in shots}))
            all_context[(year,tid)]['shots']['cbb']=cbb
        for s in stats:
            tid=s['team_id'];c=all_context[(year,tid)];assert_public(c)
            write(out/f'{year}/teams/{tid}.json',c)
            index.setdefault(str(tid),{'identity':c['identity'],'seasons':{}})['seasons'][str(year)]={'record':c['record'],'games':c['rates'].get('games_all'),
                'efg_pct':c['rates'].get('efg_o_all'),'data_through':c['data_through']}
    current=2027;games=[]
    for g in schedules[current]:
        h,a=g.get('home_id'),g.get('away_id')
        if (current,h) not in all_context and (current,a) not in all_context:continue
        def fixture_side(tid,side):
            found=all_context.get((current,tid))
            if found:return found
            return {'identity':{'name':g.get(side+'_display_name') or 'Opponent not published',
                                'logo':None,'color':None},'record':None}
        home,away=fixture_side(h,'home'),fixture_side(a,'away')
        state={'pre':'scheduled','post':'final','in':'live'}.get(g.get('status_type_state'),'scheduled')
        if g.get('status_type_name')=='STATUS_POSTPONED':state='postponed'
        if g.get('status_type_name')=='STATUS_CANCELED':state='canceled'
        # `date` retains ESPN's original UTC timestamp. game_date_time was shifted by
        # the provider; the raw snapshots preserve both. Use original only after validation.
        timestamp=g.get('date')
        row={'id':str(g['game_id']),'sport':'cbb','season':current,'slate_date':g['game_date'],'game_state':state,
             'kickoff_utc':timestamp,'away':str(a),'home':str(h),'away_name':away['identity']['name'],'home_name':home['identity']['name'],
             'away_logo':away['identity']['logo'],'home_logo':home['identity']['logo'],'away_record':away['record'],'home_record':home['record'],
             'away_color':away['identity']['color'],'home_color':home['identity']['color'],
             'away_score':g.get('away_score') if state in ('final','live') else None,'home_score':g.get('home_score') if state in ('final','live') else None,
             'venue':g.get('venue_full_name'),'venue_city':g.get('venue_address_city'),'broadcast':g.get('broadcast_name'),'neutral':bool(g.get('neutral_site')),
             'availability_summary':'Availability not collected'}
        assert_public(row);games.append(row)
    through=max((c['data_through'] for (y,_),c in all_context.items() if y==current and c['data_through']),default=None)
    manifest={'schema_version':1,'sport':'cbb','season':current,'seasons':[2027,2026], 'slate_date':as_of,
              'generated_at_utc':generated,'data_through_utc':through+'T23:59:59-05:00' if through else None,
              'sources':['Basketball Quant','CBB Analytics public reference charts'],'source_snapshot':snapshot.name,
              'reference_teams':['96','150','127','12','2305','2509'],
              'zone_policy':'Prefer matched CBB Analytics schemas for both teams; otherwise use matched Chase coordinate zones for both.',
              'games':games}
    assert_public(manifest);write(out/'slate.json',manifest);write(out/'teams.json',{'teams':index})
    write(out/'manifest.json',{k:v for k,v in manifest.items() if k!='games'})
    return {'team_season_contexts':len(all_context),'scheduled_game_rows':len(games),'data_through':through,'team_index':len(index)}
