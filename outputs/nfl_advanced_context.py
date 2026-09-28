"""Observed NFL player scheme and line-of-scrimmage context.

Current-season box/blitz data comes from FTN Data via nflverse and is joined
to nflfastR play-by-play. Coverage and defensive-personnel tags are published
after a season closes, so those splits use the immediately prior season and
carry that season on every profile. Missing charting stays missing.
"""
from __future__ import annotations

import math
import re
from typing import Any

from outputs import nfl_run_game, sharp_nfl

PBP_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/pbp/"
    "play_by_play_{season}.parquet"
)
FTN_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/ftn_charting/"
    "ftn_charting_{season}.parquet"
)
PARTICIPATION_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/pbp_participation/"
    "pbp_participation_{season}.parquet"
)
NGS_RUSHING_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats/"
    "ngs_rushing.parquet"
)
NGS_PASSING_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats/"
    "ngs_passing.parquet"
)
PFR_RUSHING_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/pfr_advstats/"
    "advstats_week_rush_{season}.parquet"
)

PBP_COLUMNS = (
    "game_id", "play_id", "season", "season_type", "week", "posteam", "defteam",
    "passer_player_id", "passer_player_name", "rusher_player_id", "rusher_player_name",
    "receiver_player_id", "receiver_player_name", "receiving_yards",
    "qb_dropback", "rush_attempt", "pass_attempt", "complete_pass", "passing_yards",
    "pass_touchdown", "interception", "sack", "qb_hit", "epa", "success",
    "yards_gained", "tackled_for_loss", "fumble_forced", "fumble_lost",
    "down", "ydstogo", "yardline_100", "run_location", "run_gap",
    "qb_kneel", "qb_scramble", "first_down_rush", "touchdown",
)


def _frame(url: str, columns: tuple[str, ...]):
    try:
        import pandas as pd
        return pd.read_parquet(url, columns=list(columns))
    except Exception as exc:
        print(f"  WARNING: NFL advanced data unavailable ({url.rsplit('/', 1)[-1]}: {exc})")
        return None


def _joined(season: int, participation: bool):
    pbp = _frame(PBP_URL.format(season=season), PBP_COLUMNS)
    if pbp is None:
        return None
    pbp = pbp[pbp["season_type"].eq("REG")].copy()
    ftn = _frame(FTN_URL.format(season=season), (
        "nflverse_game_id", "nflverse_play_id", "n_defense_box",
        "n_blitzers", "n_pass_rushers", "date_pulled",
    ))
    if ftn is not None:
        ftn = ftn.rename(columns={
            "nflverse_game_id": "game_id", "nflverse_play_id": "play_id",
        }).drop_duplicates(["game_id", "play_id"], keep="last")
        pbp = pbp.merge(ftn, on=["game_id", "play_id"], how="left")
    if participation:
        part = _frame(PARTICIPATION_URL.format(season=season), (
            "nflverse_game_id", "play_id", "defenders_in_box", "defense_personnel",
            "was_pressure", "defense_man_zone_type", "defense_coverage_type",
        ))
        if part is not None:
            part = part.rename(columns={"nflverse_game_id": "game_id"})
            part = part.drop_duplicates(["game_id", "play_id"], keep="last")
            pbp = pbp.merge(part, on=["game_id", "play_id"], how="left")
    return pbp


def _safe_ratio(numerator: float, denominator: float) -> float | None:
    return round(float(numerator) / float(denominator), 4) if denominator else None


def _finite(value: object) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _name_key(value: object) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def _bare_name(value: object) -> str:
    """A name key that ignores suffixes: PFR prints "Michael Penix", others "Michael Penix Jr."."""
    return re.sub(r"(jr|sr|ii|iii|iv|v)$", "", _name_key(value))


def _team(value: object) -> str:
    return {"LA": "LAR", "JAC": "JAX", "OAK": "LV", "SD": "LAC",
            "STL": "LAR"}.get(str(value or "").upper(), str(value or "").upper())


def _ngs_rushing(season: int) -> dict[str, dict[str, Any]]:
    """Latest cumulative regular-season NGS rushing row per player."""
    frame = _frame(NGS_RUSHING_URL, (
        "season", "season_type", "week", "player_display_name", "player_position",
        "team_abbr", "efficiency", "percent_attempts_gte_eight_defenders",
        "avg_time_to_los", "rush_attempts", "expected_rush_yards",
        "rush_yards_over_expected", "rush_yards_over_expected_per_att",
        "rush_pct_over_expected", "player_gsis_id",
    ))
    if frame is None:
        return {}
    frame = frame[(frame["season"].eq(season)) & frame["season_type"].eq("REG") &
                  frame["player_position"].eq("RB")].copy()
    frame = frame.sort_values("week").drop_duplicates("player_gsis_id", keep="last")
    out: dict[str, dict[str, Any]] = {}
    for row in frame.to_dict("records"):
        attempts = _finite(row.get("rush_attempts")) or 0
        player_id = str(row.get("player_gsis_id") or "")
        if not player_id or attempts <= 0:
            continue
        out[player_id] = {
            "season": season,
            "week": int(row.get("week") or 0),
            "attempts": int(attempts),
            "eight_plus_box_rate": (round(_finite(row.get("percent_attempts_gte_eight_defenders")) / 100, 4)
                                    if _finite(row.get("percent_attempts_gte_eight_defenders")) is not None else None),
            "avg_time_to_los": (round(_finite(row.get("avg_time_to_los")), 3)
                                if _finite(row.get("avg_time_to_los")) is not None else None),
            "expected_yards_per_carry": _safe_ratio(_finite(row.get("expected_rush_yards")) or 0, attempts),
            "ryoe_per_carry": (round(_finite(row.get("rush_yards_over_expected_per_att")), 4)
                               if _finite(row.get("rush_yards_over_expected_per_att")) is not None else None),
            "rush_pct_over_expected": (round(_finite(row.get("rush_pct_over_expected")), 4)
                                       if _finite(row.get("rush_pct_over_expected")) is not None else None),
            "source": "NFL Next Gen Stats via nflverse",
        }
    return out


