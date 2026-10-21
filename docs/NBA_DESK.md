# NBA desk

**Added:** 2026-10-21 · **Producer:** [Alphakiller1/nba-model](https://github.com/Alphakiller1/nba-model)

## Data flow

| Artifact | Built by | Read by |
|---|---|---|
| `alphakiller1.github.io/nba-model/board.json` | nba-model `deploy-pages` (every 2 h; hourly 21:00–04:00 UTC) | Model Center via `/api/model-center/board?sport=nba` |
| `alphakiller1.github.io/nba-model/slate.json` | the same build | `scripts/publish_public_nba_slate.py` |
| `data/public/nba/slate.json` | `publish-nba-slate.yml` (every 2 h; every 30 min 21:00–05:35 UTC) | `/nba/` cards and `/nba/matchup.html` |

The public slate is facts only: identity, venue, broadcast, rest and
back-to-backs, ESPN's injury report, observed team rates per 100 possessions
and the four factors (each ranked of 30 clubs), player per-game lines and game
logs. nba-model refuses to write model fields into it (`PUBLIC_FORBIDDEN`); the
publisher re-checks against `design/public_restricted_fields.json`, and
`scripts/validate_public_fields.py` holds the NBA routes to the MLB/NFL public
dependency graph. Projections, win probability and the market comparison live
only in Model Center.

The publisher keeps the published file when the source is unreachable, stale
(over 36 h), malformed, carries model fields, or has fewer games for the same
night. Between model builds it refreshes each game's state, score and record
from ESPN's scoreboard.

## Early season

A club's own rates rest on a game or two in the first week, so the adapter
(`dashboard/sports/nba.js`) reads last season's rates until a club has played
five games, and last season's player lines (for its current roster) until it
has played three. Every panel names the basis it is showing.

## Desk

* **Cards** — crest, record, each club's leading scorer, rest, players out,
  broadcast; expanded: net/offense/defense per 100 and pace with ranks, and the
  injury list.
* **Matchup analysis** — tabs: Matchup (team ratings head-to-head; offense vs
  the defense it meets on scoring and the four factors), Shooting, Rotation,
  Availability, Games, Context.

## Verify

```
python scripts/publish_public_nba_slate.py
python scripts/validate_public_fields.py
python -m unittest tests.test_nba_desk
python scripts/sport_routes_smoke.py --base-url http://127.0.0.1:8766
```
