"""Observed NFL snaps and descriptive production compared with position peers.

This is a current-season statistical percentile, not a film/scouting grade.
Offensive linemen and long snappers have no individual blocking production in
these feeds and are deliberately left unrated. Stable GSIS/PFR IDs bridge names.
"""
from __future__ import annotations

from functools import lru_cache
import math

from outputs import nfl_injury_value as injuries

POSITION = {**injuries.fit()["groups"], "SAF": "S", "FS": "S", "SS": "S",
            "LT": "OL", "RT": "OL", "LG": "OL", "RG": "OL", "OL": "OL",
            "DB": "CB", "DL": "DL", "EDGE": "EDGE", "K": "K", "P": "P", "LS": "LS"}
OFFENSE = {"QB", "RB", "WR", "TE", "OL"}
MIN_SNAPS = 50
MIN_GAMES = 2
SOURCE = "https://github.com/nflverse/nflverse-data/releases/tag/snap_counts"


def _text(value) -> str:
    return "" if value is None or str(value).lower() == "nan" else str(value).strip()


def _metrics(group: str, s: dict, offense: int, defense: int, games: int, special: int = 0) -> list[tuple[str, float]]:
    def val(name):
        value = float(s.get(name) or 0)
        return value if math.isfinite(value) else 0.0

    if group == "QB":
        drops = val("attempts") + val("sacks_suffered") + val("carries")
        attempts = val("attempts") + val("sacks_suffered")
        if drops < 30 or not attempts:
            return []
        return [("Passing and rushing EPA per opportunity", (val("passing_epa") + val("rushing_epa")) / drops),
                ("Adjusted net yards per attempt", (val("passing_yards") - val("sack_yards_lost") +
                 20 * val("passing_tds") - 45 * val("passing_interceptions")) / attempts),
                ("Passing and rushing yards per appearance", (val("passing_yards") + val("rushing_yards")) / games)]
    if group in {"RB", "WR", "TE"}:
        touches = val("carries") + val("targets")
        if touches < 10 or not offense:
            return []
        yards = val("rushing_yards") + val("receiving_yards")
        return [("Scrimmage yards per offensive snap", yards / offense),
                ("Rushing and receiving EPA per opportunity", (val("rushing_epa") + val("receiving_epa")) / touches),
                ("Scrimmage yards per appearance", yards / games)]
    if group in {"EDGE", "DL"} and defense:
        return [("Sacks per 100 defensive snaps", 100 * val("def_sacks") / defense),
                ("QB hits per 100 defensive snaps", 100 * val("def_qb_hits") / defense),
                ("Tackles for loss per 100 defensive snaps", 100 * val("def_tackles_for_loss") / defense)]
    if group == "LB" and defense:
        return [("Tackles per 100 defensive/ST snaps", 100 * (val("def_tackles_solo") + val("def_tackles_with_assist")) / (defense + special)),
                ("Tackles for loss per 100 defensive snaps", 100 * val("def_tackles_for_loss") / defense),
                ("Disruptions per 100 defensive/ST snaps", 100 * (val("def_sacks") + val("def_interceptions") +
                 val("def_fumbles_forced") + val("def_pass_defended")) / (defense + special))]
    if group in {"CB", "S"} and defense:
        return [("Passes defended per 100 defensive snaps", 100 * val("def_pass_defended") / defense),
                ("Interceptions per 100 defensive snaps", 100 * val("def_interceptions") / defense),
                ("Tackles per 100 defensive/ST snaps", 100 * (val("def_tackles_solo") + val("def_tackles_with_assist")) / (defense + special))]
    if group == "K" and val("fg_att") >= 10:
        return [("Field goal conversion", val("fg_made") / val("fg_att")),
                ("Field goal points per appearance", 3 * val("fg_made") / games)]
    if group == "P" and val("pt_att") >= 15:
        return [("Net yards per punt", val("pt_net_yards") / val("pt_att")),
                ("Inside 20 share", val("pt_inside_20") / val("pt_att")),
                ("Avoided touchback share", 1 - val("pt_touchback") / val("pt_att"))]
    return []


