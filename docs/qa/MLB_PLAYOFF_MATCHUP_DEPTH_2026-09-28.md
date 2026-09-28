# MLB matchup depth for the postseason (2026-09-28)

Stamp `20260928g`. Branch `mlb/playoff-matchup-depth`.

## What the MLB matchup page gained

| Section | What it shows | Graded against |
|---|---|---|
| **Lineup Versus Pitch Mix** (`#pitch-matchup`, new) | Every hitter in the order × each pitch the opposing starter throws at 5%+ (max 5). A switch reads the grid as xwOBA, Whiff% or Hard-Hit%. Last column: career line vs that starter (H-AB · HR · BB · K). With no order posted, the active roster's position players by PA. | Percentile among hitters who have seen that pitch type (20+ PA), facing the hitter: a low whiff rate places high. |
| **Season Series** (`#series`, new) | Postseason series, game number and standing (`seriesStatus`), then every regular-season meeting as W/L squares with runs. | Counts and results only. |
| **Bullpen → Active Pen** (extended) | Late & Close and With RISP rows added. FIP replaces ERA in the table because the Stats API publishes no earned runs on hand or situation splits. Season ERA sits, graded, on the sample line. | Place among the 30 pens as rostered now, on the same split. |
| **Bullpen → Relief Arms** (new) | Every active reliever: role, throws, G, IP, ERA, FIP, WHIP, K%, BB%, OPS vs L / vs R, Late & Close OPS, RISP OPS. | Percentile among qualified relievers (10+ G; 20+ BF on a split). |

Nothing added here is a verdict: no gap summaries and no "favours" labels
(see the evidence-not-verdicts rule). Empty cells say what is missing: "No PA",
"No Swings", "No BIP", "0 BF", "Few Seen". They never show a dash.

## Added in the second pass (same day)

| Section | What it shows | Graded against |
|---|---|---|
| **Batter Versus Pitcher** (`#bvp`, new) | Every hitter who has faced tonight's starter: PA, H, 2B, HR, BB, K, AVG/OBP/SLG/OPS, a postseason line, and the seasons met. A Career / By Season switch opens each season's row. Hitters who never faced him are listed on one line, not as empty rows. One request per lineup: `vsPlayer` with `gameType=[R,F,D,L,W]`, summed client-side from the counts. | League batters on the season split (`bat_season_*`), with the sampling noise of the hitter's own PA added to the league spread. An 0-for-3 grades about the 17th percentile, not the 0th. |
| **Club Batting Splits** (extended) | Adds With RISP, RISP with 2 outs, and Late & Close rows. | New `tm_risp_*`, `tm_risp2_*` and `tm_lc_*` baselines over the 30 clubs. `scrape_league_hitting_splits` and `compute_baselines` now pull these splits every run. |
| **Offensive Index** (under Club Batting Splits, new) | OSI / ABQ / RCV / OBR for the Season (team_context), Vs RHP and Vs LHP, with the hand the club faces tonight marked. | Rank among the 30 clubs. |

`team_index_splits.json` comes from `team_profiles.csv`, written by `core.compute_team_profile`. That step needs
the FanGraphs metrics, which only the local (Selenium) pipeline scrapes, so **CI keeps the committed file**.
Home / Away and L30 / L14 / L7 publish only when their source (`batter_splits_*.csv`) is under 3 days old.
Those files were last scraped 2026-09-08, so today only the hand splits are published (FanGraphs data through Sept 26).
A local `run_pipeline.bat` refreshes them all.

## Third pass (owner direction, same day)

- **Rank numbers:** in MLB they print only on team stats and pitch-mix stats: the starter Pitch Mix, Lineup Versus Pitch Mix, and every club table. Batter Versus Pitcher and Relief Arms are graded by colour alone. The runtime diag enforces both halves.
- **Bullpen Mix removed** (renderer, publisher pools, tests).
- **Starters only:** with no posted order, Lineup Versus Pitch Mix and Batter Versus Pitcher show the likely starting nine. That is the active-roster position players with the most starts in the club's last 10 box scores (a battingOrder slot that is a multiple of 100), in their usual spot. No bench players.
- **Aligned tables:** the pitch-grid, BvP and reliever tables use fixed layout with set tracks, so the away and home tables line up column for column. The last column takes the slack, so a four-pitch and a five-pitch starter still align.
- **Offensive Form filters:** Season, Vs Righties, Vs Lefties, At Home, On The Road, Vs Starters, Vs Bullpens. Each split view is the same mirror, fed by one Stats API request for all 30 clubs' split lines. AVG, OBP, SLG, OPS, ISO, K%, BB% and HR% are ranked on that split, and OSI/ABQ/RCV/OBR are added where team_index_splits carries the split.
- **Runs Versus Starter Hand** (`#runs-hand`, new): each club's runs scored and allowed per game when a RHP or LHP started against it. There is a window toggle (YTD / L30 / L14 / L7, the club's last N games, as in the team-context sparkline) and a venue toggle (All / At Home / On The Road). Each rate is ranked among the clubs with a game in that same cell, and tonight's opposing hand is flagged. Source: `scrape_team_game_starters` reads the pitcher who actually started from each box score (the schedule's probable was wrong on about 1 side in 80 sampled), the regular season plus the postseason, into `team_game_starters.csv`. The publisher writes `team_runs_by_hand.json`.
- **Season Series head-to-head:** each club's record and runs per game against the other, overall and at each park.

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
