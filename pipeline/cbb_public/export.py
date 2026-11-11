"""Factual public projection. Model outputs never enter this directory."""
from __future__ import annotations
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
import gzip,json,math
from .data import ZONES,read,write,table
from .. import power, predictability
from . import pressure
REPO = Path(__file__).resolve().parents[2]

RATE_FIELDS=['games_all','efg_o_all','efg_d_all','tov_pct_o_all','tov_pct_d_all','orb_pct_all','drb_pct_all',
             'ftr_o_all','ftr_d_all','tpr_o_all','tpr_d_all','ppp_off_all','ppp_def_all','fg2_pct_o_all',
             'fg2_pct_d_all','fg3_pct_o_all','fg3_pct_d_all','ast_rate_o_all','ast_rate_d_all']
# Complete D-I-game rates from the same Basketball Quant row. They replace no
# possession-tagged evidence; they cover every D-I game that evidence misses.
EXTRA_RATE_FIELDS=['ft_pct_o_all','ft_pct_d_all','fb_pts_per100_all','fb_pts_per100_d_all',
                   'pitp_per100_all','pitp_per100_d_all','pts_off_to_per_dposs_all','pts_off_to_per_dposs_d_all',
                   'stl_pct_o_all','stl_pct_d_all','blk_pct_o_all','blk_pct_d_all']
# Basketball Quant's shot-type split of every D-I game: how often each offense
# takes a shot type and what defenses allow, with points per attempt for both.
SHOT_TYPES=['rim','layup','driving','floater','pullup','midrange','three','corner3']
EXTRA_RATE_FIELDS+=[f'{shot}_{stat}_{side}_all' for shot in SHOT_TYPES for stat in ('freq','ppa') for side in ('off','def')]
RATE_FIELDS=RATE_FIELDS+EXTRA_RATE_FIELDS
PLAYER_FIELDS=['id','pid','athlete_id','Name','Team','G','Min_pct','Usg','Pts','Reb','Ast','eFG','TS',
               'FGM','FGA','3PM','3PA','FTM','FTA','3PP','FTR','Ht']
FORBIDDEN={'predicted_score','predicted_margin','home_probability','home_win_probability','win_probability','confidence','pick','edge','odds','spread','moneyline','away_points','home_points','home_margin','total_points','power','rating','model_diagnostics','shooting_reversion','recent_shooting_reversion','shooting_scenario','regression_pressure_pp100','progression_pressure_pp100','net_reversion_pp100','geometric_sets','prior_reference_weight','tracking_tactics','posterior_per_regulation','posterior_mean'}

UNTAGGED_SHOT_TYPES=('driving','floater','pullup')

def live_cutoff(stats, schedule, as_of):
    """Shot coordinates and ESPN boxes post a game within minutes; Basketball
    Quant's team rates count it overnight. When most of the day's D-I finals
    are not yet in the rates, the live feeds are read through the day before,
    so every section of a team counts the same games."""
    counted = {s['team_id']: int(s.get('games_all') or 0) for s in stats}
    days = defaultdict(list)
    for g in schedule:
        h, a = g.get('home_id'), g.get('away_id')
        if g.get('status_type_name') == 'STATUS_FINAL' and g['game_date'] <= as_of and h in counted and a in counted:
            days[h].append(g['game_date']); days[a].append(g['game_date'])
    today = [t for t, d in days.items() if as_of in d]
    behind = sum(1 for t in today if len(days[t]) > counted[t])
    if today and behind > len(today) / 2:
        print(f'Team rates do not count {behind} of {len(today)} D-I teams that finished on {as_of}; live feeds read through the day before.')
        return (date.fromisoformat(as_of) - timedelta(days=1)).isoformat()
    return as_of

def mark_untracked_shot_types(rates):
    """Play-by-play from some feeds never labels drives, floaters or pull-ups.
    A side with all three at exactly zero was not tagged, not shut out: those
    fields publish as None so they read "Not tracked" and stay out of ranks."""
    for side in ('off','def'):
        if all(rates.get(f'{k}_freq_{side}_all')==0 for k in UNTAGGED_SHOT_TYPES):
            for k in UNTAGGED_SHOT_TYPES:
                rates[f'{k}_freq_{side}_all']=None
                rates[f'{k}_ppa_{side}_all']=None


# Ridge pull, in games, toward each team's starting point: last season's rating
# carried 0.6 of the way (pipeline/power.py; CBB 2023-2026 validated).
POWER_PENALTY = 4.0
POWER_CARRY = 0.6


