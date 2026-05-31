# MLBMA Dashboard And Website Design Contract For Cursor

**Embedded in repo:** `design/MLBMA_CURSOR_DESIGN_CONTRACT.md`  
**Cursor rule:** `.cursor/rules/mlbma-design-contract.mdc` (always applied alongside brand rules)

Use this contract as the working source of truth for finishing the MLBMA dashboard project and public website. It combines the locked dashboard structure rules with the preferred premium infographic visual direction.

This document is written for Cursor. Before editing, Cursor must read the existing project files and adapt this contract to the actual codebase instead of inventing a parallel architecture.

---

## 1. Prime Directive

Finish MLBMA as a polished, production-ready baseball matchup intelligence product:

- The dashboard must feel like a premium broadcast/scouting desk: dense, editorial, credible, fast, and data-rich.
- The website must present MLBMA clearly as a serious baseball analytics product, not a generic SaaS landing page.
- Existing app behavior, routing, data contracts, dashboard section order, and functional components must be preserved unless a task explicitly asks for a functional change.
- Design work must be implemented through the existing codebase patterns, shared styles, components, tokens, and helpers.

The highest priority is a finished, coherent product. Visual polish matters, but never at the expense of broken data, changed information architecture, or hidden regressions.

---

## 2. Required Cursor Workflow

Cursor must follow this workflow for every implementation pass.

### 2.1 Read First

Before making changes, inspect:

- `package.json`
- routing/app entry files
- shared layout components
- global styles/theme files
- dashboard page files
- dashboard section components
- website/public page components
- existing helpers for metric coloring, value chips, empty states, loading states, and data formatting
- any existing `design/MLBMA_CURSOR_DESIGN_CONTRACT.md` or `design/README.md`
- any existing design notes, README files, or TODO files

Do not assume the framework, folder structure, or styling system. Read the codebase first.

### 2.2 State The Edit Plan Before Changing Files

Before edits, Cursor must state:

- Which files will be touched
- Whether each change is visual, structural, data, or behavior-related
- How dashboard structure will be protected
- How the result will be verified

For dashboard visual-polish work, the plan must explicitly say: styling-only, no DOM restructuring, no section reordering, no data relocation.

### 2.3 Make Scoped Changes

Prefer small, direct changes in the files that already own the behavior. Avoid broad rewrites, duplicated component trees, new styling systems, or parallel helpers.

### 2.4 Verify

After changes, Cursor must run the appropriate checks available in the project:

- formatter
- linter
- typecheck
- unit tests
- build
- local dev server smoke test
- browser screenshot review for dashboard and website pages
- console-error check

If a check cannot run, Cursor must say why and give the nearest equivalent verification.

### 2.5 Diff Review

Before finishing, Cursor must inspect the diff and confirm:

- No unrelated files changed
- No generated junk committed
- No dashboard sections moved, removed, duplicated, or re-nested
- No data source or metric meaning changed accidentally
- No hardcoded fake data added to production paths

---

## 3. Non-Negotiable Dashboard Structure Rules

The dashboard structure is locked. The infographic aesthetic is aesthetic-only.

### 3.1 May Change

Cursor may change:

- chip styling
- metric color treatment, using the locked green=elite to red=poor scale
- typography styling
- spacing and density
- section-header styling
- borders, shadows, depth, inset effects, and board containment
- icon styling where icons already exist
- class names when needed for styling
- shared CSS tokens if they already exist or need a small missing addition

### 3.2 Must Not Change

Cursor must not change:

- dashboard layout
- section order
- Lineup / SP / Bullpen unit structure
- tabs or tab semantics
- which data appears in which section
- metric definitions
- navigation
- routing
- functional components
- DOM hierarchy
- data loading flow
- user controls
- component nesting
- component flattening
- section count

Do not add, remove, merge, split, or reorder dashboard sections to mimic an infographic. Apply the aesthetic to the current structure exactly as it exists.

