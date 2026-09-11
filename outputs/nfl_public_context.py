"""Observed NFL team form and scheme profiles, published as public facts.

nfl-model/board.json is one artifact serving two masters: of its 27 game keys
only a handful are publishable, and inside the otherwise-observed ``teams[]``
object three of the thirteen form keys are model composites. Consuming the
board and hiding fields at render time is exactly the wrong shape, so this
module builds a separate public projection instead: every field named here is
carried across by name, and nothing else can arrive by accident.

Two rules the board makes easy to break:

* ``teams[].rank`` ranks ``teams[].rating``, a model power rating. Annotating a
  descriptive rate with it would publish the model's ordering under a factual
  label. Every rank here is recomputed from the descriptive rate itself.
* ``scheme_profiles[].confidence``, ``.staff_continuity`` and
  ``.carryover_weight`` are statements about how well last season will apply to
  this one - a forecast about the evidence. The publishable provenance is the
  source season and the sample count, which are facts.
"""
from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

# Where the board is read from. Both candidates are consulted and the newer
# one wins: the local checkout can sit several weeks behind the published
# board, and a stale copy silently drops whole sections (a schema/2 file
# carries no scheme_profiles at all).
BOARD_PATHS = (
    Path.home() / "nfl-model" / "docs" / "board.json",
)
BOARD_URL = "https://alphakiller1.github.io/nfl-model/board.json"

# Observed rates only. The three form indices are model composites and are not
# listed, so they cannot be carried across.
#
# Each entry is (key, better) where better says which end of the distribution
# earns rank 1. Sacks and turnovers invert between offence and defence: taking
# a sack is bad, generating one is good.
FORM_METRICS = (
    ("off_epa", "high"),
    ("off_first_down", "high"),
    ("off_explosive", "high"),
    ("off_sack", "low"),
    ("off_turnover", "low"),
    ("def_epa", "low"),
    ("def_first_down", "low"),
    ("def_explosive", "low"),
    ("def_sack", "high"),
    ("def_turnover", "high"),
)

# Title Case, because the desk is Title Case everywhere and a label written
# in sentence case here reaches the page as the one line that is not.
FORM_LABELS = {
    "off_epa": "Offensive EPA Per Play",
    "off_first_down": "Offensive First-Down Rate",
    "off_explosive": "Offensive Explosive-Play Rate",
    "off_sack": "Sack Rate Taken",
    "off_turnover": "Giveaway Rate",
    "def_epa": "EPA Allowed Per Play",
    "def_first_down": "First-Down Rate Allowed",
    "def_explosive": "Explosive Rate Allowed",
    "def_sack": "Sack Rate Generated",
    "def_turnover": "Takeaway Rate",
}

# Charted rates carried into the public artifact. Grouped the way the page
# reads them, so a section never has to guess which keys belong together.
SCHEME_GROUPS = {
    "coverage": (
        "man_rate", "zone_rate", "cover_0_rate", "cover_1_rate", "cover_2_rate",
        "cover_3_rate", "cover_4_rate", "cover_6_rate", "cover_2_man_rate",
    ),
    "pressure": ("blitz_rate", "pressure_rate", "stacked_box_rate", "avg_box"),
    "personnel": (
        "personnel_11_rate", "personnel_12_rate", "personnel_21_rate",
        "formation_shotgun_rate", "formation_under_center_rate",
        "motion_rate", "play_action_rate", "rpo_rate", "screen_rate",
        "no_huddle_rate", "neutral_pass_rate",
    ),
    "response": (
        "pass_epa", "rush_epa", "pass_success_rate", "rush_success_rate",
        "pass_epa_man", "pass_epa_zone", "pass_epa_blitz", "pass_epa_pressure",
        "pass_epa_play_action",
    ),
    "target_share": ("target_share_rb_all", "target_share_wr_all", "target_share_te_all"),
}

# Board team codes against the abbreviations the public schedule uses.
TEAM_ALIAS = {"LA": "LAR", "WAS": "WSH", "JAC": "JAX", "LVR": "LV", "SD": "LAC", "OAK": "LV"}


def canon(code: str) -> str:
    key = str(code or "").upper().strip()
    return TEAM_ALIAS.get(key, key)


