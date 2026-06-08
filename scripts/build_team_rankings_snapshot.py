#!/usr/bin/env python3
"""Build a static Team Rankings snapshot for instant first paint.

Reads local pipeline CSVs (same fields the dashboard uses for default YTD / both-hands
filter) and writes dashboard/team_rankings_snapshot.json. Regenerate after each pipeline
run or via push_supabase.
"""
from __future__ import annotations

import csv
import json
import math
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "dashboard" / "team_rankings_snapshot.json"

DEFAULT_FILTER = {
    "hand": "both",
    "location": "all",
    "pitcher": "both",
    "batSide": "both",
    "segment": "full",
    "window": "YTD",
}

FAMILY_SORT = {
    "surface": "winPct",
    "scoring": "osi",
    "difficulty": "abq",
    "status": "projOSI",
}

FAMILY_KEYS = {
    "surface": ["winPct", "f5WinPct", "pitcherWinPct"],
    "scoring": ["osi", "wrc", "woba", "rcv"],
    "difficulty": ["abq", "obr", "qs", "pitchInn", "pitchScore"],
    "status": ["projOSI", "ppGap", "pals", "xwoba", "xfip"],
}


def team_key(raw: str | None) -> str | None:
    if raw is None:
        return None
    t = str(raw).strip().upper()
    return t or None


def num(v) -> float | None:
    if v is None:
        return None
    s = str(v).strip()
    if not s or s.lower() in {"nan", "none", "--"}:
        return None
    try:
        n = float(s)
        if math.isnan(n):
            return None
        return n
    except ValueError:
        return None


def pct_from_results(raw) -> float | None:
    v = num(raw)
    if v is None:
        return None
    if 0 <= v <= 1:
        return round(v * 1000) / 10
    return round(v * 10) / 10


def round_val(v: float | None, digits: int = 1) -> float | None:
    if v is None:
        return None
    return round(v * (10**digits)) / (10**digits)


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def score_row(row: dict) -> dict | None:
    t = team_key(row.get("Tm") or row.get("Team"))
    if not t:
        return None
    abq = num(row.get("ABQ"))
    rcv = num(row.get("RCV"))
    obr = num(row.get("OBR"))
    osi = num(row.get("OSI"))
    if abq is None or rcv is None or obr is None or osi is None:
        return None
    proj = num(row.get("projOSI"))
    if proj is None:
        proj = osi
    woba = num(row.get("wOBA"))
    xwoba = num(row.get("xwOBA"))
    if xwoba is None and woba is not None:
        xwoba = woba
    pp_gap = num(row.get("PP-Gap"))
    if pp_gap is None and abq is not None and rcv is not None:
        pp_gap = abq - rcv
    return {
        "t": t,
        "abq": abq,
        "rcv": rcv,
        "obr": obr,
        "osi": osi,
        "projOSI": proj,
        "ppGap": pp_gap,
        "wrc": num(row.get("wRC+")),
        "woba": woba,
        "xwoba": xwoba,
        "slg": num(row.get("SLG")),
        "obp": num(row.get("OBP")),
        "ops": num(row.get("OPS")),
        "avg": num(row.get("AVG")),
        "bb": num(row.get("BB%")),
    }


def blend_rows(rhp: dict[str, dict], lhp: dict[str, dict]) -> list[dict]:
    teams = sorted(set(rhp) | set(lhp))
    out: list[dict] = []
    numeric = [
        "abq", "rcv", "obr", "osi", "projOSI", "ppGap", "wrc", "woba", "xwoba",
        "slg", "obp", "ops", "avg", "bb",
    ]

    def blend_val(k: str, r: dict | None, l: dict | None):
        rv = r.get(k) if r else None
        lv = l.get(k) if l else None
        if rv is None and lv is None:
            return None
        if rv is None:
            return lv
        if lv is None:
            return rv
        return 0.5 * rv + 0.5 * lv

    for t in teams:
        r, l = rhp.get(t), lhp.get(t)
        if r and not l:
            out.append(dict(r))
            continue
        if l and not r:
            out.append(dict(l))
            continue
        row = {"t": t}
        for k in numeric:
            row[k] = blend_val(k, r, l)
        if row.get("ppGap") is None and row.get("abq") is not None and row.get("rcv") is not None:
            row["ppGap"] = row["abq"] - row["rcv"]
        out.append(row)
    return out


