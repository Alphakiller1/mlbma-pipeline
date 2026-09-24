# NFL Matchup Visual Matrix Audit

Date: 2026-09-23  
Surface: `/nfl/matchup`  
Scope: information architecture, visual hierarchy, bettor/fantasy usability, responsive behavior, accessibility, and metric integrity.

## Audit summary

The former page had valuable EPA, pressure, coverage, personnel, and success-rate evidence, but its most useful matchup signals were buried below large lineup and scheme blocks. Standard team and player production was not presented beside the advanced evidence, so a reader had to translate the page mentally before using it for game, prop, or fantasy research. At phone widths, the hero could overlap or clip the kickoff and team identities.

The revised page starts with a decision-oriented matchup board, then progressively discloses scheme detail, player research, availability, team shape, and context. Every directional matchup cell compares the relevant offense with the opposing defense and labels the result as a matchup indicator, not as a betting recommendation.

A second structural pass added an explicit reading key and a five-lens competitive-dynamics layer. It translates the matchup evidence into the parts of game script it can influence—scoring efficiency, drive length, explosive volatility, passing friction, and possession swings—while preserving a clear boundary between observed evidence and prediction.

## Visual and audience matrix

| Dimension | Previous state | Revised state | Acceptance check |
| --- | --- | --- | --- |
| Information hierarchy | Lineups and deep scheme data preceded the matchup read | Matchup Breakdown is first; scheme, players, availability, team shape, and context follow | First viewport provides game identity and a clear route to the three research modes |
| Professional bettor workflow | EPA data existed but required scanning multiple dense tables | Directional offense-vs-defense board covers EPA/play, first-down rate, explosive rate, sack rate, and turnover rate with league ranks | Both teams are evaluated against the correct opposing unit; no model edge or recommendation is implied |
| Game-script interpretation | Readers had to infer how a rate affects possessions and opportunity | Each row names its game-script lever and a dedicated dynamics layer explains how both directional matchups affect efficiency, drives, volatility, pressure, and possession count | Interpretive copy is conditional and descriptive; it never becomes a pick, forecast, or projected player outcome |
| Player-prop workflow | Player scheme panels were nested deep inside team scheme sections | Dedicated Props & Fantasy section combines observed workload/production with optional coverage and pressure splits | Targets, receptions, receiving/rushing/passing volume, TDs, efficiency, and PPR production appear when observed data exists |
| Fantasy workflow | No fast player-volume comparison | Position-aware cards use per-game and season totals for QB, RB, WR, and TE | Cards are readable without betting terminology and do not introduce projections |
| Fan readability | Advanced labels lacked a strong reading order | Standard production panels sit beside the advanced matchup board; metric guide explains EPA, success rate, DVOA, and ranks | A non-specialist can distinguish observed production from rate-based context |
| Advanced metric integrity | EPA was available; DVOA was absent | EPA and success-rate evidence remain; DVOA is explicitly marked unavailable unless a licensed feed is supplied | No synthetic, renamed, or model-derived DVOA value is shown |
| Data provenance | Standard volume statistics were not part of the public game contract | Current-season observed team and starter statistics are ingested from nflverse and pass through the public allowlist | Only observed statistics are published; projections and private model fields remain blocked |
| Empty states | Missing player splits created large low-value regions | Deep split panels render only when evidence exists; standard observed stats remain useful independently | Missing feeds are disclosed without blank charts or fabricated fallbacks |
| Mobile layout | Kickoff and team identities could overlap; right-side content could clip | Kickoff becomes a full-width first row and teams sit in a two-column row; facts collapse to one column | No document-level horizontal overflow at 360, 375, or 390 CSS pixels |
| Accessibility | Dense content and small controls increased interaction cost | Research-path links and tabs have 44px targets, visible focus states, semantic labels, and reduced-motion support | Keyboard focus is visible and controls remain operable at all audited widths |

## Metric interpretation rules

- EPA/play, success rate, explosive rate, sack rate, turnover rate, personnel, pressure, and coverage are contextual evidence. They are not picks or guarantees.
- Directional rows pair an offense with the opponent's defense. Defensive EPA is interpreted with lower values as better; offensive EPA is interpreted with higher values as better.
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
- Python tests: 188 passed.
- Public-field projection and restricted-field scan: passed across 10 published artifacts and 7 public routes.
- Design token and cache-stamp checks: passed at `20260923a`.
- Responsive audit: passed at 1440, 1024, 768, 390, 375, and 360 pixels with zero document overflow, undersized visible controls, or page errors.
- Interaction audit: scheme-direction and lineup-unit tabs changed their selected panels correctly.
- Browser console: zero warnings or errors during the local matchup flow.
- Standard statistics and advanced statistics retain their provenance and interpretation labels.
- No production deployment is part of this audit branch.