def load_board() -> dict | None:
    candidates: list[dict] = []
    for path in BOARD_PATHS:
        try:
            if path.is_file():
                candidates.append(json.loads(path.read_text(encoding="utf-8")))
        except Exception:
            continue
    try:
        with urllib.request.urlopen(BOARD_URL, timeout=30) as response:
            candidates.append(json.loads(response.read().decode("utf-8")))
    except Exception:
        pass
    if not candidates:
        return None
    return max(candidates, key=lambda b: str(b.get("generated_at_utc") or ""))


def _ranked(rows: list[tuple[str, float]], better: str) -> dict[str, int]:
    """Rank a single descriptive rate against the league pool it came from."""
    ordered = sorted(rows, key=lambda pair: pair[1], reverse=(better == "high"))
    return {team: index + 1 for index, (team, _) in enumerate(ordered)}


def team_form(board: dict) -> dict[str, dict]:
    teams = board.get("teams") or []
    out: dict[str, dict] = {}
    for row in teams:
        team = canon(row.get("team"))
        form = row.get("form") or {}
        if not team or not form:
            continue
        out[team] = {
            "rates": {},
            "plays": form.get("plays"),
        }
    pool = len(out)
    for key, better in FORM_METRICS:
        rows = [
            (canon(row.get("team")), float((row.get("form") or {})[key]))
            for row in teams
            if (row.get("form") or {}).get(key) is not None
        ]
        if not rows:
            continue
        ranks = _ranked(rows, better)
        for team, value in rows:
            if team not in out:
                continue
            out[team]["rates"][key] = {
                "label": FORM_LABELS[key],
                "value": round(value, 4),
                "better": better,
                "rank": ranks[team],
                "of": len(rows),
            }
    for team in out:
        out[team]["pool"] = pool
    return out


def team_scheme(board: dict) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for row in board.get("scheme_profiles") or []:
        team = canon(row.get("team"))
        if not team:
            continue
        entry = {
            "source_seasons": row.get("source_seasons") or [],
            "charting_samples": row.get("charting_samples"),
            "coverage_samples": row.get("coverage_samples"),
            "offense_plays": row.get("offense_plays"),
            "defense_plays": row.get("defense_plays"),
        }
        for phase in ("offense", "defense"):
            source = row.get(phase) or {}
            grouped: dict[str, dict] = {}
            for group, keys in SCHEME_GROUPS.items():
                values = {k: source[k] for k in keys if source.get(k) is not None}
                if values:
                    grouped[group] = values
            entry[phase] = grouped
        out[team] = entry
    return out


# Identity fields only. The rest of a player_projections row is the model's
# output - metrics, persistence weights, an implied points total, a sportsbook
# line, an edge and an action - and none of it is carried across. The row is
# rebuilt key by key rather than copied and pruned, so a new model field cannot
# arrive here by default.
PLAYER_FIELDS = ("player_name", "position", "depth_rank", "headshot_url")

# The league serves these headshots as full-body cutouts - 4.8 MB of mostly
# transparent margin each, which is 40 MB of PNG for one matchup page and a
# face four pixels tall once it lands in a 56px circle. The host is Cloudinary,
# so asking for a face crop at display size costs one transformation segment
# and returns about 5 KB.
HEADSHOT_HOST = "https://static.www.nfl.com/image/upload/"
HEADSHOT_TRANSFORM = "f_auto,q_auto,w_160,h_160,c_fill,g_face"


def sized_headshot(url: str | None) -> str | None:
    if not url or not url.startswith(HEADSHOT_HOST):
        return url
    tail = url[len(HEADSHOT_HOST):]
    # Drop whatever transformation segment is already there; it is always the
    # first path element and always a comma-joined list of Cloudinary options.
    parts = tail.split("/")
    if parts and ("," in parts[0] or parts[0].startswith(("t_", "f_", "q_", "w_"))):
        parts = parts[1:]
    return HEADSHOT_HOST + HEADSHOT_TRANSFORM + "/" + "/".join(parts)

# One skill group each, in the order a reader scans them. A deeper list is
# roster trivia; this is the offence a viewer is looking for.
#
# Quarterback runs three deep on purpose. The card names whoever is actually
# taking the snap, which means walking down the chart past anyone ruled out -
# and it can only do that if the men below the starter were published.
DEPTH_LIMITS = {"QB": 3, "RB": 2, "WR": 3, "TE": 1}


