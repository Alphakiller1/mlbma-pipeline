"""Collect current/prior CBB facts in isolation; validate before publication."""
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import json,subprocess,sys,tempfile
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))

def main():
    from pipeline.cbb_public import data,export,possession_data,factual_tactics
    from scripts.publish_public_cbb import publish
    day=datetime.now(ZoneInfo('America/New_York')).date().isoformat()
    with tempfile.TemporaryDirectory(prefix='chase-cbb-') as scratch:
        temp=Path(scratch);snapshot=temp/day
        for collector in ['collect_cbb_sources.py','collect_bq_shots.py']:
            subprocess.run([sys.executable,str(ROOT/'pipeline/cbb_public'/collector),'--out',str(snapshot)],check=True)
        for name in ['collection-manifest.json','bq-shot-partition-manifest.json']:
            if any(r.get('error') for r in json.loads((snapshot/name).read_text(encoding='utf-8'))['resources']):
                raise ValueError('Collection incomplete; existing CBB publication retained')
        data.ROOT=temp
        conn=data.warehouse(snapshot)
        possession_data.DATA=ROOT/'.cache/cbb-tactics/sdv'
        for year in (2026,2027):possession_data.refresh(year)
        facts=factual_tactics.build(snapshot,day)
        export.export_public(snapshot,conn,temp/'public',day,facts)
        conn.close();publish(temp/'public')

if __name__=='__main__':main()
