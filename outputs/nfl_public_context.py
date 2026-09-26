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

import csv
import io
import json
import re
import urllib.request
from pathlib import Path

try:
    from outputs import nfl_advanced_context
except ImportError:  # Direct script execution from the outputs directory.
    import nfl_advanced_context

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
        "single_high_rate", "two_high_rate",
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
        "pass_epa_play_action", "pass_epa_cover_0", "pass_epa_cover_1",
        "pass_epa_cover_2", "pass_epa_cover_3", "pass_epa_cover_4",
        "pass_epa_cover_6", "pass_epa_cover_2_man", "rush_epa_stacked_box",
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
            "participation_source_seasons": row.get("participation_source_seasons") or [],
            "charting_samples": row.get("charting_samples"),
            "coverage_samples": row.get("coverage_samples"),
            "offense_plays": row.get("offense_plays"),
            "defense_plays": row.get("defense_plays"),
        }
        for phase in ("offense", "defense"):
            source = row.get(phase) or {}
            source = dict(source)
            if source.get("single_high_rate") is None:
                values = [source.get(key) for key in ("cover_1_rate", "cover_3_rate")]
                if all(value is not None for value in values):
                    source["single_high_rate"] = sum(float(value) for value in values)
            if source.get("two_high_rate") is None:
                values = [source.get(key) for key in (
                    "cover_2_rate", "cover_4_rate", "cover_6_rate", "cover_2_man_rate")]
                if all(value is not None for value in values):
                    source["two_high_rate"] = sum(float(value) for value in values)
            grouped: dict[str, dict] = {}
            for group, keys in SCHEME_GROUPS.items():
                values = {k: source[k] for k in keys if source.get(k) is not None}
                if values:
                    grouped[group] = values
            entry[phase] = grouped
        out[team] = entry

    # Frequency rank means "used most often", not "best". Keep this metadata
    # beside the raw values so existing consumers still receive plain numbers.
    for phase in ("offense", "defense"):
        for group in ("coverage", "pressure", "personnel", "target_share"):
            for key in SCHEME_GROUPS[group]:
                rows = [
                    (team, float(entry[phase][group][key]))
                    for team, entry in out.items()
                    if (entry.get(phase) or {}).get(group, {}).get(key) is not None
                ]
                if not rows:
                    continue
                ranks = _ranked(rows, "high")
                for team, _value in rows:
                    rank_group = (out[team].setdefault("league_frequency_ranks", {})
                                  .setdefault(phase, {}).setdefault(group, {}))
                    rank_group[key] = {"place": ranks[team], "of": len(rows)}

    # League average and spread of every situational response, per phase, across
    # the clubs charted. The page grades a club's EPA against man, under pressure,
    # off play action - and its success rates - against THIS. Zero is not average
    # in any of them: every offence gives EPA back under pressure, and a success
    # rate is a share near 45%.
    league = response_baselines(out)
    if league:
        for entry in out.values():
            entry["league_response"] = league
    return out


MIN_RESPONSE_CLUBS = 8


def response_baselines(schemes: dict[str, dict]) -> dict[str, dict]:
    league: dict[str, dict] = {}
    for phase in ("offense", "defense"):
        for key in SCHEME_GROUPS["response"]:
            values = [
                float(entry[phase]["response"][key])
                for entry in schemes.values()
                if ((entry.get(phase) or {}).get("response") or {}).get(key) is not None
            ]
            if len(values) < MIN_RESPONSE_CLUBS:
                continue
            mean = sum(values) / len(values)
            std = (sum((v - mean) ** 2 for v in values) / len(values)) ** 0.5
            if std <= 1e-9:
                continue
            league.setdefault(phase, {})[key] = {
                "mean": round(mean, 4), "std": round(std, 4), "n": len(values)}
    return league


