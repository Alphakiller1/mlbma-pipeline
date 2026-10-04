"""CFB injury reports for the matchup desk.

ESPN's college injury feed is effectively dead (three entries, dated 2020-2022)
and CFBD publishes none, so two public reports are read:

* Covers (covers.com/sport/football/ncaaf/injuries) - every FBS school, each
  player's status (Out / Questionable / Probable / IR), the reason and the
  date it was last updated. Names are initial + surname ("J. Dawson").
* RotoWire's injury table JSON - full names, a return estimate, but only the
  schools with a game in its current window.

A RotoWire row upgrades the Covers row for the same school and player
(initial + surname). Either source failing leaves the other; both failing
returns {} and the desk says the report is not published - nothing is guessed.
"""

from __future__ import annotations

import html
import json
import re
import urllib.request

COVERS_URL = "https://www.covers.com/sport/football/ncaaf/injuries"
ROTOWIRE_URL = "https://www.rotowire.com/cfootball/tables/injury-report.php?team=ALL&pos=ALL"
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/126 Safari/537.36"),
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
}
# Out first, then the doubtful end of the scale.
STATUS_ORDER = {"Out": 0, "IR": 0, "Doubtful": 1, "Questionable": 2, "Probable": 3}


def _norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def _fetch(url: str) -> str:
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=45) as r:
        return r.read().decode("utf-8", "replace")


def _clean(text: str) -> str:
    return " ".join(html.unescape(re.sub(r"<.*?>", " ", text or "")).split())


def parse_covers(page: str) -> dict[str, list[dict]]:
    """{normalized school: [entry, ...]} from the Covers page."""
    out: dict[str, list[dict]] = {}
    parts = re.split(r'<a id="([^"]+)"></a>\s*<section>', page)
    for i in range(1, len(parts), 2):
        school, body = parts[i], parts[i + 1]
        rows = re.findall(
            r"<span class='player-link'>(.*?)</span>\s*</td>\s*<td>(.*?)</td>\s*"
            r"<td><b>(.*?)</b><br>\((.*?)\)</td>(.*?)(?=<span class='player-link'>|</tbody>)",
            body, re.S)
        entries = []
        for name, pos, status, updated, rest in rows:
            label = _clean(status)
            state, _, reason = label.partition(" - ")
            note = re.search(r"covers-CoversMatchups-injuryCopy\">(.*?)</div>", rest, re.S)
            entries.append({
                "player": _clean(name), "position": _clean(pos), "status": state.strip(),
                "injury": reason.strip() or None, "updated": _clean(updated),
                "detail": _clean(note.group(1)) if note else None, "source": "Covers",
            })
        out[_norm(school)] = entries
    return out


def parse_rotowire(text: str) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    try:
        rows = json.loads(text)
    except ValueError:
        return out
    for row in rows if isinstance(rows, list) else []:
        school = row.get("RotoSchoolName") or row.get("team")
        if not school or not row.get("player"):
            continue
        out.setdefault(_norm(school), []).append({
            "player": row.get("player"), "position": row.get("position"),
            "status": str(row.get("IR") or "").strip() or None,
            "injury": row.get("injury_type") or None,
            "return": row.get("ReturnDate") or None,
            "updated": row.get("date") or None, "source": "RotoWire",
        })
    return out


def _key(name: str) -> str:
    """'Jalen Dawson' and 'J. Dawson' -> 'jdawson'."""
    parts = re.sub(r"[^A-Za-z .'-]", "", str(name or "")).replace(".", " ").split()
    parts = [p for p in parts if p.lower() not in ("jr", "sr", "ii", "iii", "iv")]
    if not parts:
        return ""
    return (parts[0][:1] + parts[-1]).lower().replace("'", "").replace("-", "")


def merge(covers: dict[str, list[dict]], roto: dict[str, list[dict]]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for school in set(covers) | set(roto):
        rows = {(_key(e["player"])): dict(e) for e in covers.get(school, [])}
        for e in roto.get(school, []):
            k = _key(e["player"])
            base = rows.get(k, {})
            merged = {**base, **{key: v for key, v in e.items() if v}}
            merged["source"] = "RotoWire + Covers" if base else "RotoWire"
            rows[k] = merged
        entries = [e for e in rows.values() if e.get("status")]
        entries.sort(key=lambda e: (STATUS_ORDER.get(e["status"], 4), e.get("position") or "",
                                    e.get("player") or ""))
        out[school] = entries
    return out


def load() -> dict[str, list[dict]]:
    """{normalized school: [injury, ...]} - empty when both reports fail."""
    covers = roto = {}
    try:
        covers = parse_covers(_fetch(COVERS_URL))
    except Exception as exc:
        print(f"  injuries: Covers unavailable: {exc}")
    try:
        roto = parse_rotowire(_fetch(ROTOWIRE_URL))
    except Exception as exc:
        print(f"  injuries: RotoWire unavailable: {exc}")
    merged = merge(covers, roto)
    print(f"  injuries: {sum(len(v) for v in merged.values())} players across "
          f"{sum(1 for v in merged.values() if v)} schools "
          f"(Covers {len(covers)}, RotoWire {len(roto)})")
    return merged
