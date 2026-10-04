"""Independent recomputation of the NFL matchup page's stats from raw nflverse data.

First run 2026-09-29: 1,152 checks (run game, trenches, team totals, current
scheme, QB season lines, red zone trips) all matched the published slate.

Written separately from outputs/nfl_* so a shared bug cannot hide: each metric
uses the textbook definition, computed from the 2026 play-by-play / FTN /
weekly team stats, and compared with the live published slate for all clubs.
"""
import json
import sys
import urllib.request

import pandas as pd

SEASON = 2026
PBP = f"https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{SEASON}.parquet"
FTN = f"https://github.com/nflverse/nflverse-data/releases/download/ftn_charting/ftn_charting_{SEASON}.parquet"
TEAM = f"https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_{SEASON}.parquet"
PLAYER = f"https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{SEASON}.parquet"
ALIAS = {"LA": "LAR", "WAS": "WSH", "JAC": "JAX", "OAK": "LV", "SD": "LAC"}

# Usage: python scripts/nfl_stat_audit.py [out.csv] [slate.json]
# (default slate: data/public/nfl/slate.json - regenerate it first so both
# sides read the same play-by-play).
slate = json.load(open(sys.argv[2] if len(sys.argv) > 2 else "data/public/nfl/slate.json", encoding="utf-8"))
clubs = {}
for g in slate["games"]:
    for side in ("away", "home"):
        clubs[g[side]] = {k[len(side) + 1:]: v for k, v in g.items() if k.startswith(side + "_")}

pbp = pd.read_parquet(PBP)
pbp = pbp[pbp["season_type"] == "REG"].copy()
pbp["posteam"] = pbp["posteam"].replace(ALIAS)
pbp["defteam"] = pbp["defteam"].replace(ALIAS)
through_week = int(pbp["week"].max())
ftn = pd.read_parquet(FTN)
team = pd.read_parquet(TEAM)
team = team[team["season_type"] == "REG"].copy()
team["team"] = team["team"].replace(ALIAS)

rows = []


def check(family, metric, club, published, ours, tol):
    if published is None or ours is None:
        rows.append((family, metric, club, published, ours, "MISSING"))
        return
    ok = abs(float(published) - float(ours)) <= tol
    rows.append((family, metric, club, round(float(published), 4), round(float(ours), 4),
                 "ok" if ok else "DIFF"))


# ---- 1. Run game (designed runs: rush_attempt, no scrambles, no kneels) ----
runs = pbp[(pbp["rush_attempt"] == 1) & (pbp["qb_scramble"] != 1) & (pbp["qb_kneel"] != 1)]
for club, data in clubs.items():
    rg = ((data.get("run_game") or {}).get("current") or {})
    for phase, col in (("offense", "posteam"), ("defense", "defteam")):
        r = runs[runs[col] == club]
        pub = rg.get(phase) or {}
        if len(r) == 0:
            continue
        games = r["game_id"].nunique()
        check("run_game", f"{phase}.carries", club, pub.get("carries"), len(r), 0)
        check("run_game", f"{phase}.yards_per_carry", club, pub.get("yards_per_carry"),
              r["yards_gained"].sum() / len(r), 0.011)
        check("run_game", f"{phase}.yards_per_game", club, pub.get("yards_per_game"),
              r["yards_gained"].sum() / games, 0.06)
        check("run_game", f"{phase}.epa_per_carry", club, pub.get("epa_per_carry"), r["epa"].mean(), 0.002)
        check("run_game", f"{phase}.success_rate", club, pub.get("success_rate"), r["success"].mean(), 0.002)
        check("run_game", f"{phase}.explosive_rate", club, pub.get("explosive_rate"),
              (r["yards_gained"] >= 10).mean(), 0.002)
        check("run_game", f"{phase}.stuff_rate", club, pub.get("stuff_rate"),
              (r["yards_gained"] <= 0).mean(), 0.002)

# ---- 2. Trenches (line_stats) ----
dropbacks = pbp[pbp["qb_dropback"] == 1]
for club, data in clubs.items():
    ls = data.get("line_stats") or {}
    off, de = ls.get("offense") or {}, ls.get("defense") or {}
    o_runs, d_runs = runs[runs["posteam"] == club], runs[runs["defteam"] == club]
    o_db, d_db = dropbacks[dropbacks["posteam"] == club], dropbacks[dropbacks["defteam"] == club]
    val = lambda e: (e or {}).get("value")
    if len(o_runs):
        check("trenches", "offense.stuff_rate", club, val(off.get("stuff_rate")),
              (o_runs["yards_gained"] <= 0).mean(), 0.002)
    if len(d_runs):
        check("trenches", "defense.stuff_rate", club, val(de.get("stuff_rate")),
              (d_runs["yards_gained"] <= 0).mean(), 0.002)
    if len(o_db):
        check("trenches", "offense.sack_rate", club, val(off.get("sack_rate")),
              o_db["sack"].fillna(0).mean(), 0.002)
    if len(d_db):
        check("trenches", "defense.sack_rate", club, val(de.get("sack_rate")),
              d_db["sack"].fillna(0).mean(), 0.002)
    short = o_runs[o_runs["down"].isin([3, 4]) & (o_runs["ydstogo"] <= 2)]
    if len(short):
        conv = (short["first_down_rush"].fillna(0) == 1) | (short["touchdown"].fillna(0) == 1)
        check("trenches", "offense.short_success", club, val(off.get("short_success")), conv.mean(), 0.002)