def _ngs_passing(season: int) -> dict[str, dict[str, Any]]:
    """Latest cumulative regular-season NGS passing row per quarterback."""
    frame = _frame(NGS_PASSING_URL, (
        "season", "season_type", "week", "player_display_name", "player_position",
        "team_abbr", "avg_time_to_throw", "attempts", "player_gsis_id",
    ))
    if frame is None:
        return {}
    frame = frame[(frame["season"].eq(season)) & frame["season_type"].eq("REG") &
                  frame["player_position"].eq("QB")].copy()
    frame = frame.sort_values("week").drop_duplicates("player_gsis_id", keep="last")
    out: dict[str, dict[str, Any]] = {}
    for row in frame.to_dict("records"):
        attempts = _finite(row.get("attempts")) or 0
        player_id = str(row.get("player_gsis_id") or "")
        time_to_throw = _finite(row.get("avg_time_to_throw"))
        if not player_id or attempts <= 0 or time_to_throw is None:
            continue
        out[player_id] = {
            "season": season,
            "week": int(row.get("week") or 0),
            "attempts": int(attempts),
            "avg_time_to_throw": round(time_to_throw, 3),
            "source": "NFL Next Gen Stats via nflverse",
        }
    return out


def _pfr_rushing(season: int, rb_names: set[str]):
    frame = _frame(PFR_RUSHING_URL.format(season=season), (
        "season", "week", "game_type", "team", "opponent", "pfr_player_name",
        "carries", "rushing_yards_before_contact", "rushing_yards_after_contact",
    ))
    if frame is None:
        return None
    frame = frame[(frame["season"].eq(season)) & frame["game_type"].eq("REG")].copy()
    # Quarterbacks and receivers also appear in PFR's rushing file. Restrict
    # line-push aggregation to players whose official season position is RB.
    frame = frame[frame["pfr_player_name"].map(_name_key).isin(rb_names)].copy()
    frame["team"] = frame["team"].map(_team)
    frame["opponent"] = frame["opponent"].map(_team)
    return frame


def _player_stats(rows, position: str) -> dict[str, Any] | None:
    games = int(rows["game_id"].nunique()) if "game_id" in rows else 0
    if position == "QB":
        dropbacks = int(rows["qb_dropback"].fillna(0).sum())
        attempts = int(rows["pass_attempt"].fillna(0).sum())
        if not dropbacks:
            return None
        completions = int(rows["complete_pass"].fillna(0).sum())
        return {
            "dropbacks": dropbacks,
            "attempts": attempts,
            "completions": completions,
            "passing_yards": int(rows["passing_yards"].fillna(0).sum()),
            "passing_tds": int(rows["pass_touchdown"].fillna(0).sum()),
            "interceptions": int(rows["interception"].fillna(0).sum()),
            "games": games,
            "dropbacks_per_game": _safe_ratio(dropbacks, games),
            "passing_yards_per_game": _safe_ratio(rows["passing_yards"].fillna(0).sum(), games),
            "completion_rate": _safe_ratio(completions, attempts),
            "yards_per_attempt": _safe_ratio(rows["passing_yards"].fillna(0).sum(), attempts),
            "epa_per_dropback": round(float(rows["epa"].fillna(0).sum()) / dropbacks, 4),
            "success_rate": round(float(rows["success"].fillna(0).mean()), 4),
        }
    carries = int(rows["rush_attempt"].fillna(0).sum())
    if not carries:
        return None
    yards = float(rows["yards_gained"].fillna(0).sum())
    return {
        "carries": carries,
        "rushing_yards": int(yards),
        "rushing_tds": int(rows["touchdown"].fillna(0).sum()),
        "games": games,
        "carries_per_game": _safe_ratio(carries, games),
        "rushing_yards_per_game": _safe_ratio(yards, games),
        "yards_per_carry": round(yards / carries, 4),
        "epa_per_carry": round(float(rows["epa"].fillna(0).sum()) / carries, 4),
        "success_rate": round(float(rows["success"].fillna(0).mean()), 4),
    }


