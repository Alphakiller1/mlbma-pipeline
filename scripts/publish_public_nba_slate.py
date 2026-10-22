#!/usr/bin/env python3
"""Publish the NBA research slate the /nba/ desk reads.

The source is nba-model's public slate (alphakiller1.github.io/nba-model/
slate.json): identity, venue, rest, injuries, observed team rates and player
lines, written behind that repo's own PUBLIC_FORBIDDEN gate. This script
re-checks the boundary, refreshes each game's state and score from ESPN's
scoreboard (the model slate is rebuilt every hour or two; a final should not
wait for it), and writes data/public/nba/slate.json.

It refuses to replace a good slate with a worse one: a source that is stale,
malformed, carries model fields, or has fewer games for the same night than
the slate already published is rejected and the published file is kept.

A key the public classification has never seen (a field nba-model added
upstream) is dropped, not published, and named in a run warning; the rest of
the slate still refreshes. Failing the whole slate on one new field used to
freeze the desk until someone classified it.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import validate_public_fields as vpf  # noqa: E402
OUT = ROOT / "data" / "public" / "nba" / "slate.json"
SOURCE = os.environ.get("NBA_PUBLIC_SLATE_URL", "https://alphakiller1.github.io/nba-model/slate.json")
SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates={date}"
MAX_AGE = timedelta(hours=36)
HEADERS = {"User-Agent": "Mozilla/5.0 (chase-analytics slate publisher)", "Accept": "application/json"}
TEAMS = {"ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GS", "HOU", "IND", "LAC", "LAL",
         "MEM", "MIA", "MIL", "MIN", "NO", "NY", "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SA", "TOR",
         "UTAH", "WSH"}
ALIASES = {"GSW": "GS", "NYK": "NY", "NOP": "NO", "SAS": "SA", "UTA": "UTAH", "WAS": "WSH"}


def fetch(url: str) -> dict:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def restricted_keys() -> set[str]:
    spec = json.loads((ROOT / "design" / "public_restricted_fields.json").read_text(encoding="utf-8"))
    return {str(k) for k in spec.get("forbidden_keys", [])}


def leaked(obj, banned: set[str], found: set[str] | None = None) -> set[str]:
    found = set() if found is None else found
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in banned:
                found.add(k)
            leaked(v, banned, found)
    elif isinstance(obj, list):
        for v in obj:
            leaked(v, banned, found)
    return found


def prune_unclassified(obj, spec: dict | None = None, path: str = "$", dropped: dict | None = None) -> dict:
    """Remove, in place, every key the public classification cannot resolve.

    Uses the validator's own resolution order (exact path, company, path
    suffix, name), so what survives is exactly what validate_public_fields
    accepts. Returns {key: first path} of what was dropped."""
    if spec is None:
        spec = json.loads(vpf.CLASSIFICATION.read_text(encoding="utf-8"))
    dropped = {} if dropped is None else dropped
    po = spec.get("path_overrides") or {}
    suffixes, id_maps, exact = po.get("suffixes") or {}, po.get("id_maps") or [], po.get("exact") or {}
    if isinstance(obj, dict):
        identifiers = vpf.is_id_map(id_maps, path)
        for key in list(obj):
            child = f"{path}.{key}"
            if not identifiers:
                resolved = (exact.get(child) or vpf.sibling_class(key, obj)
                            or vpf.path_class(suffixes, child) or vpf.class_of(spec, key))
                if resolved is None:
                    dropped.setdefault(key, child)
                    del obj[key]
                    continue
            prune_unclassified(obj[key], spec, child, dropped)
    elif isinstance(obj, list):
        for value in obj:
            prune_unclassified(value, spec, f"{path}[]", dropped)
    return dropped


def validate(slate: dict, now: datetime) -> list[str]:
    problems = []
    if slate.get("schema") != "chase-public-slate/1" or slate.get("sport") != "nba":
        problems.append(f"unexpected schema/sport {slate.get('schema')!r}/{slate.get('sport')!r}")
    games = slate.get("games")
    if not isinstance(games, list):
        return problems + ["games is not a list"]
    try:
        made = datetime.fromisoformat(str(slate.get("generated_at_utc")).replace("Z", "+00:00"))
        if now - made > MAX_AGE:
            problems.append(f"source is stale: generated {made.isoformat()}")
    except ValueError:
        problems.append("source has no generated_at_utc")
    for g in games:
        if not g.get("id") or g.get("away") not in TEAMS or g.get("home") not in TEAMS:
            problems.append(f"game without identity: {g.get('id')!r} {g.get('away')!r}@{g.get('home')!r}")
    bad = leaked(slate, restricted_keys())
    if bad:
        problems.append("model fields in the public slate: " + ", ".join(sorted(bad)))
    return problems


def live_state(slate_date: str) -> dict[str, dict]:
    """event id -> {game_state, status_detail, away_score, home_score} from ESPN."""
    try:
        data = fetch(SCOREBOARD.format(date=slate_date.replace("-", "")))
    except Exception as exc:  # the model slate's own state stands
        print(f"scoreboard unavailable: {exc}")
        return {}
    out = {}
    for ev in data.get("events", []):
        comp = (ev.get("competitions") or [{}])[0]
        status = (comp.get("status") or {}).get("type") or {}
        state = {"pre": "scheduled", "in": "live", "post": "final"}.get(status.get("state"), "scheduled")
        row = {"game_state": state, "status_detail": status.get("shortDetail") or None}
        for c in comp.get("competitors", []):
            side = c.get("homeAway")
            code = str((c.get("team") or {}).get("abbreviation", "")).upper()
            code = ALIASES.get(code, code)
            if side in ("home", "away"):
                row[f"{side}_code"] = code
                if state != "scheduled":
                    try:
                        row[f"{side}_score"] = int(c.get("score"))
                    except (TypeError, ValueError):
                        pass
                rec = next((r.get("summary") for r in c.get("records") or [] if r.get("type") == "total"), None)
                if rec:
                    row[f"{side}_record"] = rec
        out[str(ev.get("id"))] = row
    return out


def merge_live(slate: dict) -> dict:
    live = live_state(str(slate.get("slate_date") or ""))
    for g in slate.get("games", []):
        row = live.get(str(g.get("id")))
        if not row or row.get("away_code") != g.get("away") or row.get("home_code") != g.get("home"):
            continue
        g["game_state"] = row["game_state"]
        if row.get("status_detail"):
            g["status_detail"] = row["status_detail"]
        for side in ("away", "home"):
            if f"{side}_score" in row:
                g[f"{side}_score"] = row[f"{side}_score"]
            if row.get(f"{side}_record"):
                g[f"{side}_record"] = row[f"{side}_record"]
    return slate


def main() -> int:
    now = datetime.now(timezone.utc)
    try:
        slate = fetch(SOURCE)
    except Exception as exc:
        print(f"::warning::NBA source unreachable, keeping the published slate: {exc}")
        return 0
    problems = validate(slate, now)
    if problems:
        print("::warning::NBA source rejected, keeping the published slate:")
        for p in problems:
            print("  -", p)
        return 0
    if OUT.exists():
        try:
            prev = json.loads(OUT.read_text(encoding="utf-8"))
        except ValueError:
            prev = {}
        if (prev.get("slate_date") == slate.get("slate_date")
                and len(prev.get("games") or []) > len(slate.get("games") or [])):
            print(f"::warning::source has {len(slate['games'])} games for {slate['slate_date']} against "
                  f"{len(prev['games'])} published; keeping the published slate")
            return 0
    slate = merge_live(slate)
    dropped = prune_unclassified(slate)
    if dropped:
        print("::warning::NBA slate: unclassified keys dropped (classify them in "
              "design/public_metric_classification.json to publish): " +
              ", ".join(f"{k} at {v}" for k, v in sorted(dropped.items())))
    if OUT.exists():
        try:
            prev = json.loads(OUT.read_text(encoding="utf-8"))
            prev.pop("published_at_utc", None)
            if prev == slate:
                print("NBA slate unchanged; nothing to write")
                return 0
        except ValueError:
            pass
    slate["published_at_utc"] = now.replace(microsecond=0).isoformat()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(slate, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {slate.get('slate_date')} · {len(slate['games'])} games")
    return 0


if __name__ == "__main__":
    sys.exit(main())
