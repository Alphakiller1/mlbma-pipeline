"""Special teams and situational context for the NFL matchup page (2026-11-18
audit: the desk's only special-teams figure was one DVOA row).

From nflverse play-by-play, regular season, with fixed definitions:

* **Field goals** by the kick's distance: under 40, 40-49, 50 and longer.
  Blocked kicks are misses. **Extra points** are PATs after touchdowns.
* **Net punt** is the punt's distance less the return, a touchback counted
  back to the 20; a blocked punt nets zero. It is read for the club's own
  punts and for the punts it receives.
* **Returns** average the yards on kickoffs and punts actually returned
  (touchbacks and fair catches are not returns), for the club's returners
  and for what its coverage allowed.
* **Starting field position** is the yard line of each drive's first snap,
  in the possessing club's own terms ("own 30" reads 30), for the club's
  drives and its opponents'.
* **Fourth down**: the go rate is runs and passes over all fourth downs
  that were not kneels, spikes or nullified; the conversion rate is over
  the go-for-it snaps; the defence is read on what opponents converted.
* **Two-minute** EPA per play is every run and pass with two minutes or
  less left in a half.
* **Penalties** are accepted fouls that cost yards: committed per game and
  drawn per game.

Everything is observed and ranked among the 32 clubs; nothing is projected.
"""
from __future__ import annotations

from typing import Any

from outputs import nfl_advanced_context as adv

ST_PBP_COLUMNS = (
    "game_id", "play_id", "season", "season_type", "home_team", "away_team", "posteam", "defteam",
    "play_type", "down", "yardline_100", "fixed_drive", "kick_distance", "field_goal_result",
    "extra_point_result", "punt_blocked", "punt_fair_catch", "return_yards", "return_team", "touchback",
    "kickoff_attempt", "punt_attempt", "field_goal_attempt", "extra_point_attempt",
    "fourth_down_converted", "half_seconds_remaining", "epa", "penalty", "penalty_team", "penalty_yards",
    "qb_kneel", "qb_spike", "two_point_attempt",
)

# key: (label, better, format). "ppa" prints EPA to three decimals, signed.
SPEC = {
    "fg_short": ("FG% Under 40", "high", "pct"),
    "fg_40s": ("FG% 40-49", "high", "pct"),
    "fg_long": ("FG% 50+", "high", "pct"),
    "xp_pct": ("XP%", "high", "pct"),
    "net_punt": ("Net Punt", "high", "num"),
    "opp_net_punt": ("Opp Net Punt", "low", "num"),
    "kr_avg": ("Kick Return Avg", "high", "num"),
    "kr_allowed": ("Kick Return Allowed", "low", "num"),
    "pr_avg": ("Punt Return Avg", "high", "num"),
    "pr_allowed": ("Punt Return Allowed", "low", "num"),
    "start_own": ("Start (Own Yard Line)", "high", "num"),
    "start_opp": ("Opp Start (Own Yard Line)", "low", "num"),
    "fourth_go_rate": ("4th-Down Go Rate", "neutral", "pct"),
    "fourth_conv": ("4th-Down Conversion", "high", "pct"),
    "fourth_conv_allowed": ("4th-Down Conversion Allowed", "low", "pct"),
    "two_min_epa": ("Two-Minute EPA/Play", "high", "ppa"),
    "two_min_epa_allowed": ("Two-Minute EPA/Play Allowed", "low", "ppa"),
    "penalties_pg": ("Penalties/G", "low", "num"),
    "penalty_yds_pg": ("Penalty Yds/G", "low", "num"),
    "drawn_pg": ("Penalties Drawn/G", "high", "num"),
}
# Counts carried beside a rate, so the page can say how many tries it rests on.
SAMPLES = {"fg_short": "fg_short_att", "fg_40s": "fg_40s_att", "fg_long": "fg_long_att", "xp_pct": "xp_att",
           "fourth_conv": "fourth_go", "fourth_conv_allowed": "fourth_go_faced"}


def _flag(series):
    return series.fillna(0).astype(float).gt(0)


def _mean(series) -> float | None:
    series = series.dropna()
    return round(float(series.mean()), 4) if len(series) else None


def _ratio(numerator: float, denominator: float) -> float | None:
    return round(float(numerator) / float(denominator), 4) if denominator else None


