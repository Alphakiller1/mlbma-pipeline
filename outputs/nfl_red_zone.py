"""Red zone context for the public NFL matchup page, from nflverse play-by-play.

Definitions (fixed here so every number on the page means one thing):

* A **drive** is nflfastR's ``fixed_drive`` with at least one snap from
  scrimmage (pass, run, field goal, punt, kneel or spike). Kickoff-only and
  penalty-only possessions are not drives.
* A **red zone trip** is a drive with at least one snap at the opponent's 20 or
  closer - the NFL's own "20 and in". nflfastR's ``drive_inside20`` is strictly
  inside the 20, which misses a drive whose deepest snap was at the 20 (nine of
  982 drives in weeks 1-3 of 2026). Two-point tries and nullified plays never
  count, and a possession whose only red zone snaps are kneel-downs is the
  clock being run out, not a trip.
* **TD%** and **Score%** count a trip as converted only when the scoring play
  itself was snapped from the 20 or closer: a touchdown, or a touchdown or a
  made field goal. A drive pushed back out of the red zone by a sack or penalty
  that then kicks from the 35 was not converted in the red zone. This is ESPN's
  convention; against ESPN's 2025 team figures it agrees to 1.5 points of TD%
  and 2 points of Score% on average (counting every drive-ending field goal
  instead missed Score% by 5 points on average, and by as much as 11).
* Player shares are the player's red zone targets (or carries) over his club's
  red zone targets (or carries) in the same games. Scrambles count as the
  quarterback's carries, the way the official box score counts them; kneels are
  not carries.

Everything is observed. Nothing here is a projection.
"""
from __future__ import annotations

from typing import Any

from outputs import nfl_advanced_context as adv

RZ_PBP_COLUMNS = (
    "game_id", "play_id", "season", "season_type", "posteam", "defteam", "play_type",
    "fixed_drive", "fixed_drive_result", "yardline_100", "two_point_attempt",
    "qb_dropback", "pass_attempt", "rush_attempt", "qb_scramble", "qb_kneel", "sack",
    "complete_pass", "interception", "pass_touchdown", "rush_touchdown", "epa", "success",
    "passer_player_id", "passer_player_name", "receiver_player_id", "receiver_player_name",
    "rusher_player_id", "rusher_player_name", "field_goal_result", "touchdown", "td_team",
)
SNAP_TYPES = {"pass", "run", "field_goal", "punt", "qb_kneel", "qb_spike"}
RED_ZONE = 20
TARGET_POSITIONS = ("WR", "TE", "RB")
# Positions published, and each graded player metric with its sample floor:
# (metric, volume it is measured over, minimum volume, positions ranked).
# Every metric here is "more is better" for the player.
PUBLISHED_POSITIONS = ("QB", "RB", "WR", "TE")
PLAYER_RANKED = (
    ("target_share", "targets", 3, ("RB", "WR", "TE")),
    ("carry_share", "carries", 3, ("RB",)),
    ("completion_rate", "attempts", 8, ("QB",)),
    ("epa_per_dropback", "dropbacks", 8, ("QB",)),
)

# (metric, better) for each phase. "high" = more is better for that side.
TEAM_METRICS = {
    "offense": (("trips_per_game", "high"), ("trip_rate", "high"), ("td_rate", "high"),
                ("score_rate", "high"), ("epa_per_play", "high"), ("success_rate", "high")),
    "defense": (("trips_per_game", "low"), ("trip_rate", "low"), ("td_rate", "low"),
                ("score_rate", "low"), ("epa_per_play", "low"), ("success_rate", "low")),
}


def _ratio(numerator: float, denominator: float, digits: int = 4) -> float | None:
    return round(float(numerator) / float(denominator), digits) if denominator else None


def _flag(series):
    return series.fillna(0).astype(float).gt(0)


def _snaps(frame):
    """Scrimmage snaps only: no kickoffs, extra points, two-point tries or no-plays."""
    keep = (frame["play_type"].isin(SNAP_TYPES) & frame["posteam"].notna()
            & ~_flag(frame["two_point_attempt"]))
    return frame[keep].copy()


