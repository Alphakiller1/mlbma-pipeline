"""Free SportsDataverse NCAA possessions/boxes, with explicit ESPN identity.

Personnel packages use the five observed players' listed roster positions.
They do not label geometric sets or man/zone coverage. Unknown/ambiguous
roster joins remain unknown and are excluded from classified denominators.
"""

from __future__ import annotations

import csv
import gzip
import hashlib
import math
import re
from collections import defaultdict
from datetime import datetime, time, timezone
from zoneinfo import ZoneInfo

import requests

from .data import ROOT, read, write

DATA = ROOT / "data/tactics/sdv"
ET = ZoneInfo("America/New_York")
FAMILIES = ("possessions", "team_box", "team_rosters")


def number(v):
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (ValueError, TypeError):
        return None


def identifier(v):
    n = number(v)
    return str(int(n)) if n is not None and n > 0 and int(n) == n else None


def normal(v):
    return re.sub(r"[^a-z0-9]", "", str(v).lower())


def refresh(year, force=False):
    result = {}
    for family in FAMILIES:
        root = DATA / str(year)
        receipt = root / (family + ".receipt.json")
        old = read(receipt) if receipt.exists() else {}
        now = datetime.now(timezone.utc)
        if (
            old
            and not force
            and (now - datetime.fromisoformat(old["retrieved_at_utc"])).total_seconds()
            < 6 * 3600
        ):
            result[family] = old["rows"]
            continue
        url = f"https://github.com/sportsdataverse/sportsdataverse-data/releases/download/ncaa_mbb_{family}/ncaa_mbb_{family}_{year}.csv.gz"
        response = requests.get(url, timeout=120)
        response.raise_for_status()
        raw = response.content
        import io

        records = csv.DictReader(
            io.TextIOWrapper(
                gzip.GzipFile(fileobj=io.BytesIO(raw)), encoding="utf-8-sig"
            )
        )
        count = 0
        for row in records:
            if identifier(row.get("season")) != str(year):
                raise ValueError("NCAA source season mismatch")
            count += 1
        if count == 0 or count < 0.9 * old.get("rows", 0):
            raise ValueError("NCAA source coverage regressed")
        root.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha256(raw).hexdigest()
        path = root / (family + "-" + digest[:16] + ".csv.gz")
        temp = path.with_suffix(".tmp")
        temp.write_bytes(raw)
        temp.replace(path)
        write(
            receipt,
            {
                "source_url": url,
                "retrieved_at_utc": now.isoformat(),
                "season": year,
                "rows": count,
                "sha256": digest,
                "file": path.name,
            },
        )
        result[family] = count
    return result