def _receiver_stats(rows) -> dict[str, Any] | None:
    """Targets and what came of them: the receiving side of a split."""
    targets = int(len(rows))
    if not targets:
        return None
    receptions = int(rows["complete_pass"].fillna(0).sum())
    yards_col = "receiving_yards" if "receiving_yards" in rows else "yards_gained"
    yards = float(rows[yards_col].fillna(0).sum())
    return {
        "targets": targets,
        "receptions": receptions,
        "receiving_yards": int(yards),
        "touchdowns": int(rows["pass_touchdown"].fillna(0).sum()),
        "catch_rate": _safe_ratio(receptions, targets),
        "yards_per_target": round(yards / targets, 4),
        "epa_per_target": round(float(rows["epa"].fillna(0).sum()) / targets, 4),
    }


def _receiver_profiles(frame, season: int, names: dict[str, str],
                       positions: dict[str, str]) -> list[dict]:
    """WR / TE / RB targets split by the defense's coverage, shell and rush.

    A target is a pass attempt with a named receiver (sacks and throwaways
    have none). Coverage, shell and pressure exist only where the season's
    participation data is joined; the current season carries its charted
    blitz and box looks until that data publishes.
    """
    if "receiver_player_id" not in frame:
        return []
    targets = frame[frame["pass_attempt"].fillna(0).eq(1) & frame["receiver_player_id"].notna()]
    profiles = []
    for (team, player_id), rows in targets.groupby(["posteam", "receiver_player_id"], dropna=True):
        position = positions.get(str(player_id))
        if position not in ("WR", "TE", "RB"):
            continue
        splits = {}
        for look, mask in _split_masks(rows, "REC").items():
            stats = _receiver_stats(rows[mask])
            if stats:
                splits[look] = stats
        if not splits:
            continue
        fallback = (str(rows["receiver_player_name"].dropna().iloc[0])
                    if rows["receiver_player_name"].notna().any() else str(player_id))
        profiles.append({
            "player_id": str(player_id), "player_name": names.get(str(player_id), fallback),
            "team": _team(team), "position": position, "source_season": season,
            "splits": splits,
        })
    return profiles


def _db_count(value: object) -> int | None:
    text = str(value or "")
    if not text or text == "nan":
        return None
    total = 0
    for count, position in re.findall(r"(\d+)\s+(CB|DB|FS|SS|S|NB)", text.upper()):
        total += int(count)
    return total or None


def _split_masks(rows, position: str) -> dict[str, Any]:
    masks: dict[str, Any] = {"all": rows.index == rows.index}
    if "n_blitzers" in rows:
        known = rows["n_blitzers"].notna()
        # FTN's field is the number of blitzers, not total pass rushers.
        masks.update({"blitz": known & rows["n_blitzers"].gt(0),
                      "no_blitz": known & rows["n_blitzers"].eq(0)})
    box_col = "n_defense_box" if "n_defense_box" in rows else "defenders_in_box"
    if box_col in rows:
        known = rows[box_col].notna()
        masks.update({"stacked_box": known & rows[box_col].ge(8),
                      "light_box": known & rows[box_col].le(6)})
    if position in ("QB", "REC") and "defense_coverage_type" in rows:
        coverage = rows["defense_coverage_type"].fillna("").astype(str).str.upper()
        man_zone = rows["defense_man_zone_type"].fillna("").astype(str).str.upper()
        masks.update({"man": man_zone.eq("MAN_COVERAGE"), "zone": man_zone.eq("ZONE_COVERAGE")})
        for raw, public in (("COVER_0", "cover_0"), ("COVER_1", "cover_1"),
                            ("COVER_2", "cover_2"), ("COVER_3", "cover_3"),
                            ("COVER_4", "cover_4"), ("COVER_6", "cover_6"),
                            ("2_MAN", "cover_2_man")):
            masks[public] = coverage.eq(raw)
        single = coverage.isin(["COVER_1", "COVER_3"])
        two = coverage.isin(["COVER_2", "COVER_4", "COVER_6", "2_MAN"])
        masks.update({"single_high": single, "middle_field_closed": single,
                      "two_high": two, "middle_field_open": two})
        if "was_pressure" in rows:
            known = rows["was_pressure"].notna()
            masks.update({"pressure": known & rows["was_pressure"].eq(True),
                          "clean": known & rows["was_pressure"].eq(False)})
    if position == "RB":
        if "defense_personnel" in rows:
            dbs = rows["defense_personnel"].map(_db_count)
            masks.update({"base": dbs.le(4), "nickel": dbs.eq(5), "dime": dbs.ge(6)})
        if "run_location" in rows:
            location = rows["run_location"].fillna("").astype(str).str.lower()
            for look in ("left", "middle", "right"):
                masks[look] = location.eq(look)
        if "run_gap" in rows:
            gap = rows["run_gap"].fillna("").astype(str).str.lower()
            for look in ("guard", "tackle", "end"):
                masks[f"gap_{look}"] = gap.eq(look)
    return masks


