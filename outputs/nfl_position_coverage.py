"""Coverage by position group (2026-11-18).

Every target to a WR, TE or RB, split by the look the defense showed, from
the offense's side (what its pass catchers did) and from the defense's side
(what it allowed to that position group). Looks are the receiver tables'
looks (``nfl_advanced_context._split_masks``): man/zone, single/two-high,
Cover 0/1/2/2-Man/3/4/6 and pressure from nflverse participation (NGS
charting, the prior season until the current one publishes), blitz, box,
play action and motion from FTN charting (current season included).

Two windows, the desk's: ``current`` is this season alone; ``combined`` pools
it with the prior season play by play, so its coverage looks are the prior
season's. Each figure is placed among the 32 clubs: an offense's best is the
highest, a defense's best is the lowest allowed; a target share is a
tendency, placed by most. A club under the target floor in a look is placed
against the clubs above it (owner rule: no grey cells).
"""
from __future__ import annotations

from typing import Any

GROUPS = ("WR", "TE", "RB")
FLOOR = 8
# The looks the desk prints (the receiver tables' families). The middle-of-
# field names alias single/two-high and the "no" halves of play action and
# motion are the remainder of "all": neither is published twice.
LOOKS = ("all", "man", "zone", "single_high", "two_high", "cover_0", "cover_1", "cover_2",
         "cover_2_man", "cover_3", "cover_4", "cover_6", "blitz", "no_blitz", "pressure", "clean",
         "light_box", "stacked_box", "play_action", "motion")
STATS = ("catch_rate", "yards_per_target", "epa_per_target", "success_rate")
# Positions the player registry files under a group: a fullback is targeted
# out of the backfield.
GROUP_OF = {"WR": "WR", "TE": "TE", "RB": "RB", "FB": "RB", "HB": "RB"}


def _positions(frame_positions: dict[str, str] | None = None) -> dict[str, str]:
    """gsis id -> WR/TE/RB from the nflverse player registry, with the
    season-stat positions as the fallback."""
    from outputs.nfl_advanced_context import PLAYERS_URL, _frame
    out = {k: GROUP_OF.get(str(v).upper()) for k, v in (frame_positions or {}).items()}
    registry = _frame(PLAYERS_URL, ("gsis_id", "position", "position_group"))
    if registry is not None:
        for gsis, pos, grp in registry.itertuples(index=False):
            group = GROUP_OF.get(str(pos or "").upper()) or GROUP_OF.get(str(grp or "").upper())
            if gsis and group:
                out[str(gsis)] = group
    return {k: v for k, v in out.items() if v}


def _stats(rows, team_targets: int) -> dict[str, Any] | None:
    targets = int(len(rows))
    if not targets:
        return None
    receptions = float(rows["complete_pass"].fillna(0).sum())
    yards_col = "receiving_yards" if "receiving_yards" in rows else "yards_gained"
    yards = float(rows[yards_col].fillna(0).sum())
    return {
        "targets": targets,
        "target_share": round(targets / team_targets, 4) if team_targets else None,
        "catch_rate": round(receptions / targets, 4),
        "yards_per_target": round(yards / targets, 4),
        "epa_per_target": round(float(rows["epa"].fillna(0).sum()) / targets, 4),
        "success_rate": round(float(rows["success"].fillna(0).mean()), 4) if "success" in rows else None,
    }


def _window(frame, positions: dict[str, str]) -> dict[str, dict]:
    from outputs.nfl_advanced_context import _split_masks, _team
    targets = frame[frame["pass_attempt"].fillna(0).eq(1) & frame["receiver_player_id"].notna()].copy()
    targets["_group"] = targets["receiver_player_id"].astype(str).map(positions)
    targets = targets[targets["_group"].isin(GROUPS)]
    out: dict[str, dict] = {}
    for side, column in (("offense", "posteam"), ("defense", "defteam")):
        for team, rows in targets.groupby(column, dropna=True):
            club = out.setdefault(_team(team), {"offense": {}, "defense": {}})[side]
            masks = _split_masks(rows, "REC")
            totals = {look: int(mask.sum()) for look, mask in masks.items()}
            for look, mask in masks.items():
                if look not in LOOKS or not totals[look]:
                    continue
                subset = rows[mask]
                for group in GROUPS:
                    stats = _stats(subset[subset["_group"].eq(group)], totals[look])
                    if stats:
                        club.setdefault(group, {})[look] = stats
    return out


def _place(pool: list[float], value: float, high_better: bool) -> int:
    if high_better:
        place = 1 + sum(1 for other in pool if other > value + 1e-12)
    else:
        place = 1 + sum(1 for other in pool if other < value - 1e-12)
    return min(place, len(pool))


def _rank(window: dict[str, dict]) -> None:
    """league_ranks on every figure, among the clubs above the floor."""
    for side in ("offense", "defense"):
        cells: dict[tuple, list[tuple[str, dict]]] = {}
        for team, sides in window.items():
            for group, looks in sides[side].items():
                for look, stats in looks.items():
                    cells.setdefault((group, look), []).append((team, stats))
        for (group, look), rows in cells.items():
            # A rare look (stacked-box targets to backs) can leave a handful of
            # clubs at the floor; the pool then steps down so every club is
            # placed among at least half the league, never among one or two.
            qualified = []
            for floor in (FLOOR, 4, 2, 1):
                qualified = [s for _, s in rows if s["targets"] >= floor]
                if len(qualified) >= 16:
                    break
            for stat in STATS + ("target_share",):
                pool = [s[stat] for s in qualified if s.get(stat) is not None]
                if len(pool) < 2:
                    continue
                high = True if stat == "target_share" or side == "offense" else False
                for _, stats in rows:
                    if stats.get(stat) is None:
                        continue
                    stats.setdefault("league_ranks", {})[stat] = {
                        "place": _place(pool, stats[stat], high), "of": len(pool)}


def build(current, prior, season: int, frame_positions: dict[str, str] | None = None) -> dict[str, dict]:
    """{club: {"current": {...}, "combined": {...}, "seasons": {...}}}; {} when
    neither season's play by play is available."""
    import pandas as pd
    frames = [f for f in (current, prior) if f is not None and not f.empty]
    if not frames:
        return {}
    positions = _positions(frame_positions)
    windows = {}
    if current is not None and not current.empty:
        windows["current"] = (_window(current, positions), [season])
    pooled = pd.concat(frames, ignore_index=True, sort=False)
    seasons = sorted({int(s) for s in pooled["season"].dropna().unique()}) if "season" in pooled else []
    windows["combined"] = (_window(pooled, positions), seasons)
    out: dict[str, dict] = {}
    for name, (window, years) in windows.items():
        _rank(window)
        for team, sides in window.items():
            entry = out.setdefault(team, {"seasons": {}})
            entry[name] = sides
            entry["seasons"][name] = years
    return out
