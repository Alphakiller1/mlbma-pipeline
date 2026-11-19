"""NFL strength indices: OSI, DSI and NSI (2026-11-18).

The inputs (this season's raw and opponent-adjusted EPA per play, last
season's, and the margin so far) come from nflverse play-by-play; the index
math and its rationale are in outputs/strength_index.py. Weights
(outputs/nfl_strength_weights.json) were fitted at game level on 2017-2025:
predicting each later game, NSI's mean leave-one-season-out R^2 was 0.124
against 0.115 for the margin so far and 0.098 for raw net EPA; OSI and DSI
together 0.083 against 0.078 for the raw figures. Interceptions, fumbles and
third-down rate were tested and do not carry forward.
"""
from __future__ import annotations

import json
from pathlib import Path

from outputs import strength_index

PBP_URL = "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{season}.parquet"
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
    inputs = {t: {"off": float(raw_off[t]), "off_adj": float(adj_off[t]), "p_off": float(p_off.get(t, p_off.mean())),
                  "def": float(raw_def[t]), "def_adj": float(adj_def[t]), "p_def": float(p_def.get(t, p_def.mean())),
                  "m1": sum(margins[t]) / len(margins[t])}
              for t in raw_off.index if t in raw_def.index and t in margins}
    if len(inputs) < 32:
        print(f"  WARNING: strength index covers {len(inputs)} clubs; skipped")
        return {}
    spec = json.loads(WEIGHTS.read_text(encoding="utf-8"))
    out = strength_index.indices(inputs, spec, week)
    for block in out.values():
        block.update(week=week, season=season, prior_season=season - 1)
    print(f"  strength index: {len(out)} clubs through week {week}")
    return out