### 3.3 Structural Stop Rule

If an intended visual change requires moving data, changing component hierarchy, adding a new dashboard section, removing a section, or altering tab behavior, stop. That is structural, not visual.

---

## 4. Visual Direction

The preferred aesthetic reference is the ChatGPT-generated MLB team scouting infographic style described in the source notes: premium, dense, editorial, broadcast-quality, and stat-forward.

Use that as inspiration only. Translate it into the project design system.

### 4.1 Take From The Infographic Direction

Adopt:

- premium dark board composition
- compact editorial density
- high-confidence baseball scouting tone
- strong hierarchy
- crisp numbers
- bold stat chips
- analyst-take visual treatment
- contained panels with depth
- tight spacing rhythm
- section headers with intentional emphasis

### 4.2 Do Not Copy From The Infographic Direction

Do not copy:

- mixed contextual stat colors
- arbitrary red/green/gold/orange per-stat palettes
- infographic fonts
- image layout
- section order
- metric placement
- raw values
- one-off colors
- decorative layouts that require changing the app structure

### 4.3 Product Feeling

MLBMA should feel like:

- a serious matchup command center
- a broadcast research board before first pitch
- a sharp analyst workspace
- fast, legible, and opinionated
- dense but not cluttered
- premium but not flashy

MLBMA should not feel like:

- a generic AI dashboard
- a crypto dashboard
- a soft pastel startup template
- a simple spreadsheet skin
- a betting spam page
- a marketing-only website detached from the actual product

---

## 5. Design Tokens

Use the existing token system first. The source notes refer to the existing `--bg`, `--card`, `--border`, `--c-*`, and `--v` token family. Do not fork or eyeball values when tokens exist.

### 5.1 Token Policy

- Use existing CSS variables and theme utilities.
- Add missing tokens only in the global theme owner file.
- Do not scatter one-off hex values across components.
- Do not introduce a second theme file unless the project already uses that pattern.
- Keep color semantics stable across dashboard and website.

### 5.2 Required Semantic Token Families

If the project does not already expose these concepts, add them conservatively:

- background: app/page background
- surface: primary card/panel background
- surface-raised: elevated board background
- border: standard panel border
- border-strong: high-emphasis board border
- text-primary
- text-secondary
- text-muted
- accent-violet
- accent-violet-soft
- metric-elite
- metric-good
- metric-neutral
- metric-watch
- metric-poor
- shadow-board
- shadow-inset

Map these to the existing `--bg`, `--card`, `--border`, `--c-*`, and `--v` system where possible.

### 5.3 Color Rules

Metric colors must follow one universal semantic scale:

- green = elite / favorable
- yellow or amber = neutral / watch
- red = poor / unfavorable

Never use one palette where red means good for one stat and bad for another. Normalize the scale in the metric helper layer.

### 5.4 Violet Accent Rule

Violet is the premium brand accent. Use it for:

- top board accents
- active states
- focus rings
- section icon circles
- subtle glow/inset treatment
- selected tabs

Do not let violet dominate the entire UI. It is an accent, not the whole palette.

---

## 6. Typography

Use:

- Display/editorial text: Roboto Condensed
- UI text, labels, controls, and numbers: DM Sans

If these fonts are already loaded, reuse the current loading method. If not, add them through the project-approved font mechanism.

### 6.1 Display Typography

Use Roboto Condensed for:

- dashboard title
- section headers
- website hero headline
- major page headers
- matchup labels
- compact editorial headings

Display style:

- uppercase where already appropriate
- heavy weight
- tight hierarchy
- controlled letter spacing
- no negative letter spacing
- no viewport-width font scaling

### 6.2 UI And Number Typography

Use DM Sans for:

- controls
- tabs
- body copy
- table labels
- metric labels
- values
- empty states
- tooltips

Numbers must use tabular alignment where supported:

```css
font-variant-numeric: tabular-nums;
```

### 6.3 Copy Tone

