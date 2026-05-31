"""Shared player-name normalization and registry lookup."""

from __future__ import annotations

import re
import unicodedata
from typing import Optional

import pandas as pd

NAME_SUFFIXES = re.compile(r"^(jr|sr|ii|iii|iv|v)$", re.I)


def normalize_player_name(name: str) -> str:
    s = unicodedata.normalize("NFD", str(name or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9 ]", " ", s.lower())
    return " ".join(s.split())


def player_last_name(name: str) -> str:
    parts = re.sub(r"\.", " ", str(name or "")).split()
    while len(parts) > 1 and NAME_SUFFIXES.match(parts[-1]):
        parts.pop()
    return parts[-1].lower() if parts else ""


def player_initial(name: str) -> Optional[str]:
    m = re.match(r"^([A-Za-z])\.", str(name or "").strip())
    return m.group(1).lower() if m else None


def team_key(team: str) -> str:
    return str(team or "").strip().upper()


def find_registry_entry(name: str, team: str, registry: pd.DataFrame) -> Optional[pd.Series]:
    direct = normalize_player_name(name)
    ln = player_last_name(name)
    init = player_initial(name) or (direct.split(" ")[0][:1] if direct else "")
    t = team_key(team)
    hits = []
    for _, row in registry.iterrows():
        full = str(row.get("full_name") or "").strip()
        if not full:
            continue
        fn = normalize_player_name(full)
        score = 0
        if fn == direct:
            score = 100
        elif ln and player_last_name(full) == ln:
            score = 85 if (not init or full[0].lower() == init) else 60
        if not score:
            continue
        row_team = team_key(row.get("team_abbr") or row.get("team") or "")
        if row_team == t:
            score += 10
        hits.append((score, row))
    if not hits:
        return None
    hits.sort(key=lambda x: x[0], reverse=True)
    return hits[0][1]


def resolve_lineup_player(name: str, team: str, registry: pd.DataFrame) -> Optional[str]:
    hit = find_registry_entry(name, team, registry)
    if hit is not None:
        return str(hit["full_name"]).strip()
    return str(name or "").strip() or None


def lineup_full_names(registry: pd.DataFrame, lineups: pd.DataFrame) -> set[str]:
    names: set[str] = set()
    if lineups is None or lineups.empty:
        return names
    player_col = "Player" if "Player" in lineups.columns else lineups.columns[-1]
    team_col = "Team" if "Team" in lineups.columns else "team"
    for _, row in lineups.iterrows():
        resolved = resolve_lineup_player(
            str(row.get(player_col) or ""),
            str(row.get(team_col) or ""),
            registry,
        )
        if resolved:
            names.add(resolved)
    return names
