"""
social_queue.py — build a daily social posting QUEUE from the pipeline data.

No Meta / Graph API. Generates captions + hashtags for the recommended post types and writes
a CSV + JSON you can publish manually or import into Buffer / Metricool / Later.

  python -m outputs.social_queue                 # today
  python -m outputs.social_queue --date 2026-06-12

Output: outputs/social_queue/queue_<date>.csv and .json  (non-destructive — only writes there).
See docs/INSTAGRAM_WORKFLOW.md.
"""
import argparse
import csv
import json
from datetime import date as date_cls

import pandas as pd

from core.config import CHASE_ANALYTICS_DOMAIN, PROJECT_ROOT
from outputs.push_instagram import _read_csv, _fmt_score

QUEUE_DIR = PROJECT_ROOT / "outputs" / "social_queue"
HASHTAGS = "#MLB #MLBAnalytics #SportsBetting #Baseball #MLBPicks #Sabermetrics"
DISCLAIMER = "Model-generated research. Not betting advice. 21+. Bet responsibly."
LINK = CHASE_ANALYTICS_DOMAIN


def _caption(hook: str, body: str) -> str:
    return f"{hook}\n\n{body}\n\n{LINK}\n{DISCLAIMER}"


def post_matchup_of_the_day():
    df = _read_csv("today_matchups.csv")
    if df.empty or "Lineup_Edge" not in df.columns:
        return None
    d = df.copy()
    d["_e"] = d["Lineup_Edge"].astype(str).str.extract(r"([-+]?\d+(?:\.\d+)?)")[0].astype(float).abs()
    d = d.dropna(subset=["_e"])
    if d.empty:
        return None
    row = d.sort_values("_e", ascending=False).head(1).iloc[0]
    hook = "⚾ Matchup of the Day"
    body = f"{row.get('Away', '--')} at {row.get('Home', '--')} — biggest projected lineup edge on the slate: {str(row.get('Lineup_Edge', '')).strip()}."
    return ("matchup_of_the_day", _caption(hook, body))


def post_top_team_movement():
    df = _read_csv("team_profiles.csv")
    if df.empty or "osi_l14" not in df.columns or "osi_ytd" not in df.columns:
        return None
    d = df.copy()
    d["osi_l14"] = pd.to_numeric(d["osi_l14"], errors="coerce")
    d["osi_ytd"] = pd.to_numeric(d["osi_ytd"], errors="coerce")
    d = d.dropna(subset=["osi_l14", "osi_ytd"])
    if d.empty:
        return None
    d["_delta"] = d["osi_l14"] - d["osi_ytd"]
    row = d.sort_values("_delta", ascending=False).head(1).iloc[0]
    hook = "📈 Heating Up"
    body = (f"{row.get('team', '--')} — L14 OSI {_fmt_score(row['osi_l14'])} vs YTD "
            f"{_fmt_score(row['osi_ytd'])} (+{_fmt_score(row['_delta'])}). Trending up at the plate.")
    return ("top_team_movement", _caption(hook, body))


def post_trend_signal_snapshot():
    df = _read_csv("signals_convergence.csv")
    if df.empty:
        return None
    d = df.copy()
    if "convergence_count" in d.columns:
        d["convergence_count"] = pd.to_numeric(d["convergence_count"], errors="coerce")
        d = d.sort_values("convergence_count", ascending=False)
    if d.empty:
        return None
    row = d.head(1).iloc[0]
    hook = "🎯 Signal Snapshot"
    body = (f"{row.get('away', '--')} at {row.get('home', '--')}: "
            f"{_fmt_score(row.get('convergence_count'), 0)}x model convergence today — where multiple indicators agree.")
    return ("trend_signal_snapshot", _caption(hook, body))


def _first_value(df, cols):
    if df.empty:
        return None
    for col in cols:
        if col in df.columns and len(df):
            return str(df.iloc[0][col])
    return None


def post_pitcher_spotlight():
    name = _first_value(_read_csv("sp_profiles.csv"), ("pitcher", "name", "Player", "player"))
    hook = "🔥 Pitcher Spotlight"
    if name:
        body = f"{name} takes the mound tonight — full profile (splits, pitch mix, matchup) on the dashboard."
    else:
        body = "Tonight's arm to watch — full pitcher profiles (splits, pitch mix, matchup) on the dashboard. [fill in name]"
    return ("pitcher_spotlight", _caption(hook, body))


def post_bullpen_warning():
    team = _first_value(_read_csv("bullpen_unit.csv"), ("team", "Team"))
    hook = "🚨 Bullpen Watch"
    if team:
        body = f"{team}'s pen is stretched — check the bullpen report before backing late innings."
    else:
        body = "Which pens are on fumes tonight? Bullpen usage + strength-of-schedule on the dashboard. [fill in team]"
    return ("bullpen_warning", _caption(hook, body))


BUILDERS = [
    post_matchup_of_the_day,
    post_top_team_movement,
    post_pitcher_spotlight,
    post_bullpen_warning,
    post_trend_signal_snapshot,
]


def build_queue(d: str):
    rows = []
    slot = 0
    for builder in BUILDERS:
        try:
            result = builder()
        except Exception as exc:  # one bad row never kills the queue
            print(f"  ! {builder.__name__} skipped: {exc}")
            result = None
        if not result:
            continue
        slot += 1
        ptype, caption = result
        rows.append({
            "date": d, "slot": slot, "type": ptype, "status": "draft",
            "caption": caption, "hashtags": HASHTAGS,
            "image_path": "", "link": LINK, "notes": "",
        })
    return rows


def write_queue(rows, d: str):
    QUEUE_DIR.mkdir(parents=True, exist_ok=True)
    (QUEUE_DIR / "cards").mkdir(parents=True, exist_ok=True)
    cols = ["date", "slot", "type", "status", "caption", "hashtags", "image_path", "link", "notes"]
    csv_path = QUEUE_DIR / f"queue_{d}.csv"
    json_path = QUEUE_DIR / f"queue_{d}.json"
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=cols)
        writer.writeheader()
        writer.writerows(rows)
    json_path.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    return csv_path, json_path


def main():
    parser = argparse.ArgumentParser(description="Build a daily social posting queue (no API).")
    parser.add_argument("--date", default=date_cls.today().isoformat(), help="YYYY-MM-DD (default: today).")
    args = parser.parse_args()
    rows = build_queue(args.date)
    csv_path, json_path = write_queue(rows, args.date)
    print(f"Queued {len(rows)} posts for {args.date}:")
    for r in rows:
        print(f"  [{r['slot']}] {r['type']}")
    print(f"CSV:  {csv_path}")
    print(f"JSON: {json_path}")


if __name__ == "__main__":
    main()