def key_players(board: dict) -> dict[str, list[dict]]:
    """The named offence for each club: identity, position and depth only."""
    by_team: dict[str, list[dict]] = {}
    rows = board.get("player_projections") or []
    for row in rows:
        team = canon(row.get("team"))
        position = str(row.get("position") or "").upper()
        rank = row.get("depth_rank")
        if not team or position not in DEPTH_LIMITS:
            continue
        if rank is None or int(rank) > DEPTH_LIMITS[position]:
            continue
        by_team.setdefault(team, []).append({
            "name": row.get("player_name") or "",
            "position": position,
            "depth_rank": int(rank),
            "headshot_url": sized_headshot(row.get("headshot_url")) or None,
        })
    order = list(DEPTH_LIMITS)
    for team, players in by_team.items():
        players.sort(key=lambda pl: (order.index(pl["position"]), pl["depth_rank"]))
    return by_team


ESPN_DEPTH_CHART = (
    "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{team}/depthcharts"
)

TEAM_SLUGS = (
    "ari", "atl", "bal", "buf", "car", "chi", "cin", "cle", "dal", "den",
    "det", "gb", "hou", "ind", "jax", "kc", "lac", "lar", "lv", "mia",
    "min", "ne", "no", "nyg", "nyj", "phi", "pit", "sea", "sf", "tb",
    "ten", "wsh",
)


def sized_espn_headshot(url: str | None) -> str | None:
    """Request an ESPN-supplied portrait at card size without inventing one."""
    if not url or "/i/headshots/nfl/players/full/" not in url:
        return url
    path = url.split("espncdn.com", 1)[-1]
    return "https://a.espncdn.com/combiner/i?img=" + path + "&w=160&h=160"


DEFENSIVE_SLOTS = {
    "LDE", "DE", "RDE", "DT", "NT",
    "WLB", "OLB", "LILB", "ILB", "MLB", "RILB", "SLB", "LB",
    "LCB", "CB", "RCB", "NB", "SS", "S", "FS",
}


def position_group(position: str, phase: str) -> str:
    """A small, stable set of scan groups; the exact depth-chart slot remains."""
    pos = str(position or "").upper()
    if phase == "offense":
        if pos in {"QB", "RB", "FB"}:
            return "Backfield"
        if pos in {"WR", "TE"}:
            return "Receivers"
        return "Offensive Line"
    if pos in {"LDE", "DE", "RDE", "DT", "NT"}:
        return "Front"
    if pos in {"WLB", "OLB", "LILB", "ILB", "MLB", "RILB", "SLB", "LB"}:
        return "Linebackers"
    return "Secondary"


def parse_depth_chart(payload: dict) -> dict:
    """Project ESPN's ordered depth chart to identity-only starting units.

    The first athlete in each published position is the depth-chart starter.
    No player metric, role forecast, snap share or model output is carried.
    ESPN also lists package alternatives beside the named eleven (fullback in
    3WR/1TE and nickel back in a base defence). Those alternates are excluded
    so the public surface does not mislabel twelve names as eleven starters.
    """
    out: dict = {
        "source": "ESPN depth chart",
        "observed_at_utc": payload.get("timestamp"),
    }
    for chart in payload.get("depthchart") or []:
        positions = chart.get("positions") or {}
        abbreviations = {
            str((node.get("position") or {}).get("abbreviation") or key).upper()
            for key, node in positions.items()
        }
        phase = "offense" if "QB" in abbreviations else (
            "defense" if abbreviations & DEFENSIVE_SLOTS else ""
        )
        if not phase or phase in out:
            continue
        players = []
        for key, node in positions.items():
            athletes = node.get("athletes") or []
            if not athletes:
                continue
            athlete = athletes[0]
            name = athlete.get("displayName") or athlete.get("shortName")
            position = str(
                (node.get("position") or {}).get("abbreviation") or key
            ).upper()
            if not name:
                continue
            player = {
                "name": name,
                "position": position,
                "group": position_group(position, phase),
            }
            headshot = sized_espn_headshot(
                ((athlete.get("headshot") or {}).get("href")))
            if headshot:
                player["headshot_url"] = headshot
            players.append(player)
        package = chart.get("name") or (
            "Offense" if phase == "offense" else "Base Defense"
        )
        package_key = str(package).lower().replace(" ", "")
        if phase == "offense" and "3wr1te" in package_key:
            players = [player for player in players if player["position"] != "FB"]
        if phase == "defense" and package_key.startswith("base"):
            players = [player for player in players if player["position"] != "NB"]
        if players:
            out[phase] = {
                "package": package,
                "players": players,
            }
    return out


