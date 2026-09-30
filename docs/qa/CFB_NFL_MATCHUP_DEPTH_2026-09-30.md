# CFB and NFL matchup-depth update — 2026-09-30

## Scope

The CFB matchup desk now exposes the same evidence-first depth as the NFL desk across seven groups: Units, Passing, Rushing, Trenches, Situational, Special Teams, and Profile. The NFL desk adds a dedicated DVOA group.

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

## DVOA contract

DVOA is proprietary FTN data. The public UI does not calculate a lookalike or substitute a synthetic number.

- CFB displays an explicit licensed-feed status for offense, defense, and special teams DVOA.
- NFL accepts optional `away_dvoa` and `home_dvoa` objects from the public slate.
- Supported NFL fields are total, offense, defense, special teams, pass offense, rush offense, pass defense, and rush defense DVOA.
- Values are fractional percentages and may include `{value, rank, of}` plus source, season, and week provenance.
- Until a licensed FTN feed is connected, every field renders `Not Published` and `Licensed Feed Required` instead of a fabricated estimate.

## Verification

- CFB slate regenerated with 56 of 56 games carrying both team profiles.
- Public-field classification and restricted-field validation pass.
- JavaScript and Python syntax checks pass.
- Design token and cache-stamp checks pass at `20260930a`.
- Full automated suite: 251 tests and 8 subtests passed.
- Browser checks confirmed the CFB seven-tab layout, NFL nine-tab layout, DVOA feed states, rank pills, no console errors, and no horizontal overflow at desktop and phone widths.

The broader runtime diagnostic still reports legacy availability assertions for NFL scheme, player, and trench feeds on the current sampled game. Those checks are independent of this change; the new CFB and DVOA checks pass.