def _player_profiles(frame, season: int, names: dict[str, str],
                     positions: dict[str, str],
                     ngs_rushing: dict[str, dict[str, Any]] | None = None,
                     ngs_passing: dict[str, dict[str, Any]] | None = None,
                     qb_pressure: dict[str, dict[str, Any]] | None = None) -> list[dict]:
    profiles = []
    for position, id_col, name_col, family, flag in (
        ("QB", "passer_player_id", "passer_player_name", "passing", "qb_dropback"),
        ("RB", "rusher_player_id", "rusher_player_name", "rushing", "rush_attempt"),
    ):
        subset = frame[frame[flag].fillna(0).eq(1) & frame[id_col].notna()].copy()
        for (team, player_id), rows in subset.groupby(["posteam", id_col], dropna=True):
            # A rusher ID can be a scrambling quarterback or a receiver on a
            # jet sweep. Publish the RB table only for players whose official
            # season-stat position is RB; role inference from one play is not
            # a position chart.
            if positions.get(str(player_id)) != position:
                continue
            splits = {}
            for look, mask in _split_masks(rows, position).items():
                stats = _player_stats(rows[mask], position)
                if stats:
                    splits[look] = stats
            if not splits:
                continue
            fallback = str(rows[name_col].dropna().iloc[0]) if rows[name_col].notna().any() else str(player_id)
            profile = {
                "player_id": str(player_id), "player_name": names.get(str(player_id), fallback),
                "team": str(team), "position": position, "source_season": season,
                "play_family": family, "splits": splits,
            }
            if position == "RB" and ngs_rushing and str(player_id) in ngs_rushing:
                profile["tracking"] = ngs_rushing[str(player_id)]
            if position == "QB" and ngs_passing and str(player_id) in ngs_passing:
                profile["tracking"] = ngs_passing[str(player_id)]
            if position == "QB" and qb_pressure and _bare_name(profile["player_name"]) in qb_pressure:
                profile.setdefault("tracking", {}).update(qb_pressure[_bare_name(profile["player_name"])])
            profiles.append(profile)
    return profiles


def _line_yards(yards: float) -> float:
    if yards <= 0:
        return yards * 1.2
    if yards <= 4:
        return yards
    if yards <= 10:
        return 4 + (yards - 4) * 0.5
    return 7.0


def _entry(label: str, value: float | None, better: str, fmt: str) -> dict | None:
    if value is None:
        return None
    return {"label": label, "value": round(float(value), 4), "better": better, "format": fmt}


def _run_front(rows) -> dict[str, dict[str, float | int]]:
    """Observed run defense by point of attack, never by inferred blocking call."""
    result: dict[str, dict[str, float | int]] = {}
    for column, prefix, values in (
        ("run_gap", "gap", ("guard", "tackle", "end")),
        ("run_location", "lane", ("left", "middle", "right")),
    ):
        if column not in rows:
            continue
        normalized = rows[column].fillna("").astype(str).str.lower()
        for value in values:
            sample = rows[normalized.eq(value)]
            carries = len(sample)
            if not carries:
                continue
            result[f"{prefix}_{value}"] = {
                "carries": carries,
                "yards_per_carry_allowed": round(float(sample["yards_gained"].fillna(0).mean()), 4),
                "epa_per_carry_allowed": round(float(sample["epa"].fillna(0).mean()), 4),
                "success_rate_allowed": round(float(sample["success"].fillna(0).mean()), 4),
                "stuff_rate": round(float(sample["yards_gained"].le(0).mean()), 4),
            }
    return result


def _pfr_contact_entry(rows, field: str, label: str, better: str) -> dict | None:
    carries = float(rows["carries"].fillna(0).sum()) if len(rows) else 0
    value = _safe_ratio(rows[field].fillna(0).sum(), carries) if carries else None
    return _entry(label, value, better, "num")


