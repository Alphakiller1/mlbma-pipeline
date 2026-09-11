#!/usr/bin/env python3
"""Publish the batter and bullpen context the matchup architecture asks for.

Everything here already existed in the pipeline and none of it was reaching the
site, so the analysis page had been falling back to whatever the MLB Stats API
would give it. That is why the lineup tables carried a bare slash line and the
bullpen carried workload with no quality beside it.

Three sources, joined and projected:

  batter_profiles.csv      OSI / ABQ / RCV / OBR per batter, per split, with PA.
                           The vs_RHP and vs_LHP rows are the ones section 3.3
                           is about: a lineup read against the hand it faces.
  batter_savant_rates.csv  xwOBA per batter, keyed by MLB person id.
  bullpen_individual.csv   Per reliever: FIP, K%, BB%, inherited-runners-scored,
                           and the same rates split by the quality of lineup
                           faced - which is where leverage lives.

projOSI and PP_Gap are present in the batter file and are never carried across:
both are forecasts and both are named model_private.
"""
from __future__ import annotations

import csv
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "data" / "public"

TEAM_ALIAS = {
    "ARI": "AZ", "ARZ": "AZ", "CHW": "CWS", "KCR": "KC", "SDP": "SD",
    "SFG": "SF", "TBR": "TB", "TBD": "TB", "WSN": "WSH", "WAS": "WSH",
}

# Which split each published key comes from. `overall` is kept so a batter with
# no rows against a hand still has something true to show.
SPLITS = {"overall": "overall", "vs_RHP": "vs_rhp", "vs_LHP": "vs_lhp"}

BATTER_METRICS = ("OSI", "ABQ", "RCV", "OBR")

# Never carried across. Both are forecasts sitting in an otherwise observed file.
FORBIDDEN = ("projOSI", "PP_Gap", "trend")

BULLPEN_RATES = {
    "overall_ERA": "era", "overall_FIP": "fip", "overall_WHIP": "whip",
    "overall_K_pct": "k_pct", "overall_BB_pct": "bb_pct",
    "overall_HR9": "hr9", "overall_OPS_allowed": "ops_allowed",
    "overall_inherited_runners_scored_pct": "ir_scored_pct",
    # Leverage: the same arm against the lineups that actually threaten.
    "vs_high_osi_ERA": "high_lev_era",
    "vs_high_osi_FIP": "high_lev_fip",
    "vs_high_osi_K_pct": "high_lev_k_pct",
}


def canon(code: str) -> str:
    key = str(code or "").upper().strip()
    return TEAM_ALIAS.get(key, key)


def norm_name(raw: str) -> str:
    """A join key that survives accents, punctuation and suffixes.

    Name joins are the known weak point in this pipeline - a surname-only match
    collides constantly - so the key is the whole name, stripped rather than
    shortened.
    """
    text = unicodedata.normalize("NFKD", str(raw or ""))
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", text.lower())
    return re.sub(r"[^a-z]", "", text)


def num(value):
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return None if out != out else out