def profiles_map(rows: list[dict]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for row in rows:
        t = team_key(row.get("team") or row.get("Tm"))
        if not t:
            continue
        out[t] = {
            "avg_pitching_score": num(row.get("avg_pitching_score")),
            "avg_ip_per_start": num(row.get("avg_ip_per_start")),
            "pals": num(row.get("pals")),
        }
    return out


def pals_map(rows: list[dict]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for row in rows:
        t = team_key(row.get("Tm") or row.get("Team"))
        if not t:
            continue
        out[t] = {
            "pals": num(row.get("PALS")),
            "xfip": num(row.get("avg_xFIP_faced")),
        }
    return out


def results_map(rows: list[dict]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for row in rows:
        t = team_key(row.get("team") or row.get("Tm"))
        if not t:
            continue
        rec: dict[str, float | None] = {}
        for k, v in row.items():
            if k.lower() == "team":
                continue
            rec[k.strip().lower()] = num(v)
        out[t] = rec
    return out


def enrich_row(base: dict, prof: dict, pals: dict, results: dict) -> dict:
    d = dict(base)
    t = d["t"]
    p = prof.get(t, {})
    pal = pals.get(t, {})
    r = results.get(t, {})

    if d.get("pals") is None and pal.get("pals") is not None:
        d["pals"] = pal["pals"]
    if d.get("xfip") is None and pal.get("xfip") is not None:
        d["xfip"] = pal["xfip"]

    d["pitchScore"] = p.get("avg_pitching_score")
    ip = p.get("avg_ip_per_start")
    ip_per_start = None
    if ip is not None:
        ip_per_start = ip * 9 if 0 < ip < 1.5 else ip

    pitch_inn = r.get("pitch_inn")
    d["pitchInn"] = pitch_inn if pitch_inn is not None else (
        (92 / ip_per_start) if ip_per_start and ip_per_start > 0 else None
    )

    qs = r.get("qs_against_pct")
    if qs is not None:
        d["qs"] = pct_from_results(qs)
    elif ip_per_start is not None:
        d["qs"] = max(0.0, min(100.0, ((ip_per_start - 4.0) / 2.5) * 100))

    d["winPct"] = pct_from_results(r.get("win_pct"))
    d["f5WinPct"] = pct_from_results(r.get("f5_win_pct"))
    d["pitcherWinPct"] = pct_from_results(r.get("sp_win_pct"))

    return d


def slim_row(row: dict, keys: list[str]) -> dict:
    out = {"t": row["t"]}
    for k in keys:
        v = row.get(k)
        if v is not None:
            out[k] = v
    return out


def sort_rows(rows: list[dict], sort_key: str) -> list[dict]:
    def sort_val(r: dict):
        v = r.get(sort_key)
        if v is None:
            return (1, r["t"])
        return (0, -v if isinstance(v, (int, float)) else 0, r["t"])

    return sorted(rows, key=sort_val)


def build_snapshot() -> dict:
    rhp_rows = {r["t"]: r for r in (score_row(x) for x in read_csv(DATA / "metrics_vs_RHP.csv")) if r}
    lhp_rows = {r["t"]: r for r in (score_row(x) for x in read_csv(DATA / "metrics_vs_LHP.csv")) if r}
    blended = blend_rows(rhp_rows, lhp_rows)

    prof = profiles_map(read_csv(DATA / "team_profiles.csv"))
    pals = pals_map(read_csv(DATA / "metrics_pals.csv"))
    results = results_map(read_csv(DATA / "team_results.csv"))

    full_rows = [enrich_row(r, prof, pals, results) for r in blended]
    families = {}
    for fam, sort_key in FAMILY_SORT.items():
        keys = FAMILY_KEYS[fam]
        slim = [slim_row(r, keys) for r in full_rows]
        families[fam] = {
            "sortKey": sort_key,
            "sortDir": "desc",
            "rows": sort_rows(slim, sort_key),
        }

    return {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "filter": DEFAULT_FILTER,
        "defaultFamily": "surface",
        "families": families,
        "teamCount": len(full_rows),
    }


def main() -> int:
    snap = build_snapshot()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(snap, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT} ({snap['teamCount']} teams, {len(snap['families'])} families)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
