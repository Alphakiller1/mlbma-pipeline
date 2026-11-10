# Basketball matchup evidence and colors — November 2026

This extends the existing matchup desk, tab order, club switch, paired ledgers,
court geometry, fonts, surfaces and five-tier Chase color system. No replacement
layout or chart library is introduced.

## CBB

Current/prior season controls continue to select 2026–27 and 2025–26 explicitly.
Efficiency, shooting tables, summary eFG% and rotation production now carry
performance colors. Team baselines use same-season D-I clubs with reported games;
player baselines require reported participation of at least 10% MIN%. Colors for
production express output, not a total player evaluation. GP, MIN%, counts and
shot shares remain neutral. Lower defensive FG%/PPP allowed and fewer offensive
turnovers are favorable; turnovers forced and defensive rebounds reverse those
directions appropriately.

Zone/eFG comparisons use the same shot-source definitions as their counts.
CBBAnalytics zones6 and Chase coordinate zones keep separate league baselines.
Never use a box-score baseline to shade a differently defined shot sample.

The added Defense tab compares each offense's shot mix, rim/three-point accuracy
and turnover patterns with the opposing defense. These are observed tendencies.
The connected free CBB feeds have no verified possession-tagged man/zone, press,
pick-and-roll coverage or named formation dataset for both seasons. The UI states
this limitation instead of inventing scheme labels or efficiency splits.

`pipeline/cbb_public/UPSTREAM.json` pins the factual exporter from cbb-model.
Its team index now includes `grade_baselines` by season, group and statistic.
Missing values are excluded and reported zeros retained. The existing daily
factual refresh regenerates these baselines along with its validated snapshot.

## NBA

The existing 12 tabs retain the native desktop/phone layout. Team/player
statistics now have explicit season selection; the current fixture, rest and
availability keep their current identity. Prior-season players are listed with
their last club in that season; per-game lines cover their whole season.

The Defense tab begins with **measured** NBA zone/non-zone usage, exact possession
samples, points allowed per possession and the opposing offense's PPP against
each coverage. The source label Non-zone is preserved; it is not proof of man
defense. A minimum of 20 coverage possessions is required for a performance grade;
raw values below that threshold remain visible as thin samples. Offense PPP
grades high as favorable; defense PPP grades low as favorable. Counts and usage
are neutral. Relative ranks use the actual qualifying same-season cohort.

Existing shot/matchup-based scheme indicators are explicitly labeled **inferred
defensive tendencies** and appear after measured data. Drop/switch/blitz/press,
horns/5-out and other named coverages/formations have no verified tagged efficiency
from these free feeds. These indicators must never masquerade as coverage usage.

The Shot Profile tab keeps ESPN geometric courts and adds a separate Databallr
table with that provider's at-rim, short/long mid-range, corner and above-break
definitions, makes/attempts, accuracy and share. Short mid-range is not silently
mapped onto geometric paint. Same-source FG% grades require 20 attempts.
Court accuracy/rank text is colored; shot share stays neutral. The rank map calls
its difference **rank gap**, with the unit stated as rank places rather than points.

Rotation is actually sorted by MPG and grades production against same-season
players with 10+ MPG. Current injury status is not assigned to historical rosters;
the separate Current Injury Report always refers to the actual fixture.

## Sources, refresh and factual boundary