def power_inputs(finals):
    """Rows and played games for pipeline/power.py from D-I finals: each side's
    noise-adjusted points per 100 possessions, the game's possessions the
    average of the two sides' estimates."""
    from .espn_boxes import shooting_totals
    rates = power.shooting_rates(shooting_totals(finals))
    rows, played = [], []
    for g in finals:
        poss = (g["home_poss"] + g["away_poss"]) / 2
        for side, other, loc in (("home", "away", 1), ("away", "home", -1)):
            loc = 0 if g.get("neutral") else loc
            tpm, tpa, ftm, fta = g[side + "_shots"]
            adj = power.basketball_points(g[side + "_pts"], tpm, tpa, ftm, fta, rates.get(g[side]) or rates[""])
            rows.append(power.Row(g[side], g[other], loc, 100 * adj / poss, poss))
            margin = g[side + "_pts"] - g[other + "_pts"]
            played.append(power.Played(g[side], g[other], loc, margin > 0 if margin else None, poss / 100, margin))
    return rows, played


def previous_ratings(year):
    """Last season's published adjusted offense and defense per team."""
    offense, defense = {}, {}
    for f in (REPO / 'data/public/cbb' / str(year - 1) / 'teams').glob('*.json'):
        a = read(f).get('adjusted')
        if a:
            offense[f.stem], defense[f.stem] = a['offense']['value'], a['defense']['value']
    return offense, defense


def adjusted_ranking(season, finals, prior=None):
    """Each D-I team's power ranking over its D-I finals (pipeline/power.py),
    starting from ``prior`` (last season's ratings) where one is given."""
    rows, played = power_inputs(finals)
    if len({r.offense for r in rows}) < 10:
        return
    fit = power.ridge(rows, POWER_PENALTY, prior=power.season_prior(*prior, POWER_CARRY) if prior else None)
    out = power.table(fit, played, {str(t) for t in season})
    for tid, c in season.items():
        row = out["teams"].get(str(tid))
        if row:
            c["adjusted"] = {**row, "season": c["season"], "home_court": out["home_court"],
                             "data_through": max(g["date"] for g in finals)}


def distribution(values, *, rank_samples=False):
    values=[float(v) for v in values if v is not None and math.isfinite(float(v))]
    if not values:return {'mean':None,'std':None,'sample_size':0}
    mean=sum(values)/len(values)
    result = {'mean':mean,'std':math.sqrt(sum((v-mean)**2 for v in values)/len(values)),'sample_size':len(values)}
    if rank_samples:
        result['rank_samples'] = sorted(values)
    return result

def grade_baselines(contexts,year):
    season=[c for (y,_),c in contexts.items() if y==year]
    cohort=[c for c in season if (c['rates'].get('games_all') or 0)>0]
    fallback=[(c.get('official_box') or {}).get('rates',{}) for c in season if not c['rates'].get('games_all')]
    team={}
    for key in RATE_FIELDS:
        if key=='games_all':
            continue
        # A team Basketball Quant has not counted yet is read on its ESPN box
        # rates (espn_boxes.rate_rows, the same definitions), so every figure
        # the desk shows sits in the pool it is ranked against.
        values=[c['rates'].get(key) for c in cohort]
        values.extend(box.get(key) for box in fallback)
        team[key]=distribution(values,rank_samples=True)
    for key in pressure.RANKED:
        team[key]=distribution(pressure.rank_values((c.get('pressure') for c in season),key),rank_samples=True)
    # The desk reads a team's ESPN box players when it has no counted player
    # line, so those players join the pool they are ranked against.
    lines=[p for c in season for p in (c['players'] if any(x.get('G') for x in c['players'])
                                        else (c.get('official_box') or {}).get('players') or [])]
    players=[p for p in lines if (p.get('G') or 0)>0 and (p.get('Min_pct') or 0)>=10]
    # Box player lines publish TS only when the player shot (no FGA/FTA keys).
    player={k:distribution((p.get(k) for p in players if k!='TS' or (p.get('FGA') or 0)+(p.get('FTA') or 0)>0
                            or ('FGA' not in p and p.get('TS') is not None)), rank_samples=True)
            for k in ['Pts','Reb','Ast','TS']}
    return {'team':team,'player':player, **matchup_baselines(season),
            'team_policy':'Same-season D-I teams with a reported game; equal team weighting.',
            'player_policy':'Same-season players with a reported game and at least 10% reported MIN%; TS requires shooting attempts.'}