Use concise, confident baseball-analytics language.

Good examples:

- Matchup Edge
- Analyst Take
- Run Environment
- Starter Form
- Bullpen Leverage
- Contact Quality
- Platoon Pressure
- Lineup Stress

Avoid:

- vague hype
- AI buzzwords without product meaning
- long instructional text inside the app
- marketing paragraphs inside the dashboard

---

## 7. Dashboard Component Contract

The dashboard is the core product experience. It must be polished first.

### 7.1 Overall Dashboard Layout

Keep the existing layout and DOM hierarchy. Improve visual quality through:

- stronger board containment
- tighter vertical rhythm
- consistent section headers
- crisp chip treatment
- aligned number columns
- clear active tab states
- compact but readable spacing
- predictable responsive behavior

### 7.2 Section Containers

Existing dashboard section containers should feel like premium dark boards.

Required treatment:

- dark raised surface
- visible border
- subtle inner highlight
- subtle shadow
- violet top accent or header accent
- no excessive border radius
- compact internal spacing
- consistent header/body rhythm

Do not wrap existing sections in extra outer cards if that changes hierarchy or creates nested-card clutter.

### 7.3 Metric Chips

Every metric value chip must be:

- solid, not translucent
- saturated enough to read as intentional
- mapped through the green=elite to red=poor scale
- high contrast
- compact
- consistent in height
- aligned with neighboring labels and values

Use existing helpers such as `valChipHtml` and `metricColor` if present. Do not duplicate metric-color logic in individual components.

### 7.4 Metric Rows

Metric rows should support rapid scanning:

- label left, value right where that pattern exists
- stable alignment
- tabular numbers
- compact gaps
- no wrapped numeric chips unless unavoidable on small screens
- consistent baseline alignment

Do not move metrics between rows or sections.

### 7.5 Tabs

Lineup / SP / Bullpen tabs are locked.

Enhance only:

- active state
- hover state
- focus state
- spacing
- typography
- border treatment

Do not rename, reorder, remove, duplicate, or change tab behavior.

### 7.6 Insight Rail And Analyst Take

Where insight-rail or analyst-take elements already exist, style them toward the infographic treatment:

- icon inside violet circle
- bold condensed label
- compact supporting text
- strong border or inset left accent
- dense editorial rhythm

Do not add a new analyst-take section unless the project already has the data and structure for it or the user explicitly requests it.

### 7.7 Empty States

Use honest-empty behavior:

- If data is missing, say the data is unavailable.
- Do not invent fake matchup values.
- Do not silently hide sections unless existing logic does so intentionally.
- Empty states should be compact, calm, and useful.

Good empty-state copy:

- Data unavailable
- No matchup data loaded
- Waiting for game selection
- Projection unavailable for this split

Bad empty-state copy:

- Random placeholder statistics
- Lorem ipsum
- Fake confidence scores
- Hidden blank panels with no explanation

### 7.8 Loading States

Loading states must:

- appear quickly
- clear reliably
- not trap the page
- not block interaction after data arrives
- not leave console errors

Preserve any existing `window.x=x` requirement if present in the project contract or runtime workaround.

---

## 8. Website Contract

The public website must sell and explain the product while looking connected to the dashboard.

### 8.1 Website Goal

The website should make a visitor understand, within the first viewport:

- what MLBMA is
- that it is about MLB matchup analysis
- that the product produces dashboard-level insights
- why it is useful before and during games

### 8.2 First Viewport

The first viewport must show MLBMA as the main signal. The hero should not be vague.

Required:

- MLBMA name or full product name as the dominant headline
- concise value proposition
- visible product/dashboard preview, baseball data visual, or live-feeling matchup module
- primary action to open/use the dashboard or view matchups
- secondary action only if useful

Avoid:

- generic gradient hero with no product
- large marketing card that hides the actual product
- stock-like atmospheric sports imagery that does not explain the tool
- long paragraphs above the product

