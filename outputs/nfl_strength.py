"""NFL strength indices: OSI, DSI and NSI (2026-11-18).

The inputs (this season's raw and opponent-adjusted EPA per play, last
season's, and the margin so far) come from nflverse play-by-play; the index
math and its rationale are in outputs/strength_index.py. Weights
(outputs/nfl_strength_weights.json) were fitted at game level on 2017-2025:
predicting each later game, NSI's mean leave-one-season-out R^2 was 0.124
against 0.115 for the margin so far and 0.098 for raw net EPA; OSI and DSI
together 0.083 against 0.078 for the raw figures. Interceptions, fumbles and
third-down rate were tested and do not carry forward.

The quarterback read (2026-11-19): each club's current quarterback is its
passer with the most dropbacks in its latest game, and he carries his own
last-season EPA per dropback with any club, shrunk toward replacement level
by 150 dropbacks (nflverse weekly player stats). It lifted NSI to 0.127 and
OSI/DSI to 0.086, in every week. Discounting the club's prior when the
quarterback changed was tested and lost accuracy: the rest of the offense
carries over.
"""
from __future__ import annotations

import json
from pathlib import Path

from outputs import strength_index

PBP_URL = "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{season}.parquet"
WEEK_URL = "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{season}.parquet"
QB_SHRINK = 150.0        # dropbacks of replacement-level play mixed into a quarterback's figure
BACKUP_DROPBACKS = 200   # a season under this many dropbacks defines replacement level
WEIGHTS = Path(__file__).with_name("nfl_strength_weights.json")
COLUMNS = ("game_id", "week", "season_type", "posteam", "defteam", "epa", "play_type", "qb_kneel", "qb_spike",
           "two_point_attempt", "wp", "home_team", "away_team", "result")
ITERATIONS = 15


def _team(code) -> str:
    return {"LA": "LAR", "JAC": "JAX", "OAK": "LV", "SD": "LAC", "STL": "LAR"}.get(str(code), str(code))


def _plays(season: int):
    import pandas as pd
    try:
        df = pd.read_parquet(PBP_URL.format(season=season), columns=list(COLUMNS))
    except Exception as exc:  # network or a season not published
        print(f"  WARNING: strength index play-by-play {season} unavailable ({exc})")
        return None
    df = df[df["season_type"].eq("REG")].copy()
    for col in ("posteam", "defteam", "home_team", "away_team"):
        df[col] = df[col].map(_team)
    return df


def _qb_weeks(season: int):
    """Quarterbacks' regular-season weeks: club, dropbacks (attempts + sacks), passing EPA."""
    import pandas as pd
    try:
        w = pd.read_parquet(WEEK_URL.format(season=season))
    except Exception as exc:  # network or a season not published
        print(f"  WARNING: strength index quarterback weeks {season} unavailable ({exc})")
        return None
    w = w[w["season_type"].eq("REG") & w["position"].eq("QB")].copy()
    w["team"] = w["team"].map(_team)
    w["db"] = w["attempts"].fillna(0) + w["sacks_suffered"].fillna(0)
    w["passing_epa"] = w["passing_epa"].fillna(0.0)
    return w[w["db"] > 0][["player_id", "player_display_name", "team", "week", "db", "passing_epa"]]


def quarterbacks(season: int, through_week: int) -> dict[str, dict]:
    """{club: {"name", "qb_epa", "qb_league", "prior_dropbacks"}}: the passer
    with the most dropbacks in the club's latest game through the week, and
    his last-season EPA per dropback with any club, shrunk toward replacement
    level. {} when either season's weekly file is unavailable."""
    now, before = _qb_weeks(season), _qb_weeks(season - 1)
    if now is None or before is None or now.empty or before.empty:
        return {}
    now = now[now["week"] <= through_week]
    rates = before.groupby("player_id")[["db", "passing_epa"]].sum()
    league = rates["passing_epa"].sum() / rates["db"].sum()
    backups = rates[rates["db"] < BACKUP_DROPBACKS]
    replacement = backups["passing_epa"].sum() / backups["db"].sum() if backups["db"].sum() else league
    latest = now[now["week"] == now.groupby("team")["week"].transform("max")]
    out = {}
    for team, rows in latest.groupby("team"):
        top = rows.sort_values("db").iloc[-1]
        n = float(rates.at[top["player_id"], "db"]) if top["player_id"] in rates.index else 0.0
        e = float(rates.at[top["player_id"], "passing_epa"]) if n else 0.0
        out[team] = {"name": str(top["player_display_name"]), "prior_dropbacks": int(n),
                     "qb_epa": (e + QB_SHRINK * replacement) / (n + QB_SHRINK), "qb_league": float(league)}
    return out