def _drives(snaps):
    """One row per drive: clubs, whether it was a red zone trip, and whether
    it scored a touchdown or field goal from inside the red zone."""
    keys = ["game_id", "fixed_drive"]
    live = snaps[~_flag(snaps["qb_kneel"])]
    in_rz = snaps["yardline_100"].le(RED_ZONE)
    reached = live[live["yardline_100"].le(RED_ZONE)].groupby(keys).size().rename("rz_snaps")
    own_td = (_flag(snaps["touchdown"]) & snaps["td_team"].eq(snaps["posteam"])
              & snaps["play_type"].isin({"pass", "run"}))
    td = snaps[own_td & in_rz].groupby(keys).size().rename("rz_td")
    fg = snaps[snaps["play_type"].eq("field_goal") & snaps["field_goal_result"].eq("made")
               & in_rz].groupby(keys).size().rename("rz_fg")
    drives = (snaps.groupby(keys)
              .agg(posteam=("posteam", "first"), defteam=("defteam", "first"))
              .join(reached, how="left").join(td, how="left").join(fg, how="left")
              .reset_index())
    drives["trip"] = drives["rz_snaps"].fillna(0).gt(0)
    drives["td"] = drives["trip"] & drives["rz_td"].fillna(0).gt(0)
    drives["scored"] = drives["td"] | (drives["trip"] & drives["rz_fg"].fillna(0).gt(0))
    return drives


def _unit(drives, plays, games: int) -> dict[str, Any]:
    """Trip volume, conversion and play results for one club on one side."""
    trips = drives[drives["trip"]]
    n_drives, n_trips = int(len(drives)), int(len(trips))
    td = int(trips["td"].sum())
    scores = int(trips["scored"].sum())
    dropbacks = int(_flag(plays["qb_dropback"]).sum())
    designed = int((_flag(plays["rush_attempt"]) & ~_flag(plays["qb_scramble"])
                    & ~_flag(plays["qb_kneel"])).sum())
    scrimmage = plays[_flag(plays["qb_dropback"]) | (_flag(plays["rush_attempt"])
                                                    & ~_flag(plays["qb_kneel"]))]
    return {
        "games": games,
        "drives": n_drives,
        "trips": n_trips,
        "td_trips": td,
        "score_trips": scores,
        "trips_per_game": _ratio(n_trips, games, 2),
        "trip_rate": _ratio(n_trips, n_drives),
        "td_rate": _ratio(td, n_trips),
        "score_rate": _ratio(scores, n_trips),
        "plays": int(len(scrimmage)),
        "pass_rate": _ratio(dropbacks, dropbacks + designed),
        "epa_per_play": _ratio(float(scrimmage["epa"].fillna(0).sum()), len(scrimmage)),
        "success_rate": _ratio(float(scrimmage["success"].fillna(0).sum()), len(scrimmage)),
    }


def _by_position(rz, positions: dict[str, str]) -> dict[str, dict[str, Any]]:
    """Red zone targets and touchdowns by the receiving player's position."""
    targets = rz[_flag(rz["pass_attempt"]) & rz["receiver_player_id"].notna()]
    total = int(len(targets))
    out: dict[str, dict[str, Any]] = {}
    pos = targets["receiver_player_id"].astype(str).map(positions)
    for group in TARGET_POSITIONS:
        mine = targets[pos.eq(group)]
        out[group] = {
            "targets": int(len(mine)),
            "target_share": _ratio(len(mine), total),
            "receiving_tds": int(_flag(mine["pass_touchdown"]).sum()),
        }
    rushes = rz[_flag(rz["rush_attempt"]) & ~_flag(rz["qb_kneel"])]
    out["RB"]["rushing_tds"] = int(_flag(rushes["rush_touchdown"]).sum())
    out["all"] = {"targets": total}
    return out