def matchup_baselines(contexts):
    pace_samples = defaultdict(list)
    frequency = defaultdict(list)
    efficiency = defaultdict(list)
    ranked = defaultdict(list)

    def record(values, key, value):
        if isinstance(value, (int, float)) and math.isfinite(value):
            values[key].append(value)

    for context in contexts:
        observed = context.get('observed_tactics') or {}
        box = context.get('official_box') or {}
        counted = observed.get('pace') or {}
        for pace, games, keys in (
            (counted, counted.get('games'), ('observed_per40', 'recent5_per40')),
            (box.get('pace') or {}, (box.get('pace') or {}).get('games') or box.get('games'),
             ('estimated_per40', 'recent5_estimated_per40')),
        ):
            record(pace_samples, keys[0], pace.get(keys[0]))
            if (games or 0) >= 6:
                record(pace_samples, keys[1], pace.get(keys[1]))
        for family in ('situations', 'restart_contexts', 'personnel'):
            for row in observed.get(family, []):
                key = (family, row['side'], row.get('basis') or '', row.get('personnel') or row.get('kind'))
                record(frequency, key, row.get('usage'))
                if row['possessions'] >= 10:
                    record(efficiency, key, row.get('ppp'))
        for role, side in (('offense', 'o'), ('defense', 'd')):
            key = ('shot_share', role, '', 'three')
            rates = context['rates'] if context['rates'].get('games_all') else box.get('rates', {})
            record(frequency, key, rates.get(f'tpr_{side}_all'))
            for schema, block in context['shots'].items():
                profile = block[role]
                rim = next((z for z in profile['zones'] if z['id'] == 'atr2'), {})
                record(frequency, ('shot_share', role, schema, 'rim'), rim.get('shot_share'))
                if profile['totals']['attempts'] >= 20:
                    record(ranked, ('shot_accuracy', role, schema, 'efg'), profile['totals'].get('efg_pct'))
                for zone in profile['zones']:
                    record(frequency, ('shot_share', role, schema, zone['id']), zone.get('shot_share'))
                    if zone['attempts'] >= 10:
                        record(ranked, ('shot_accuracy', role, schema, zone['id']), zone.get('fg_pct'))
        size = observed.get('size_summary') or {}
        for basis, key in (('starters', 'starter_position_size'), ('whole_team', 'position_size')):
            record(ranked, ('height', basis, '', 'all'), (size.get(basis) or {}).get('mean_height_inches'))
            for row in observed.get(key, []):
                record(ranked, ('height', basis, '', row['position']), row.get('mean_height_inches'))
    comparisons = []
    for key in sorted(frequency.keys() | ranked.keys()):
        family, side, basis, kind = key
        row = {'family': family, 'side': side, 'basis': basis, 'kind': kind}
        if key in frequency:
            row['usage_samples'] = sorted(frequency[key])
        if family in ('situations', 'restart_contexts', 'personnel'):
            row['ppp_baseline'] = distribution(efficiency[key])
        if key in ranked or key in efficiency:
            row['rank_samples'] = sorted(ranked.get(key) or efficiency[key])
        comparisons.append(row)
    return {
        'pace_samples': {key: sorted(values) for key, values in sorted(pace_samples.items())},
        'matchup_comparisons': comparisons,
    }


def split_matchup_ranks(baselines):
    """Move matchup-only samples out of the board's team index."""
    ranks = {}
    for year, baseline in baselines.items():
        season = {group: {key: entry.pop('rank_samples') for key, entry in baseline[group].items()
                          if 'rank_samples' in entry} for group in ('team', 'player')}
        comparisons, board = [], []
        for row in baseline['matchup_comparisons']:
            samples = row.pop('rank_samples', None)
            if row['family'] == 'shot_share' and row['kind'] in ZONES:
                samples = row.pop('usage_samples', None)
            if samples:
                comparisons.append({**{k: row[k] for k in ('family', 'side', 'basis', 'kind')},
                                    'rank_samples': samples})
            if 'usage_samples' in row:
                board.append(row)
        season['matchup_comparisons'] = comparisons
        baseline['matchup_comparisons'] = board
        ranks[year] = season
    return {'grade_baselines': ranks}


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
    lg_attempts=sum(r.get('attempts',0) for r in league.values());lg_made=sum(r.get('made',0) for r in league.values())
    lg_threes=sum(league.get(z,{}).get('made',0) for z in ['c3','atb3','heave3'])
    return {'schema':schema,'zones':zones,'totals':{'made':made,'attempts':attempts,'efg_pct':(made+.5*three)/attempts if attempts else None,
            'league_efg_pct':(lg_made+.5*lg_threes)/lg_attempts if lg_attempts else None,
            'games':games,'data_through':through},'source':'CBB Analytics' if schema=='cbb-analytics-zones6' else 'Chase zones from Basketball Quant shot coordinates'}

