# NFL Matchup Visual Matrix Audit

Date: 2026-09-23  
Surface: `/nfl/matchup`  
Scope: information architecture, visual hierarchy, bettor/fantasy usability, responsive behavior, accessibility, and metric integrity.

## Audit summary

The former page had valuable EPA, pressure, coverage, personnel, and success-rate evidence, but its most useful matchup signals were buried below large lineup and scheme blocks. Standard team and player production was not presented beside the advanced evidence, so a reader had to translate the page mentally before using it for game, prop, or fantasy research. At phone widths, the hero could overlap or clip the kickoff and team identities.

The revised page starts with a decision-oriented matchup board, then progressively discloses scheme detail, player research, availability, team shape, and context. Every directional matchup cell compares the relevant offense with the opposing defense and labels the result as a matchup indicator, not as a betting recommendation.

A third structural pass replaces the stacked mini-reports with two filterable workspaces. Team evidence now switches between Overview, Passing, Rushing, and DVOA; player evidence filters by team, position, and stat family. Only one evidence family is expanded at a time, so standard production and advanced splits share one visual grammar without becoming one long table.

## Visual and audience matrix

| Dimension | Previous state | Revised state | Acceptance check |
| --- | --- | --- | --- |
| Information hierarchy | Lineups and deep scheme data preceded the matchup read | Matchup Breakdown is first; scheme, players, availability, team shape, and context follow | First viewport provides game identity and a clear route to the three research modes |
| Professional bettor workflow | EPA data existed but required scanning multiple dense tables | Directional offense-vs-defense board covers EPA/play, first-down rate, explosive rate, sack rate, and turnover rate with league ranks | Both teams are evaluated against the correct opposing unit; no model edge or recommendation is implied |
| Game-script interpretation | Readers had to infer how a rate affects possessions and opportunity | Overview labels the competitive lever; Passing and Rushing pair each offense directly with the defense it faces | Interpretive copy is descriptive; it never becomes a pick, forecast, or projected player outcome |
| Player-prop workflow | Player scheme panels were nested deep inside team scheme sections | Player Stat Lab combines a team switch with QB/RB/WR/TE and passing/rushing/receiving/fantasy/split filters | One filter combination produces one focused workload board |
| Fantasy workflow | No fast player-volume comparison | Position-aware cards use per-game and season totals; the family filter removes irrelevant fields | Cards are readable without betting terminology and do not introduce projections |
| Fan readability | Advanced labels lacked a strong reading order | Shared pill controls keep one stat family visible; standard production and advanced duels reuse the same team-versus-team axis | A non-specialist can distinguish observed production from rate-based context |
| Advanced metric integrity | EPA was available; DVOA was absent | Pass/rush EPA, success rate, pressure, blitz and stacked-box response are first-class views; DVOA has a dedicated licensed-feed state | No synthetic, renamed, or model-derived DVOA value is shown |
| Color semantics | Matchup winners and rank grades could both appear green, while some graded numbers stayed white | Every league-ranked value uses the same five-band green-to-red ramp; the matchup-relative edge is a narrow marker and label rather than a competing fill | Low-is-good defensive metrics are normalized before coloring; each value also prints its league rank |
| Data provenance | Standard volume statistics were not part of the public game contract | Current-season observed team and starter statistics are ingested from nflverse and pass through the public allowlist | Only observed statistics are published; projections and private model fields remain blocked |
| Empty states | Missing player splits created large low-value regions | Deep split panels render only when evidence exists; standard observed stats remain useful independently | Missing feeds are disclosed without blank charts or fabricated fallbacks |
| Mobile layout | Kickoff and team identities could overlap; right-side content could clip | Kickoff becomes a full-width first row and teams sit in a two-column row; facts collapse to one column | No document-level horizontal overflow at 360, 375, or 390 CSS pixels |
| Accessibility | Dense content and small controls increased interaction cost | Research-path links and tabs have 44px targets, visible focus states, semantic labels, and reduced-motion support | Keyboard focus is visible and controls remain operable at all audited widths |

## Metric interpretation rules

- EPA/play, success rate, explosive rate, sack rate, turnover rate, personnel, pressure, and coverage are contextual evidence. They are not picks or guarantees.
- Directional rows pair an offense with the opponent's defense. Defensive EPA is interpreted with lower values as better; offensive EPA is interpreted with higher values as better.
- Grade colors always mean league standing: elite, strong, league average, weak, or poor. They never mean team identity or a betting recommendation. Matchup-relative strength is labeled separately.
- Standard yards, touchdowns, attempts, carries, targets, receptions, first downs, interceptions, sacks, and PPR fantasy points are observed current-season totals or per-game calculations.
- DVOA is a proprietary opponent- and situation-adjusted FTN metric. This repository has no licensed DVOA feed, so the UI explains the metric and displays its feed status instead of inventing a substitute.
- League ranks are based on the full 32-team comparison artifact, not just the two teams in the selected game.

## Responsive matrix

| Width | Target | Required result |
| --- | --- | --- |
| 1440px | Desktop research workstation | Two-team comparison grids, persistent section navigation, dense evidence without clipping |
| 1024px | Small laptop/tablet landscape | Major comparisons remain side by side where legible; navigation wraps or scrolls within its own region |
| 768px | Tablet portrait | Cards reduce columns cleanly and preserve reading order |
| 390px | Large phone | Hero, research paths, team panels, and player cards stack without page overflow |
| 375px | Common phone | 44px controls, readable abbreviations, no clipped team identity |
| 360px | Narrow phone | Single-column facts and cards, internal comparison regions remain contained |

## Release gate

- JavaScript syntax checks: passed for the shared game-detail renderer and public-slate loader.
- Focused sport-route tests: 38 passed.
- Public-field projection and restricted-field scan: passed across 10 published artifacts and 7 public routes.
- Design token and cache-stamp checks: passed at `20260926b`.
- Runtime browser audit: 164 checks passed at desktop, tablet, and phone widths with zero document overflow or page errors.
- Interaction audit: team-stat, scheme-direction, player-position, player-family, player-team, and lineup-unit controls changed the correct panels.
- Browser console: zero warnings or errors during the local matchup flow.
- Standard statistics and advanced statistics retain their provenance and interpretation labels.
- Production deployment is permitted only after this gate remains green on the release revision.