def _quarterbacks_from_depth(payload: dict) -> list[dict]:
    for chart in payload.get("depthchart") or []:
        for key, node in (chart.get("positions") or {}).items():
            position = str(
                (node.get("position") or {}).get("abbreviation") or key
            ).upper()
            if position != "QB":
                continue
            return [
                {
                    "name": athlete.get("displayName") or athlete.get("shortName") or "",
                    "position": "QB",
                    "headshot_url": sized_espn_headshot(
                        ((athlete.get("headshot") or {}).get("href"))),
                }
                for athlete in (node.get("athletes") or [])
                if athlete.get("displayName") or athlete.get("shortName")
            ]
    return []


def fetch_depth_chart_context() -> tuple[dict[str, dict], dict[str, list[dict]]]:
    """Fetch each club once and return its starting units plus quarterback room."""
    lineups: dict[str, dict] = {}
    rooms: dict[str, list[dict]] = {}
    for team in TEAM_SLUGS:
        try:
            with urllib.request.urlopen(
                    ESPN_DEPTH_CHART.format(team=team), timeout=25) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except Exception:
            continue
        abbr = canon(((payload.get("team") or {}).get("abbreviation")) or team)
        projected = parse_depth_chart(payload)
        if projected.get("offense") or projected.get("defense"):
            lineups[abbr] = projected
        arms = _quarterbacks_from_depth(payload)
        if arms:
            rooms[abbr] = arms
    return lineups, rooms


def attach_known_headshots(lineups: dict[str, dict],
                           players: dict[str, list[dict]]) -> dict[str, dict]:
    """Reuse already-published portraits where names match; never invent URLs."""
    def name_key(value: object) -> str:
        return re.sub(r"[^a-z0-9]", "", str(value or "").lower())

    for team, lineup in lineups.items():
        known = {
            name_key(player.get("name")): player.get("headshot_url")
            for player in players.get(team, [])
            if player.get("headshot_url")
        }
        for phase in ("offense", "defense"):
            for player in (lineup.get(phase) or {}).get("players") or []:
                headshot = known.get(name_key(player["name"]))
                if headshot:
                    player["headshot_url"] = headshot
                else:
                    player.pop("headshot_url", None)
    return lineups


def merge_quarterbacks(players: dict[str, list[dict]],
                       rooms: dict[str, list[dict]]) -> dict[str, list[dict]]:
    """Put the whole quarterback room behind the board's named starter.

    The board's ordering wins where it has an opinion, because it reflects a
    depth chart. Everyone else keeps roster order behind them, which is the
    only ordering the roster itself asserts.
    """
    for team, room in rooms.items():
        existing = [pl for pl in players.get(team, []) if pl["position"] == "QB"]
        known = {pl["name"].lower() for pl in existing}
        rank = max((pl["depth_rank"] for pl in existing), default=0)
        for arm in room:
            if arm["name"].lower() in known:
                continue
            rank += 1
            players.setdefault(team, []).append({
                "name": arm["name"], "position": "QB",
                "depth_rank": rank, "headshot_url": arm["headshot_url"],
            })
        order = list(DEPTH_LIMITS)
        players.get(team, []).sort(
            key=lambda pl: (order.index(pl["position"]) if pl["position"] in order else 99,
                            pl["depth_rank"]))
    return players


def build(board: dict | None = None, rooms: dict | None = None,
          lineups: dict | None = None) -> dict:
    """Public NFL context, or empty dicts when the board is unreachable.

    Failing soft is deliberate: a missing board must leave the affected
    sections explicitly unavailable, never silently absent and never filled in
    with a stand-in number.
    """
    board = board if board is not None else load_board()
    if not board:
        return {"form": {}, "scheme": {}, "players": {}, "lineups": {}, "source": None}
    if rooms is None and lineups is None:
        lineups, rooms = fetch_depth_chart_context()
    elif lineups is None:
        lineups, _ = fetch_depth_chart_context()
    elif rooms is None:
        rooms = {}
    players = merge_quarterbacks(key_players(board), rooms)
    return {
        "form": team_form(board),
        "scheme": team_scheme(board),
        "players": players,
        "lineups": attach_known_headshots(lineups, players),
        "source": {
            "season": board.get("season"),
            "week": board.get("week"),
            "observed_at_utc": board.get("generated_at_utc"),
        },
    }
