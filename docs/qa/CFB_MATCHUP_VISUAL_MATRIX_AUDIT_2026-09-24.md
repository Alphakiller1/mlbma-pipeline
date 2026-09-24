# CFB Matchup Visual Matrix Audit

Date: 2026-09-24  
Surface: `/cfb/matchup`  
Scope: information architecture, game-script interpretation, responsive presentation, interaction behavior, accessibility, and current-slate completeness.

## Audit summary

The CFB page already paired each offense with the opposing defense and offered a broad FBS percentile comparison. The main usability problem was order: the page opened with an unexplained “largest gaps” summary, then presented two long unit boards without telling readers how the statistics connect to possessions, pace, play mix, or field position. Outcome statistics and rate statistics also lacked a compact interpretation guide.

The audit also found that the checked-in research slate was still on Week 3 while the public model board had moved to Week 4. That mismatch left current matchup pages without unit-rate data. The refreshed Week 4 artifact contains 58 games, and all 58 have both offensive and defensive profiles.

The revised page now starts with three explicit research paths, an offense-to-game-script-to-defense reading key, and the two directional matchup boards. A six-lens competitive-dynamics layer then connects the observed rates to scoring pressure, drive sustainability, explosive passing, run-game control, passing friction, and possession volatility. Largest percentile gaps and the metric glossary remain available through progressive disclosure.

## Visual and audience matrix

| Dimension | Previous state | Revised state | Acceptance check |
| --- | --- | --- | --- |
| Information hierarchy | Largest gaps appeared before the evidence that produced them | Research paths and reading key lead into both directional boards; interpretations and supporting detail follow | A reader can identify the producing offense, the game-script lever, and the opposing defense before reading a value |
| Game-script clarity | Users had to infer what a rate could change | Six lenses explain the possible effect on possessions, pace, play mix, field position, and opportunity | Copy remains conditional and never becomes a pick, forecast, or guarantee |
| Professional research | Broad rate coverage existed but the decision path was unclear | Offense-vs-defense boards remain primary; largest gaps are available after the full matchup | Each direction compares the correct offensive and defensive unit using one FBS pool |
| General fan readability | Outcome and rate statistics appeared together without interpretation | Expandable guide separates descriptive production, conversion rates, per-attempt measures, and disruption outcomes | Readers are warned that points/yards per game are context-dependent and small samples can move rapidly |
| Team identity | Stat comparison contained useful categories but was visually secondary and very long | Team Identity route goes directly to family tabs for scoring, passing, rushing, downs, and special teams | Selecting a family exposes one panel and preserves the same two-team comparison axis |
| Visual density | The largest-gaps board duplicated evidence above the full boards | Largest gaps are collapsed by default; all evidence remains available | The primary flow is shorter without deleting any public evidence |
| Current data | Week 3 profiles did not match the Week 4 public board | Week 4 slate refreshed from the model board and ESPN team-stat source | 58/58 current games have both team profiles |
| Mobile navigation | Section tabs exposed a native horizontal scrollbar | Tabs remain horizontally scrollable but the scrollbar is visually hidden | Swipe/keyboard navigation remains available with no document-level overflow |
| Responsive dynamics | No dedicated game-script layer | Six cards use three columns on desktop, two on tablet, and one on phone | One-column layout verified at 390px; no horizontal overflow |

## Metric interpretation rules

- FBS ranks are calculated only among teams that published the selected statistic. Metric direction is normalized so 1st always represents the strongest result.
- Points and yards per game describe production; they are affected by pace, field position, opponent quality, and sample size. They are not treated as opponent-adjusted efficiency.
- Third- and fourth-down rates describe possession-leverage conversions, not every snap.
- Passing yards per attempt is used as a field-position and chunk-production lens. The page explicitly does not relabel it as an explosive-play rate.
- Sacks and interceptions are per-game observed outcomes. They communicate passing friction and possession volatility, not a prediction that either event will happen in the selected game.
- Every directional comparison places the offense on the left and the defense it will actually face on the right.

## Responsive matrix

| Width | Target | Required result |
| --- | --- | --- |
| 1440px | Desktop research workspace | Full matchup boards remain legible; dynamics use three columns |
| 1024px | Laptop/tablet landscape | Major evidence remains contained with no page overflow |
| 768px | Tablet portrait | Dynamics reduce to two columns and controls remain operable |
| 390px | Large phone | Reading key and dynamics stack to one column; section navigation scrolls without a visible scrollbar |
| 360px | Narrow phone | No document-level horizontal overflow; data mirrors remain internally contained |

## Release gate

- JavaScript and Python syntax checks: passed.
- Python tests: 189 passed.
- Public-field validation: passed across 10 published artifacts and 7 public routes.
- Public-boundary browser crawl: 46/46 passed.
- Full public runtime diagnostic: 140/140 passed, including new CFB detail, interaction, and phone-layout checks.
- Design token and cache-stamp checks: passed at `20260924b`.
- Manual browser inspection: passed at 1440px and 390px.
- CFB interactions: family tabs select exactly one panel; the metric guide expands; largest gaps remain collapsed by default.
- Browser console: zero warnings or errors during the CFB matchup flow.
- Current CFB slate: 58 games, 58 with both directional unit profiles.
