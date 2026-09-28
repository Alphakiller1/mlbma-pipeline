#!/usr/bin/env python3
"""Publish the league pools behind the deeper MLB matchup sections.

batter_pitch_types.json
    Every hitter's line against every pitch type he has seen (xwOBA, whiff rate,
    hard-hit rate), each with its percentile among hitters who have seen that
    same pitch type at least MIN_PA times. It is read by the Lineup Versus
    Pitch Mix section. A slider is compared with sliders, because a .300 xwOBA
    against sliders and a .300 against four-seamers are not the same result.
    Percentiles face the HITTER: 90 is a line better than 90% of the pool,
    whiff rate included (a low whiff rate places high).

bullpen_board.json
    Sorted league pools, with no per-player lines. The page already reads each
    active reliever's line live from the Stats API; these are what it grades
    those lines against:
      relievers   every qualified reliever, per split, per rate
      units       the thirty pens as rostered now, per split, per rate
      pen_pitches the thirty pens' run value per 100, per pitch type
    and the FIP constant for the season, so a FIP the page computes from a
    reliever's counting stats sits on the same scale as the league's.

Descriptive only. Neither file forecasts anything, and pitch-type-specific
hitting has been measured not to persist between windows (mlb-model,
2026-09-03). The section presents it as a record of the season already played.
"""
from __future__ import annotations

import csv
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "data" / "public"

BATTER_SOURCE = "batter_pitch_types.csv"
RELIEVER_SOURCE = "reliever_splits.csv"
RUN_VALUE_SOURCE = "pitch_run_value.csv"

# A hitter joins a pitch type's pool at this many plate appearances ending on it.
# Below it his line is still published and still placed against the pool, so no
# row is left ungraded, but it does not move anyone else's percentile.
MIN_PA = 20
MIN_POOL = 15

# The same rotation-arm rule the page and the slate publisher use
# (outputs/publish_public_slate.is_rotation_arm).
ROTATION_MIN_STARTS = 5
ROTATION_START_SHARE = 0.4
# A reliever joins the individual pool at 10 appearances (the rp_* baselines'
# floor) and a split pool at 20 batters faced in that split.
MIN_GAMES = 10
MIN_SPLIT_BF = 20
MIN_PEN_PITCHES = 100

# FIP is on every split because it is built from counts every split carries;
# ERA only where the Stats API publishes earned runs.
SPLIT_METRICS = {
    "season": ("era", "fip", "whip", "k_pct", "bb_pct", "hr9", "ops"),
    "h": ("era", "fip", "whip", "k_pct", "bb_pct", "hr9", "ops"),
    "a": ("era", "fip", "whip", "k_pct", "bb_pct", "hr9", "ops"),
    "vl": ("fip", "whip", "k_pct", "bb_pct", "hr9", "ops"),
    "vr": ("fip", "whip", "k_pct", "bb_pct", "hr9", "ops"),
    "lc": ("fip", "whip", "k_pct", "bb_pct", "hr9", "ops"),
    "risp": ("fip", "whip", "k_pct", "bb_pct", "hr9", "ops"),
}
# The page's own pitch families (dashboard/public_game_detail.js PITCH_FAMILY).
PITCH_FAMILY = {
    "FF": "heat", "FA": "heat", "FT": "heat", "SI": "heat", "FC": "heat",
    "SL": "break", "ST": "break", "CU": "break", "KC": "break", "SV": "break",
    "SC": "break", "CS": "break",
    "CH": "offspeed", "FS": "offspeed", "FO": "offspeed", "EP": "offspeed",
}
COUNTS = ("outs", "bf", "ab", "h", "bb", "hbp", "so", "hr", "tb", "sf", "er")
# The Stats API publishes earned runs on the season line and the home / road
# splits only; the hand and situation splits have no ERA to grade.
ERA_SPLITS = ("season", "h", "a")


