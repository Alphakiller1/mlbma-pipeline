"""Full-court pressure measured from play-by-play.

No free feed tags man, zone or press. Pressure leaves a mark the play-by-play
does record: after a team scores, the opponent inbounds a dead ball and has to
bring it up the floor. A turnover or steal in the first ``WINDOW`` seconds of
that possession, before the offense gets a shot or free throw away, is a
backcourt turnover. Half-court defense almost never forces one that early;
pressing defenses do.

Per team and season this counts:

- defense: possessions after its own scores (``after_score``) and the
  backcourt turnovers it forced in them (``forced``; ``steals`` is the live-ball
  part);
- offense: possessions after the opponent scored (``after_score``) and the
  backcourt turnovers it gave up (``lost``; ``stolen`` is the live-ball part).

Overtime and the last four minutes of regulation are left out: trailing teams
press out of necessity and leading teams foul, which is game state, not scheme.
"""
from __future__ import annotations

WINDOW = 10        # seconds of game clock after the score (the NCAA backcourt count)
LATE = 240         # seconds left in the second half from which presses are game state
TURNOVER = "Lost Ball Turnover"   # ESPN's type for every turnover
STEAL = "Steal"


def seconds(clock) -> float | None:
    """'12:34', '0:45' or '45.3' -> seconds left in the period."""
    text = str(clock or "").strip()
    try:
        if ":" in text:
            minutes, secs = text.split(":", 1)
            return int(minutes) * 60 + float(secs)
        return float(text)
    except ValueError:
        return None


def is_free_throw(play) -> bool:
    return "FreeThrow" in (play.get("type") or "")


def game_pressure(plays: list[dict], teams: tuple[str, str]) -> dict[str, dict]:
    """plays: in game order, each ``{period, clock, type, team, scoring, shooting}``
    (team is the acting team's id as a string). Returns per team
    ``{"defense": {after_score, forced, steals}, "offense": {after_score, lost, stolen}}``.
    """
    out = {t: {"defense": {"after_score": 0, "forced": 0, "steals": 0},
               "offense": {"after_score": 0, "lost": 0, "stolen": 0}} for t in teams}
    rows = []
    for play in plays:
        period, left = play.get("period"), seconds(play.get("clock"))
        if period is None or left is None:
            continue
        rows.append((int(period), left, play))
    for i, (period, left, play) in enumerate(rows):
        team = play.get("team")
        if not play.get("scoring") or team not in out:
            continue
        if period >= 3 or (period == 2 and left <= LATE):
            continue
        # The ball is dead and inbounded only after the last free throw of a trip,
        # or after a field goal with no free throw to follow.
        more = False
        for later_period, later_left, later in rows[i + 1:]:
            if later_period != period or later_left != left:
                break
            if later.get("team") == team and is_free_throw(later):
                more = True
                break
        if more:
            continue
        other = teams[1] if team == teams[0] else teams[0]
        out[team]["defense"]["after_score"] += 1
        out[other]["offense"]["after_score"] += 1
        for j in range(i + 1, len(rows)):
            later_period, later_left, later = rows[j]
            if later_period != period or later_left < left - WINDOW:
                break
            kind, actor = later.get("type"), later.get("team")
            if actor == other and (later.get("shooting") or is_free_throw(later)):
                break
            if kind in (TURNOVER, STEAL) and actor in (team, other):
                out[team]["defense"]["forced"] += 1
                out[other]["offense"]["lost"] += 1
                # ESPN lists the turnover first and the steal right after it.
                nxt = next((r[2] for r in rows[j:j + 4] if r[2].get("type") == STEAL), None)
                if nxt is not None and nxt.get("team") == team:
                    out[team]["defense"]["steals"] += 1
                    out[other]["offense"]["stolen"] += 1
                break
            if kind == "Jumpball" or (actor == team and later.get("scoring")):
                break
    return out


def espn_plays(payload: dict) -> list[dict]:
    """Normalise an ESPN summary payload's plays."""
    rows = []
    for p in payload.get("plays") or []:
        rows.append({"period": (p.get("period") or {}).get("number"),
                     "clock": (p.get("clock") or {}).get("displayValue"),
                     "type": (p.get("type") or {}).get("text"),
                     "team": str((p.get("team") or {}).get("id")) if (p.get("team") or {}).get("id") else None,
                     "scoring": bool(p.get("scoringPlay")),
                     "shooting": bool(p.get("shootingPlay"))})
    return rows


def add(total: dict, game: dict) -> dict:
    for side, counts in game.items():
        bucket = total.setdefault(side, {})
        for key, value in counts.items():
            bucket[key] = bucket.get(key, 0) + value
    return total


SOURCE = "ESPN play-by-play"
MIN_AFTER_SCORE = 20   # fewer post-score possessions than this and a side is not ranked


def summarise(total: dict, games: int, through: str | None) -> dict | None:
    """The published block: counts plus rates per 100 post-score possessions."""
    if not games or not total:
        return None
    out = {"source": SOURCE, "games": games, "data_through": through, "window_seconds": WINDOW}
    for side, counts, keys in (("defense", total.get("defense") or {}, ("forced", "steals")),
                               ("offense", total.get("offense") or {}, ("lost", "stolen"))):
        n = counts.get("after_score") or 0
        block = {"after_score": n, **{k: counts.get(k) or 0 for k in keys}}
        for k in keys:
            block[k + "_per100"] = round(100 * block[k] / n, 2) if n else None
        out[side] = block
    return out


RANKED = {"pressure_forced_per100": ("defense", "forced_per100"),
          "pressure_steals_per100": ("defense", "steals_per100"),
          "pressure_lost_per100": ("offense", "lost_per100"),
          "pressure_stolen_per100": ("offense", "stolen_per100")}


def rank_values(blocks, key: str) -> list[float]:
    """Values of one ranked pressure rate across a season's teams."""
    side, field = RANKED[key]
    values = []
    for block in blocks:
        part = (block or {}).get(side) or {}
        if (part.get("after_score") or 0) >= MIN_AFTER_SCORE and part.get(field) is not None:
            values.append(part[field])
    return values