# ---- 3. Team box totals (team_stats) vs nflverse weekly team stats ----
for club, data in clubs.items():
    ts = data.get("team_stats") or {}
    t = team[team["team"] == club]
    if not len(t):
        continue
    for key in ("passing_yards", "rushing_yards", "carries", "attempts", "completions", "passing_tds"):
        if key in t:
            check("team_stats", key, club, ts.get(key), t[key].sum(), 0)
    check("team_stats", "games", club, ts.get("games"), t["week"].nunique(), 0)

# ---- 4. Current-season scheme (FTN + pbp) ----
f = ftn.rename(columns={"nflverse_game_id": "game_id", "nflverse_play_id": "play_id"}).drop_duplicates(["game_id", "play_id"])
plays = pbp[pbp["play_type"].isin(["pass", "run"])].merge(f, on=["game_id", "play_id"], how="left")
for club, data in clubs.items():
    sc = data.get("scheme_current") or {}
    off = (sc.get("offense") or {})
    per = off.get("personnel") or {}
    o = plays[plays["posteam"] == club]
    if not len(o):
        continue
    check("scheme_current", "offense.shotgun_rate", club, per.get("formation_shotgun_rate"),
          o["shotgun"].fillna(0).mean(), 0.01)
    charted = o[o["is_motion"].notna()] if "is_motion" in o else o.iloc[0:0]
    charted_db = charted[charted["qb_dropback"] == 1]
    if len(charted_db):
        check("scheme_current", "offense.play_action_rate", club, per.get("play_action_rate"),
              charted_db["is_play_action"].astype(float).mean(), 0.01)
    if len(charted):
        check("scheme_current", "offense.motion_rate", club, per.get("motion_rate"),
              charted["is_motion"].astype(float).mean(), 0.01)
    resp = off.get("response") or {}
    check("scheme_current", "offense.pass_epa", club, resp.get("pass_epa"), o[o["pass"] == 1]["epa"].mean(), 0.02)
    check("scheme_current", "offense.rush_epa", club, resp.get("rush_epa"), o[o["rush"] == 1]["epa"].mean(), 0.02)

# ---- 5. QB season line (current window, look = all) vs the OFFICIAL line ----
# nflverse's weekly player stats are the official counting stats: attempts
# exclude sacks and two-point tries and include spikes. (The 2026-09-29 audit
# derived attempts from pass_attempt, which counts sacks, and so agreed with a
# pipeline that understated every completion rate.)
official = pd.read_parquet(PLAYER)
official = official[official["season_type"] == "REG"].groupby("player_id")[
    ["attempts", "completions", "passing_yards", "passing_tds", "passing_interceptions"]].sum()
plays = pbp[(pbp["two_point_attempt"].fillna(0) != 1)]
for club, data in clubs.items():
    for prof in data.get("player_scheme") or []:
        if prof.get("position") != "QB" or prof.get("source_season") != SEASON:
            continue
        allsplit = next((s for s in prof["splits"] if s["look"] == "all"), None)
        if not allsplit or prof["player_id"] not in official.index:
            continue
        o = official.loc[prof["player_id"]]
        who = f"{club} {prof['player_name']}"
        check("qb_line", "attempts", who, allsplit.get("attempts"), o["attempts"], 0)
        check("qb_line", "completions", who, allsplit.get("completions"), o["completions"], 0)
        check("qb_line", "passing_yards", who, allsplit.get("passing_yards"), o["passing_yards"], 0)
        check("qb_line", "completion_rate", who, allsplit.get("completion_rate"),
              o["completions"] / o["attempts"] if o["attempts"] else None, 0.002)
        check("qb_line", "yards_per_attempt", who, allsplit.get("yards_per_attempt"),
              o["passing_yards"] / o["attempts"] if o["attempts"] else None, 0.01)
        q = plays[(plays["passer_player_id"] == prof["player_id"]) & (plays["qb_dropback"] == 1)]
        check("qb_line", "dropbacks", who, allsplit.get("dropbacks"), len(q), 0)

# ---- 6. Red zone trips (a snap at the 20 or closer, per drive) ----
rz = pbp[(pbp["yardline_100"] <= 20) & pbp["play_type"].isin(["pass", "run", "field_goal", "punt", "qb_spike"])
         & (pbp["two_point_attempt"].fillna(0) != 1)]
for club, data in clubs.items():
    cur = ((data.get("red_zone") or {}).get("current") or {}).get("offense") or {}
    o = rz[rz["posteam"] == club]
    if not len(o):
        continue
    trips = o.groupby(["game_id", "fixed_drive"]).ngroups
    check("red_zone", "offense.trips", club, cur.get("trips"), trips, 0)

df = pd.DataFrame(rows, columns=["family", "metric", "club", "published", "recomputed", "status"])
print(f"through week {through_week}; {len(df)} checks")
print(df.groupby(["family", "status"]).size().unstack(fill_value=0))
bad = df[df["status"] != "ok"]
if len(bad):
    print("\nDIFF / MISSING by metric:")
    print(bad.groupby(["family", "metric", "status"]).size().to_string())
    print("\nexamples:")
    print(bad.head(40).to_string(index=False))
df.to_csv(sys.argv[1] if len(sys.argv) > 1 else "nfl_stat_audit.csv", index=False)
