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