def _team_line(frame, season: int, pfr_rushing=None) -> dict[str, dict]:
    frame = frame.copy()
    runs = frame[frame["rush_attempt"].fillna(0).eq(1) &
                 ~frame["qb_kneel"].fillna(0).eq(1) &
                 ~frame["qb_scramble"].fillna(0).eq(1)].copy()
    plays = frame[(frame["rush_attempt"].fillna(0).eq(1) |
                   frame["qb_dropback"].fillna(0).eq(1))].copy()
    runs["line_yards"] = runs["yards_gained"].fillna(0).map(_line_yards)
    short = runs[runs["down"].isin([3, 4]) & runs["ydstogo"].le(2)]
    plays["havoc"] = (plays["sack"].fillna(0).eq(1) |
                       plays["tackled_for_loss"].fillna(0).eq(1) |
                       plays["fumble_forced"].fillna(0).eq(1) |
                       plays["interception"].fillna(0).eq(1))
    out: dict[str, dict] = {}
    teams = sorted(set(plays["posteam"].dropna()) | set(plays["defteam"].dropna()))
    for team in teams:
        off_runs = runs[runs["posteam"].eq(team)]
        def_runs = runs[runs["defteam"].eq(team)]
        off_plays = plays[plays["posteam"].eq(team)]
        def_plays = plays[plays["defteam"].eq(team)]
        off_short = short[short["posteam"].eq(team)]
        def_short = short[short["defteam"].eq(team)]
        off_db = off_plays[off_plays["qb_dropback"].fillna(0).eq(1)]
        def_db = def_plays[def_plays["qb_dropback"].fillna(0).eq(1)]
        off_short_wins = (off_short["first_down_rush"].fillna(0).eq(1) |
                          off_short["touchdown"].fillna(0).eq(1))
        def_short_wins = (def_short["first_down_rush"].fillna(0).eq(1) |
                          def_short["touchdown"].fillna(0).eq(1))
        off = {
            "line_yards": _entry("Adjusted Line Yards / Carry", off_runs["line_yards"].mean() if len(off_runs) else None, "high", "num"),
            "stuff_rate": _entry("Stuff Rate Allowed", off_runs["yards_gained"].le(0).mean() if len(off_runs) else None, "low", "pct"),
            "short_success": _entry("Short-Yardage Success", off_short_wins.mean() if len(off_short) else None, "high", "pct"),
            "sack_rate": _entry("Sack Rate Allowed", off_db["sack"].fillna(0).mean() if len(off_db) else None, "low", "pct"),
            "havoc_rate": _entry("Havoc Rate Allowed", off_plays["havoc"].mean() if len(off_plays) else None, "low", "pct"),
        }
        defense = {
            "line_yards": _entry("Adjusted Line Yards Allowed", def_runs["line_yards"].mean() if len(def_runs) else None, "low", "num"),
            "stuff_rate": _entry("Stuff Rate Generated", def_runs["yards_gained"].le(0).mean() if len(def_runs) else None, "high", "pct"),
            "short_success": _entry("Short-Yardage Stop Rate", 1 - def_short_wins.mean() if len(def_short) else None, "high", "pct"),
            "sack_rate": _entry("Sack Rate Generated", def_db["sack"].fillna(0).mean() if len(def_db) else None, "high", "pct"),
            "qb_hit_rate": _entry("QB Hit Rate", def_db["qb_hit"].fillna(0).mean() if len(def_db) else None, "high", "pct"),
            "havoc_rate": _entry("Defensive Havoc Rate", def_plays["havoc"].mean() if len(def_plays) else None, "high", "pct"),
        }
        if pfr_rushing is not None:
            off_ybc = _pfr_contact_entry(
                pfr_rushing[pfr_rushing["team"].eq(team)],
                "rushing_yards_before_contact", "RB Yards Before Contact / Carry", "high")
            def_ybc = _pfr_contact_entry(
                pfr_rushing[pfr_rushing["opponent"].eq(team)],
                "rushing_yards_before_contact", "RB Yards Before Contact Allowed / Carry", "low")
            if off_ybc:
                off["yards_before_contact"] = off_ybc
            if def_ybc:
                defense["yards_before_contact"] = def_ybc
        out[str(team)] = {
            "season": season,
            "source": "nflverse/nflfastR; FTN Data and PFR advanced rushing via nflverse",
            "offense": {k: v for k, v in off.items() if v},
            "defense": {k: v for k, v in defense.items() if v},
            "defense_run_front": _run_front(def_runs),
            "definitions": {
                "line_yards": "Rush-outcome adjusted line-yards proxy; not player-tracking contact yards.",
                "yards_before_contact": "Actual RB rushing yards before first contact from PFR advanced rushing data.",
                "havoc_rate": "Share of rushes and dropbacks ending in a sack, tackle for loss, forced fumble or interception.",
                "blocking_scheme": "Zone-versus-gap blocking calls are not published in the licensed public feed; guard/tackle/end rows are point of attack, not blocking scheme.",
            },
        }
    for phase in ("offense", "defense"):
        keys = {key for team in out.values() for key in team[phase]}
        for key in keys:
            rows = [(team, data[phase][key]) for team, data in out.items() if key in data[phase]]
            if not rows:
                continue
            better = rows[0][1]["better"]
            rows.sort(key=lambda item: item[1]["value"], reverse=(better == "high"))
            for place, (_team, entry) in enumerate(rows, 1):
                entry.update({"rank": place, "of": len(rows)})
    return out


# ---------------------------------------------------------------------------
# Current-season team scheme, from what is published for it.
#
# Coverage, man/zone, pressure and personnel come from nflverse participation
# data, which is not released for a season in progress. FTN charting and the
# play-by-play are: blitzers, pass rushers, box counts, motion, play action,
# RPO, screens, no-huddle and QB alignment, with EPA and success on every play.
# This builds the current season's team scheme from those, in the same shape
# as the model board's scheme profiles (rates by group, responses, league
# frequency ranks, league response baselines) so the page renders it the same
# way. A look with no public source is simply absent, never borrowed.
# ---------------------------------------------------------------------------
SCHEME_PBP_COLUMNS = (
    "game_id", "play_id", "season_type", "posteam", "defteam", "play_type",
    "qb_dropback", "pass", "rush", "shotgun", "no_huddle", "down", "wp",
    "half_seconds_remaining", "epa", "success",
)
SCHEME_FTN_COLUMNS = (
    "nflverse_game_id", "nflverse_play_id", "n_defense_box", "n_blitzers",
    "n_pass_rushers", "is_motion", "is_play_action", "is_screen_pass", "is_rpo",
    "is_no_huddle", "qb_location",
)


def _scheme_frame(season: int):
    pbp = _frame(PBP_URL.format(season=season), SCHEME_PBP_COLUMNS)
    if pbp is None:
        return None
    pbp = pbp[pbp["season_type"].eq("REG") & pbp["play_type"].isin(["pass", "run"])].copy()
    ftn = _frame(FTN_URL.format(season=season), SCHEME_FTN_COLUMNS)
    if ftn is not None:
        ftn = ftn.rename(columns={"nflverse_game_id": "game_id", "nflverse_play_id": "play_id"})
        ftn = ftn.drop_duplicates(["game_id", "play_id"], keep="last")
        pbp = pbp.merge(ftn, on=["game_id", "play_id"], how="left")
    return pbp