### 8.3 Website Visual Relationship To Dashboard

The website should borrow the dashboard language:

- dark premium boards
- violet accents
- solid metric chips
- condensed editorial headings
- compact baseball-stat modules
- matchup-card previews
- credible analytical tone

The website can be more explanatory than the dashboard, but it must not become visually disconnected.

### 8.4 Recommended Website Sections

Use existing routes/sections if already present. If the website is unfinished and needs structure, prefer this order:

1. Product hero with real dashboard/product signal
2. Featured matchup or dashboard preview
3. What MLBMA analyzes
4. Key modules: Lineup, Starter, Bullpen, Run Environment
5. Analyst workflow: choose game, scan edges, compare units, act
6. Methodology or data transparency
7. Final call to action

Do not add a section if it creates fake claims, fake integrations, or unsupported functionality.

### 8.5 Website Copy Rules

Copy should be:

- specific
- baseball-native
- concise
- confident
- free of unsupported claims

Prefer:

- "Compare lineup pressure, starter form, bullpen leverage, and contact-quality signals before first pitch."

Avoid:

- "Revolutionize your sports decisions with AI-powered synergy."

### 8.6 Website Cards And Modules

Website cards should show real product concepts:

- matchup edge preview
- team comparison
- starter snapshot
- bullpen risk
- lineup split
- analyst take

Avoid decorative cards that only repeat generic marketing claims.

### 8.7 Navigation

Navigation should be simple:

- Product or Dashboard
- Matchups
- Methodology
- About

Use the routes already present. Do not create dead nav links.

### 8.8 Mobile Website

On mobile:

- hero must still show MLBMA clearly
- product preview must not overflow
- cards must stack cleanly
- buttons must fit text
- chips must remain readable
- no text overlap
- no horizontal scroll

---

## 9. Data And Content Integrity

MLBMA is a data product. Design must respect data meaning.

### 9.1 Do Not Fake Production Data

Do not hardcode fake production stats, teams, odds, projections, or rankings unless the app already has a mock/demo mode and the UI clearly labels it as demo/sample.

### 9.2 Preserve Metric Semantics

Do not change:

- metric names
- formulas
- sort direction
- color thresholds
- stat labels
- team abbreviations
- game identifiers
- split definitions
- units

unless the task explicitly requests that change.

### 9.3 Formatting

Use existing formatters. If missing, centralize formatting helpers.

Examples:

- percentages use consistent decimal precision
- rates align consistently
- ranks show clear direction
- unavailable values render as unavailable, not zero

### 9.4 Favorable Direction

For every colored metric, confirm whether higher is better or lower is better. Use helper metadata or existing logic. If no source exists, do not guess silently. Add a small TODO or ask the user.

---

## 10. Responsive Contract

Support desktop, tablet, and mobile without changing the information architecture.

### 10.1 Desktop

Desktop should feel like a command center:

- dense dashboard panels
- strong comparison layout
- readable stat groups
- no oversized marketing spacing in the app

### 10.2 Tablet

Tablet should preserve hierarchy:

- fewer columns where needed
- tabs remain accessible
- chips do not squeeze into illegibility
- key matchup summary remains near the top

### 10.3 Mobile

Mobile should be stacked and scannable:

- no horizontal scrolling
- no clipped chips
- no overlapping text
- no broken sticky elements
- controls are reachable
- sections keep the same order

Responsive changes may alter CSS layout behavior, but must not alter the semantic order or data placement.

---

## 11. Accessibility Contract

Minimum requirements:

- visible focus states
- keyboard-reachable controls
- semantic buttons for interactive controls
- accessible tab states
- readable contrast for all chips and text
- no color-only meaning for critical decisions
- labels for icons where meaning is not obvious
- reduced-motion respect if animations exist

Metric chips may use color, but the label/value must carry the meaning.

---

## 12. Interaction And Motion

Use motion sparingly.

Allowed:

