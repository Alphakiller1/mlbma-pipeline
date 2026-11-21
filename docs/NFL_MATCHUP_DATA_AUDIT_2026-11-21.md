# NFL matchup data audit — November 21, 2026

The Week 11 audit compared all 13 fixtures and 26 club records with ESPN's
current scoreboard, checked the displayed players against current club rosters
and completed-game box scores, and checked the published team-form rates and
ranks against the source board. The official NFL injury report exposed newer
Monday designations than the previously published slate.

NFL matchup cards now check the fixture-specific injury endpoint when opened,
every minute while visible, and when the tab regains focus. Their quarterback
selection and availability summaries use the same report application policy as
the full matchup analysis. Changed reports repaint without closing expanded
cards or resetting search filters. A failed check retains the previous evidence;
an official report cannot be replaced with a secondary report during an outage.
Collapsed cards summarize the reports they actually contain instead of showing
an incorrect pending message. Report check times update without repainting cards.

An official report that clears every listed player remains authoritative even
when it contains no Out, Doubtful or Questionable designations. An older ESPN
game designation cannot restore a cleared player's injury. Verified game-day
inactives and durable roster updates are still incorporated.

Completed fixtures retain their game-specific participation evidence; current
roster changes do not erase a player's verified historical appearance. Coverage
and statistical panels continue to show their own observed season windows.

The sources update on their own schedules. A report check is a retrieval time,
not confirmation of a final inactive list before it is published.