def _flag(series):
    return series.map(lambda v: None if v is None or v != v else bool(v))


def _rate(mask, base) -> float | None:
    known = int(base.sum())
    return round(float((mask & base).sum()) / known, 4) if known else None


def _mean(values) -> float | None:
    values = values.dropna()
    return round(float(values.mean()), 4) if len(values) else None


def _unit_scheme(rows) -> dict:
    """Rates and responses for one club's plays, from its offense or defense view."""
    dropback = rows["qb_dropback"].fillna(0).eq(1)
    rush = rows["rush"].fillna(0).eq(1) & ~dropback
    charted = rows["n_defense_box"].notna() if "n_defense_box" in rows else rows.index != rows.index
    has_blitz = rows["n_blitzers"].notna() if "n_blitzers" in rows else rows.index != rows.index
    blitz = has_blitz & rows["n_blitzers"].fillna(0).gt(0) if "n_blitzers" in rows else has_blitz
    stacked = charted & rows["n_defense_box"].fillna(0).ge(8)
    light = charted & rows["n_defense_box"].fillna(99).le(6)
    flags = {}
    for col in ("is_motion", "is_play_action", "is_screen_pass", "is_rpo", "is_no_huddle"):
        flags[col] = rows[col].fillna(False).astype(bool) if col in rows else rows.index != rows.index
    has_ftn = rows["is_motion"].notna() if "is_motion" in rows else rows.index != rows.index
    shotgun = rows["shotgun"].fillna(0).eq(1)
    neutral = (rows["down"].isin([1, 2]) & rows["wp"].between(0.2, 0.8)
               & rows["half_seconds_remaining"].gt(120))
    epa = rows["epa"]
    success = rows["success"]

    pressure = {
        "blitz_rate": _rate(blitz, dropback & has_blitz),
        "stacked_box_rate": _rate(stacked, charted),
        "light_box_rate": _rate(light, charted),
        "avg_box": _mean(rows.loc[charted, "n_defense_box"]) if "n_defense_box" in rows else None,
    }
    personnel = {
        "formation_shotgun_rate": _rate(shotgun, rows.index == rows.index),
        "formation_under_center_rate": _rate(~shotgun, rows.index == rows.index),
        "motion_rate": _rate(flags["is_motion"], has_ftn),
        "play_action_rate": _rate(flags["is_play_action"], dropback & has_ftn),
        "rpo_rate": _rate(flags["is_rpo"], has_ftn),
        "screen_rate": _rate(flags["is_screen_pass"], dropback & has_ftn),
        "no_huddle_rate": _rate(rows["no_huddle"].fillna(0).eq(1), rows.index == rows.index),
        "neutral_pass_rate": _rate(dropback & neutral, neutral),
    }
    response = {
        "pass_epa": _mean(epa[dropback]),
        "rush_epa": _mean(epa[rush]),
        "pass_success_rate": _mean(success[dropback]),
        "rush_success_rate": _mean(success[rush]),
        "pass_epa_blitz": _mean(epa[dropback & blitz]),
        "pass_epa_no_blitz": _mean(epa[dropback & has_blitz & ~blitz]),
        "pass_epa_play_action": _mean(epa[dropback & flags["is_play_action"]]),
        "pass_epa_motion": _mean(epa[dropback & flags["is_motion"]]),
        "pass_epa_screen": _mean(epa[dropback & flags["is_screen_pass"]]),
        "rush_epa_stacked_box": _mean(epa[rush & stacked]),
        "rush_epa_light_box": _mean(epa[rush & light]),
    }
    strip = lambda d: {k: v for k, v in d.items() if v is not None}
    return {"pressure": strip(pressure), "personnel": strip(personnel), "response": strip(response)}


# ---------------------------------------------------------------------------
# Pro Football Reference charting, republished weekly by nflverse. Two 2026
# facts the participation file would carry and nothing else public does:
# pressure (per quarterback game: times pressured, over the dropbacks the
# published rate implies) and coverage by defender (targets, completions,
# yards, touchdowns and interceptions allowed in coverage, and aDOT).
# ---------------------------------------------------------------------------
PFR_ADV_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/pfr_advstats/"
    "advstats_week_{kind}_{season}.parquet"
)
PLAYERS_URL = "https://github.com/nflverse/nflverse-data/releases/download/players/players.parquet"


