# MLBMA Responsive Migration Plan

## Goal

Make the deployed dashboard adapt seamlessly for desktop, tablet, and mobile users without separate platform modes, duplicate page logic, or page-specific layout drift.

This plan is intentionally phased. The current dashboard already has responsive behavior, but it is fragmented across shared CSS, page CSS, inline page styles, and a few JS-driven mobile fallbacks. The work here is to replace that fragmented behavior with one enforced responsive system.

## Constraints

- Preserve existing dashboard information architecture.
- Do not move, remove, merge, split, or reorder dashboard sections.
- Prefer CSS-driven layout switching.
- Use JS only when the render shape must materially differ, such as table-to-card fallback.
- Roll out in phases so regressions are isolated and easy to trace.

## Current State Audit

### Shared responsive primitives already present

- `dashboard/chase_nav.css`
  - Owns the mobile navigation breakpoint at `768px`.
- `dashboard/chase_nav.js`
  - Owns mobile menu behavior and header status rendering.
- `dashboard/mlbma_ui.css`
  - Contains shared smaller-screen layout adjustments.
- `dashboard/mlbma_design_system.css`
  - Contains some shared responsive styling, but not a complete viewport contract.
- `dashboard/matchup_shared.js`
  - Already has shared sheet-fetch behavior and slate-tab handling, but not viewport state ownership.

### Highest responsive complexity by file

Responsive references found in dashboard files:

- `dashboard/chase_analytics_mlb_oem_v7.html`: 28
- `dashboard/team_profile.css`: 18
- `dashboard/research_lab.css`: 17
- `dashboard/landing_dashboard.css`: 7
- `dashboard/matchup_compare.css`: 3
- `dashboard/lineup_view.js`: 3
- `dashboard/player_profile_pages.css`: 3
- `dashboard/pitcher_profile.css`: 2
- `dashboard/profile_shell.css`: 2
- `dashboard/mlbma_ui.css`: 2
- `dashboard/batter_profile.html`: 2
- `dashboard/chase_nav.css`: 2
- `dashboard/team_rankings.html`: 2

### Current breakpoint fragmentation

The current dashboard uses multiple breakpoint values depending on page or component:

- `460px`
- `480px`
- `520px`
- `560px`
- `640px`
- `700px`
- `720px`
- `760px`
- `768px`
- `820px`
- `900px`
- `1024px`
- `1040px`
- `1100px`

This is the main source of inconsistency. Different surfaces collapse at different widths, so desktop/tablet/mobile behavior is not predictable across the product.

### High-risk surfaces

#### 1. Opening dashboard

Primary files:

- `dashboard/chase_analytics_mlb_oem_v7.html`
- `dashboard/landing_dashboard.css`
- `dashboard/platform_dashboard.js`
- `dashboard/research_lab.css`

Risk factors:

- Large amount of inline responsive CSS.
- Custom mobile card fallback for leaderboard/table views.
- Dense hero and multi-panel sections.
- Resize-driven rerender behavior.

#### 2. Team Rankings

Primary files:

- `dashboard/team_rankings.html`
- `dashboard/lineup_view.js`

Risk factors:

- Inline page styles.
- Expandable rows and table-heavy presentation.
- Its own local responsive rules, separate from the opening dashboard.

#### 3. Team Profile

Primary files:

- `dashboard/team_profile.html`
- `dashboard/team_profile.css`
- `dashboard/team_profile_sections.js`
- `dashboard/team_profile_mini.js`
- `dashboard/team_profile_lineup_ui.css`

Risk factors:

- Highest CSS complexity outside the opening dashboard.
- Many different breakpoint values.
- Dense profile boards, filters, mini dashboards, and lineup views.

#### 4. Profile pages

Primary files:

- `dashboard/pitcher_profile.html`
- `dashboard/pitcher_profile.css`
- `dashboard/batter_profile.html`
- `dashboard/player_profile_pages.css`
- `dashboard/profile_shell.css`
- `dashboard/bullpen_report.html`
- `dashboard/bullpen_report.css`

Risk factors:

- Shared shell but page-specific layout behavior.
- Risk of inconsistent spacing, controls, and stacking if migrated independently.

## Target Responsive Contract

### Breakpoint tiers

Adopt one shared viewport contract for the entire dashboard:

- `mobile`: `0-767px`
- `tablet`: `768-1099px`
- `desktop`: `1100px+`

Optional micro-breakpoint for dense cards only:

- `mobile-compact`: `0-479px`

This contract should replace page-local breakpoint guessing over time.

### What changes at each tier

#### Mobile

- Single-column reading flow where possible.
- No horizontal page overflow.
- Dense tables must switch to a sanctioned card/list fallback.
- Sticky or floating controls must not cover content.
- Nav uses mobile drawer.
- Touch targets must remain comfortable.

#### Tablet

- Two-column grids where density supports it.
- Tables can remain tables if readable without clipping.
- Expanded comparison panels may stack selectively.
- Nav remains in compact mode only if space is constrained.

#### Desktop

- Existing dense command-center presentation remains primary.
- Multi-column panels and wide tables stay intact.
- No mobile-only card rendering unless explicitly needed.

## Architecture Plan

### 1. Shared CSS breakpoint ownership

Create one shared responsive layer, likely in a shared stylesheet such as:

- `dashboard/mlbma_design_system.css`
- or a new `dashboard/responsive.css`

This layer should own:

- breakpoint tokens
- layout utility classes
- shared responsive spacing
- shared table fallback visibility rules
- shared shell width behavior