def _players(snaps, rz, positions: dict[str, str]) -> dict[str, list[dict[str, Any]]]:
    """Each skill player's red zone usage and results, grouped by current club.

    Keyed by player, not club, so a player who changed teams keeps both seasons
    in the pooled window. His share divides his red zone targets (or carries) by
    his clubs' red zone targets (or carries) in the games he took part in -
    a game counts once he has a target, carry or dropback anywhere on the field.
    """
    def ids(frame):
        dropback = _flag(frame["qb_dropback"])
        scramble = _flag(frame["qb_scramble"])
        passer = frame["passer_player_id"].where(frame["passer_player_id"].notna(),
                                                 frame["rusher_player_id"].where(scramble))
        return {
            "target": frame["receiver_player_id"].where(_flag(frame["pass_attempt"])),
            "carry": frame["rusher_player_id"].where(_flag(frame["rush_attempt"])
                                                    & ~_flag(frame["qb_kneel"])),
            "dropback": passer.where(dropback),
        }

    # Games each player took part in, per club.
    played: dict[str, set[tuple[str, str]]] = {}
    for series in ids(snaps).values():
        keep = series.notna()
        for pid, team, game in zip(series[keep].astype(str), snaps.loc[keep, "posteam"],
                                   snaps.loc[keep, "game_id"]):
            played.setdefault(pid, set()).add((adv._team(team), str(game)))

    rz_ids = ids(rz)
    clubs = rz["posteam"].map(adv._team)
    games = rz["game_id"].astype(str)
    team_targets: dict[tuple[str, str], int] = {}
    team_carries: dict[tuple[str, str], int] = {}
    for kind, bucket in (("target", team_targets), ("carry", team_carries)):
        keep = rz_ids[kind].notna()
        for key in zip(clubs[keep], games[keep]):
            bucket[key] = bucket.get(key, 0) + 1

    rows: dict[str, dict[str, Any]] = {}

    def entry(pid: str, name: object) -> dict[str, Any]:
        return rows.setdefault(pid, {
            "player_id": pid, "player_name": str(name or ""), "position": positions.get(pid, ""),
            "targets": 0, "targets_inside10": 0, "receptions": 0, "receiving_tds": 0,
            "carries": 0, "carries_inside5": 0, "rushing_tds": 0,
            "dropbacks": 0, "attempts": 0, "completions": 0, "passing_tds": 0,
            "interceptions": 0, "sacks": 0, "_epa": 0.0,
        })

    for i, row in enumerate(rz.itertuples(index=False)):
        pid = rz_ids["target"].iloc[i]
        if pid == pid and pid is not None:
            e = entry(str(pid), row.receiver_player_name)
            e["targets"] += 1
            e["targets_inside10"] += int(float(row.yardline_100) <= 10)
            e["receptions"] += int(bool(row.complete_pass))
            e["receiving_tds"] += int(bool(row.pass_touchdown))
        pid = rz_ids["carry"].iloc[i]
        if pid == pid and pid is not None:
            e = entry(str(pid), row.rusher_player_name)
            e["carries"] += 1
            e["carries_inside5"] += int(float(row.yardline_100) <= 5)
            e["rushing_tds"] += int(bool(row.rush_touchdown))
        pid = rz_ids["dropback"].iloc[i]
        if pid == pid and pid is not None:
            name = row.passer_player_name if row.passer_player_name == row.passer_player_name                 else row.rusher_player_name
            e = entry(str(pid), name)
            e["dropbacks"] += 1
            e["attempts"] += int(bool(row.pass_attempt) and not bool(row.sack))
            e["completions"] += int(bool(row.complete_pass))
            e["passing_tds"] += int(bool(row.pass_touchdown))
            e["interceptions"] += int(bool(row.interception))
            e["sacks"] += int(bool(row.sack))
            e["_epa"] += float(row.epa) if row.epa == row.epa else 0.0

    out: dict[str, list[dict[str, Any]]] = {}
    for pid, e in rows.items():
        if e["position"] not in PUBLISHED_POSITIONS:
            e.pop("_epa")
            continue
        mine = played.get(pid, set())
        e["games"] = len(mine)
        e["target_share"] = _ratio(e["targets"], sum(team_targets.get(k, 0) for k in mine))
        e["carry_share"] = _ratio(e["carries"], sum(team_carries.get(k, 0) for k in mine))
        e["completion_rate"] = _ratio(e["completions"], e["attempts"])
        e["epa_per_dropback"] = _ratio(e.pop("_epa"), e["dropbacks"])
        e["touchdowns"] = e["receiving_tds"] + e["rushing_tds"]
        # Listed under the club of his latest game; game ids sort by season and week.
        e["team"] = max(mine, key=lambda k: k[1])[0] if mine else ""
        out.setdefault(e["team"], []).append(e)
    for club_rows in out.values():
        club_rows.sort(key=lambda r: (-(r["targets"] + r["carries"] + r["dropbacks"]), r["player_name"]))
    return out