def pfr_pressure(season: int) -> dict:
    """Team pressure faced and generated, and each quarterback's, for a season."""
    rows = _frame(PFR_ADV_URL.format(kind="pass", season=season), (
        "team", "opponent", "pfr_player_name", "times_pressured", "times_pressured_pct",
        "game_type"))
    if rows is None or rows.empty:
        return {"offense": {}, "defense": {}, "qbs": {}}
    rows = rows[rows["game_type"].fillna("REG").eq("REG")].copy()
    pressured = rows["times_pressured"].fillna(0)
    pct = rows["times_pressured_pct"]
    # The published rate is pressures over dropbacks; recover the dropbacks.
    rows["dropbacks"] = (pressured / pct).where(pct.gt(0))
    rows = rows[rows["dropbacks"].notna()]
    out = {"offense": {}, "defense": {}, "qbs": {}}
    for phase, col in (("offense", "team"), ("defense", "opponent")):
        for team, grp in rows.groupby(col):
            db = float(grp["dropbacks"].sum())
            if db > 0:
                out[phase][_team(team)] = round(float(grp["times_pressured"].sum()) / db, 4)
    for name, grp in rows.groupby("pfr_player_name"):
        db = float(grp["dropbacks"].sum())
        if db > 0:
            out["qbs"][_bare_name(name)] = {"pressure_rate": round(float(grp["times_pressured"].sum()) / db, 4),
                                           "pressure_dropbacks": int(round(db))}
    return out


def _passer_rating(att: float, cmp_: float, yds: float, td: float, ints: float) -> float | None:
    if not att:
        return None
    clamp = lambda v: max(0.0, min(2.375, v))
    a = clamp((cmp_ / att - 0.3) * 5)
    b = clamp((yds / att - 3) * 0.25)
    c = clamp(td / att * 20)
    d = clamp(2.375 - ints / att * 25)
    return round((a + b + c + d) / 6 * 100, 1)


def pfr_coverage(season: int) -> dict[str, list[dict]]:
    """Each club's defenders in coverage this season, from PFR charting."""
    rows = _frame(PFR_ADV_URL.format(kind="def", season=season), (
        "team", "pfr_player_name", "pfr_player_id", "game_type", "def_targets",
        "def_completions_allowed", "def_yards_allowed", "def_receiving_td_allowed",
        "def_ints", "def_adot"))
    if rows is None or rows.empty:
        return {}
    rows = rows[rows["game_type"].fillna("REG").eq("REG") & rows["def_targets"].fillna(0).gt(0)].copy()
    positions: dict[str, str] = {}
    registry = _frame(PLAYERS_URL, ("pfr_id", "position", "position_group"))
    if registry is not None:
        for pid, pos, grp in registry.itertuples(index=False):
            if pid:
                positions[str(pid)] = str(pos or grp or "")
    out: dict[str, list[dict]] = {}
    rows["adot_x_t"] = rows["def_adot"].fillna(0) * rows["def_targets"].fillna(0)
    for (team, pid), grp in rows.groupby(["team", "pfr_player_id"]):
        targets = float(grp["def_targets"].sum())
        cmp_ = float(grp["def_completions_allowed"].fillna(0).sum())
        yds = float(grp["def_yards_allowed"].fillna(0).sum())
        td = float(grp["def_receiving_td_allowed"].fillna(0).sum())
        ints = float(grp["def_ints"].fillna(0).sum())
        out.setdefault(_team(team), []).append({
            "player_name": str(grp["pfr_player_name"].iloc[0]),
            "position": positions.get(str(pid), ""),
            "games": int(len(grp)),
            "targets": int(targets),
            "completions": int(cmp_),
            "yards": int(yds),
            "touchdowns": int(td),
            "interceptions": int(ints),
            "completion_rate": round(cmp_ / targets, 4) if targets else None,
            "yards_per_target": round(yds / targets, 2) if targets else None,
            "passer_rating": _passer_rating(targets, cmp_, yds, td, ints),
            "adot": round(float(grp["adot_x_t"].sum()) / targets, 1) if targets else None,
        })
    for team in out:
        out[team].sort(key=lambda r: -r["targets"])
    return out


def team_scheme_current(season: int) -> dict[str, dict]:
    """Current-season scheme for every club, ranked and baselined across the league."""
    frame = _scheme_frame(season)
    if frame is None or frame.empty:
        return {}
    out: dict[str, dict] = {}
    for phase, col in (("offense", "posteam"), ("defense", "defteam")):
        for team, rows in frame.groupby(col, dropna=True):
            club = _team(team)
            entry = out.setdefault(club, {"team": club, "source_seasons": [season],
                                          "participation_source_seasons": [],
                                          "offense_plays": 0, "defense_plays": 0})
            entry[phase] = _unit_scheme(rows)
            entry[phase + "_plays"] = int(len(rows))
    if len(out) < 30:
        return {}
    # Coverage, man/zone and personnel for the current season come from Sharp
    # Football Analysis charting (used with permission); see outputs/sharp_nfl.
    sharp = sharp_nfl.current_season(season)
    sharp.pop("_source", None)
    for team, phases in sharp.items():
        club = out.get(_team(team))
        if not club:
            continue
        for phase, groups in phases.items():
            if phase not in club:
                continue
            for group, values in groups.items():
                club[phase].setdefault(group, {}).update(values)
        if (phases.get("defense") or {}).get("coverage"):
            club["participation_source_seasons"] = [season]
    pressure = pfr_pressure(season)
    for phase in ("offense", "defense"):
        for team, rate in pressure[phase].items():
            if team in out and phase in out[team]:
                out[team][phase].setdefault("pressure", {})["pressure_rate"] = rate
    # League places for every rate (1st = most often) and the league mean and
    # spread for every response, per phase, over the same clubs.
    for phase in ("offense", "defense"):
        for group in ("coverage", "pressure", "personnel"):
            keys = {k for club in out.values() for k in (club.get(phase) or {}).get(group, {})}
            for key in keys:
                pool = [(team, club[phase][group][key]) for team, club in out.items()
                        if key in (club.get(phase) or {}).get(group, {})]
                ranks = _ranked_desc(pool)
                for team, _ in pool:
                    out[team].setdefault("league_frequency_ranks", {}).setdefault(phase, {}) \
                        .setdefault(group, {})[key] = {"place": ranks[team], "of": len(pool)}
        keys = {k for club in out.values() for k in (club.get(phase) or {}).get("response", {})}
        for key in keys:
            values = [club[phase]["response"][key] for club in out.values()
                      if key in (club.get(phase) or {}).get("response", {})]
            if len(values) < 2:
                continue
            mean = sum(values) / len(values)
            std = (sum((v - mean) ** 2 for v in values) / len(values)) ** 0.5
            for club in out.values():
                club.setdefault("league_response", {}).setdefault(phase, {})[key] = {
                    "mean": round(mean, 4), "std": round(std, 4), "n": len(values)}
    return out