* [Databallr public stats](https://databallr.com/stats) is collected in nba-model
  for both seasons. Raw basic/advanced player and team/opponent responses carry
  request URLs, UTC retrieval dates and SHA-256 receipts. `leverage=all` means all
  possessions. Advanced requests can return playoff rows despite the false flag;
  regular-season normalization explicitly filters them. Adjusted impact estimates
  remain model research inputs and never enter the public factual payload.
* [NBA Inside the Game](https://www.nba.com/inside-the-game/team/zonedefense)
  supplies measured zone/non-zone through its public `zonedefenseteamleaders`
  endpoint. This does not require an account or licensed plan.
* [BasketballQuant](https://basketballquant.com/) and
  [CBBAnalytics](https://cbbanalytics.com/tools/shot-charts) retain their existing
  factual CBB roles; collection covers publicly exposed responses only.

nba-model builds `evidence.json` for both seasons on its regular scheduled build,
with a six-hour source cache. The website's existing NBA publisher independently
validates/copies this file alongside its slate. A failed evidence fetch retains
the dated last good evidence without freezing valid fixture/score updates.
When the league endpoint lags its public table, the dated paired table capture
can supply both directions. Counts must resolve uniquely from the published
shares and league totals must reconcile. The table's two-decimal PPP stays at
that precision. A later website refresh retains the more complete coverage
cohort while other NBA evidence updates.
Unknown/private fields reject the evidence publication. Each nested field is
classified; no object-level blanket exception bypasses the public boundary.

Source update time, retrieval time and last included game are different facts.
ESPN supplies the explicit game cutoff. Databallr exposes a source update time but
no last included game date. NBA coverage exposes counts/games plus retrieval time.
The UI labels each accordingly. Source snapshots dated today are ineligible for
backtests with an earlier as-of date. No forecast-coefficient improvement is
claimed without a separate time-safe evaluation.

## Verification and rollback

Source tests cover season/competition boundaries, checksums, all-team completeness,
coverage reconciliation, thin/zero samples and direction-correct grades. Website
tests cover year/roster separation, nested private-field rejection and incomplete
cohorts. Runtime checks exercise both season controls and preserve the active tab.
Token/public-field guards and 360/375/390px audits remain release gates.

Rollback uses the existing Git/Cloudflare path: revert the feature merge. Data
snapshots remain dated and retained in their owning model repositories. The user's
original dirty website checkout is not changed by this release.
## Reviewed coverage samples

The coverage panels can show the results of individual game samples separately from season data. `data/public/{cbb,nba,nfl}/film-coverage.json` records the game, the film source, the play-by-play source and the underlying observations. `python scripts/check_film_coverage.py --live` checks basketball game IDs, dates, teams, clocks and score changes against ESPN. To also reconcile the NFL results and EPA, pass `--nflverse <play_by_play_2026.parquet>` using the public nflverse play-by-play release.

- **CBB, 2026–27:** The first ten completed possessions of Central Connecticut at Syracuse (November 5) and Oakland at Stanford (November 6), reviewed from ACC Digital Network full-game replays. The first established half-court defense is tagged as man or zone when defenders can be followed through cuts or reversals. Backcourt pressure by multiple defenders is a separate tag because the same possession can encounter a press and then a half-court zone. Camera cuts and early offense can leave a possession unclassified. Offensive rebounds and nonshooting fouls keep the possession open; related made free throws count. The existing 2025–26 tournament reference stays in the prior-season view.
- **NBA, 2026–27:** The six first-quarter possessions in Kellan Olson’s full-game compilation of one Phoenix ball handler's half-court ball screens against Oklahoma City (October 26). Drop means the screener’s defender contains from below the screen while the guard retains the original matchup. Switch requires a visible exchange of assignments; blitz requires both defenders to trap the handler at the screen. Brief help or an ambiguous exchange remains unclassified. Possession points come from the game log, including any scoring after an offensive rebound or nonshooting foul. This is a sample of one handler, one quarter and one game.
- **NBA, November 8:** Four selected Miami–Sacramento possessions are linked to the NBA player paths rendered by CourtSketch. The analyst checked the movement of both defenders before and after each screen and reconciled the possession outcomes with ESPN. The two switches and two blitzes reflect that visual review. Each record links to its own replay and gives the approximate time relative to the play. The sample was selected to show the two coverages, so its counts describe the examples alone.
- **NFL, 2026 Weeks 5, 8 and 9:** Six selected plays from three Patriots team film reviews. Week 5 identifies Cover 0 against Las Vegas. Week 8 identifies an inverted Tampa-2 by New England and a Cover 3 call by Miami. Week 9 identifies Cover 1, Cover 6 and match quarters (poach) against Green Bay. Outcomes and EPA come from nflverse. Each call has one example, so the archive reports EPA for the play itself.

Samples retain their original teams and dates when shown as recent evidence on another matchup. A small film sample does not receive a season grade or enter a forecast. No missing scheme is entered as zero. The connected free feeds still do not provide league-wide current NBA drop/switch/blitz, men’s D-I man/zone/press, or NFL Cover 0–6 splits. The NFL’s official coaches film and paid coverage feeds are outside the free source set.