def build(snaps, stats, identities, season: int) -> dict[str, dict[str, dict]]:
    """Pure calculation; inputs are nflverse snap, weekly-stat and identity frames."""
    snaps = snaps[(snaps.season == season) & (snaps.game_type == "REG")].copy()
    stats = stats[(stats.season == season) & (stats.season_type == "REG")].copy()
    if snaps.empty:
        raise ValueError("No regular-season snap counts")
    if snaps.duplicated(["pfr_player_id", "game_id", "team"]).any():
        raise ValueError("Duplicate player/game snap rows")
    if (snaps[["offense_snaps", "defense_snaps", "st_snaps"]].fillna(0) < 0).any().any():
        raise ValueError("Negative snap counts")
    identity_by_pfr = {_text(r.get("pfr_id")): r for r in identities.to_dict("records") if _text(r.get("pfr_id"))}
    numeric = list(stats.select_dtypes(include="number").columns)
    summed = stats.groupby("player_id")[numeric].sum().to_dict("index")
    club_weeks = {injuries.TEAM_ALIASES.get(t, t): sorted(set(g.week.astype(int))) for t, g in snaps.groupby("team")}
    rows = {}
    for identifier, g in snaps.groupby("pfr_player_id"):
        identity = identity_by_pfr.get(str(identifier), {})
        counts = {key: int(g[key].fillna(0).sum()) for key in ("offense_snaps", "defense_snaps", "st_snaps")}
        played = g[(g.offense_snaps.fillna(0) + g.defense_snaps.fillna(0) + g.st_snaps.fillna(0)) > 0]
        games = int(played.game_id.nunique())
        position = str(g.position.mode().iloc[0])
        group = POSITION.get(position, position)
        unit = counts["st_snaps"] if group in {"K", "P", "LS"} else counts["offense_snaps"] if group in OFFENSE else counts["defense_snaps"]
        unit_col = "st_snaps" if group in {"K", "P", "LS"} else "offense_snaps" if group in OFFENSE else "defense_snaps"
        unit_games = int(g[g[unit_col].fillna(0) > 0].game_id.nunique())
        total = sum(counts.values())
        metrics = _metrics(group, summed.get(_text(identity.get("gsis_id")), {}), counts["offense_snaps"],
                           counts["defense_snaps"], unit_games, counts["st_snaps"]) if unit_games >= MIN_GAMES else []
        eligible = (unit >= MIN_SNAPS or group in {"K", "P"}) and bool(metrics)
        aliases = {injuries.name_key(str(name)) for name in g.player.unique()}
        last = _text(identity.get("last_name"))
        for first in ("common_first_name", "first_name", "football_name"):
            if _text(identity.get(first)) and last:
                aliases.add(injuries.name_key(_text(identity[first]) + " " + last))
        if _text(identity.get("display_name")):
            aliases.add(injuries.name_key(identity["display_name"]))
        rows[str(identifier)] = {"identity": identity, "aliases": aliases, "group": group, "metrics": metrics,
            "eligible": eligible, "games": games, "frame": g,
            "snap_counts": {"total": total, "offense": counts["offense_snaps"], "defense": counts["defense_snaps"],
                            "special_teams": counts["st_snaps"], "games": games, "season": season,
                            "through_week": int(snaps.week.max()), "source_url": SOURCE},
            "production": {"score": None, "position": group, "season": season, "sample_snaps": unit,
                           "sample_games": unit_games,
                           "reason": "Individual blocking production is not published in this feed" if group in {"OL", "LS"}
                           else "Needs at least two appearances, 50 unit snaps and position-specific opportunities",
                           "components": []}}
    pools = {}
    for row in rows.values():
        if row["eligible"]:
            pools.setdefault(row["group"], []).append(row)
    for group, pool in pools.items():
        if len(pool) < 8:
            continue
        for row in pool:
            components = []
            for i, (label, value) in enumerate(row["metrics"]):
                values = [peer["metrics"][i][1] for peer in pool]
                lower = sum(v < value - 1e-12 for v in values)
                equal = sum(abs(v - value) <= 1e-12 for v in values)
                pct = 100 * (lower + 0.5 * (equal - 1)) / (len(pool) - 1)
                components.append({"label": label, "value": round(value, 4), "percentile": round(pct, 1)})
            row["production"] = {"score": round(sum(c["percentile"] for c in components) / len(components)),
                "position": group, "season": season, "sample_snaps": row["production"]["sample_snaps"],
                "sample_games": row["production"]["sample_games"],
                "cohort_size": len(pool), "minimum_snaps": MIN_SNAPS, "components": components,
                "method": "Equal-weight mean of current-season position-specific production percentiles"}
    out = {}
    for row in rows.values():
        g = row["frame"]
        for raw_team, tg in g.groupby("team"):
            team = injuries.TEAM_ALIASES.get(raw_team, raw_team)
            appeared = tg[(tg.offense_snaps.fillna(0) + tg.defense_snaps.fillna(0) + tg.st_snaps.fillna(0)) > 0]
            latest = int(appeared.week.max()) if not appeared.empty else None
            evidence = {"snap_counts": {**row["snap_counts"], "through_week": max(club_weeks[team])}, "production": row["production"],
                        "source_name": str(g.player.iloc[0]),
                        "missed": sum(w > latest for w in club_weeks[team]) if latest is not None else None}
            for alias in row["aliases"]:
                out.setdefault(team, {})[alias] = evidence
    # A known current player with no snap record has zero recorded snaps, not
    # a missing box-score line. Do not invent consecutive absences or a grade.
    for identity in identities.to_dict("records"):
        team = injuries.TEAM_ALIASES.get(_text(identity.get("latest_team")), _text(identity.get("latest_team")))
        try:
            recent = float(identity.get("last_season") or 0) >= season - 2
        except (ValueError, TypeError):
            recent = False
        if team not in club_weeks or not recent:
            continue
        name = _text(identity.get("display_name"))
        if not name:
            continue
        key = injuries.name_key(name)
        out.setdefault(team, {}).setdefault(key, {
            "snap_counts": {"total": 0, "offense": 0, "defense": 0, "special_teams": 0,
                            "games": 0, "season": season, "through_week": max(club_weeks[team]), "source_url": SOURCE},
            "production": {"score": None, "position": POSITION.get(_text(identity.get("position")), ""),
                           "season": season, "sample_snaps": 0, "components": [], "reason": "No current-season snap sample"},
            "source_name": name, "missed": None})
    return out


@lru_cache(maxsize=2)
def load(season: int) -> dict[str, dict[str, dict]]:
    return build(injuries._read("snap_counts", f"snap_counts_{season}.parquet"),
                 injuries._read("stats_player", f"stats_player_week_{season}.parquet"),
                 injuries._read("players", "players.parquet"), season)
