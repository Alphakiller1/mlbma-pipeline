# CFB and NFL matchup-depth update — 2026-09-30

## Scope

The CFB matchup desk now exposes evidence across eight groups: Units, Passing, Coverage, Rushing, Trenches, Situational, Special Teams, and Profile. The NFL desk adds a dedicated DVOA group.

## CFB descriptive metrics

The public CFB publisher derives the following rates from ESPN season totals. Each rate is ranked against the published slate when a higher or lower value has a clear football meaning; neutral pace and play-mix fields remain unranked.

- Points per play: points / offensive or defensive plays.
- Yards per play: total yards / plays.
- First-down rate: first downs / plays.
- Plays per game: plays / games (neutral).
- Pass rate: pass attempts / plays (neutral).
- Sack rate: sacks / opponent pass attempts.
- Sack yards per game: sack yards / games.
- Rush attempts per game: rush attempts / games (neutral).
- Rush first-down rate: rushing first downs / rush attempts.
- Pass first-down rate: passing first downs / pass attempts.
- Defensive disruption rate: (sacks + interceptions + fumbles recovered) / defensive plays.

The UI combines these with available PPA, success rate, explosiveness, and stuff-rate fields from the current-season CFB model artifact. The model merge now reads the season stamp from the payload, matching the artifact's actual schema.

## CFB coverage and scheme

Actual CFB man/zone snap rates and Cover-1/2/3/4 rates are not publicly available. The Coverage tab now separates two evidence types instead of leaving scheme empty:

- Deep Metric Analytics staff-derived 2026 scheme expectations: offensive family, competitive-down pass rate, defensive front, coverage leaning, pressure profile, expected play caller, and matchup notes versus man, zone, and pressure. Every panel states that actual man/zone snap rates are unavailable and identifies the 2025 metric season.
- Observed current-season passing outcomes: each offense is paired with the opposing defense and ranked against the 138-team FBS pool for completion rate, yards per attempt, yards per completion, passer rating, touchdown rate, interception rate, passing first-down rate, and sack rate. Dropbacks per game is neutral workload context.

The current slate carries both scheme profiles for 55 of 56 games. Wyoming–North Dakota State remains outcome-only because the scheme source does not rate that FBS–FCS pairing; no scheme is invented for it.

## NFL rushing integrity

The NFL run-game publisher supplies both current-season and prior-plus-current windows for every club: unit yards per game, yards per carry, EPA per carry, success, explosive and stuff rates, league ranks, and every current ball carrier with carry share. `run_game` is now a guarded evidence family, so a failed advanced-data pull cannot replace a complete live slate with empty rushing panels.

## DVOA contract

DVOA is FTN data. The NFL desk uses FTN's public DVOA dataset. The CFB desk uses SP+ as its clearly labelled opponent-adjusted DVOA equivalent and never presents SP+ as FTN DVOA.

- CFB publishes overall, offense, defense, and special-teams SP+ ratings and their FBS ranks from CFB Update's public current-season table.
- Every CFB panel identifies the source and states `Opponent-adjusted CFB efficiency; not FTN DVOA`.
- The CFB publisher refuses to replace the live slate unless both schools in every matchup have all four SP+ profiles.
- NFL publishes `away_dvoa` and `home_dvoa` objects from FTN's free public Team Total DVOA dataset.
- The public dataset supplies total, offense, defense, and special teams DVOA. Subscriber-only pass/run detail is shown only when explicitly supplied and is never inferred.
- Values are fractional percentages and may include `{value, rank, of}` plus source, season, and week provenance.
- A failed or incomplete upstream response leaves the last complete published slate in place instead of replacing numeric DVOA with an empty state.

## Verification

- CFB slate regenerated with 56 of 56 games carrying both descriptive profiles and both four-unit SP+ profiles.
- CFB scheme profiles populate both teams on 55 of 56 games; the FBS–FCS pairing is explicitly left outcome-only.
- NFL slate regenerated with current and combined run-game unit and carrier profiles for both teams on all 16 games.
- Public-field classification and restricted-field validation pass.
- JavaScript and Python syntax checks pass.
- Design token and cache-stamp checks pass at `20260930e`.
- Full automated suite: 258 tests and 8 subtests passed.
- Browser checks confirmed populated CFB scheme and coverage profiles, populated SP+ DVOA-equivalent panels, restored NFL run-game unit and carrier tables, populated NFL DVOA values and ranks, no console errors, and no horizontal overflow at desktop and phone widths.
- Full public-site runtime diagnostic: 213 checks passed. CFB scheme assertions require both profiles, coverage/front/pressure labels, man/zone matchup notes, and the measurement caveat; NFL rushing assertions require unit tables and ball carriers without an unpublished fallback.