# Identity fields only. The rest of a player_projections row is the model's
# output - metrics, persistence weights, an implied points total, a sportsbook
# line, an edge and an action - and none of it is carried across. The row is
# rebuilt key by key rather than copied and pruned, so a new model field cannot
# arrive here by default.
PLAYER_FIELDS = (
    "player_id", "player_name", "position", "depth_rank", "headshot_url",
)

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
            "player_id": str(row.get("player_id") or ""),
            "name": row.get("player_name") or "",
            "position": position,
            "depth_rank": int(rank),
            "headshot_url": sized_headshot(row.get("headshot_url")) or None,
        })
    order = list(DEPTH_LIMITS)
    for team, players in by_team.items():
        players.sort(key=lambda pl: (order.index(pl["position"]), pl["depth_rank"]))
    return by_team


PLAYER_COVERAGE_SPLITS = {
    "all", "man", "zone", "cover_0", "cover_1", "cover_2", "cover_3",
    "cover_4", "cover_6", "cover_2_man",
}
PLAYER_COVERAGE_FIELDS = (
    "targets", "receptions", "receiving_yards", "touchdowns", "catch_rate",
    "yards_per_target", "epa_per_target",
)


def player_coverage(board: dict) -> dict[str, list[dict]]:
    """Allowlist observed RB/WR/TE coverage splits from the producer board."""
    out: dict[str, list[dict]] = {}
    for row in board.get("player_coverage_profiles") or []:
        team = canon(row.get("team"))
        position = str(row.get("position") or "").upper()
        name = str(row.get("player_name") or "").strip()
        season = row.get("source_season")
        if not team or position not in {"RB", "WR", "TE"} or not name or season is None:
            continue
        splits = []
        for coverage, values in (row.get("splits") or {}).items():
            if coverage not in PLAYER_COVERAGE_SPLITS or not isinstance(values, dict):
                continue
            stats = {key: values[key] for key in PLAYER_COVERAGE_FIELDS
                     if values.get(key) is not None}
            if not stats.get("targets"):
                continue
            splits.append({"coverage": coverage, **stats})
        if not splits:
            continue
        out.setdefault(team, []).append({
            "player_id": str(row.get("player_id") or ""),
            "player_name": name,
            "position": position,
            "source_season": int(season),
            "splits": splits,
        })
    # Grade each rate against players at the same position, in the same season
    # and coverage. A split needs three targets (twenty for the all-coverage
    # summary) before it enters a pool; volume itself is not graded as quality.
    rows = [profile for profiles in out.values() for profile in profiles]
    for position in ("RB", "WR", "TE"):
        seasons = {profile["source_season"] for profile in rows
                   if profile["position"] == position}
        for season in seasons:
            coverages = {split["coverage"] for profile in rows
                         if profile["position"] == position and
                         profile["source_season"] == season
                         for split in profile["splits"]}
            for coverage in coverages:
                minimum = 20 if coverage == "all" else 3
                for metric in ("catch_rate", "yards_per_target", "epa_per_target"):
                    pool = []
                    for profile in rows:
                        if profile["position"] != position or profile["source_season"] != season:
                            continue
                        split = next((item for item in profile["splits"]
                                      if item["coverage"] == coverage), None)
                        if split and split.get("targets", 0) >= minimum and split.get(metric) is not None:
                            pool.append((profile["player_id"] or profile["player_name"],
                                         float(split[metric])))
                    if len(pool) < 2:
                        continue
                    ranks = _ranked(pool, "high")
                    for profile in rows:
                        if profile["position"] != position or profile["source_season"] != season:
                            continue
                        split = next((item for item in profile["splits"]
                                      if item["coverage"] == coverage), None)
                        identity = profile["player_id"] or profile["player_name"]
                        if split and identity in ranks:
                            split.setdefault("league_ranks", {})[metric] = {
                                "place": ranks[identity], "of": len(pool)
                            }
    return out