def read(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def rank_pool(rows: list[tuple[str, float]], better: str) -> dict[str, tuple[int, int]]:
    ordered = sorted(rows, key=lambda pair: pair[1], reverse=(better == "high"))
    return {key: (i + 1, len(ordered)) for i, (key, _) in enumerate(ordered)}


def batter_context(data_dir: Path) -> dict:
    """Per batter, per split: the Chase metrics with their league rank."""
    rows = read(data_dir / "batter_profiles.csv")
    savant = {str(r.get("player_id") or "").strip(): num(r.get("xwOBA"))
              for r in read(data_dir / "batter_savant_rates.csv")}
    savant_by_name = {norm_name(r.get("player_name")): num(r.get("xwOBA"))
                      for r in read(data_dir / "batter_savant_rates.csv")}

    by_split: dict[str, dict[str, dict]] = {}
    for row in rows:
        split = SPLITS.get(str(row.get("split_type") or "").strip())
        if not split:
            continue
        key = norm_name(row.get("player_name"))
        if not key:
            continue
        pa = num(row.get("PA"))
        entry = {"name": row.get("player_name") or "", "team": canon(row.get("team")),
                 "pa": int(pa) if pa else 0}
        for metric in BATTER_METRICS:
            entry[metric.lower()] = num(row.get(metric))
        by_split.setdefault(split, {})[key] = entry

    # Rank inside each split against batters with a real sample, so a 12-PA
    # cameo never lands at the top of a league table.
    for split, players in by_split.items():
        for metric in BATTER_METRICS:
            low = metric.lower()
            pool = [(k, v[low]) for k, v in players.items()
                    if v[low] is not None and v["pa"] >= 100]
            ranks = rank_pool(pool, "high")
            for key, value in players.items():
                got = ranks.get(key)
                value[low] = {
                    "value": round(value[low], 1) if value[low] is not None else None,
                    "rank": got[0] if got else None,
                    "of": got[1] if got else None,
                }
        for key, value in players.items():
            value["xwoba"] = savant_by_name.get(key)

    return {"splits": by_split, "ids": {k: v for k, v in savant.items() if v is not None}}


def bullpen_context(data_dir: Path) -> dict:
    """Per reliever quality, including the leverage split the IA asks for."""
    out: dict[str, dict] = {}
    for row in read(data_dir / "bullpen_individual.csv"):
        key = norm_name(row.get("pitcher_name"))
        if not key:
            continue
        entry = {"name": row.get("pitcher_name") or "",
                 "team": canon(row.get("pitcher_team")),
                 "hand": row.get("pitcher_hand") or None,
                 "appearances": int(num(row.get("appearances")) or 0)}
        for source, name in BULLPEN_RATES.items():
            entry[name] = num(row.get(source))
        out[key] = entry

    # Each rate becomes {value, rank, of, better} - the same shape every other
    # public artifact uses. It was a bare rate plus a separate `<name>_rank`
    # object holding nothing but an ordering, which reads as a number the
    # reader is asked to take on trust rather than one they can check against
    # the value it came from. The boundary gate now enforces exactly that:
    # a rank is publishable when it sits beside its own value.
    for name in ("fip", "k_pct", "ir_scored_pct", "high_lev_era"):
        better = "high" if name == "k_pct" else "low"
        pool = [(k, v[name]) for k, v in out.items()
                if v.get(name) is not None and v["appearances"] >= 10]
        ranks = rank_pool(pool, better)
        for key, value in out.items():
            raw = value.get(name)
            if raw is None:
                value.pop(name, None)
                continue
            got = ranks.get(key)
            value[name] = {"value": raw, "better": better}
            if got:
                value[name]["rank"], value[name]["of"] = got[0], got[1]
    return out


def main(argv: list[str]) -> int:
    data_dir = Path(argv[1]) if len(argv) > 1 else ROOT / "data"
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    batters = batter_context(data_dir)
    pen = bullpen_context(data_dir)
    if not batters["splits"] and not pen:
        print(f"  skip: no batter or bullpen CSVs under {data_dir}")
        return 1

    payload = {
        "schema": "chase-public-batters/1",
        "sport": "mlb",
        "generated_at_utc": now,
        "note": "Batter and reliever context, joined on the full name. Ranks are "
                "computed inside each split against players with a real sample "
                "(100 PA for batters, 10 appearances for relievers), so a cameo "
                "never lands at the top of a league table.",
        "formulas": {"osi": "0.43*RCV + 0.37*ABQ + 0.20*OBR"},
        "batters": batters["splits"],
        "bullpen": pen,
    }
    blob = json.dumps(payload)
    for bad in FORBIDDEN:
        if bad in blob:
            print(f"  ERROR: {bad} reached the public batter artifact")
            return 1

    dest = PUBLIC / "batter_context.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    counts = ", ".join(f"{k} {len(v)}" for k, v in batters["splits"].items())
    print(f"  wrote {dest.relative_to(ROOT)} (batters: {counts}; relievers {len(pen)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
