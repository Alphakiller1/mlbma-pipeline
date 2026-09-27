# NFL matchup: the MLB table language (2026-09-26)

The NFL matchup detail page (`/nfl/matchup.html`) is built from the same three
components as the MLB matchup page. Before this change, the section had been
rebuilt nine times in three days, and testers reported that the information
was good but hard to digest. The owner chose the MLB page's Probable Starters,
Club Batting Splits and Pitch Mix blocks as the design for NFL.

Supersedes the layout described in `NFL_MATCHUP_VISUAL_MATRIX_AUDIT_2026-09-23.md`.

## Components

| MLB component | Classes | NFL sections |
|---|---|---|
| Probable Starters | `.ca-starter-panel`, `.ca-stat-row`, `.ca-last-start`, `.ca-split-block` + `.ca-split-table` | Quarterbacks, Running Backs |
| Club Batting Splits | `.ca-form-panel` + `.ca-split-table` | Unit Matchups, Trenches, Pass Catchers |
| Pitch Mix | `.ca-arsenal-panel` + `.ca-arsenal-table`, `usageSquares`, `rankBadge` | Coverage Shells, Defensive Looks, Offensive Tendencies, Run Direction, Target Distribution |

Every section is an away | home `.ca-detail-duo`. Renderers live between
`nflLeaguePool` and `nflSections` in `dashboard/public_game_detail.js`.

## Page order

1. **Unit Matchups.** One panel per possession. The offense's row sits directly
   above the row of the defense it meets, in the same columns: team form, then
   charted pass/run EPA, then offensive production per game.
2. **Quarterbacks.** Season tiles, the season line, and one split table per
   season. The last column shows how often *this week's opponent* shows each
   look.
3. **Coverage Shells.** Each defense's shells, most-played first. Columns are
   EPA allowed with a rank chip, then the other offense's EPA against that
   shell with a rank chip.
4. **Defensive Looks.** Man, zone, blitz, pressure, play action and stacked box,
   in the same shape as Coverage Shells.
5. **Running Backs.** Same panel as the quarterbacks.
6. **Trenches.** One panel per possession: the offense's line above the front
   it meets, then Run Direction (the back's lanes against what the front has
   allowed in each).
7. **Pass Catchers.** Per-game volume, then Target Distribution (the offense's
   share by position beside what the other defense allows).
8. **Offensive Tendencies.** Personnel, formation and play type, beside how
   often the other defense has faced the same.
9. Lineups and Availability, Radar, and Rest/Travel are unchanged.

## Rules the gates enforce

`tests/test_sport_routes.py` and `scripts/public_site_runtime_diag.py` check
all of these:

- **Evidence, never verdicts.** No "largest gaps" summaries, winner labels,
  `is-off`/`is-def` leads, or rows sorted by gap. Rows are ordered by a fixed
  list, or by the club's own usage. Finding the gap is the reader's job. This
  is owner direction.
- **Tendency is not performance.** Usage and frequency are never tier-coloured.
  Offensive Tendencies carries no grade at all.
- **Show the sample.** A split under its floor (30 dropbacks, 15 carries) is
  printed with a Low n tag and never graded. Run Direction prints the carry
  count beside every YPC.
- **Real ranks.** Situational EPA is ranked among the clubs on the slate
  (`nflPool`, at least 20 clubs). Below that, it falls back to the published
  league mean and spread (`responseEntry`).
- **One number per idea.** Middle-field closed/open, which duplicate
  single-high/two-high, are not shown. A split that holds every snap (a back's
  "No Blitz") is dropped. Sack rate appears once, in Unit Matchups. The line
  stats publish a second sack rate from another source, so Trenches leaves it out.
- **Thin samples are tagged, not just grey.** Every ungraded number on the desk
  is already secondary grey, so a row under its floor carries a "Low n" tag.
  A Run Direction count under 15 carries is underlined with a dotted line.
- **Looks come in families.** QB rows are grouped Coverage / Pass Rush / Box /
  Shells, and RB rows Box / Personnel Faced / Direction / Point Of Attack, using
  `tr.ca-split-group` rows. Only the QB table carries the opponent's "Show"
  column; the run game has no matching published rates.

## Extending it

Add a row to a spec array (`NFL_SHELLS`, `NFL_LOOKS`, `NFL_TENDENCIES`,
`NFL_TRENCH_COLS`, `NFL_LANES`, `NFL_BACK`) rather than adding a new component.
If the NFL data needs something none of the three components can show, build
it from the same classes, and add a runtime-diag check for it.

Widths. NFL pairs (`.ca-nfl-duo`) tighten their cell padding at 1400px and
below, and stack to one column below 1340px, so no table has to scroll between
768px and 1440px. On phones (560px and below), the mix tables drop the usage
squares and keep the percentage, so the matchup columns stay on screen. The
seven-column QB table scrolls inside its panel, as the MLB tables do.

The section nav is a single row on every sport (`grid-auto-flow: column`). It
used to be a fixed six-track grid, which wrapped MLB's nine anchors onto a second
sticky row. The NFL nav groups its anchors: Units, Passing, Rushing, Receiving,
Tendencies, Lineups, Radar, Context.