- subtle hover lift
- border glow on active controls
- short opacity/transform transitions
- loading shimmer if already used tastefully

Avoid:

- flashy animation
- distracting parallax
- slow transitions
- motion that makes stat scanning harder

All transitions should feel quick and precise.

---

## 13. Implementation Guidance

### 13.1 Prefer Existing Patterns

Use:

- existing component APIs
- existing styling conventions
- existing utility classes
- existing helpers
- existing routing
- existing build/test commands

Do not introduce:

- a new CSS framework
- a second design system
- duplicate dashboard components
- new state management
- new charting library
- new data-fetching library

unless the user explicitly approves it.

### 13.2 CSS And Class Changes

For dashboard aesthetic work, the final diff should mostly be:

- CSS variables
- stylesheet rules
- className additions
- small presentational wrappers only if already consistent with the project and not changing structure

Avoid moving JSX/HTML blocks.

### 13.3 Component Boundaries

Do not collapse meaningful components into one large file. Do not split components just for style edits. Keep ownership stable.

### 13.4 Icons

Use the existing icon library. If the project uses Lucide, use Lucide. Do not hand-draw SVG icons unless no suitable icon exists or the project already does so.

### 13.5 Charts And Visualizations

If charts exist:

- keep chart data and scales intact
- polish labels, colors, gridlines, tooltips, and containers
- preserve interactions

If charts do not exist, do not add a chart library just for decoration.

---

## 14. Page-Level Acceptance Criteria

### 14.1 Dashboard Acceptance

The dashboard is acceptable when:

- existing layout and section order are unchanged
- Lineup / SP / Bullpen tabs are intact
- data remains in the same sections
- metric chips use the locked green=elite to red=poor scale
- chips are solid, readable, and consistent
- boards feel premium, dark, contained, and dense
- typography uses Roboto Condensed and DM Sans as specified
- existing analyst/insight elements have a polished editorial treatment
- loading and empty states behave honestly
- there are no console errors
- responsive layouts do not overlap or overflow

### 14.2 Website Acceptance

The website is acceptable when:

- first viewport clearly communicates MLBMA
- product/dashboard signal is visible immediately
- visual language matches the dashboard
- copy is baseball-specific and credible
- nav links work
- mobile layout is clean
- no dead CTAs
- no fake feature claims
- no generic template feel

### 14.3 Technical Acceptance

The implementation is acceptable when:

- lint passes or known unrelated failures are documented
- typecheck passes or known unrelated failures are documented
- build passes
- tests pass where available
- visual smoke test is completed in browser
- diff is scoped
- no unrelated refactors are included

---

## 15. Cursor Final Response Requirements

When Cursor finishes, it must report:

- files changed
- summary of dashboard work
- summary of website work
- verification commands run and results
- any known risks or skipped checks
- confirmation that dashboard structure was preserved
- commit hash if a commit was made

For dashboard aesthetic-only work, include this exact confirmation:

> Confirmed: dashboard visual changes were styling/class/token changes only. No sections were moved, added, removed, merged, split, or re-nested; Lineup/SP/Bullpen tabs and data placement remain intact.

---

## 16. Quick Checklist For Cursor

Before edits:

- Read existing design contract and project files
- Identify dashboard and website owner files
- State files to touch
- Confirm dashboard structure lock

During edits:

- Use existing tokens and helpers
- Reuse `valChipHtml` / `metricColor` if present
- Use Roboto Condensed + DM Sans
- Keep green=elite to red=poor metric scale
- Preserve data placement
- Preserve tabs and routing

Before final:

- Run checks
- Smoke test in browser
- Inspect responsive states
- Inspect diff for structural dashboard changes
- Remove debug logs and junk files
- Report exactly what changed

---

## 17. One-Sentence North Star

Make MLBMA feel like a premium baseball matchup command center: dense, sharp, trustworthy, and finished, while preserving the dashboard structure and data truth exactly.