def num(value):
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def read(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def percentile(pool: list[float], value: float, higher_is_better: bool):
    if len(pool) < MIN_POOL:
        return None
    if higher_is_better:
        beaten = sum(1 for other in pool if other < value)
    else:
        beaten = sum(1 for other in pool if other > value)
    return round(100.0 * beaten / len(pool), 1)


# ---------------------------------------------------------------- batters

BATTER_METRICS = {
    # published key -> higher is better for the hitter
    "xwoba": True,
    "whiff_percent": False,
    "hard_hit_percent": True,
}


def batter_pitch_types(data_dir: Path) -> dict:
    rows = read(data_dir / BATTER_SOURCE)
    pools: dict[tuple[str, str], list[float]] = defaultdict(list)
    for row in rows:
        if (num(row.get("pa")) or 0) < MIN_PA:
            continue
        code = str(row.get("pitch_type") or "").upper()
        for key in BATTER_METRICS:
            value = num(row.get(key))
            if value is not None:
                pools[(code, key)].append(value)

    hitters: dict[str, dict] = {}
    for row in rows:
        pid = str(row.get("player_id") or "").strip()
        code = str(row.get("pitch_type") or "").upper()
        if not pid or not code:
            continue
        entry = {
            "name": row.get("pitch_name") or code,
            "pa": int(num(row.get("pa")) or 0),
            "pitches": int(num(row.get("pitches")) or 0),
        }
        for key, higher in BATTER_METRICS.items():
            value = num(row.get(key))
            if value is None:
                continue
            entry[key] = {"value": round(value, 3 if key == "xwoba" else 1),
                          "percentile": percentile(pools[(code, key)], value, higher)}
        name = str(row.get("player_name") or "")
        if ", " in name:
            last, first = name.split(", ", 1)
            name = f"{first} {last}"
        hitter = hitters.setdefault(pid, {"name": name, "team": row.get("team") or "",
                                          "pitches": {}})
        hitter["pitches"][code] = entry
    return hitters


# ---------------------------------------------------------------- bullpens

def rates(total: dict, split: str, fip_constant: float | None) -> dict:
    outs, bf, ab = total["outs"], total["bf"], total["ab"]
    out = {}
    if outs:
        out["whip"] = (total["h"] + total["bb"]) * 3 / outs
        out["hr9"] = total["hr"] * 27 / outs
    if bf:
        out["k_pct"] = total["so"] / bf * 100
        out["bb_pct"] = total["bb"] / bf * 100
    obp_den = ab + total["bb"] + total["hbp"] + total["sf"]
    if obp_den and ab:
        out["ops"] = ((total["h"] + total["bb"] + total["hbp"]) / obp_den
                      + total["tb"] / ab)
    if split in ERA_SPLITS and outs:
        out["era"] = total["er"] * 27 / outs
    if outs:
        if fip_constant is not None:
            out["fip"] = ((13 * total["hr"] + 3 * (total["bb"] + total["hbp"])
                           - 2 * total["so"]) / (outs / 3) + fip_constant)
    return out


def counts(row: dict) -> dict:
    return {key: num(row.get(key)) or 0.0 for key in COUNTS}


def is_rotation_arm(row: dict) -> bool:
    starts = num(row.get("games_started")) or 0
    games = num(row.get("games")) or 0
    return starts >= ROTATION_MIN_STARTS and games > 0 and starts / games >= ROTATION_START_SHARE


def bullpen_board(data_dir: Path) -> dict | None:
    rows = read(data_dir / RELIEVER_SOURCE)
    if not rows:
        return None
    by_split: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_split[row["split"]].append(row)
    season = {row["player_id"]: row for row in by_split.get("season", [])}
    if len(season) < 400:
        return None

    # FIP constant: league ERA minus league raw FIP, over every pitcher.
    league = defaultdict(float)
    for row in season.values():
        for key, value in counts(row).items():
            league[key] += value
    fip_constant = None
    if league["outs"]:
        ip = league["outs"] / 3
        fip_constant = (league["er"] * 9 / ip
                        - (13 * league["hr"] + 3 * (league["bb"] + league["hbp"])
                           - 2 * league["so"]) / ip)

    relief = {pid for pid, row in season.items() if not is_rotation_arm(row)}
    qualified = {pid for pid in relief if (num(season[pid].get("games")) or 0) >= MIN_GAMES}

    relievers: dict[str, dict] = {}
    units: dict[str, dict] = {}
    for split, metrics in SPLIT_METRICS.items():
        pool = defaultdict(list)
        team_totals: dict[str, dict] = defaultdict(lambda: defaultdict(float))
        for row in by_split.get(split, []):
            pid = row["player_id"]
            if pid not in relief:
                continue
            total = counts(row)
            for key, value in total.items():
                team_totals[row["team_id"]][key] += value
            if pid not in qualified or (split != "season" and total["bf"] < MIN_SPLIT_BF):
                continue
            for key, value in rates(total, split, fip_constant).items():
                pool[key].append(value)
        relievers[split] = {key: sorted(round(v, 3) for v in pool[key]) for key in metrics}
        unit_pool = defaultdict(list)
        for total in team_totals.values():
            for key, value in rates(total, split, fip_constant).items():
                unit_pool[key].append(value)
        units[split] = {key: sorted(round(v, 3) for v in unit_pool[key]) for key in metrics}

    if len(units["season"].get("era") or []) < 30:
        return None

    # Run value per 100 for each pen as rostered now, per pitch type, from the
    # same Savant pitcher board the arsenal panel reads.
    pen_pitches: dict[str, list[float]] = {}
    pen_families: dict[str, list[float]] = {}
    rv_rows = read(data_dir / RUN_VALUE_SOURCE)
    if rv_rows:
        team_of = {pid: row["team_id"] for pid, row in season.items() if pid in relief}
        sums: dict[tuple[str, str], list[float]] = defaultdict(lambda: [0.0, 0.0])
        for row in rv_rows:
            pid = str(row.get("player_id") or "")
            code = str(row.get("pitch_type") or "").upper()
            rv, thrown = num(row.get("run_value")), num(row.get("pitches"))
            if pid not in team_of or not code or rv is None or not thrown:
                continue
            cell = sums[(team_of[pid], code)]
            cell[0] += rv
            cell[1] += thrown
        grouped: dict[str, list[float]] = defaultdict(list)
        families: dict[str, list[float]] = defaultdict(list)
        for (_, code), (rv, thrown) in sums.items():
            if thrown >= MIN_PEN_PITCHES:
                grouped[code].append(round(rv / thrown * 100, 2))
                if code in PITCH_FAMILY:
                    families[PITCH_FAMILY[code]].append(round(rv / thrown * 100, 2))
        pen_pitches = {code: sorted(values) for code, values in grouped.items()
                       if len(values) >= MIN_POOL}
        # A forkball or a slurve is thrown by too few pens to rank on its own,
        # so it is placed among every pen pitch of its family instead.
        pen_families = {name: sorted(values) for name, values in families.items()
                        if len(values) >= MIN_POOL}

    return {
        "fip_constant": round(fip_constant, 3) if fip_constant is not None else None,
        "relievers": relievers,
        "units": units,
        "pen_pitches": pen_pitches,
        "pen_families": pen_families,
    }


# ---------------------------------------------------------------- team indices

TEAM_PROFILE_SOURCE = "team_profiles.csv"
TEAM_ALIAS = {"ARI": "AZ", "ARZ": "AZ", "CHW": "CWS", "KCR": "KC", "SDP": "SD",
              "SFG": "SF", "TBR": "TB", "TBD": "TB", "WSN": "WSH", "WAS": "WSH", "OAK": "ATH"}
INDICES = ("osi", "abq", "rcv", "obr")
# published split -> (team_profiles column per index, the CSV that split is built from)
INDEX_SPLITS = {
    "vs_rhp": ({i: f"{i}_vs_rhp" for i in INDICES}, "metrics_vs_RHP.csv"),
    "vs_lhp": ({i: f"{i}_vs_lhp" for i in INDICES}, "metrics_vs_LHP.csv"),
    "home": ({i: f"home_{i}" for i in INDICES}, "batter_splits_home.csv"),
    "away": ({i: f"away_{i}" for i in INDICES}, "batter_splits_away.csv"),
    "l30": ({i: f"{i}_l30" for i in INDICES}, "batter_splits_recent.csv"),
    "l14": ({i: f"{i}_l14" for i in INDICES}, "batter_splits_l14.csv"),
    "l7": ({i: f"{i}_l7" for i in INDICES}, "batter_splits_l7.csv"),
}
# A split is published only when the file it is built from is this fresh. The
# FanGraphs split scrapes run on the owner's machine, not in CI, and a window
# scraped weeks ago must never be shown as the last fourteen days.
MAX_SOURCE_AGE_DAYS = 3


def team_index_splits(data_dir: Path) -> tuple[dict, dict]:
    import time
    rows = read(data_dir / TEAM_PROFILE_SOURCE)
    if len(rows) < 30:
        return {}, {}
    now = time.time()
    fresh: dict[str, str] = {}
    for split, (_, source) in INDEX_SPLITS.items():
        path = data_dir / source
        if path.is_file() and now - path.stat().st_mtime <= MAX_SOURCE_AGE_DAYS * 86400:
            fresh[split] = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc) \
                .strftime("%Y-%m-%dT%H:%M:%SZ")
    teams: dict[str, dict] = {}
    for split in fresh:
        columns = INDEX_SPLITS[split][0]
        for index, column in columns.items():
            values = [(TEAM_ALIAS.get(r["team"].upper(), r["team"].upper()), num(r.get(column)))
                      for r in rows]
            values = [(team, v) for team, v in values if v is not None]
            if len(values) < 30:
                continue
            ordered = sorted(values, key=lambda item: -item[1])
            for place, (team, value) in enumerate(ordered, start=1):
                teams.setdefault(team, {}).setdefault(split, {})[index] = {
                    "value": round(value, 1), "rank": place, "of": len(ordered)}
    return teams, fresh


