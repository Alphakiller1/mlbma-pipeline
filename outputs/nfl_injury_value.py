"""What each NFL player is worth to the spread, and how often a player listed
his way has played (owner 2026-11-13).

The points come from scripts/fit_nfl_injury_value.py (outputs/
nfl_injury_value.json): closing lines priced each missing regular at a fixed
number of points per full snap share for his position group, plus, for a
quarterback, a quality term on his EPA per play over his last 16 games. A
player's value this week is that price times his snap share over his club's
last three games.

Play rates are nflverse's final weekly reports joined to snap counts, by game
status and by game status with the week's last practice participation.
"""
from __future__ import annotations

import io
import json
import re
import unicodedata
import urllib.request
from pathlib import Path

FIT = Path(__file__).with_name("nfl_injury_value.json")
RELEASE = "https://github.com/nflverse/nflverse-data/releases/download/{tag}/{name}"
RATE_FLOOR = 20
TEAM_ALIASES = {"WAS": "WSH", "LA": "LAR"}  # nflverse club codes -> ESPN's
PRACTICE = {"Did Not Practice": "DNP", "Limited Practice": "Limited", "Full Practice": "Full"}


def fit() -> dict:
    return json.loads(FIT.read_text(encoding="utf-8"))


def name_key(name: str) -> str:
    text = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().lower()
    parts = re.findall(r"[a-z0-9]+", text.replace("'", "").replace(".", ""))
    if len(parts) > 2 and parts[-1] in {"jr", "sr", "ii", "iii", "iv", "v"}:
        parts.pop()
    return "".join(parts)


def _read(tag: str, name: str, columns=None):
    import pandas as pd
    with urllib.request.urlopen(RELEASE.format(tag=tag, name=name), timeout=120) as response:
        return pd.read_parquet(io.BytesIO(response.read()), columns=columns)


def team_values(season: int, constants: dict | None = None) -> dict[str, dict[str, dict]]:
    """{team: {name key: {"value", "value_recent", "missed", "share", "group"}}}
    for every player who took a snap for his club this season.

    value         his share over his last three appearances: his role when
                  he plays, so a game he missed is not a zero.
    value_recent  his share over the club's last three games, a missed game
                  a zero - the measure the fit priced, so a long absence fades
                  from it the way it faded from the closing lines.
    missed        the club's games in a row, newest first, without a snap."""
    import numpy as np
    import pandas as pd
    constants = constants or fit()
    v = constants["value"]
    groups = constants["groups"]
    pts = v["points_per_share"]
    snaps = _read("snap_counts", f"snap_counts_{season}.parquet")
    snaps = snaps[snaps.game_type == "REG"].copy()
    snaps["group"] = snaps.position.map(groups)
    offense = snaps.group.isin({"QB", "RB", "WR", "TE", "OL"})
    snaps["share"] = np.where(offense, snaps.offense_pct, snaps.defense_pct).astype(float)
    snaps["share"] = snaps["share"].fillna(0)
    stats = pd.concat([_read("stats_player", f"stats_player_week_{y}.parquet") for y in (season - 1, season)])
    stats = stats[stats.season_type == "REG"].copy()
    stats["plays"] = stats.attempts.fillna(0) + stats.sacks_suffered.fillna(0) + stats.carries.fillna(0)
    stats["epa"] = stats.passing_epa.fillna(0) + stats.rushing_epa.fillna(0)
    qbs = stats[(stats.position == "QB") & (stats.plays >= 5)].sort_values(["season", "week"])
    league, shrink, window = v["league_qb_epa_per_play"], v["qb_shrink_plays"], v["qb_window_games"]
    quality = {}
    for name, g in qbs.groupby("player_display_name"):
        last = g.tail(window)
        quality[name_key(name)] = (last.epa.sum() + shrink * league) / (last.plays.sum() + shrink) - league
    out: dict[str, dict[str, dict]] = {}
    n = v["prior_games"]
    for team, tg in snaps.groupby("team"):
        weeks = sorted(tg.week.unique())
        played = tg[tg.share > 0].sort_values("week")
        shares = played.groupby(["player", "group"]).share.apply(lambda s: s.tail(n).mean())
        lately = played[played.week.isin(weeks[-n:])].groupby(["player", "group"]).share.sum() / min(n, len(weeks))
        last = played.groupby(["player", "group"]).week.max()
        table = {}
        for (player, group), share in shares.items():
            if group not in pts or share <= 0:
                continue
            key = name_key(player)
            q = quality.get(key, 0.0) if group == "QB" else None
            price = float(pts[group] + (pts["qbq"] * q if q is not None else 0.0))  # points per full share
            recent = float(lately.get((player, group), 0.0))
            row = {"value": round(max(price * float(share), 0.0), 2),
                   "value_recent": round(max(price * recent, 0.0), 2),
                   "missed": sum(1 for w in weeks if w > last[(player, group)]),
                   "share": round(float(share), 3), "group": group}
            if q is not None:
                row["qb_quality"] = round(float(q), 4)
            if key not in table or table[key]["value"] < row["value"]:
                table[key] = row
        out[TEAM_ALIASES.get(team, team)] = table
    return out


def play_rates(constants: dict | None = None) -> dict:
    """The published table: by status, and by status with last practice."""
    rates = (constants or fit())["play_rates"]
    return {"by_status": rates["by_status"], "by_status_practice": rates["by_status_practice"],
            "seasons": rates["seasons"], "method": rates["method"]}
