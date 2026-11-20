# Model Center prop-line comparisons

The prop table shows the projection and central 80% range, the posted sportsbook
threshold, and projection minus line. Above/below describes the numerical gap;
it is not a qualified betting edge. Model over/under estimates use that actual
threshold. Integer count thresholds retain a separate push probability.

Published NFL `player_prop_comparisons` attach by player ID, club and opponent.
Legacy producer `lines` remain supported. Missing thresholds show **Not posted**
and have no invented half-point line, market marker or over/under percentage.

Opening an NFL or CFB matchup checks `/api/model-center/prop-lines` for current
DraftKings thresholds through ESPN. It refreshes each minute while the prop
view is visible, and on focus. Quotes load after the board, so they do not block
the initial slate. The provider cache is bounded to 60 seconds; roster identity
data is cached for an hour. The source is free and uses no paid Odds API credits.

The endpoint validates NFL clubs/season/week or CFB event/season, finds the exact
event, joins ESPN athlete IDs to the two club rosters, reads every prop page,
and deduplicates paired entries. CFB joins by ESPN athlete and club IDs.
For NFL, the client accepts a roster name only when it
identifies a unique projected player on the same club. Unidentifiable athletes
and conflicting same-time main lines are withheld. Closed events publish no
current pregame lines.

ESPN supplies thresholds without paired over/under prices. Those quotes retain
null prices. Supplied producer prices are displayed only when actually present.
Each line shows its source/check time; failed refreshes label retained data as
**Snapshot**, and leave projections available. A checked source can still lag
the sportsbook. Model forecasts keep their own publication cadence.

The shared row renderer also removes synthetic fallback thresholds for
NBA and MLB. Their published lines remain available; the new live quote
endpoint covers NFL and CFB. WNBA's separate quoted-market renderer remains
unchanged.

Run `node --test tests/model_prop_lines.test.mjs` for provider pagination,
identity, main-line selection, closed markets, quote failures, correct gap
arithmetic, missing-price handling and integer pushes. The unittest wrapper
includes these checks in the existing CI suite. Local browser checks cover
the real NFL prop modal, its direct game view and phone widths; existing CI
retains the full public boundary, runtime and responsive gates.