def write(name: str, payload: dict) -> None:
    dest = PUBLIC / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    # Compact: the batter file is read on every MLB matchup page.
    dest.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")


def main(argv: list[str]) -> int:
    data_dir = Path(argv[1]) if len(argv) > 1 else ROOT / "data"
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    written = 0

    hitters = batter_pitch_types(data_dir)
    if len(hitters) >= 300:
        write("batter_pitch_types.json", {
            "schema": "chase-public-batter-pitch/1",
            "sport": "mlb",
            "generated_at_utc": now,
            "minimum_pa": MIN_PA,
            "hitters": hitters,
        })
        print(f"  wrote data/public/batter_pitch_types.json ({len(hitters)} hitters)")
        written += 1
    else:
        print(f"  skip batter pitch types: {len(hitters)} hitters under {data_dir}")

    board = bullpen_board(data_dir)
    if board:
        write("bullpen_board.json", {
            "schema": "chase-public-bullpen/1",
            "sport": "mlb",
            "generated_at_utc": now,
            "minimum_games": MIN_GAMES,
            "minimum_split_bf": MIN_SPLIT_BF,
            **board,
        })
        print(f"  wrote data/public/bullpen_board.json "
              f"({len(board['relievers']['season']['era'])} relievers, "
              f"{len(board['units']['season']['era'])} pens, "
              f"{len(board['pen_pitches'])} pen pitch types)")
        written += 1
    else:
        print(f"  skip bullpen board: no usable {RELIEVER_SOURCE} under {data_dir}")

    teams, fresh = team_index_splits(data_dir)
    if teams:
        write("team_index_splits.json", {
            "schema": "chase-public-team-index-splits/1",
            "sport": "mlb",
            "generated_at_utc": now,
            "sources_as_of": fresh,
            "teams": teams,
        })
        print(f"  wrote data/public/team_index_splits.json ({len(teams)} clubs; "
              f"splits {', '.join(sorted(fresh))})")
    else:
        print(f"  skip team index splits: no fresh {TEAM_PROFILE_SOURCE} under {data_dir}")

    return 0 if written == 2 else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
