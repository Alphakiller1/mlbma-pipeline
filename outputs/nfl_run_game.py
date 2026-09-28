"""Team run game and every ball carrier, from nflverse play-by-play.

The Rushing tab led with each club's starting back. This is the unit under
him: every designed run a club has made (backs, quarterbacks, gadget carries;
scrambles and kneels are not designed runs), what its defense has allowed on
the same plays, and each ball carrier's share of it.

Two windows, matching the page's evidence toggle:
- ``current``: the season in progress;
- ``combined``: the prior season and the current one together.

Unit figures are placed among all 32 clubs. Ball carriers are placed on the
page among the carriers on the slate, so the pipeline publishes raw figures
and carries for them.
"""
from __future__ import annotations

from typing import Any

UNIT_METRICS = (
    # key, offense better, defense better
    ("yards_per_game", "high", "low"),
    ("yards_per_carry", "high", "low"),
    ("epa_per_carry", "high", "low"),
    ("success_rate", "high", "low"),
    ("explosive_rate", "high", "low"),
    ("stuff_rate", "low", "high"),
)
CARRIERS_PER_CLUB = 8
_TEAM = {"LA": "LAR", "JAC": "JAX", "OAK": "LV", "SD": "LAC", "STL": "LAR", "WAS": "WSH"}


def _code(value: object) -> str:
    key = str(value or "").upper()
    return _TEAM.get(key, key)


def _designed_runs(frame):
    if frame is None or frame.empty:
        return None
    runs = frame[
        frame["rush_attempt"].fillna(0).eq(1)
        & frame["qb_scramble"].fillna(0).eq(0)
        & frame["qb_kneel"].fillna(0).eq(0)
        & frame["posteam"].notna()
        & frame["defteam"].notna()
    ].copy()
    runs["_explosive"] = runs["yards_gained"].fillna(0).ge(10).astype(float)
    runs["_stuffed"] = runs["yards_gained"].fillna(0).le(0).astype(float)
    runs["_td"] = runs["touchdown"].fillna(0).astype(float)
    return runs


def _unit(rows) -> dict[str, Any]:
    carries = int(len(rows))
    games = int(rows["game_id"].nunique())
    yards = float(rows["yards_gained"].fillna(0).sum())
    return {
        "games": games,
        "carries": carries,
        "touchdowns": int(rows["_td"].sum()),
        "yards_per_game": round(yards / games, 1) if games else None,
        "yards_per_carry": round(yards / carries, 2) if carries else None,
        "epa_per_carry": round(float(rows["epa"].mean()), 3) if carries else None,
        "success_rate": round(float(rows["success"].mean()), 4) if carries else None,
        "explosive_rate": round(float(rows["_explosive"].mean()), 4) if carries else None,
        "stuff_rate": round(float(rows["_stuffed"].mean()), 4) if carries else None,
    }


def _place(pool: dict[str, float], better: str) -> dict[str, dict[str, int]]:
    ordered = sorted(pool.items(), key=lambda kv: kv[1], reverse=(better == "high"))
    return {team: {"place": i + 1, "of": len(ordered)} for i, (team, _) in enumerate(ordered)}


def _window(runs, positions: dict[str, str], names: dict[str, str],
            club_of: dict[str, str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for phase, col in (("offense", "posteam"), ("defense", "defteam")):
        for team, rows in runs.groupby(col):
            out.setdefault(_code(team), {})[phase] = _unit(rows)
    clubs = [t for t in out if "offense" in out[t] and "defense" in out[t]]
    for phase, index in (("offense", 1), ("defense", 2)):
        for spec in UNIT_METRICS:
            key, better = spec[0], spec[index]
            pool = {t: out[t][phase][key] for t in clubs if out[t][phase].get(key) is not None}
            if len(pool) < 20:
                continue
            for team, place in _place(pool, better).items():
                out[team][phase].setdefault("ranks", {})[key] = place
    # Every ball carrier, credited to the club he carries for now.
    carriers: dict[str, list[dict]] = {}
    for pid, rows in runs[runs["rusher_player_id"].notna()].groupby("rusher_player_id"):
        pid = str(pid)
        # Only players carrying for a club this season: a 2025 back who has not
        # carried in 2026 may no longer be on the roster.
        team = club_of.get(pid)
        if not team:
            continue
        stats = _unit(rows)
        fallback = str(rows["rusher_player_name"].dropna().iloc[-1]) if rows["rusher_player_name"].notna().any() else pid
        carriers.setdefault(team, []).append({
            "player_id": pid,
            "player_name": names.get(pid, fallback),
            "position": positions.get(pid, ""),
            "games": stats["games"],
            "carries": stats["carries"],
            "touchdowns": stats["touchdowns"],
            "yards_per_carry": stats["yards_per_carry"],
            "epa_per_carry": stats["epa_per_carry"],
            "success_rate": stats["success_rate"],
            "explosive_rate": stats["explosive_rate"],
        })
    for team, rows in carriers.items():
        total = sum(r["carries"] for r in rows) or 1
        rows.sort(key=lambda r: -r["carries"])
        for r in rows:
            r["carry_share"] = round(r["carries"] / total, 4)
        if team in out:
            out[team]["carriers"] = rows[:CARRIERS_PER_CLUB]
    return out


def build(current, prior, season: int, positions: dict[str, str],
          names: dict[str, str]) -> dict[str, dict]:
    """{club: {"current": {...}, "combined": {...}, "seasons": {...}}}; empty on failure."""
    try:
        import pandas as pd
        now = _designed_runs(current)
        before = _designed_runs(prior)
        if now is None or now.empty:
            return {}
        # The club a player carries for today: his latest club this season.
        club_of = {
            str(pid): _code(rows.sort_values("game_id")["posteam"].iloc[-1])
            for pid, rows in now[now["rusher_player_id"].notna()].groupby("rusher_player_id")
        }
        windows = {"current": _window(now, positions, names, club_of)}
        if before is not None and not before.empty:
            windows["combined"] = _window(pd.concat([before, now], ignore_index=True),
                                          positions, names, club_of)
        out: dict[str, dict] = {}
        for label, by_team in windows.items():
            for team, value in by_team.items():
                out.setdefault(team, {})[label] = value
        for team in out:
            out[team]["seasons"] = {
                "current": [season],
                "combined": [season - 1, season] if "combined" in windows else [season],
            }
        return out if len(out) >= 30 else {}
    except Exception as exc:  # the run game never blocks the slate
        print(f"  WARNING: NFL run game unavailable ({exc})")
        return {}
