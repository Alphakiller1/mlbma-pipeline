"""Every NFL team's game log for the matchup desk: the final score, a
noise-adjusted score, and the surface and advanced numbers behind each game.

The noise-adjusted score keeps everything a team controls and replaces the
parts of a final score that are mostly luck with what an average team would
have got from the same chances:

  * field goals and extra points count at the league's make rate for that
    distance, not at their actual result (3 x (made - expected) per FG);
  * fumble recoveries, which go roughly 50/50 whatever the team, count at the
    league's average fumble outcome: each fumble's EPA is replaced with the
    mean EPA of all fumbles, and the net swing is split across both scores;
  * defensive and return touchdowns (scored by the team without the ball)
    count at the league's average per team-game rather than as they fell.

Interceptions and everything else stay as played. Constants are measured from
the prior and current regular seasons together and published with the log.
Every per-game rate is placed as a percentile among all team-games this
season.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pandas as pd

PBP_URL = ("https://github.com/nflverse/nflverse-data/releases/download/pbp/"
           "play_by_play_{season}.parquet")
COLUMNS = (
    "game_id", "season_type", "week", "posteam", "defteam", "home_team", "away_team",
    "home_score", "away_score", "play_type", "epa", "success", "yards_gained",
    "field_goal_result", "kick_distance", "extra_point_result", "fumble", "fumble_lost",
    "interception", "touchdown", "td_team", "third_down_converted", "third_down_failed",
    "sack", "pass", "rush",
)
# The slate's club codes (nflverse writes WAS and LA).
TEAM_ALIAS = {"WAS": "WSH", "LA": "LAR"}
MIN_GAMES = 16

# [key, higher is better]
RATES = (
    ("off_epa_play", True), ("def_epa_play", False),
    ("off_success", True), ("def_success", False),
    ("yards", True), ("yards_allowed", False),
    ("yards_per_play", True), ("yards_per_play_allowed", False),
    ("turnover_margin", True), ("third_down", True),
)


def _canon(team: object) -> str:
    key = str(team or "").upper()
    return TEAM_ALIAS.get(key, key)


def _load(season: int) -> pd.DataFrame | None:
    try:
        frame = pd.read_parquet(PBP_URL.format(season=season), columns=list(COLUMNS))
    except Exception as exc:  # noqa: BLE001 - a missing season is a skip, not a crash
        print(f"  WARNING: play-by-play {season} unavailable ({exc})")
        return None
    return frame[frame["season_type"].eq("REG")].copy()


def luck_constants(frames: list[pd.DataFrame]) -> dict[str, Any]:
    both = pd.concat(frames, ignore_index=True)
    fg = both[both["play_type"].eq("field_goal")].dropna(subset=["kick_distance"])
    fg = fg.assign(bin=(fg["kick_distance"] // 5 * 5).astype(int),
                   made=fg["field_goal_result"].eq("made").astype(float))
    fg_rate = {int(k): round(float(v), 4) for k, v in fg.groupby("bin")["made"].mean().items()}
    xp = both[both["play_type"].eq("extra_point")]
    xp_rate = float(xp["extra_point_result"].eq("good").mean())
    fumbles = both[both["fumble"].eq(1) & both["epa"].notna() & both["play_type"].isin(["pass", "run"])]
    nonoff = both[both["touchdown"].eq(1) & both["td_team"].notna() & both["td_team"].ne(both["posteam"])]
    team_games = both["game_id"].nunique() * 2
    return {
        "fg_make_rate_by_distance": fg_rate,
        "xp_make_rate": round(xp_rate, 4),
        "fumble_mean_epa": round(float(fumbles["epa"].mean()), 4),
        "non_offensive_td_per_team_game": round(len(nonoff) / team_games, 4) if team_games else 0.0,
    }


def _fg_expected(distance: float, rates: dict[int, float]) -> float:
    key = int(distance // 5 * 5)
    if key in rates:
        return rates[key]
    nearest = min(rates, key=lambda k: abs(k - key))
    return rates[nearest]


def _game_rows(game: pd.DataFrame, k: dict[str, Any]) -> list[dict]:
    home, away = game["home_team"].iloc[0], game["away_team"].iloc[0]
    final = {home: int(game["home_score"].max()), away: int(game["away_score"].max())}
    luck = {home: 0.0, away: 0.0}
    nonoff_points = 6 + k["xp_make_rate"]
    plays = game[game["play_type"].isin(["pass", "run"])]
    for team in (home, away):
        opp = away if team == home else home
        fg = game[game["posteam"].eq(team) & game["play_type"].eq("field_goal")].dropna(
            subset=["kick_distance"])
        expected = sum(_fg_expected(d, k["fg_make_rate_by_distance"]) for d in fg["kick_distance"])
        luck[team] += 3 * (int(fg["field_goal_result"].eq("made").sum()) - expected)
        xp = game[game["posteam"].eq(team) & game["play_type"].eq("extra_point")]
        luck[team] += int(xp["extra_point_result"].eq("good").sum()) - k["xp_make_rate"] * len(xp)
        nonoff = game[game["touchdown"].eq(1) & game["td_team"].eq(team) & game["posteam"].ne(team)]
        luck[team] += (len(nonoff) - k["non_offensive_td_per_team_game"]) * nonoff_points
        fumbles = plays[plays["posteam"].eq(team) & plays["fumble"].eq(1) & plays["epa"].notna()]
        net = float((fumbles["epa"] - k["fumble_mean_epa"]).sum())
        luck[team] += net / 2
        luck[opp] -= net / 2

    rows = []
    for team in (home, away):
        opp = away if team == home else home
        off = plays[plays["posteam"].eq(team)]
        dfn = plays[plays["posteam"].eq(opp)]
        give = int(off["interception"].fillna(0).sum() + off["fumble_lost"].fillna(0).sum())
        take = int(dfn["interception"].fillna(0).sum() + dfn["fumble_lost"].fillna(0).sum())
        third_att = int(off["third_down_converted"].fillna(0).sum() + off["third_down_failed"].fillna(0).sum())
        third_conv = int(off["third_down_converted"].fillna(0).sum())
        rows.append({
            "game_id": game["game_id"].iloc[0],
            "week": int(game["week"].iloc[0]),
            "team": _canon(team), "opp": _canon(opp), "home": team == home,
            "points": final[team], "opp_points": final[opp],
            "adj_points": round(final[team] - luck[team], 1),
            "opp_adj_points": round(final[opp] - luck[opp], 1),
            "off_epa_play": float(off["epa"].mean()) if len(off) else None,
            "def_epa_play": float(dfn["epa"].mean()) if len(dfn) else None,
            "off_success": float(off["success"].mean()) if len(off) else None,
            "def_success": float(dfn["success"].mean()) if len(dfn) else None,
            "yards": int(off["yards_gained"].fillna(0).sum()),
            "yards_allowed": int(dfn["yards_gained"].fillna(0).sum()),
            "yards_per_play": float(off["yards_gained"].fillna(0).mean()) if len(off) else None,
            "yards_per_play_allowed": float(dfn["yards_gained"].fillna(0).mean()) if len(dfn) else None,
            "giveaways": give, "takeaways": take, "turnover_margin": take - give,
            "third_down": third_conv / third_att if third_att else None,
            "third_down_made": third_conv, "third_down_att": third_att,
        })
    return rows


def _percentile(pool: list[float], value: float, higher: bool) -> float:
    beaten = sum(1 for other in pool if (other < value if higher else other > value))
    ties = sum(1 for other in pool if other == value) - 1
    return round(100.0 * (beaten + max(ties, 0) / 2) / max(len(pool) - 1, 1), 1)


def build(season: int | None = None) -> dict | None:
    season = season or datetime.now(timezone.utc).year
    current = _load(season)
    if current is None or current.empty:
        return None
    prior = _load(season - 1)
    k = luck_constants([f for f in (prior, current) if f is not None])
    rows = [row for _, game in current.groupby("game_id") for row in _game_rows(game, k)]
    if len(rows) < MIN_GAMES * 2:
        print(f"  WARNING: only {len(rows)} team-games; not publishing a game log")
        return None
    pools = {key: [r[key] for r in rows if r[key] is not None] for key, _ in RATES}
    teams: dict[str, list[dict]] = {}
    for row in rows:
        game = {key: row[key] for key in ("game_id", "week", "opp", "home", "points", "opp_points",
                                          "adj_points", "opp_adj_points", "giveaways", "takeaways",
                                          "third_down_made", "third_down_att")}
        for key, higher in RATES:
            value = row[key]
            game[key] = None if value is None else {
                "value": round(value, 3), "percentile": _percentile(pools[key], value, higher)}
        teams.setdefault(row["team"], []).append(game)
    for games in teams.values():
        games.sort(key=lambda g: g["week"])
    return {
        "season": season,
        "through_week": int(current["week"].max()),
        "team_games": len(rows),
        "luck_rates": k,
        "teams": teams,
    }
