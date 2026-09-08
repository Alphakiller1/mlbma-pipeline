"""Pull DraftKings game lines from The Odds API and emit ShowTemplate props.

Uses the licensed API the sharp tracker already pays for rather than scraping
DraftKings HTML: a scraper gets blocked, breaks on markup changes, and violates
their terms. `bookmakers=draftkings` costs the same as one region.

COST: one credit per run for the whole slate (h2h + spreads + totals). The
response's x-requests-remaining header is echoed so the budget stays visible.

    python -m outputs.fetch_dk_lines --league nfl
    python -m outputs.fetch_dk_lines --league mlb --platform tiktok

IMPORTANT: these are CURRENT lines, not opening lines. The emitted props set
lineSource="current" so the template labels them "Spread"/"Total" rather than
"Open Spread"/"Open Total". Capturing a true opening line means storing the
first quote seen per event, which nothing in the stack does yet.
"""

import argparse
import json
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

PIPELINE = Path(__file__).resolve().parents[1]
PROPS_ROOT = PIPELINE / "video" / "props"
# The key lives with the tracker that pays for it.
TRACKER_ENV = PIPELINE.parent / "sharp-money-tracker" / ".env"

API_BASE = "https://api.the-odds-api.com/v4"
SPORT_KEY = {"nfl": "americanfootball_nfl", "mlb": "baseball_mlb"}

# The Odds API returns full team names; the graphics package keys on abbreviations.
NFL_ABBR = {
    "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
    "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
    "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
    "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
    "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV",
    "Los Angeles Chargers": "LAC", "Los Angeles Rams": "LAR", "Miami Dolphins": "MIA",
    "Minnesota Vikings": "MIN", "New England Patriots": "NE", "New Orleans Saints": "NO",
    "New York Giants": "NYG", "New York Jets": "NYJ", "Philadelphia Eagles": "PHI",
    "Pittsburgh Steelers": "PIT", "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA",
    "Tampa Bay Buccaneers": "TB", "Tennessee Titans": "TEN",
    "Washington Commanders": "WSH",
}
MLB_ABBR = {
    "Arizona Diamondbacks": "ARI", "Atlanta Braves": "ATL", "Baltimore Orioles": "BAL",
    "Boston Red Sox": "BOS", "Chicago Cubs": "CHC", "Chicago White Sox": "CHW",
    "Cincinnati Reds": "CIN", "Cleveland Guardians": "CLE", "Colorado Rockies": "COL",
    "Detroit Tigers": "DET", "Houston Astros": "HOU", "Kansas City Royals": "KC",
    "Los Angeles Angels": "LAA", "Los Angeles Dodgers": "LAD", "Miami Marlins": "MIA",
    "Milwaukee Brewers": "MIL", "Minnesota Twins": "MIN", "New York Mets": "NYM",
    "New York Yankees": "NYY", "Athletics": "OAK", "Oakland Athletics": "OAK",
    "Philadelphia Phillies": "PHI", "Pittsburgh Pirates": "PIT",
    "San Diego Padres": "SD", "San Francisco Giants": "SF", "Seattle Mariners": "SEA",
    "St. Louis Cardinals": "STL", "Tampa Bay Rays": "TB", "Texas Rangers": "TEX",
    "Toronto Blue Jays": "TOR", "Washington Nationals": "WSH",
}


def fail(msg: str) -> None:
    print(f"[dk-lines] FAILED: {msg}")
    raise SystemExit(1)