def red_zone_from_frame(frame, positions: dict[str, str],
                        names: dict[str, str] | None = None) -> dict[str, dict]:
    """Per-club red zone offense, defense, players and position splits.

    Pure over an already-loaded play-by-play frame, so it is unit-testable.
    """
    if frame is None or frame.empty:
        return {}
    frame = frame[frame["season_type"].eq("REG")] if "season_type" in frame else frame
    snaps = _snaps(frame)
    if snaps.empty:
        return {}
    drives = _drives(snaps)
    rz_plays = snaps[snaps["yardline_100"].le(RED_ZONE)]
    games = {
        "offense": snaps.groupby("posteam")["game_id"].nunique(),
        "defense": snaps.groupby("defteam")["game_id"].nunique(),
    }
    out: dict[str, dict] = {}
    for team in sorted(set(snaps["posteam"].dropna()) | set(snaps["defteam"].dropna())):
        club = adv._team(team)
        own_rz = rz_plays[rz_plays["posteam"].eq(team)]
        opp_rz = rz_plays[rz_plays["defteam"].eq(team)]
        out[club] = {
            "team": club,
            "offense": _unit(drives[drives["posteam"].eq(team)], own_rz,
                             int(games["offense"].get(team, 0))),
            "defense": _unit(drives[drives["defteam"].eq(team)], opp_rz,
                             int(games["defense"].get(team, 0))),
            "offense_by_position": _by_position(own_rz, positions),
            "defense_by_position": _by_position(opp_rz, positions),
            "players": [],
        }
    for club, rows in _players(snaps, rz_plays, positions).items():
        for row in rows:
            row["player_name"] = (names or {}).get(row["player_id"], row["player_name"])
        if club in out:
            out[club]["players"] = rows
    return out


def _places(pool: list[tuple[str, float]], better: str) -> dict[str, int]:
    """1st = best for that side. Ties share the better place."""
    ordered = sorted((v for _, v in pool), reverse=(better == "high"))
    return {key: ordered.index(value) + 1 for key, value in pool}


