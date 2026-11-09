"""Collect current/prior CBB facts in isolation; validate before publication."""
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import subprocess,sys,tempfile
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))

def export_snapshot(snapshot, temp, day):
    from pipeline.cbb_public import data,export,possession_data,factual_tactics,espn_roster
    from scripts.publish_public_cbb import publish
    if any(r.get('error') for r in data.read(snapshot/'collection-manifest.json')['resources']):
        raise ValueError('Collection incomplete; existing CBB publication retained')
    # Keep completed-season coordinate profiles and their original baselines.
    # A partial current shot pull must also keep a single consistent snapshot.
    published=ROOT/'data/public/cbb'
    retained={2026:published}
    shots=data.read(snapshot/'bq-shot-partition-manifest.json')
    if not shots['expected_partitions'] or shots['completed_partitions']!=shots['expected_partitions']:
        retained[2027]=published
        print('::warning::Incomplete coordinate shot pull; retaining the last valid coordinate profiles.')
    data.ROOT=temp
    conn=data.warehouse(snapshot)
    possession_data.DATA=ROOT/'.cache/cbb-tactics/sdv'
    for year in (2026,2027):possession_data.refresh(year)
    facts=factual_tactics.build(snapshot,day)
    filled=espn_roster.fill_missing_heights(facts[2027],2027)
    print(f'ESPN roster heights filled for {len(filled)} current-season teams.')
    export.export_public(snapshot,conn,temp/'public',day,facts,retained)
    conn.close()
    publish(temp/'public')

def main():
    day=datetime.now(ZoneInfo('America/New_York')).date().isoformat()
    with tempfile.TemporaryDirectory(prefix='chase-cbb-') as scratch:
        temp=Path(scratch);snapshot=temp/day
        collectors=[('collect_cbb_sources.py',[]),('collect_bq_shots.py',['--seasons','2027'])]
        for collector,args in collectors:
            subprocess.run([sys.executable,str(ROOT/'pipeline/cbb_public'/collector),'--out',str(snapshot),*args],check=True)
        export_snapshot(snapshot,temp,day)

if __name__=='__main__':main()
