# Basketball matchup evidence and colors — November 2026

This extends the existing matchup desk, tab order, club switch, paired ledgers,
court geometry, fonts, surfaces and five-tier Chase color system. No replacement
layout or chart library is introduced.

The CFB matchup ledger also serves NBA scoring, Four Factors and shooting,
CBB efficiency and transition, and NFL team form, pass/run, rushing and red
zone comparisons. Each row puts the offense on the left and its opposing
defense on the right. The bars mirror each unit's rank within its own cohort.
Reported values without a comparable rank appear with an empty bar.

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
The current-season export reconciles the Basketball Quant team-rate game
counts against the D-I fixture calendar to choose a cutoff for coordinate
shots and ESPN box estimates. The publisher requires at least 97% agreement
across the rated teams. Fixture scores, statuses, and verified game-log figures
continue updating through the slate date.

The added Defense tab compares each offense's shot mix, rim/three-point accuracy
and turnover patterns with the opposing defense. These are observed tendencies.
The connected free CBB feeds have no verified possession-tagged man/zone, press,
pick-and-roll coverage or named formation dataset for both seasons. The UI states
this limitation instead of inventing scheme labels or efficiency splits.

`pipeline/cbb_public/UPSTREAM.json` pins the factual exporter from cbb-model.
Its team index now includes `grade_baselines` by season, group and statistic.
Missing values are excluded and reported zeros retained. The existing daily
factual refresh regenerates these baselines along with its validated snapshot.

The matchup detail loads `matchup-ranks.json` alongside its team profiles.
Ranks use observed values in the selected season. Pace ranks fastest first
within the same counting method. Height ranks tallest first within position,
with separate cohorts for starters and full rosters. Zone accuracy needs at
least 10 attempts and a comparable shot source. Shot-share bands use the same
cutoffs and colors for both courts and their FGA labels. The bands measure how
often a zone is used.

Size by Position uses listed center heights. When a roster lacks center
heights, the publisher checks ESPN’s roster for the same school and season.
It uses that roster when it supplies a center height and at least as many
measured players. Frontcourt combines reported forward and center heights,
weighted by players for the roster and by recorded starts for starters.
Center ranks still use only same-season teams with a measured center sample.
Frontcourt now ranks against the same-season F/C cohort too, with separate
starts-weighted and roster-weighted samples. Its counts include both measured
players and starts. Heights retain a total-inches tooltip. Invalid heights remain
unreported; an actual absence of recorded center starts is not filled with a
forward's height.

When NCAA possession tags are pending, score-matched ESPN finals can supply
fast-break points, points off turnovers, and recorded starting groups. They also
supply reconciled player lines where Basketball Quant has no rotation. Each
panel identifies the ESPN source and the measurement it supplies. The Man, Zone
and Press panel shows labeled same-season references from Synergy's published
tournament sample, and only for the teams that sample covers.

## NBA

The 12 tabs put the matchup overview, game log, injuries and rotation first.
Player shot distribution sits with the individual shooting tables. Team
shooting, play types and defense follow, with measured coverage ahead of
inferred tendencies. Section and panel labels name the units, eligible peers
and source windows where available.

The season picker sets team rates, player profiles and measured coverage.
Game logs, adjusted power, five-man units and situational splits show their
published season on their panels. Fixture rest and availability refer to the
actual game. Prior-season players are listed with their last club in that
season and per-game lines cover the whole season.

The Matchup Map groups shot accuracy, the four factors and play-type
efficiency. Each row pairs one team's offense with the defense it meets.
The figures and ordinal ranks sit beside mirrored bars with the same
performance grades. The longest bar represents first in that unit's NBA
comparison pool. A disclosure opens the remaining published categories.

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

The Shooting tab keeps ESPN geometric courts and a separate Databallr
table with that provider's at-rim, short/long mid-range, corner and above-break
definitions, makes/attempts, accuracy and share. Short mid-range is not silently
mapped onto geometric paint. Same-source FG% grades require 20 attempts.
Court accuracy and rank share the performance color. Shot share uses the
volume color. The play-type fingerprint labels bar length as usage and
reports efficiency in points per possession.

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
