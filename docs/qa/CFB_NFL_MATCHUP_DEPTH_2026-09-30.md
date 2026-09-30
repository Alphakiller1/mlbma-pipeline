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

## CFB coverage outcomes

Public CFB feeds do not publish NFL-style man/zone or Cover-1/2/3/4 charting. The Coverage tab therefore uses observed, current-season passing outcomes rather than inventing scheme labels. Each offense is paired with the opposing defense and ranked against the 138-team FBS pool for completion rate, yards per attempt, yards per completion, passer rating, touchdown rate, interception rate, passing first-down rate, and sack rate. Dropbacks per game is included as neutral workload context.

## DVOA contract

DVOA is FTN data. The public UI does not calculate a lookalike or substitute a synthetic number.

- CFB displays an explicit licensed-feed status for offense, defense, and special teams DVOA.
- NFL publishes `away_dvoa` and `home_dvoa` objects from FTN's free public Team Total DVOA dataset.
- The public dataset supplies total, offense, defense, and special teams DVOA. Subscriber-only pass/run detail is shown only when explicitly supplied and is never inferred.
- Values are fractional percentages and may include `{value, rank, of}` plus source, season, and week provenance.
- A failed or incomplete upstream response leaves the last complete published slate in place instead of replacing numeric DVOA with an empty state.

## Verification

- CFB slate regenerated with 56 of 56 games carrying both team profiles.
- Public-field classification and restricted-field validation pass.
- JavaScript and Python syntax checks pass.
- Design token and cache-stamp checks pass at `20260930c`.
- Full automated suite: 254 tests and 8 subtests passed.
- Browser checks confirmed the CFB eight-tab layout, populated coverage outcomes and ranks, NFL nine-tab layout, populated NFL DVOA values and ranks, no console errors, and no horizontal overflow at desktop and phone widths.
- Full public-site runtime diagnostic: 209 checks passed. CFB coverage assertions require both matchup directions, all nine outcome/workload columns, and FBS rank provenance; NFL DVOA assertions require all four public metrics for both teams plus source, week, and league-rank provenance.