def rank(clubs: dict[str, dict]) -> dict[str, dict]:
    """League places for team metrics, position splits and players (1st = best)."""
    for phase, metrics in TEAM_METRICS.items():
        for metric, better in metrics:
            pool = [(team, club[phase][metric]) for team, club in clubs.items()
                    if club[phase].get(metric) is not None and club[phase]["trips"] > 0]
            places = _places(pool, better)
            for team, _ in pool:
                clubs[team].setdefault("ranks", {}).setdefault(phase, {})[metric] = {
                    "place": places[team], "of": len(pool)}
        # Pass rate is a tendency: a frequency place, 1st = most often.
        pool = [(team, club[phase]["pass_rate"]) for team, club in clubs.items()
                if club[phase].get("pass_rate") is not None]
        places = _places(pool, "high")
        for team, _ in pool:
            clubs[team].setdefault("ranks", {}).setdefault(phase, {})["pass_rate"] = {
                "place": places[team], "of": len(pool)}
    # Position splits: target share is a frequency (1st = most); touchdowns
    # allowed per game grade the defense (1st = fewest).
    for side in ("offense_by_position", "defense_by_position"):
        phase = side.split("_")[0]
        for group in TARGET_POSITIONS:
            pool = [(team, club[side][group]["target_share"]) for team, club in clubs.items()
                    if club[side][group]["target_share"] is not None]
            places = _places(pool, "high")
            for team, _ in pool:
                clubs[team][side][group]["target_share_rank"] = {"place": places[team], "of": len(pool)}
            key = "receiving_tds"
            per_game = [(team, club[side][group][key] / club[phase]["games"])
                        for team, club in clubs.items() if club[phase]["games"]]
            places = _places(per_game, "low" if phase == "defense" else "high")
            for team, value in per_game:
                clubs[team][side][group]["receiving_tds_per_game"] = round(value, 2)
                clubs[team][side][group]["receiving_tds_rank"] = {"place": places[team], "of": len(per_game)}
    # Players among the league at their position, above each metric's floor:
    # the share a player earns is only graded once he has a few chances at it.
    everyone = [p for club in clubs.values() for p in club["players"]]
    for metric, volume, floor, groups in PLAYER_RANKED:
        for position in groups:
            pool = [(p["player_id"], p[metric]) for p in everyone
                    if p["position"] == position and p[volume] >= floor and p.get(metric) is not None]
            places = _places(pool, "high")
            for p in everyone:
                if p["player_id"] in places and p["position"] == position:
                    p.setdefault("ranks", {})[metric] = {"place": places[p["player_id"]], "of": len(pool)}
    return clubs


# How many players per club the page shows. Ranks are placed across the whole
# league first; only the published list is trimmed, to keep the slate small.
PUBLISHED_PLAYERS = {"QB": ("dropbacks", 2), "catchers": ("targets", 6), "RB": ("carries", 4)}


def trim_players(clubs: dict[str, dict]) -> dict[str, dict]:
    for club in clubs.values():
        rows = club["players"]
        keep: dict[str, dict] = {}
        for group, (volume, limit) in PUBLISHED_PLAYERS.items():
            pool = [r for r in rows if r[volume] > 0 and (
                r["position"] == group if group != "catchers" else r["position"] != "QB")]
            for r in sorted(pool, key=lambda r: -r[volume])[:limit]:
                keep[r["player_id"]] = r
        club["players"] = [r for r in rows if r["player_id"] in keep]
    return clubs


def _registry() -> tuple[dict[str, str], dict[str, str]]:
    """Position and full display name by gsis id. Play-by-play abbreviates
    names ("A.St. Brown"); the page shows and matches full names."""
    registry = adv._frame(adv.PLAYERS_URL, ("gsis_id", "position", "display_name"))
    if registry is None:
        return {}, {}
    positions, names = {}, {}
    for gid, pos, name in registry.itertuples(index=False):
        if gid:
            positions[str(gid)] = str(pos or "").upper()
            if name:
                names[str(gid)] = str(name)
    return positions, names


def _positions() -> dict[str, str]:
    return _registry()[0]


def build(season: int) -> dict[str, dict]:
    """{"current": {club: ...}, "combined": {club: ...}} - fails soft to {}.

    ``combined`` is last season and this one pooled play by play, which is what
    the page's "2025 + 2026" window shows; it is not an average of two rates.
    """
    import pandas as pd

    positions, names = _registry()
    frames = {}
    for year in (season - 1, season):
        frame = adv._frame(adv.PBP_URL.format(season=year), RZ_PBP_COLUMNS)
        if frame is not None and not frame.empty:
            frames[year] = frame
    out: dict[str, dict] = {}
    current = red_zone_from_frame(frames.get(season), positions, names) if season in frames else {}
    if len(current) >= 30:
        out["current"] = trim_players(rank(current))
    if frames:
        pooled = red_zone_from_frame(pd.concat(list(frames.values()), ignore_index=True),
                                     positions, names)
        if len(pooled) >= 30:
            out["combined"] = trim_players(rank(pooled))
    return out
