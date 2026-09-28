# NFL Red Zone Section (2026-09-27)

The matchup page's **Red Zone** section (`#redzone`) shows each offense against the defense it meets, in both evidence windows (2025 + 2026 pooled play by play, and 2026 only).

Source: nflverse play-by-play, built by `outputs/nfl_red_zone.py`. The data is published as `away_red_zone` / `home_red_zone`, `{ "current": club, "combined": club }`.

## Definitions

| Term | Definition |
|---|---|
| Drive | nflfastR `fixed_drive` with at least one snap from scrimmage (pass, run, field goal, punt, kneel, spike). |
| Trip | A drive with a non-kneel snap at the opponent's **20 or closer**. Two-point tries and nullified plays do not count. |
| Trips / G | Trips over games played. |
| Trip Rate | Trips over drives. |
| TD% / Score% | Trips on which a touchdown, or a touchdown or made field goal, was **snapped from the 20 or closer**, over trips. |
| EPA / Play | Mean EPA on red zone dropbacks and rushes (kneels excluded). |
| Pass Rate | Red zone dropbacks (sacks and scrambles included) over dropbacks plus designed runs. This is a tendency: it gets a league marker, never a grade. |
| Targets By Position | Share of red zone targets to WR / TE / RB (from the nflverse player registry), beside the share the defense allows and the receiving TDs it allows per game. |
| Tgt Share / Car Share | A player's red zone targets (carries) over his clubs' red zone targets (carries) **in the games he took part in**. A traded player keeps both clubs and is listed under his latest club. |
| Inside 10 / Inside 5 | Targets at the 10 or closer / carries at the 5 or closer. |
| QB line | Dropbacks include sacks and scrambles (nflfastR puts the scrambler in the rusher field). Attempts exclude sacks. |

**Ranks** are league places, where 1st is best for that side: most trips is 1st for an offense, fewest trips allowed is 1st for a defense. Player shares are placed within position.

**Sample floors** decide which players are graded:
- 3 red zone targets for a target share
- 3 carries for a carry share
- 8 attempts or dropbacks for a quarterback

Players under the floor are printed with **Low n** and are not graded. The published list is at most 2 QBs, 6 pass catchers and 4 backs per club. It is trimmed after ranking.

## Validation

- **At the 20.** nflfastR's `drive_inside20` counts only snaps strictly inside the 20, so it misses 9 of 982 drives in 2026 weeks 1–3. We use the NFL's "20 and in", which is also FantasyPros' definition. Three of those 9 drives were end-of-half kneels; the kneel rule removes them.
- **ESPN, 2025, all 32 clubs.** TD% is within 1.35 points of ESPN's `redzoneTouchdownPct` on average (4.0 max). Score% is within 1.9 points of `redzoneScoringPct` on average (6.5 max).
  - Counting every drive-ending field goal instead (a field goal kicked after being pushed back out of the red zone) missed by 5.3 points on average (11.4 max). That is why a score must be snapped from inside the 20.
- **Consistency.** League trips for equal league trips against (307 in 2026, 2,076 pooled). League rates are 3.3 trips per team-game and a 58–60% TD rate.
- **Player counts.** All 260 players with 2026 red zone involvement were recounted independently from the raw play-by-play: 0 mismatches in targets, receiving TDs, carries or rushing TDs.
- **Runtime diag.** `public_site_runtime_diag.py`: 177/177. The section is in the "every number graded, marked, thin or a count" audit.