def export_public(snapshot,conn,out,as_of,observed_tactics=None,archived_coordinates=None,box_cache=None):
    out=Path(out); generated=datetime.now(timezone.utc)
    cross=read(snapshot/'data/bq-mbb_institution_crosswalk-all.json');identity={}
    for r in cross:
        if r.get('espn_team_id') is None:continue
        tid=int(r['espn_team_id'])
        if tid not in identity or not r.get('is_alias'):identity[tid]=r
    all_context={};index={};schedules={};coverage=[]
    for year in (2026,2027):
        stats=table(snapshot,'mbb_team_seasons',year);cohort={r['team_id'] for r in stats};ratings={r['team_id']:r for r in table(snapshot,'mbb_team_ratings',year)}
        players=table(snapshot,'basketball_players',year);schedules[year]=table(snapshot,'mbb_sched',year)
        live=date.fromisoformat(live_cutoff(stats,schedules[year],as_of) if year==2027 else as_of).isoformat()
        players_by_team=defaultdict(list)
        for p in players:players_by_team[p.get('Team')].append({k:p.get(k) for k in PLAYER_FIELDS})
        cbb_lg={r['zoneName']:{'made':r['fgm'],'attempts':r['fga']} for r in read(snapshot/f'data/cbb-league-zones-{year}.json') if r.get('zoneSchema')=='zones6' and r.get('divisionId')==1}
        lg=defaultdict(lambda:{'made':0,'attempts':0})
        aggregates={'offense':defaultdict(list),'defense':defaultdict(list)}
        # Team rates count D-I opponents only. Shots use the same games, so a
        # shot chart and the efficiency table beside it describe one sample.
        division=','.join(str(int(t)) for t in sorted(cohort))
        d1=f" AND home_id IN ({division}) AND away_id IN ({division}) AND game_date<='{live}'"
        for tid,z,n,m in conn.execute('SELECT team_id,zone,COUNT(*),SUM(made) FROM shots WHERE season=? AND zone IS NOT NULL'+d1+' GROUP BY team_id,zone',(year,)):
            aggregates['offense'][tid].append({'id':z,'attempts':n,'made':m})
            if tid in cohort:lg[z]['attempts']+=n;lg[z]['made']+=m
        defender='CASE WHEN team_id=home_id THEN away_id WHEN team_id=away_id THEN home_id END'
        for tid,z,n,m in conn.execute(f'SELECT {defender},zone,COUNT(*),SUM(made) FROM shots WHERE season=? AND zone IS NOT NULL{d1} GROUP BY 1,2',(year,)):
            aggregates['defense'][tid].append({'id':z,'attempts':n,'made':m})
        game_summaries={role:{tid:(n,through) for tid,n,through in conn.execute(f'SELECT {owner},COUNT(DISTINCT game_id),MAX(game_date) FROM shots WHERE season=? AND zone IS NOT NULL{d1} GROUP BY 1',(year,))} for role,owner in [('offense','team_id'),('defense',defender)]}
        for s in stats:
            tid=s['team_id'];ident=identity.get(tid,{})
            name=s.get('torvik_team_name') or ident.get('barttorvik_team_name')
            roster=players_by_team.get(name,[]);ident={'id':str(tid),'name':ident.get('display_name') or s.get('team') or name,
                'short_name':ident.get('short_display_name') or name,'abbr':ident.get('abbreviation') or str(tid),
                'logo':ident.get('logo_url') or f'https://a.espncdn.com/i/teamlogos/ncaa/500/{tid}.png',
                'color':'#'+str(ident.get('primary_color') or '9A6BFF').lstrip('#')}
            rates={k:s.get(k) for k in RATE_FIELDS};mark_untracked_shot_types(rates)
            c={'identity':ident,'season':year,'rates':rates,'players':roster,
               'source':'Basketball Quant','data_through':max((g['game_date'] for g in schedules[year] if g.get('status_type_name')=='STATUS_FINAL' and tid in [g.get('home_id'),g.get('away_id')] and g['game_date']<=live),default=None),
               'record':f'{int(s.get("wins") or 0)}–{int(s.get("losses") or 0)}','shots':{}}
            if observed_tactics:c['observed_tactics']=observed_tactics.get(year,{}).get(str(tid))
            own={};previous=None
            if year in (archived_coordinates or {}):
                previous=read(archived_coordinates[year]/f'{year}/teams/{tid}.json')
                if previous['season']!=year or previous['identity']['id']!=str(tid):
                    raise ValueError('Retained shot profile identity mismatch')
                own=previous['shots']['coordinates']
                # A completed season's pressure was measured once from its full
                # play-by-play (scripts/backfill_cbb_pressure.py) and is kept.
                if previous.get('pressure'):c['pressure']=previous['pressure']
                # ...and so is its power ranking (scripts/backfill_cbb_power.py).
                if previous.get('adjusted'):c['adjusted']=previous['adjusted']
            else:
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
            # A completed season's box lines were ranked once from its full box
            # scores (scripts/backfill_cbb_game_lines.py) and are kept.
            if previous and year!=2027:
                kept={g['id']:g for g in previous.get('games',[]) if g.get('box') or g.get('adj_points') is not None}
                for g in c['games']:
                    if g['id'] in kept:
                        g.update({k:kept[g['id']][k] for k in ('week','box','adj_points','adj_opponent_points') if k in kept[g['id']]})
            all_context[(year,tid)]=c
        finals=None
        if year==2027 and observed_tactics and box_cache:
            from .espn_boxes import supplement
            finals=supplement({tid:all_context[(year,tid)] for tid in cohort},schedules[year],year,live,box_cache)
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
        season={tid:c for (y,tid),c in all_context.items() if y==year}
        if finals:
            adjusted_ranking(season,finals,previous_ratings(year))
            # Each offense's scoring events over its D-I games (pipeline/predictability.py).
            events=defaultdict(list)
            for g in finals:
                for side in ('home','away'):events[g[side]].append(g[side+'_events'])
            scored=predictability.score(events,predictability.CBB)
            for tid,c in season.items():
                if str(tid) in scored:c['predictability']=scored[str(tid)]
        for s in stats:
            tid=s['team_id'];c=all_context[(year,tid)];assert_public(c)
            write(out/f'{year}/teams/{tid}.json',c)
            summary={'record':c['record'],'games':c['rates'].get('games_all'),
                'efg_pct':c['rates'].get('efg_o_all'),'data_through':c['data_through']}
            box=c.get('official_box',{})
            if box.get('rates'):
                summary.update(games=box['games'],efg_pct=box['rates']['efg_o_all'],
                               data_through=box['data_through'],source=box['source'])
            index.setdefault(str(tid),{'identity':c['identity'],'seasons':{}})['seasons'][str(year)]=summary
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
    cutoff = min(generated, datetime.combine(date.fromisoformat(through), time(23,59,59),
                                             ZoneInfo('America/New_York'))) if through else None
    manifest={'schema_version':1,'sport':'cbb','season':current,'seasons':[2027,2026], 'slate_date':as_of,
              'generated_at_utc':generated.isoformat(),'data_through_utc':cutoff.astimezone(timezone.utc).isoformat() if cutoff else None,
              'sources':['Basketball Quant','CBB Analytics public reference charts']+(['SportsDataverse NCAA possessions and rosters'] if observed_tactics else [])+(['ESPN final box scores and rosters'] if box_cache else []),'source_snapshot':snapshot.name,
              'reference_teams':['96','150','127','12','2305','2509'],
              'zone_policy':'Prefer matched CBB Analytics schemas for both teams; otherwise use matched Chase coordinate zones for both.',
              'games':games}
    assert_public(manifest);write(out/'slate.json',manifest)
    baselines={str(y):grade_baselines(all_context,y) for y in [2026,2027]}
    write(out/'matchup-ranks.json',split_matchup_ranks(baselines))
    write(out/'teams.json',{'teams':index,'grade_baselines':baselines})
    write(out/'manifest.json',{k:v for k,v in manifest.items() if k!='games'})
    return {'team_season_contexts':len(all_context),'scheduled_game_rows':len(games),'data_through':through,'team_index':len(index)}
