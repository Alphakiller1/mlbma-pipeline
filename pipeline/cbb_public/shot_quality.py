"""CBB shot quality (2026-11-19): expected eFG from shot selection, and a
predicted eFG fitted to later games.

Every field-goal attempt is classed from the scorer's text, which every feed
writes the same way: rim (layup, dunk, tip), three, or another two. A team's
xeFG is its shot mix priced at pooled D-I make rates; for a defense, the mix
it allows. On 2023-2026 (game level, leave-one-season-out), xeFG alone
predicted later shooting far worse than eFG so far, but the blend beat eFG
through about ten games, and the shot mix a defense allows kept 30-40% of the
weight all season (shot_quality_weights.json). Predicted eFG is that blend:
the eFG this offense is expected to shoot against an average defense, and the
eFG this defense is expected to allow an average offense.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

SPEC = json.loads(Path(__file__).with_name("shot_quality_weights.json").read_text(encoding="utf-8"))
PRICE = SPEC["prices"]
CLASSES = ("rim", "two", "three")
RIM = re.compile(r"layup|dunk|\btip", re.I)


def game_classes(payload: dict, teams) -> dict[str, dict]:
    """{team: {class: [attempts, makes]}} from an ESPN summary's plays."""
    out = {str(t): {c: [0, 0] for c in CLASSES} for t in teams}
    for play in payload.get("plays") or []:
        team = str((play.get("team") or {}).get("id") or "")
        text = (play.get("text") or "").lower()
        if not play.get("shootingPlay") or team not in out or "free throw" in text:
            continue
        cls = "three" if "three point" in text else ("rim" if RIM.search(text) else "two")
        out[team][cls][0] += 1
        out[team][cls][1] += bool(play.get("scoringPlay"))
    return out


def xefg(classes: list[dict]) -> float | None:
    """Shot mix over games, priced at the pooled D-I make rates."""
    attempts = {c: sum(g[c][0] for g in classes) for c in CLASSES}
    total = sum(attempts.values())
    return sum(attempts[c] * PRICE[c] for c in CLASSES) / total if total else None


def weights_for(games: int) -> list[float] | None:
    cuts = sorted(int(k) for k in SPEC["weights"])
    fitted = [c for c in cuts if c <= games]
    return SPEC["weights"][str(fitted[-1])] if fitted else None


def predicted(teams: dict[str, dict]) -> dict[str, dict]:
    """teams: {team: {"games", "o_efg", "o_xefg", "d_efg", "d_xefg"}} ->
    {team: {"pefg_o_all", "pefg_d_all"}}: offense against the pool's average
    defense, defense against its average offense, on the weights for the
    team's games played."""
    full = {t: r for t, r in teams.items() if all(r.get(k) is not None for k in ("o_efg", "o_xefg", "d_efg", "d_xefg"))}
    if not full:
        return {}
    mean = {k: sum(r[k] for r in full.values()) / len(full) for k in ("o_efg", "o_xefg", "d_efg", "d_xefg")}
    out = {}
    for team, r in full.items():
        w = weights_for(r["games"])
        if not w:
            continue
        c, a1, a2, b1, b2 = w
        out[team] = {"pefg_o_all": c + a1 * r["o_efg"] + a2 * r["o_xefg"] + b1 * mean["d_efg"] + b2 * mean["d_xefg"],
                     "pefg_d_all": c + a1 * mean["o_efg"] + a2 * mean["o_xefg"] + b1 * r["d_efg"] + b2 * r["d_xefg"]}
    return out