def _ranked_desc(pool: list[tuple[str, float]]) -> dict[str, int]:
    ordered = sorted(pool, key=lambda pair: pair[1], reverse=True)
    return {team: index + 1 for index, (team, _) in enumerate(ordered)}


# A quarterback is credited with his offense's man and zone figures only when
# he has taken nearly all of its dropbacks; otherwise they belong to the club.
SOLE_PASSER_SHARE = 0.85


def _credit_offense_coverage(profiles: list[dict], frame, season: int) -> None:
    """Fill a current-season starter's Vs Man / Vs Zone rows from Sharp.

    Participation data (the only public per-play coverage) is not released
    mid-season; Sharp Football Analysis charts coverage live but publishes it
    per offense. Rows the participation data already filled are left alone.
    """
    by_team = sharp_nfl.offense_coverage(season)
    through = by_team.pop("_through_week", None) if by_team else None
    if not by_team or frame is None:
        return
    # Shares over the weeks Sharp's figures cover, on dropbacks with a named passer.
    drops = frame[frame["qb_dropback"].fillna(0).eq(1) & frame["passer_player_id"].notna()]
    if through and "week" in drops:
        drops = drops[drops["week"].le(through)]
    team_db = drops.groupby("posteam").size().to_dict()
    passer_db = drops.groupby(["posteam", "passer_player_id"]).size().to_dict()
    for profile in profiles:
        if profile.get("position") != "QB" or profile.get("source_season") != season:
            continue
        splits = profile.get("splits") or {}
        mine = passer_db.get((profile.get("team"), profile.get("player_id")), 0)
        total = team_db.get(profile.get("team")) or 0
        looks = by_team.get(_team(profile.get("team")))
        if not looks or not total or mine / total < SOLE_PASSER_SHARE:
            continue
        for look, stats in looks.items():
            splits.setdefault(look, dict(stats))


def build(season: int, player_stats: dict[str, list[dict]]) -> dict:
    """Return derived observed context; any unavailable feed fails soft."""
    # Imported here, not at the top: nfl_red_zone reuses this module's loaders.
    from outputs import nfl_red_zone
    names = {
        str(row.get("player_id")): str(row.get("player_name"))
        for rows in player_stats.values() for row in rows
        if row.get("player_id") and row.get("player_name")
    }
    positions = {
        str(row.get("player_id")): str(row.get("position") or "").upper()
        for rows in player_stats.values() for row in rows
        if row.get("player_id") and row.get("position")
    }
    rb_names = {
        _name_key(row.get("player_name"))
        for rows in player_stats.values() for row in rows
        if str(row.get("position") or "").upper() == "RB" and row.get("player_name")
    }
    ngs_rushing = _ngs_rushing(season)
    ngs_passing = _ngs_passing(season)
    qb_pressure = pfr_pressure(season).get("qbs") or {}
    pfr_rushing = _pfr_rushing(season, rb_names)
    # Participation (coverage, man/zone, pressure, personnel) is requested for
    # the current season too: it is not released mid-season today and the pull
    # fails soft to charting-only splits, but the day nflverse publishes it the
    # current season's coverage splits fill in without a code change.
    current = _joined(season, participation=True)
    prior = _joined(season - 1, participation=True)
    profiles = []
    receivers = []
    if current is not None:
        profiles.extend(_player_profiles(
            current, season, names, positions, ngs_rushing, ngs_passing, qb_pressure))
        receivers.extend(_receiver_profiles(current, season, names, positions))
        _credit_offense_coverage(profiles, current, season)
    if prior is not None:
        profiles.extend(_player_profiles(prior, season - 1, names, positions))
        receivers.extend(_receiver_profiles(prior, season - 1, names, positions))
    return {
        "player_scheme_profiles": profiles,
        "player_coverage_profiles": receivers,
        "team_scheme_current": team_scheme_current(season),
        "defenders_current": pfr_coverage(season),
        "run_game": nfl_run_game.build(current, prior, season, positions, names),
        "team_line": _team_line(current, season, pfr_rushing) if current is not None else {},
        "red_zone": nfl_red_zone.build(season),
    }