### 2. Shared viewport JS helper

Add one small helper, for example:

- `dashboard/platform_viewport.js`

Responsibilities:

- expose `isMobile`, `isTablet`, `isDesktop`
- expose current breakpoint name
- centralize `matchMedia` listeners
- provide a tiny event/subscription API for components that truly need rerender behavior

Rule:

- CSS changes layout
- viewport JS changes behavior only when CSS is insufficient

### 3. Standardized responsive patterns

Each component family must use one approved responsive pattern.

#### Tables

- Desktop/tablet: normal table where readable
- Mobile: switch to shared card/list renderer

#### Hero boards

- Desktop: split hero / signal board layout
- Tablet: reduce columns
- Mobile: stack content, preserve order, keep key signal above the fold

#### Multi-panel comparisons

- Desktop: side-by-side
- Tablet: selective stack
- Mobile: full stack

#### Control bars and filters

- Desktop: inline rows
- Tablet/mobile: wrapped groups with stable ordering
- Never hide critical filters behind ad hoc collapses

## Migration Phases

### Phase 0. Audit and contract

Deliverables:

- this plan
- responsive breakpoint map
- list of high-risk files
- shared acceptance criteria

Exit criteria:

- breakpoint contract approved
- rollout order approved

### Phase 1. Shared foundations

Scope:

- add shared breakpoint/tokens layer
- add shared viewport helper
- add shared responsive test checklist

Files likely touched:

- `dashboard/mlbma_design_system.css`
- `dashboard/chase_nav.css`
- `dashboard/chase_nav.js`
- new `dashboard/platform_viewport.js`

Exit criteria:

- no page behavior regressions
- nav and shell still work on current breakpoints
- shared utilities are ready for adoption

### Phase 2. Opening dashboard migration

Scope:

- refactor opening dashboard responsive behavior to use shared contract
- remove page-local breakpoint drift where possible
- standardize mobile fallback for leaderboard/table surfaces

Files likely touched:

- `dashboard/chase_analytics_mlb_oem_v7.html`
- `dashboard/landing_dashboard.css`
- `dashboard/platform_dashboard.js`
- `dashboard/research_lab.css`

Exit criteria:

- opening dashboard passes all viewport checks
- no duplicated mobile/desktop logic remains without explicit reason

### Phase 3. Team Rankings migration

Scope:

- move Team Rankings to shared breakpoints
- standardize expandable row behavior and table/card fallback

Files likely touched:

- `dashboard/team_rankings.html`
- `dashboard/lineup_view.js`

Exit criteria:

- Team Rankings matches opening dashboard behavior at the same widths

### Phase 4. Team Profile migration

Scope:

- normalize breakpoints in `team_profile.css`
- standardize profile board stacking, filters, and mini dashboards

Files likely touched:

- `dashboard/team_profile.html`
- `dashboard/team_profile.css`
- `dashboard/team_profile_sections.js`
- `dashboard/team_profile_mini.js`
- `dashboard/team_profile_lineup_ui.css`

Exit criteria:

- team profile no longer uses drifting breakpoint logic
- no clipped cards, filters, or stat boards

### Phase 5. Remaining profile pages and secondary surfaces

Scope:

- pitcher profile
- batter profile
- bullpen report
- glossary
- matchup compare
- supporting shells

Files likely touched:

- `dashboard/pitcher_profile.html`
- `dashboard/pitcher_profile.css`
- `dashboard/batter_profile.html`
- `dashboard/bullpen_report.html`
- `dashboard/bullpen_report.css`
- `dashboard/player_profile_pages.css`
- `dashboard/profile_shell.css`
- `dashboard/matchup_compare.css`
- `dashboard/matchup_compare.html`

Exit criteria:

- all dashboard surfaces align with the shared responsive contract

## QA Matrix

Every migrated page must be checked at these widths:

- `390px`
- `768px`
- `1024px`
- `1440px`

Optional additional checks:

- `480px`
- `1280px`

### Required checks at each width

- no horizontal overflow
- no clipped tables or charts
- no overlapping cards
- no hidden primary controls
- no duplicate data rendered in two modes
- no sticky header or filter collision
- no broken mobile navigation
- no console errors
- no resize-triggered rerender bugs

### Data integrity checks

- same teams, values, and sections visible across viewport modes
- only the presentation changes
- no metric meaning changes by viewport
- no missing matchup or profile data on mobile fallback views

## Risk Register

### Risk: page-local inline CSS overrides shared system

Mitigation:

- migrate high-traffic pages first
- shrink inline breakpoint usage as each page is converted

### Risk: JS resize logic fights CSS layout

Mitigation:

- centralize viewport state in one helper
- remove ad hoc resize listeners where possible

### Risk: mobile fallbacks duplicate logic and drift from desktop tables

Mitigation:

- create one canonical table-to-card pattern
- derive both views from the same source data

### Risk: hidden regressions on tablet widths

Mitigation:

- make tablet a first-class breakpoint
- explicitly test `768px` and `1024px`

## Implementation Rules

- No separate mobile site.
- No user-facing PC/mobile mode toggle.
- No page-specific breakpoint inventions unless there is a documented exception.
- No shipping a page before it passes the viewport matrix.
- No data relocation to make mobile easier.

## Recommended Immediate Next Step

Phase 1 should begin with a breakpoint inventory refactor:

1. define shared breakpoint names and values
2. add shared CSS tokens/utilities
3. add shared viewport helper
4. convert nav and page shell behavior to the shared contract

Only after that should the opening dashboard be migrated.
