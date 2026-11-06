"""Immutable snapshot ingestion; original records are never rewritten."""
from __future__ import annotations
from collections import Counter
from pathlib import Path
import gzip, hashlib, json, math, shutil, sqlite3

ROOT = Path(__file__).resolve().parents[1]
ZONES = {'atr2':'At rim', 'paint2':'Paint, non-rim', 'mid2':'Mid-range',
         'c3':'Corner 3', 'atb3':'Above-break 3', 'heave3':'Long-distance 3'}

def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))

def write(path, value):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',',':')), encoding='utf-8')

def import_snapshot(source, date):
    source = Path(source).resolve(); dest = ROOT/'data/snapshots'/date
    if dest.exists():
        raise ValueError(f'Snapshot already exists: {dest}; use the existing snapshot or a new dated folder')
    manifest = read(source/'collection-manifest.json')
    partitions = read(source/'bq-shot-partition-manifest.json')
    resources = manifest['resources'] + partitions['resources']
    if any(r.get('error') for r in resources): raise ValueError('Snapshot contains failed resources')
    for r in resources:
        if not r.get('file'): continue
        path = (source/r['file'].replace('\\','/')).resolve()
        if not path.is_relative_to(source) or not path.is_file(): raise ValueError('Unsafe or missing source file')
        if r.get('sha256') and hashlib.sha256(path.read_bytes()).hexdigest()!=r['sha256']:
            raise ValueError(f'Source checksum mismatch: {r["file"]}')
    dest.mkdir(parents=True)
    shutil.copytree(source/'data',dest/'data')
    for name in ['collection-manifest.json','bq-shot-partition-manifest.json','Data-Quality-Report.json']:
        shutil.copy2(source/name,dest/name)
    write(dest/'snapshot.json',{'snapshot_date':date,'source_scope':manifest['scope'],
          'seasons':[2026,2027], 'shot_records':sum(r.get('rows',0) for r in partitions['resources']),
          'original_source':'Public Basketball Quant and public CBB Analytics demo/shortcut charts'})
    return dest

def classify_zone(x, y, points):
    """Chase coordinates v1, not the provider's zones6 classifier.

    Coordinates are center-court feet, hoop at (+/-41.75, 0). Combine ends.
    Rim <=4.5ft; paint: baseline-to-FT-line and 12ft wide; corner 3: |y|>=21.5
    and |x|>=36; long 3: distance>=36ft. Source attempt value decides 2/3.
    """
    if x is None or y is None or points not in (2,3): return None
    if not all(math.isfinite(float(v)) for v in (x,y)) or abs(x)>47 or abs(y)>25: return None
    x,y=abs(x),abs(y); distance=math.hypot(41.75-x,y)
    if points==3:
        return 'heave3' if distance>=36 else 'c3' if y>=21.5 and x>=36 else 'atb3'
    return 'atr2' if distance<=4.5 else 'paint2' if x>=28 and y<=6 else 'mid2'

def warehouse(snapshot):
    path=ROOT/'data/warehouse'/f'{snapshot.name}.sqlite'; path.parent.mkdir(parents=True,exist_ok=True)
    conn=sqlite3.connect(path)
    conn.execute('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT)')
    if conn.execute("SELECT value FROM metadata WHERE key='complete'").fetchone():
        conn.executescript('CREATE INDEX IF NOT EXISTS shots_home ON shots(season,home_id); CREATE INDEX IF NOT EXISTS shots_away ON shots(season,away_id);')
        return conn
    conn.executescript('DROP TABLE IF EXISTS shots; CREATE TABLE shots (season INTEGER, source TEXT, game_id INTEGER, game_date TEXT, team_id INTEGER, home_id INTEGER, away_id INTEGER, x REAL, y REAL, made INTEGER, points INTEGER, athlete_id INTEGER, period INTEGER, clock TEXT, shot_seq TEXT, exact_repeat INTEGER, zone TEXT);')
    seen=set(); counts=Counter(); batch=[]
    for year in (2026,2027):
        for file in sorted((snapshot/f'data/bq-shots/{year}').glob('*.ndjson.gz')):
            with gzip.open(file,'rt',encoding='utf-8') as source:
                for line in source:
                    s=json.loads(line); fingerprint=hashlib.sha256(json.dumps(s,sort_keys=True,separators=(',',':')).encode()).digest()
                    duplicate=fingerprint in seen; seen.add(fingerprint)
                    zone=classify_zone(s['coordinate_x'],s['coordinate_y'],s['points_attempted'])
                    batch.append((year,s['source'],s['game_id'],s['game_date'],s['team_id'],s['home_team_id'],s['away_team_id'],s['coordinate_x'],s['coordinate_y'],int(bool(s['scoring_play'])),s['points_attempted'],s['athlete_id_1'],s['period_number'],s['time'],s['shot_seq'],int(duplicate),zone))
                    counts['events']+=1; counts['exact_repeats_retained']+=duplicate; counts['unclassified_attempts']+=s['points_attempted'] not in (2,3)
                    if len(batch)>=10000:
                        conn.executemany('INSERT INTO shots VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',batch);batch=[]
    if batch: conn.executemany('INSERT INTO shots VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',batch)
    conn.executescript('CREATE INDEX shots_team ON shots(season,team_id); CREATE INDEX shots_game ON shots(season,game_id); CREATE INDEX shots_home ON shots(season,home_id); CREATE INDEX shots_away ON shots(season,away_id);')
    conn.execute('INSERT OR REPLACE INTO metadata VALUES (?,?)',('counts',json.dumps(counts)))
    conn.execute('INSERT OR REPLACE INTO metadata VALUES (?,?)',('complete','1'));conn.commit()
    write(ROOT/'reports/ingestion.json',dict(counts))
    return conn

def table(snapshot, family, year):
    return read(snapshot/f'data/bq-{family}-{year}.json')

def final_games(snapshot, year, before=None):
    cohort={int(t['team_id']) for t in table(snapshot,'mbb_team_seasons',year)}
    seen=set(); games=[]
    for g in table(snapshot,'mbb_sched',year):
        if g['game_id'] in seen: continue
        if g.get('status_type_name')!='STATUS_FINAL' or not g.get('status_type_completed'):continue
        if g.get('home_id') not in cohort or g.get('away_id') not in cohort:continue
        if not all(isinstance(g.get(k),(int,float)) and math.isfinite(g[k]) and 0<g[k]<250 for k in ('home_score','away_score')):continue
        if before and g['game_date']>=before:continue
        seen.add(g['game_id']);games.append(g)
    return sorted(games,key=lambda g:(g['game_date'],g['game_id']))