PLAYER_SCHEME_SPLITS = {
    "all", "man", "zone", "cover_0", "cover_1", "cover_2", "cover_3",
    "cover_4", "cover_6", "cover_2_man", "blitz", "no_blitz", "pressure",
    "clean", "stacked_box", "light_box", "left", "middle", "right",
    "gap_guard", "gap_tackle", "gap_end", "single_high", "two_high",
    "middle_field_closed", "middle_field_open", "base", "nickel", "dime",
}
PLAYER_SCHEME_FIELDS = {
    "QB": (
        "dropbacks", "attempts", "completions", "passing_yards", "passing_tds",
        "interceptions", "completion_rate", "yards_per_attempt", "epa_per_dropback",
        "success_rate", "games", "dropbacks_per_game", "passing_yards_per_game",
    ),
    "RB": (
        "carries", "rushing_yards", "rushing_tds", "yards_per_carry",
        "epa_per_carry", "success_rate", "games", "carries_per_game",
        "rushing_yards_per_game",
    ),
}
PLAYER_TRACKING_FIELDS = (
    "season", "week", "attempts", "eight_plus_box_rate", "avg_time_to_los",
    "avg_time_to_throw", "expected_yards_per_carry", "ryoe_per_carry",
    "rush_pct_over_expected", "source",
)


def player_scheme(board: dict) -> dict[str, list[dict]]:
    """Allowlist and league-rank observed QB passing and RB rushing splits."""
    out: dict[str, list[dict]] = {}
    for row in board.get("player_scheme_profiles") or []:
        team = canon(row.get("team"))
        position = str(row.get("position") or "").upper()
        family = str(row.get("play_family") or "").lower()
        name = str(row.get("player_name") or "").strip()
        season = row.get("source_season")
        expected = "passing" if position == "QB" else "rushing"
        if (not team or position not in PLAYER_SCHEME_FIELDS or family != expected
                or not name or season is None):
            continue
        splits = []
        volume = "dropbacks" if position == "QB" else "carries"
        for look, values in (row.get("splits") or {}).items():
            if look not in PLAYER_SCHEME_SPLITS or not isinstance(values, dict):
                continue
            stats = {key: values[key] for key in PLAYER_SCHEME_FIELDS[position]
                     if values.get(key) is not None}
            if not stats.get(volume):
                continue
            splits.append({"look": look, **stats})
        if splits:
            published = {
                "player_id": str(row.get("player_id") or ""), "player_name": name,
                "position": position, "source_season": int(season),
                "play_family": family, "splits": splits,
            }
            if isinstance(row.get("tracking"), dict):
                tracking = {key: row["tracking"][key] for key in PLAYER_TRACKING_FIELDS
                            if row["tracking"].get(key) is not None}
                if tracking:
                    published["tracking"] = tracking
            out.setdefault(team, []).append(published)
    rows = [profile for profiles in out.values() for profile in profiles]
    for position in ("QB", "RB"):
        volume = "dropbacks" if position == "QB" else "carries"
        metrics = (("completion_rate", "yards_per_attempt", "epa_per_dropback", "success_rate")
                   if position == "QB" else
                   ("yards_per_carry", "epa_per_carry", "success_rate"))
        seasons = {profile["source_season"] for profile in rows
                   if profile["position"] == position}
        for season in seasons:
            looks = {split["look"] for profile in rows if profile["position"] == position
                     and profile["source_season"] == season for split in profile["splits"]}
            for look in looks:
                minimum = 100 if look == "all" and position == "QB" else (
                    50 if look == "all" else (10 if position == "QB" else 5))
                for metric in metrics:
                    pool = []
                    for profile in rows:
                        if profile["position"] != position or profile["source_season"] != season:
                            continue
                        split = next((item for item in profile["splits"] if item["look"] == look), None)
                        if split and split.get(volume, 0) >= minimum and split.get(metric) is not None:
                            pool.append((profile["player_id"] or profile["player_name"], float(split[metric])))
                    if len(pool) < 2:
                        continue
                    ranks = _ranked(pool, "high")
                    for profile in rows:
                        split = next((item for item in profile["splits"] if item["look"] == look), None)
                        identity = profile["player_id"] or profile["player_name"]
                        if (profile["position"] == position and profile["source_season"] == season
                                and split and identity in ranks):
                            split.setdefault("league_ranks", {})[metric] = {
                                "place": ranks[identity], "of": len(pool)}
    return out