def club_figures(frame) -> dict[str, dict[str, Any]]:
    """{club: {figure: value}} over every regular-season play in ``frame``."""
    frame = frame[frame["season_type"].eq("REG")].copy()
    clubs = sorted({c for c in frame["posteam"].dropna().unique()} | {c for c in frame["defteam"].dropna().unique()})
    games = {club: frame.loc[frame["posteam"].eq(club) | frame["defteam"].eq(club), "game_id"].nunique()
             for club in clubs}
    out: dict[str, dict[str, Any]] = {club: {"games": int(games[club])} for club in clubs}

    fg = frame[_flag(frame["field_goal_attempt"])]
    for club, rows in fg.groupby("posteam"):
        for key, lo, hi in (("fg_short", 0, 39), ("fg_40s", 40, 49), ("fg_long", 50, 99)):
            band = rows[rows["kick_distance"].between(lo, hi)]
            out[club][key] = _ratio(band["field_goal_result"].eq("made").sum(), len(band))
            out[club][key + "_att"] = int(len(band))
    xp = frame[_flag(frame["extra_point_attempt"])]
    for club, rows in xp.groupby("posteam"):
        out[club]["xp_pct"] = _ratio(rows["extra_point_result"].eq("good").sum(), len(rows))
        out[club]["xp_att"] = int(len(rows))

    punts = frame[_flag(frame["punt_attempt"])].copy()
    blocked = _flag(punts["punt_blocked"])
    punts["net"] = punts["kick_distance"].fillna(0) - punts["return_yards"].fillna(0)
    punts.loc[_flag(punts["touchback"]), "net"] = punts["kick_distance"].fillna(0) - 20
    punts.loc[blocked, "net"] = 0
    for club, rows in punts.groupby("posteam"):
        out[club]["net_punt"] = _mean(rows["net"])
    for club, rows in punts.groupby("defteam"):
        out[club]["opp_net_punt"] = _mean(rows["net"])

    def returned(rows):
        return rows[~_flag(rows["touchback"]) & rows["return_yards"].notna() & rows["return_team"].notna()
                    & ~_flag(rows.get("punt_fair_catch", rows["touchback"] * 0))]
    kicks = returned(frame[_flag(frame["kickoff_attempt"])]).copy()
    kicks["kicking"] = kicks["home_team"].where(kicks["return_team"].ne(kicks["home_team"]), kicks["away_team"])
    for club, rows in kicks.groupby("return_team"):
        out[club]["kr_avg"] = _mean(rows["return_yards"])
    for club, rows in kicks.groupby("kicking"):
        out[club]["kr_allowed"] = _mean(rows["return_yards"])
    punt_returns = returned(punts[~blocked])
    for club, rows in punt_returns.groupby("return_team"):
        out[club]["pr_avg"] = _mean(rows["return_yards"])
    for club, rows in punt_returns.groupby("posteam"):
        out[club]["pr_allowed"] = _mean(rows["return_yards"])

    snaps = frame[frame["down"].notna() & frame["posteam"].notna() & frame["fixed_drive"].notna()
                  & ~frame["play_type"].isin(["kickoff", "extra_point"])]
    starts = snaps.sort_values("play_id").drop_duplicates(["game_id", "fixed_drive"], keep="first").copy()
    starts["own_line"] = 100 - starts["yardline_100"]
    for club, rows in starts.groupby("posteam"):
        out[club]["start_own"] = _mean(rows["own_line"])
    for club, rows in starts.groupby("defteam"):
        out[club]["start_opp"] = _mean(rows["own_line"])

    fourth = frame[frame["down"].eq(4) & frame["play_type"].isin(["pass", "run", "punt", "field_goal"])
                   & ~_flag(frame["qb_kneel"]) & ~_flag(frame["qb_spike"])]
    go = fourth[fourth["play_type"].isin(["pass", "run"])]
    for club, rows in fourth.groupby("posteam"):
        tried = go[go["posteam"].eq(club)]
        out[club]["fourth_go_rate"] = _ratio(len(tried), len(rows))
        out[club]["fourth_conv"] = _ratio(_flag(tried["fourth_down_converted"]).sum(), len(tried))
        out[club]["fourth_go"] = int(len(tried))
    for club, rows in go.groupby("defteam"):
        out[club]["fourth_conv_allowed"] = _ratio(_flag(rows["fourth_down_converted"]).sum(), len(rows))
        out[club]["fourth_go_faced"] = int(len(rows))

    late = frame[frame["half_seconds_remaining"].le(120) & frame["play_type"].isin(["pass", "run"])
                 & ~_flag(frame["two_point_attempt"])]
    for club, rows in late.groupby("posteam"):
        out[club]["two_min_epa"] = _mean(rows["epa"])
    for club, rows in late.groupby("defteam"):
        out[club]["two_min_epa_allowed"] = _mean(rows["epa"])

    flags = frame[_flag(frame["penalty"]) & frame["penalty_yards"].fillna(0).gt(0) & frame["penalty_team"].notna()]
    flags = flags.assign(drawn_by=flags["home_team"].where(flags["penalty_team"].ne(flags["home_team"]),
                                                           flags["away_team"]))
    for club in clubs:
        g = games[club] or 1
        mine = flags[flags["penalty_team"].eq(club)]
        out[club]["penalties_pg"] = round(len(mine) / g, 2)
        out[club]["penalty_yds_pg"] = round(float(mine["penalty_yards"].sum()) / g, 1)
        out[club]["drawn_pg"] = round(int(flags["drawn_by"].eq(club).sum()) / g, 2)
    return out


def rank(figures: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Each figure as a ranked entry among the clubs that have it."""
    out: dict[str, dict[str, Any]] = {club: {"games": f.get("games")} for club, f in figures.items()}
    for key, (label, better, fmt) in SPEC.items():
        pool = [(club, f[key]) for club, f in figures.items() if f.get(key) is not None]
        for club, value in pool:
            ahead = sum(1 for _, other in pool if (other < value if better == "low" else other > value))
            entry = {"label": label, "value": value, "better": better, "rank": ahead + 1,
                     "of": len(pool), "format": fmt}
            if key in SAMPLES and figures[club].get(SAMPLES[key]) is not None:
                n = figures[club][SAMPLES[key]]
                entry["n"] = n
                entry["label"] = f"{label} ({n} {'try' if n == 1 else 'tries'})"
            out[club][key] = entry
    return out


def build(season: int) -> dict[str, dict]:
    """{"current": {club: ...}, "combined": {club: ...}}; {} when the feed is down."""
    import pandas as pd

    frames = {}
    for year in (season - 1, season):
        frame = adv._frame(adv.PBP_URL.format(season=year), ST_PBP_COLUMNS)
        if frame is not None and not frame.empty:
            frames[year] = frame
    out: dict[str, dict] = {}
    if season in frames:
        current = club_figures(frames[season])
        if len(current) >= 30:
            out["current"] = rank(current)
    if frames:
        pooled = club_figures(pd.concat(list(frames.values()), ignore_index=True))
        if len(pooled) >= 30:
            out["combined"] = rank(pooled)
    return out
