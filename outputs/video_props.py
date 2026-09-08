"""Emit Remotion props JSON for the video graphics engine (MLB and NFL).

Writes one props file per game into video/props/<league>/ and prints the render
command for each. video.bat renders every file it finds.

    python -m outputs.video_props --games NYM@TBR          # MLB, today's slate
    python -m outputs.video_props --league nfl             # NFL, whole board
    python -m outputs.video_props --league nfl --games NE@SEA

MLB reuses read_slate/resolve_games from content_engine, inheriting the
fail-closed stale-slate check and the AWAY@HOME#2 doubleheader disambiguation.

NFL reads nfl-model/docs/board.json. That board self-reports
authority=RESEARCH_ONLY with may_bet=false, and withholds per-game edges
(edge_points is null) because the model does not beat the closing line. Those
flags are carried into the props so the graphic can state the model's read
WITHOUT implying a bet - see NflCutaway.

NOTE: first pitch / kickoff handling differs by league. MLB deliberately never
emits a time (today_matchups.csv's Time column is wrong for day games, see
content_engine ~line 819). NFL kickoff comes straight from the board and is
trustworthy, so it is emitted.
"""

import argparse
import json
from datetime import date
from pathlib import Path

from outputs.content_engine import PIPELINE, fail, read_slate, resolve_games

PROPS_ROOT = PIPELINE / "video" / "props"
NFL_BOARD = PIPELINE.parent / "nfl-model" / "docs" / "board.json"


# ── MLB ──────────────────────────────────────────────────────────────────────
def _num(row: dict, key: str) -> float:
    """Slate numerics are strings; a blank means the pipeline had no value."""
    raw = (row.get(key) or "").strip()
    if not raw:
        fail(f"{row.get('Away')}@{row.get('Home')}: {key} is empty - "
             "the slate is incomplete, refusing to render a partial graphic")
    return round(float(raw), 1)


def mlb_props(row: dict) -> dict:
    return {
        "league": "mlb",
        "away": row["Away"].strip().upper(),
        "home": row["Home"].strip().upper(),
        "awaySP": row["Away_SP"].strip(),
        "awayHand": row["Away_Hand"].strip().upper(),
        "awayPitchScore": _num(row, "Away_PitchScore"),
        "homeSP": row["Home_SP"].strip(),
        "homeHand": row["Home_Hand"].strip().upper(),
        "homePitchScore": _num(row, "Home_PitchScore"),
        "awayOSI": _num(row, "Away_OSI"),
        "homeOSI": _num(row, "Home_OSI"),
        "lineupEdge": row["Lineup_Edge"].strip(),
    }


def run_mlb(a: argparse.Namespace) -> list[tuple[str, dict]]:
    slate = read_slate(a.date)
    games = resolve_games(slate, a.games)
    out = []
    for row in games:
        p = mlb_props(row)
        out.append((f"{p['away']}-{p['home']}", p))
    return out


# ── NFL ──────────────────────────────────────────────────────────────────────
def run_nfl(a: argparse.Namespace) -> list[tuple[str, dict]]:
    if not NFL_BOARD.exists():
        fail(f"{NFL_BOARD} missing - run the nfl-model pipeline first")
    # utf-8 explicitly: the board carries a mid-dot in `kickoff` that mojibakes
    # under the Windows cp1252 default.
    board = json.loads(NFL_BOARD.read_text(encoding="utf-8"))

    ratings = {t["team"].upper(): t for t in board.get("teams", [])}
    index: dict[str, dict] = {}
    for g in board.get("games", []):
        index[f"{g['away'].upper()}@{g['home'].upper()}"] = g

    if not index:
        fail("nfl board has no games")

    if a.games:
        keys = []
        for token in [t.strip().upper() for t in a.games.split(",") if t.strip()]:
            if token not in index:
                fail(f"{token} is not on the board. "
                     f"Available: {', '.join(sorted(index))}")
            keys.append(token)
    else:
        keys = sorted(index)

    out = []
    for key in keys:
        g = index[key]
        away, home = g["away"].upper(), g["home"].upper()
        p = {
            "league": "nfl",
            "away": away,
            "home": home,
            "awayRating": round(float(ratings.get(away, {}).get("rating", 0.0)), 1),
            "homeRating": round(float(ratings.get(home, {}).get("rating", 0.0)), 1),
            "modelMargin": round(float(g["model_margin"]), 1),
            "marketMargin": round(float(g["published_margin"]), 1),
            "winProbability": round(float(g["win_probability"]), 4),
            "projectedTotal": round(float(g["projected_total"]), 1),
            "projectedAwayScore": round(float(g["projected_away_score"]), 1),
            "projectedHomeScore": round(float(g["projected_home_score"]), 1),
            "marketTotal": round(float(g["market_total"]), 1),
            "kickoff": g.get("kickoff", ""),
            "action": g.get("action", "MONITOR"),
            # Carried so the graphic can never present a withheld edge as a play.
            "edgeWithheld": g.get("edge_points") is None,
            "authority": g.get("authority", board.get("authority", "RESEARCH_ONLY")),
            "mayBet": bool(board.get("may_bet", False)),
        }
        out.append((f"{away}-{home}", p))
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--league", choices=("mlb", "nfl"), default="mlb")
    ap.add_argument("--games", help="NYM@TBR,SDP@CIN (default: every game)")
    ap.add_argument("--date", default=date.today().isoformat(),
                    help="MLB only; the NFL board carries its own week")
    ap.add_argument("--take", help="Override the perspective line for a single game")
    a = ap.parse_args()

    entries = run_nfl(a) if a.league == "nfl" else run_mlb(a)

    if a.take:
        if len(entries) != 1:
            fail("--take applies to one game; narrow it with --games")
        entries[0][1]["take"] = a.take

    out_dir = PROPS_ROOT / a.league
    out_dir.mkdir(parents=True, exist_ok=True)
    # Clear stale props first: video.bat renders every file in this directory, so
    # a leftover from an earlier run would silently ship an old game alongside
    # the current ones.
    for stale in out_dir.glob("*.json"):
        stale.unlink()

    comp = "NflCutaway" if a.league == "nfl" else "MatchupCutaway"
    for name, props in entries:
        path = out_dir / f"{name}.json"
        path.write_text(json.dumps(props, indent=2), encoding="utf-8")
        print(f"wrote {path.relative_to(PIPELINE)}")
        print(f'  npx remotion render {comp} out/{name}.mov '
              f'--props=props/{a.league}/{name}.json')

    if a.league == "nfl" and entries and entries[0][1]["edgeWithheld"]:
        print("\nNOTE: the NFL board withholds per-game edges "
              "(model does not beat the closing line). Graphics render the "
              "model's read as research, not as a play.")


if __name__ == "__main__":
    main()