def _team_games(df):
    """One row per team-game: offense EPA per play and the EPA per play allowed."""
    p = df[df["epa"].notna() & df["play_type"].isin(["pass", "run"]) & df["qb_kneel"].fillna(0).eq(0)
           & df["qb_spike"].fillna(0).eq(0) & df["two_point_attempt"].fillna(0).eq(0) & df["wp"].between(0.05, 0.95)]
    tg = p.groupby(["game_id", "posteam", "defteam"])["epa"].mean().reset_index()
    tg.columns = ["game_id", "team", "opp", "off"]
    allowed = tg.rename(columns={"team": "opp", "opp": "team", "off": "def"})[["game_id", "team", "def"]]
    return tg.merge(allowed, on=["game_id", "team"]).dropna()


def _adjusted(tg):
    league = tg["off"].mean()
    oa, da = tg.groupby("team")["off"].mean(), tg.groupby("team")["def"].mean()
    for _ in range(ITERATIONS):
        x = tg.assign(oadj=tg["off"] - (tg["opp"].map(da) - league), dadj=tg["def"] - (tg["opp"].map(oa) - league))
        oa, da = x.groupby("team")["oadj"].mean(), x.groupby("team")["dadj"].mean()
    return oa, da


def build(season: int) -> dict[str, dict]:
    """{club: {"week", "osi", "dsi", "nsi", "inputs", "weights"}}; {} without
    this season's and last season's play-by-play or before week 1."""
    current, prior = _plays(season), _plays(season - 1)
    if current is None or current.empty or prior is None or prior.empty:
        return {}
    tg = _team_games(current)
    if tg.empty:
        return {}
    week = int(current.loc[current["game_id"].isin(tg["game_id"]), "week"].max())
    adj_off, adj_def = _adjusted(tg)
    p_off, p_def = _adjusted(_team_games(prior))
    games = current.groupby("game_id").agg(home=("home_team", "first"), away=("away_team", "first"),
                                           result=("result", "first")).dropna()
    margins: dict[str, list[float]] = {}
    for g in games.itertuples():
        margins.setdefault(g.home, []).append(g.result)
        margins.setdefault(g.away, []).append(-g.result)
    raw_off, raw_def = tg.groupby("team")["off"].mean(), tg.groupby("team")["def"].mean()
    qbs = quarterbacks(season, week)
    inputs = {t: {"off": float(raw_off[t]), "off_adj": float(adj_off[t]), "p_off": float(p_off.get(t, p_off.mean())),
                  "def": float(raw_def[t]), "def_adj": float(adj_def[t]), "p_def": float(p_def.get(t, p_def.mean())),
                  "m1": sum(margins[t]) / len(margins[t]),
                  "qb_epa": (qbs.get(t) or {}).get("qb_epa"), "qb_league": (qbs.get(t) or {}).get("qb_league")}
              for t in raw_off.index if t in raw_def.index and t in margins}
    if len(inputs) < 32:
        print(f"  WARNING: strength index covers {len(inputs)} clubs; skipped")
        return {}
    spec = json.loads(WEIGHTS.read_text(encoding="utf-8"))
    out = strength_index.indices(inputs, spec, week)
    for team, block in out.items():
        block.update(week=week, season=season, prior_season=season - 1)
        if qbs.get(team):
            block["qb"] = {"name": qbs[team]["name"], "prior_dropbacks": qbs[team]["prior_dropbacks"]}
    print(f"  strength index: {len(out)} clubs through week {week} ({len(qbs)} with a quarterback read)")
    return out
