"""CBB first- and second-half figures (2026-11-19), from the ESPN play-by-play
the box supplement already reads.

Each final is split at halftime. Overtime is left out, since halves are
20 minutes apiece. For each half, each side counts:
- field goals and threes, made and attempted;
- free throws, made and attempted;
- offensive and defensive rebounds (team "dead ball" rebounds excluded);
- turnovers.

The official line score supplies the points. A half whose counted points
(2 x FGM + 3PM + FTM) do not match the line score is not used for that
game: the play-by-play missed something.

Rates over a team's D-I games, offense and the defense against it:
- Pts/G;
- points per possession;
- eFG%;
- turnover rate;
- offensive rebound rate, and the defense's own DRB%;
- FT rate (FTA/FGA);
- pace: possessions per half and seconds per possession (style, no verdict).

Possessions are FGA - ORB + TOV + 0.475 x FTA, averaged across the two
sides, as the box rates count them.
"""
from __future__ import annotations

from collections import Counter

HALVES = ("h1", "h2")
COUNTS = ("pts", "fga", "fgm", "tpa", "tpm", "fta", "ftm", "orb", "drb", "tov")
# The rate keys a team's rates carry, per half (also export.EXTRA_RATE_FIELDS).
KEYS = tuple(f"{h}_{k}" for h in HALVES for k in
             ("pts_o", "pts_d", "ppp_o", "ppp_d", "efg_o", "efg_d", "tov_o", "tov_d",
              "orb_o", "drb_d", "ftr_o", "ftr_d", "poss", "spp")) + ("halves_games_all",)


def game_halves(payload: dict, teams) -> dict[str, dict | None]:
    """{team id: {"h1": counts, "h2": counts} or None} for one final."""
    teams = [str(t) for t in teams]
    sums = {t: {h: Counter() for h in HALVES} for t in teams}
    comp = ((payload.get("header") or {}).get("competitions") or [{}])[0]
    lines = {}
    for c in comp.get("competitors") or []:
        scores = [ls.get("displayValue", ls.get("value")) for ls in c.get("linescores") or []]
        lines[str((c.get("team") or {}).get("id") or c.get("id") or "")] = scores
    for play in payload.get("plays") or []:
        period = (play.get("period") or {}).get("number")
        half = "h1" if period == 1 else "h2" if period == 2 else None
        team = str((play.get("team") or {}).get("id") or "")
        if not half or team not in sums:
            continue
        c = sums[team][half]
        kind = ((play.get("type") or {}).get("text") or "").lower()
        text = (play.get("text") or "").lower()
        made = bool(play.get("scoringPlay"))
        if play.get("shootingPlay") and "free throw" in text:
            c["fta"] += 1
            c["ftm"] += made
        elif play.get("shootingPlay"):
            c["fga"] += 1
            c["fgm"] += made
            if play.get("pointsAttempted") == 3 or "three point" in text:
                c["tpa"] += 1
                c["tpm"] += made
        elif kind == "offensive rebound":
            c["orb"] += 1
        elif kind == "defensive rebound":
            c["drb"] += 1
        elif "turnover" in kind:
            c["tov"] += 1
    out: dict[str, dict | None] = {}
    for t in teams:
        scores = lines.get(t) or []
        halves = {}
        for i, h in enumerate(HALVES):
            c = sums[t][h]
            try:
                pts = int(float(scores[i]))
            except (IndexError, TypeError, ValueError):
                halves = None
                break
            if not c["fga"] or 2 * c["fgm"] + c["tpm"] + c["ftm"] != pts:
                halves = None
                break
            c["pts"] = pts
            halves[h] = {k: int(c[k]) for k in COUNTS}
        out[t] = halves or None
    # A half is read only when both sides reconcile: each side's rates use the other's.
    if any(v is None for v in out.values()):
        return {t: None for t in teams}
    return out


def _poss(c: dict) -> float:
    return c["fga"] - c["orb"] + c["tov"] + 0.475 * c["fta"]


def rates(pairs) -> dict[str, float | int | None]:
    """Half rates over games: pairs of (own halves, opponent halves)."""
    out: dict[str, float | int | None] = {"halves_games_all": len(pairs)}
    for h in HALVES:
        own = Counter()
        opp = Counter()
        poss = 0.0
        for mine, theirs in pairs:
            own.update(mine[h])
            opp.update(theirs[h])
            poss += (_poss(mine[h]) + _poss(theirs[h])) / 2
        n = len(pairs)

        def ratio(a, b):
            return a / b if b else None
        out.update({
            f"{h}_pts_o": ratio(own["pts"], n), f"{h}_pts_d": ratio(opp["pts"], n),
            f"{h}_ppp_o": ratio(own["pts"], poss), f"{h}_ppp_d": ratio(opp["pts"], poss),
            f"{h}_efg_o": ratio(own["fgm"] + 0.5 * own["tpm"], own["fga"]),
            f"{h}_efg_d": ratio(opp["fgm"] + 0.5 * opp["tpm"], opp["fga"]),
            f"{h}_tov_o": ratio(own["tov"], poss), f"{h}_tov_d": ratio(opp["tov"], poss),
            f"{h}_orb_o": ratio(own["orb"], own["orb"] + opp["drb"]),
            f"{h}_drb_d": ratio(own["drb"], own["drb"] + opp["orb"]),
            f"{h}_ftr_o": ratio(own["fta"], own["fga"]), f"{h}_ftr_d": ratio(opp["fta"], opp["fga"]),
            f"{h}_poss": ratio(poss, n),
            # Pace as time: a 20-minute half over its possessions (both sides').
            f"{h}_spp": ratio(1200.0 * n, 2 * poss) if poss else None,
        })
    return out