def load_key() -> str:
    key = os.getenv("ODDS_API_KEY", "").strip()
    if key:
        return key
    if TRACKER_ENV.exists():
        for line in TRACKER_ENV.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("ODDS_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    fail("no ODDS_API_KEY in env or sharp-money-tracker/.env")
    return ""


def american(odds: float) -> str:
    n = int(round(odds))
    return f"+{n}" if n > 0 else str(n)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--league", choices=("nfl", "mlb"), default="nfl")
    ap.add_argument("--platform", default="reels",
                    choices=("reels", "reels-ads", "tiktok", "shorts", "youtube"))
    ap.add_argument("--eyebrow", default="", help="Small line above the title")
    # DraftKings posts the whole NFL season, so an unfiltered run wrote 272
    # games. One week is the useful unit.
    ap.add_argument("--days", type=int, default=8,
                    help="Only games kicking off within this many days (0 = all)")
    a = ap.parse_args()

    abbr = NFL_ABBR if a.league == "nfl" else MLB_ABBR
    url = f"{API_BASE}/sports/{SPORT_KEY[a.league]}/odds/?" + urllib.parse.urlencode({
        "apiKey": load_key(),
        "bookmakers": "draftkings",
        "markets": "h2h,spreads,totals",
        "oddsFormat": "american",
    })

    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            games = json.loads(r.read())
            remaining = r.headers.get("x-requests-remaining")
            used = r.headers.get("x-requests-used")
    except urllib.error.HTTPError as e:
        fail(f"HTTP {e.code} from the Odds API: {e.read()[:200]!r}")
        return
    except Exception as exc:  # noqa: BLE001
        fail(f"request failed: {exc}")
        return

    print(f"[dk-lines] credits remaining: {remaining} (used {used})")
    if not games:
        fail(f"no {a.league.upper()} games returned - is the slate posted yet?")

    out_dir = PROPS_ROOT / a.league
    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in out_dir.glob("template-*.json"):
        stale.unlink()

    cutoff = (datetime.now(timezone.utc) + timedelta(days=a.days)) if a.days else None

    written, skipped, out_of_window = 0, [], 0
    for g in games:
        if cutoff:
            try:
                when = datetime.fromisoformat(
                    g["commence_time"].replace("Z", "+00:00"))
            except (KeyError, ValueError):
                when = None
            if when and when > cutoff:
                out_of_window += 1
                continue
        else:
            when = None
        if when is None:
            try:
                when = datetime.fromisoformat(
                    g["commence_time"].replace("Z", "+00:00"))
            except (KeyError, ValueError):
                when = None
        away_full, home_full = g.get("away_team", ""), g.get("home_team", "")
        away, home = abbr.get(away_full), abbr.get(home_full)
        if not away or not home:
            skipped.append(f"{away_full} @ {home_full} (unmapped name)")
            continue

        books = g.get("bookmakers") or []
        dk = next((b for b in books if b.get("key") == "draftkings"), None)
        if not dk:
            skipped.append(f"{away}@{home} (no DraftKings price)")
            continue

        spread = total = moneyline = None
        for m in dk.get("markets", []):
            outs = m.get("outcomes", [])
            if m["key"] == "spreads":
                fav = min(outs, key=lambda o: o.get("point", 0))
                spread = f"{abbr.get(fav['name'], fav['name'])} {fav['point']:+g}"
            elif m["key"] == "totals":
                over = next((o for o in outs if o.get("name") == "Over"), None)
                if over:
                    total = f"{over['point']:g}"
            elif m["key"] == "h2h":
                fav = min(outs, key=lambda o: o.get("price", 0))
                moneyline = f"{abbr.get(fav['name'], fav['name'])} {american(fav['price'])}"

        if not (spread or total):
            skipped.append(f"{away}@{home} (no spread or total posted)")
            continue

        props = {
            "platform": a.platform,
            "league": a.league,
            "away": away,
            "home": home,
            "eyebrow": a.eyebrow,
            # Kickoff, not "AWAY at HOME" - the abbreviations already flank this
            # slot, so repeating them wastes the only headline on the card.
            # %-I is a glibc extension and raises on Windows; strip the zero.
            "title": (when.astimezone(ZoneInfo("America/New_York"))
                      .strftime("%a %I:%M %p ET").replace(" 0", " ")
                      if when else f"{away} at {home}"),
            "spread": spread,
            "total": total,
            "moneyline": moneyline,
            # CURRENT, not opening - see the module docstring.
            "lineSource": "current",
        }
        path = out_dir / f"template-{away}-{home}.json"
        path.write_text(json.dumps(props, indent=2), encoding="utf-8")
        written += 1

    print(f"[dk-lines] wrote {written} template props -> "
          f"{out_dir.relative_to(PIPELINE)}")
    if out_of_window:
        print(f"[dk-lines] {out_of_window} games beyond the {a.days}-day window "
              "(use --days 0 for the full posted season)")
    for s in skipped:
        print(f"  skipped {s}")


if __name__ == "__main__":
    main()