def iter_rows(year, family):
    root = DATA / str(year)
    receipt_path = root / (family + ".receipt.json")
    if not receipt_path.exists():
        return
    receipt = read(receipt_path)
    path = root / receipt.get("file", family + ".csv.gz")
    if not path.exists():
        raise ValueError("NCAA receipt references a missing source file")
    if hashlib.sha256(path.read_bytes()).hexdigest() != receipt["sha256"]:
        raise ValueError("NCAA source checksum mismatch")
    with gzip.open(path, "rt", encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            if identifier(row.get("season")) != str(year):
                raise ValueError("Mixed NCAA seasons")
            yield row


def role(position):
    p = str(position).upper()
    return "C" if "C" in p else "G" if "G" in p else "F" if "F" in p else None


def roster(year):
    by_id, names = {}, defaultdict(dict)
    for index, row in enumerate(iter_rows(year, "team_rosters")):
        team, pid = identifier(row["team_id"]), identifier(row["player_id"])
        r = role(row["position"])
        if not team or not r:
            continue
        if pid:
            by_id[(team, pid)] = r
        for name in (row["player"], row.get("clean_name"), row.get("name")):
            key = (team, normal(name))
            if not key[1]:
                continue
            names[key][pid or str(index)] = r
    return by_id, {
        key: next(iter(players.values())) if len(players) == 1 else None
        for key, players in names.items()
    }


def package(row, side, lookup):
    team = identifier(row.get(side + "_ncaa_team_id"))
    names = [normal(row.get(f"{side}_{i}")) for i in range(1, 6)]
    if len(set(names)) != 5 or not all(names):
        return None
    ids = [identifier(row.get(f"{side}_{i}_player_id")) for i in range(1, 6)]
    known = [pid for pid in ids if pid]
    if len(set(known)) != len(known):
        return None
    roles = []
    for i in range(1, 6):
        value = lookup[0].get((team, identifier(row.get(f"{side}_{i}_player_id"))))
        if value is None:
            value = lookup[1].get((team, names[i - 1]))
        if value is None:
            return None
        roles.append(value)
    return "-".join(str(roles.count(k)) + k for k in ("G", "F", "C"))


def game_date(value):
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            pass
    raise ValueError("Unrecognized NCAA game date")


def normalize(year, cohort):
    lookup = roster(year)
    prior_map = {
        identifier(r["team_ncaa_team_id"]): identifier(r["team_espn_team_id"])
        for r in iter_rows(year - 1, "team_box")
    }
    prior_people = defaultdict(set)
    for r in iter_rows(year - 1, "team_rosters"):
        mapped = prior_map.get(identifier(r["team_id"]))
        if mapped:
            prior_people[mapped].add(normal(r["player"]))
    info = {}
    samples = defaultdict(
        lambda: {
            "possessions": 0,
            "points": 0,
            "transition_possessions": 0,
            "transition_points": 0,
            "half_court_possessions": 0,
            "half_court_points": 0,
            "known_exposure": 0,
            "returning_exposure": 0,
        }
    )
    formations = defaultdict(lambda: {"possessions": 0, "points": 0})
    seen = set()
    excluded = defaultdict(int)
    for row in iter_rows(year, "possessions"):
        cid = row["contest_id"]
        h = identifier(row.get("home_espn_team_id"))
        a = identifier(row.get("away_espn_team_id"))
        if h not in cohort or a not in cohort:
            excluded["outside_or_unmapped_cohort"] += 1
            continue
        off = identifier(row.get("poss_team_espn_team_id"))
        if off not in (a, h):
            excluded["unknown_offense"] += 1
            continue
        side = "home" if off == h else "away"
        other = "away" if side == "home" else "home"
        opponent = a if off == h else h
        day = game_date(row["game_date"])
        period = int(row["period"])
        points = number(row["pts"])
        if points is None or not 0 <= points <= 12:
            raise ValueError("Invalid NCAA possession points")
        identity = (cid, period, row["poss_num"], off)
        if identity in seen:
            excluded["duplicate_possession"] += 1
            continue
        seen.add(identity)
        entry = {"home": h, "away": a, "day": day.isoformat(), "max_period": period}
        if cid in info:
            if any(info[cid][k] != entry[k] for k in ("home", "away", "day")):
                raise ValueError("Conflicting NCAA game identity")
            info[cid]["max_period"] = max(info[cid]["max_period"], period)
        else:
            info[cid] = entry
        s = samples[(cid, off)]
        s["possessions"] += 1
        s["points"] += points
        if prior_people.get(off):
            names = [normal(row.get(f"{side}_{i}")) for i in range(1, 6)]
            if len(set(names)) == 5 and all(names):
                s["known_exposure"] += 5
                s["returning_exposure"] += sum(
                    name in prior_people[off] for name in names
                )
        if row["is_transition"] in ("0", "1"):
            key = "transition" if row["is_transition"] == "1" else "half_court"
            s[key + "_possessions"] += 1
            s[key + "_points"] += points
        own, op = package(row, side, lookup), package(row, other, lookup)
        if own and op:
            key = (cid, off, opponent, own, op)
            f = formations[key]
            f["possessions"] += 1
            f["points"] += points
        else:
            excluded["unknown_personnel_possessions"] += 1
    boxes = {}
    for row in iter_rows(year, "team_box"):
        team = identifier(row.get("team_espn_team_id"))
        cid = row["contest_id"]
        if cid not in info or team not in (info[cid]["home"], info[cid]["away"]):
            continue
        if (cid, team) in boxes:
            raise ValueError("Duplicate NCAA team box")
        boxes[(cid, team)] = row
    games = []
    valid = set()
    for cid, i in info.items():
        h, a = boxes.get((cid, i["home"])), boxes.get((cid, i["away"]))
        if not h or not a:
            excluded["incomplete_box_games"] += 1
            continue
        # Points must reconcile in both directions before possession efficiency
        # or personnel efficiency from this game enters a model.
        if any(
            samples[(cid, t)]["points"] != number(b["pts"])
            for t, b in ((i["home"], h), (i["away"], a))
        ):
            excluded["score_reconciliation_games"] += 1
            continue
        rawpos = [number(h["o_poss"]), number(a["o_poss"])]
        if any(p is None or p <= 0 for p in rawpos):
            excluded["invalid_possessions_games"] += 1
            continue
        duration = 40 + 5 * max(0, i["max_period"] - 2)
        timestamp = datetime.combine(
            game_date(i["day"]), time(23, 59, 59), tzinfo=ET
        ).isoformat()
        pair = []
        for own, op in ((h, a), (a, h)):
            tid = identifier(own["team_espn_team_id"])
            opid = identifier(op["team_espn_team_id"])
            r = {
                "game_id": cid,
                "season": year,
                "date": timestamp,
                "available_at": timestamp,
                "team": tid,
                "opponent": opid,
                "home": tid == i["home"],
                "possessions": sum(rawpos) / 2,
                "duration_minutes": duration,
                "known_exposure": samples[(cid, tid)]["known_exposure"],
                "returning_exposure": samples[(cid, tid)]["returning_exposure"],
            }
            for prefix, box in (("", own), ("d_", op)):
                for source, target in [
                    ("pts", "pts"),
                    ("fgm", "fgm"),
                    ("fga", "fga"),
                    ("tpm", "tpm"),
                    ("tpa", "tpa"),
                    ("ftm", "ftm"),
                    ("fta", "fta"),
                    ("to", "tov"),
                    ("orb", "orb"),
                    ("drb", "drb"),
                ]:
                    r[prefix + target] = number(box[source])
            if any(v is None for v in r.values()):
                raise ValueError("Incomplete NCAA box inputs")
            if any(
                not (
                    0 <= r[p + "tpm"] <= r[p + "tpa"] <= r[p + "fga"]
                    and r[p + "tpm"] <= r[p + "fgm"] <= r[p + "fga"]
                    and r[p + "fgm"] - r[p + "tpm"] <= r[p + "fga"] - r[p + "tpa"]
                    and r[p + "ftm"] <= r[p + "fta"]
                    and r[p + "pts"] == 2 * r[p + "fgm"] + r[p + "tpm"] + r[p + "ftm"]
                )
                for p in ("", "d_")
            ):
                excluded["invalid_box_games"] += 1
                pair = []
                break
            pair.append(r)
        if len(pair) == 2:
            games.extend(pair)
            valid.add(cid)
    packages = []
    for (cid, team, opponent, own, other), v in formations.items():
        if cid not in valid:
            continue
        packages.append(
            {
                "game_id": cid,
                "season": year,
                "date": info[cid]["day"],
                "team": team,
                "opponent": opponent,
                "own_personnel": own,
                "opponent_personnel": other,
                **v,
            }
        )
    situations = []
    for (cid, team), v in samples.items():
        if cid in valid:
            situations.append(
                {
                    "game_id": cid,
                    "season": year,
                    "date": info[cid]["day"],
                    "team": team,
                    **v,
                }
            )
    report = {
        "season": year,
        "valid_games": len(valid),
        "team_game_rows": len(games),
        "formation_rows": len(packages),
        "classified_personnel_possessions": sum(r["possessions"] for r in packages),
        "valid_possessions": sum(r["possessions"] for r in situations),
        "excluded": dict(excluded),
        "source": "SportsDataverse NCAA possession detector, official NCAA boxes and rosters",
        "personnel_definition": "Listed roster G/F/C composition of five observed players; C, then G, then F for hybrids.",
        "geometric_set_policy": "Personnel packages do not establish horns, five-out, man/zone or press.",
    }
    return games, packages, situations, report