NFLVERSE_RELEASE = (
    "https://github.com/nflverse/nflverse-data/releases/download/{tag}/{name}"
)

# Plain observed season totals. These are deliberately separate from the
# producer's player projections: the public matchup page may show what a player
# has done, never what the private model expects him to do next.
TEAM_STAT_FIELDS = (
    "games", "completions", "attempts", "passing_yards", "passing_tds",
    "passing_first_downs", "sacks_suffered", "carries", "rushing_yards", "rushing_tds",
    "rushing_first_downs", "receptions", "targets", "receiving_yards",
    "receiving_tds", "def_sacks", "def_interceptions", "def_fumbles_forced",
)
PLAYER_STAT_FIELDS = (
    "games", "completions", "attempts", "passing_yards", "passing_tds",
    "passing_interceptions", "carries", "rushing_yards", "rushing_tds",
    "receptions", "targets", "receiving_yards", "receiving_tds",
    "target_share", "fantasy_points", "fantasy_points_ppr",
)


def _number(value: object) -> int | float | None:
    """CSV number without turning a missing observation into zero."""
    text = str(value or "").strip()
    if not text:
        return None
    try:
        number = float(text)
    except (TypeError, ValueError):
        return None
    return int(number) if number.is_integer() else round(number, 4)


def _nflverse_rows(tag: str, name: str) -> list[dict]:
    url = NFLVERSE_RELEASE.format(tag=tag, name=name)
    try:
        request = urllib.request.Request(url, headers={
            "User-Agent": "ChaseAnalytics-public-stats/1.0",
        })
        with urllib.request.urlopen(request, timeout=30) as response:
            text = response.read().decode("utf-8-sig")
    except Exception:
        return []
    return list(csv.DictReader(io.StringIO(text)))


