# MLB matchup depth for the postseason (2026-09-28)

Stamp `20260928d`. Branch `mlb/playoff-matchup-depth`.

## What the MLB matchup page gained

| Section | What it shows | Graded against |
|---|---|---|
| **Lineup Versus Pitch Mix** (`#pitch-matchup`, new) | Every hitter in the order × each pitch the opposing starter throws at 5%+ (max 5). A switch reads the grid as xwOBA, Whiff% or Hard-Hit%. Last column: career line vs that starter (H-AB · HR · BB · K). With no order posted, the active roster's position players by PA. | Percentile among hitters who have seen that pitch type (20+ PA), facing the hitter: a low whiff rate places high. |
| **Season Series** (`#series`, new) | Postseason series, game number and standing (`seriesStatus`), then every regular-season meeting as W/L squares with runs. | Counts and results only. |
| **Bullpen → Active Pen** (extended) | Late & Close and With RISP rows added. FIP replaces ERA in the table because the Stats API publishes no earned runs on hand or situation splits. Season ERA sits, graded, on the sample line. | Place among the 30 pens as rostered now, on the same split. |
| **Bullpen → Relief Arms** (new) | Every active reliever: role, throws, G, IP, ERA, FIP, WHIP, K%, BB%, OPS vs L / vs R, Late & Close OPS, RISP OPS. | Percentile among qualified relievers (10+ G; 20+ BF on a split). |
| **Bullpen → Bullpen Mix** (new) | The active pen's combined arsenal: usage, count, number of arms throwing it (5%+ of their own mix), RV/100, and the opposing club's xwOBA / contact vs that pitch. | RV/100 placed among the 30 pens for that pitch type, or among the pitch family when too few pens throw it. |

Nothing added here is a verdict: no gap summaries and no "favours" labels
(see the evidence-not-verdicts rule). Empty cells say what is missing: "No PA",
"No Swings", "No BIP", "0 BF", "Few Seen". They never show a dash.

## Data

- `scrapers/scrape_matchup_depth.py` writes `data/batter_pitch_types.csv`
  (Savant pitch-arsenal leaderboard, **batter** side) and
  `data/reliever_splits.csv`. The second file holds the Stats API season line plus
  the h/a/vl/vr/lc/risp statSplits for every pitcher, keyed to his *current*
  club, with position players excluded.
- `scripts/publish_public_matchup_depth.py` writes
  `data/public/batter_pitch_types.json` (compact, about 1 MB raw / 120 KB gzip)
  and `data/public/bullpen_board.json`. The board holds sorted pools only, with
  no player lines, and the season FIP constant.
- Both run in Step 20b of `pipeline/main.py` (non-fatal). Both files are in the
  `run-pipeline.yml` publish list. A short pull keeps the previous CSV and file.
- Live per game (client): active-roster relief lines on 6 splits,
  `vsPlayerTotal` for each order vs the opposing starter, and the schedule
  (`opponentId`, `seriesStatus`).

Regular-season lines are frozen once October starts, so a daily publish of the
pools is exact for the whole postseason.

## Fixed on the way

The published slate names a hitter `person_id` / `name`. The page read `pl.id` /
`pl.fullName`, so **Lineup Versus Starter was blank on the live site** (empty
names, a dash in every cell). All readers now go through `lineupId()` /
`lineupName()`, and `test_mlb_lineups_read_the_published_person_id` pins it.

## Verification

- Runtime diag against a local server: 187 pass. The only failures are the 3 CFB
  checks that fail identically on `origin/master` locally (182 pass there).
  The CFB `.ca-script-lens-grid` locator also crashes the diag before it prints,
  on master too. New MLB checks: 9 sections, 12 unit rows, reliever and bullpen-mix
  tables for both clubs, 6 pitch-matchup tables, and no dash or unpilled cells
  in the depth tables.
- Rendered a Wild Card game (BOS @ NYY, gamePk 849851) through a local test slate:
  series status, the roster fallback and the career lines all render. No console
  errors, no overflow at 1440 or 390.
- `pytest tests` (excluding the 3 known gspread collection errors): 217 passed.