def nflverse_season_stats(season: int) -> dict:
    """Observed current-season team and player volume from nflverse.

    Both release files are league-wide, so this costs two requests per publish,
    not one request per player. The output is field-allowlisted and rejects a
    wrong-season or unexpectedly sparse response instead of publishing it.
    """
    teams: dict[str, dict] = {}
    players: dict[str, list[dict]] = {}
    team_name = f"stats_team_reg_{season}.csv"
    player_name = f"stats_player_reg_{season}.csv"

    for row in _nflverse_rows("stats_team", team_name):
        if _number(row.get("season")) != season or row.get("season_type") != "REG":
            continue
        team = canon(row.get("team"))
        if not team:
            continue
        entry = {key: _number(row.get(key)) for key in TEAM_STAT_FIELDS}
        teams[team] = {
            "team": team, "season": season, "source": "nflverse/nflfastR",
            **{key: val for key, val in entry.items() if val is not None},
        }

    for row in _nflverse_rows("stats_player", player_name):
        if _number(row.get("season")) != season or row.get("season_type") != "REG":
            continue
        team = canon(row.get("recent_team"))
        position = str(row.get("position") or "").upper()
        name = str(row.get("player_display_name") or row.get("player_name") or "").strip()
        if not team or position not in {"QB", "RB", "WR", "TE"} or not name:
            continue
        entry = {key: _number(row.get(key)) for key in PLAYER_STAT_FIELDS}
        players.setdefault(team, []).append({
            "player_id": str(row.get("player_id") or ""),
            "player_name": name,
            "position": position,
            "season": season,
            "source": "nflverse/nflfastR",
            **{key: val for key, val in entry.items() if val is not None},
        })

    # A valid regular-season team file covers the league. Fail closed if the
    # release is truncated or points at the wrong asset; player data may be
    # thinner early in Week 1, but it may not exist without the team backbone.
    if len(teams) < 30:
        return {"teams": {}, "players": {}}
    pace_rows = []
    for team, entry in teams.items():
        games = float(entry.get("games") or 0)
        snaps = sum(float(entry.get(key) or 0)
                    for key in ("attempts", "carries", "sacks_suffered"))
        if games > 0 and snaps > 0:
            entry["offensive_plays"] = int(snaps)
            entry["offensive_plays_per_game"] = round(snaps / games, 2)
            pace_rows.append((team, entry["offensive_plays_per_game"]))
    pace_ranks = _ranked(pace_rows, "high")
    for team, _value in pace_rows:
        teams[team]["offensive_pace_rank"] = pace_ranks[team]
        teams[team]["offensive_pace_of"] = len(pace_rows)
    for rows in players.values():
        rows.sort(key=lambda row: (
            ("QB", "RB", "WR", "TE").index(row["position"]),
            -float(row.get("targets") or row.get("carries") or row.get("attempts") or 0),
            row["player_name"],
        ))
    return {"teams": teams, "players": players}


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
            athlete_id = str(athlete.get("id") or "").strip()
            if not headshot and athlete_id.isdigit():
                headshot = sized_espn_headshot(
                    f"https://a.espncdn.com/i/headshots/nfl/players/full/{athlete_id}.png"
                )
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
    """Prefer model portraits while preserving official ESPN depth-chart art."""
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
          lineups: dict | None = None, season_stats: dict | None = None,
          advanced_context: dict | None = None) -> dict:
    """Public NFL context, or empty dicts when the board is unreachable.

    Failing soft is deliberate: a missing board must leave the affected
    sections explicitly unavailable, never silently absent and never filled in
    with a stand-in number.
    """
    supplied_board = board is not None
    board = board if supplied_board else load_board()
    if not board:
        return {"form": {}, "scheme": {}, "players": {}, "lineups": {},
                "player_coverage": {}, "player_scheme": {}, "team_stats": {},
                "player_stats": {}, "team_line": {}, "source": None}
    if rooms is None and lineups is None:
        lineups, rooms = fetch_depth_chart_context()
    elif lineups is None:
        lineups, _ = fetch_depth_chart_context()
    elif rooms is None:
        rooms = {}
    if season_stats is None:
        # Unit tests and callers that hand us a board are deterministic and
        # offline by default. The production no-argument build owns the two
        # league-wide downloads.
        season_stats = ({} if supplied_board else
                        nflverse_season_stats(int(board.get("season") or 0)))
    if advanced_context is None:
        # Only the production no-argument build owns the large play-by-play
        # downloads. Tests and callers supplying a board remain offline unless
        # they explicitly inject an advanced context fixture.
        advanced_context = ({} if supplied_board else nfl_advanced_context.build(
            int(board.get("season") or 0), season_stats.get("players") or {}))
    scheme_board = dict(board)
    scheme_board["player_scheme_profiles"] = [
        *(board.get("player_scheme_profiles") or []),
        *(advanced_context.get("player_scheme_profiles") or []),
    ]
    players = merge_quarterbacks(key_players(board), rooms)
    return {
        "form": team_form(board),
        "scheme": team_scheme(board),
        "players": players,
        "lineups": attach_known_headshots(lineups, players),
        "player_coverage": player_coverage(board),
        "player_scheme": player_scheme(scheme_board),
        "team_stats": season_stats.get("teams") or {},
        "player_stats": season_stats.get("players") or {},
        "team_line": advanced_context.get("team_line") or {},
        "source": {
            "season": board.get("season"),
            "week": board.get("week"),
            "observed_at_utc": board.get("generated_at_utc"),
        },
    }
