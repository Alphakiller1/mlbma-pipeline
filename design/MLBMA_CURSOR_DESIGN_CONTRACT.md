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

### 3.2.1 Programme carve-out (dated 2026-09-08, owner decision)

**Within `dashboard/` only**, the 2026-09-08 Chase Analytics cross-sport programme **may** change:

- navigation
- routing
- user controls
- section count

This carve-out exists so WP5 (sport selector, real 404, hub) and related IA work are not blocked by §3.2. It is **not** a license to restyle or to relocate metrics inside a locked scouting board.

Still locked under this carve-out:

- metric definitions and chip polarity (green = elite → red = poor)
- Lineup / SP / Bullpen **tab semantics** on Team Rankings
- data contracts / sheet column names
- pipeline `push_*.py` behaviour
- files outside `dashboard/` except design-token docs and tests named by the programme

WP1 itself must not use this carve-out to change nav or routes beyond design-layer `<link>` order.

### 3.3 Structural Stop Rule

If an intended visual change requires moving data, changing component hierarchy, adding a new dashboard section, removing a section, or altering tab behavior, stop. That is structural, not visual.

**Exception:** work explicitly tagged as the 2026-09-08 programme and listed in `docs/CROSS_SPORT_PROGRAMME_CHECKLIST.md` (WP5 nav/routing/controls/section count inside `dashboard/`). If the task is visual polish only, the stop rule still applies.

---

## 4. Visual Direction

The preferred aesthetic reference is the ChatGPT-generated MLB team scouting infographic style described in the source notes: premium, dense, editorial, broadcast-quality, and stat-forward.

Use that as inspiration only. Translate it into the project design system.

### 4.0 Glossy Infographic Target

The May 2026 ChatGPT-generated MLBMA images are the current visual north star. Cursor must translate their look into the locked dashboard structure rather than inventing new layouts.

Required visual qualities:

- near-black broadcast background without grid texture
- violet neon edge light, not a flat purple wash
- solid lacquered dark panels with border glow, inset highlight, and deep shadow
- metallic silver display headings for major page titles
- violet gradient display emphasis for selected words or key CTAs
- compact all-caps editorial labels with deliberate tracking
- circular icon badges with violet glow where icons already exist
- thin luminous divider rules and top-edge glints on major boards
- active tabs and buttons that feel like illuminated controls
- filled panel mass; avoid thin, translucent, wireframe, or binary-outline surfaces

Implementation requirements:

- Use shared CSS tokens for glow, panel, metallic text, and violet text effects.
- Apply these effects to existing panels, cards, tables, tabs, chips, and section headers.
- Panel backgrounds must be opaque dark gradients first, with gloss layered on top. Do not rely on low-alpha glass to create depth.
- Borders should usually be 1.5px to 2px on major boards/cards; 1px low-alpha strokes are only for internal dividers and minor table rows.
- Profile pages are a priority surface for this rule: hero banners, pitcher/player snapshots, decision cards, stat strips, metric bands, tables, and context controls must feel like filled broadcast boards, not transparent inline boxes.
- Keep metric colors on the existing green-to-red grading scale; violet and gold are brand/editorial accents only.
- Do not add fake stadium art, generated backgrounds, decorative bokeh, or extra hero sections to chase the image.

### 4.0.2 Black Premium Surface (dated 2026-09-15, owner decision)

The owner judged the desk visually immature: every object was boxed - a bordered card holding a bordered group holding bordered tiles holding bordered chips (37% of sized elements on the live slate drew a frame on three or more sides) - on a blue-grey slate ground, and the matchup routes rendered in the system fallback font because they never linked the font stylesheet. This section supersedes the conflicting parts of §4.0, §6 and §7.2; where they disagree, this wins.

- **Ground.** A neutral black ramp, no blue cast: `--ca-ink-1000` `#000000`, `-950` `#050506` (canvas), `-900` `#09090B`, `-850` `#0D0D10`, `-800` `#131316`, `-750` `#1A1A1E`. The header sits on the canvas black, so masthead and desk are one surface. Model Center keeps a faint violet cast in its fields but shares the black ground.
- **One slab per object.** A card or a section is `--surface-card` with a `--border-card` hairline (white 4.5%) and `--elevation-card` (1px of top light). Nothing inside it draws a frame of its own.
- **Separation by tone and space, never outline.** Tiles inside a card step up to `--surface-field`; panels inside a section recess to `--surface-well`. Chips, buttons, inputs, meters and tracks are fills. A grade chip carries its grade as a 14% tint of its own colour, with the number and its label inside it, so colour is never the only cue.
- **Borders.** Replaces "1.5px to 2px on major boards" and "visible border / border glow": major surfaces take the hairline only, internal dividers use `--border-subtle` (white 4.5%), and table row rules stay.
- **Violet.** Navigation, links, focus and active controls. The 3px rail down every card and section is removed - fifteen rails on one page were segmentation, not brand. Club colour keeps its 3px tab on the club tile, the one edge left on a card, because it answers "whose side".
- **Metal.** The silver fill stays on page titles and section `h2`s. Small titles (venue, team, starter and panel names) are solid `--text-primary`.
- **Type.** Archivo, self-hosted, one variable family: `Chase Sans` at normal width and `Chase Display`, the same file pinned to 72% width. See §6.

Reversal lives at the token and override level: the TIER 1 inks in `design/tokens/chase-tokens.css`, the roles in `chase-semantic.css`, the faces in `dashboard/assets/fonts/chase-fonts.css`, and the dated `BLACK PREMIUM SURFACE - 2026-09-15` blocks at the foot of `chase-public.css`, `chase-model-center.css` and `chase-shell.css`.

### 4.0.1 Icon Standard

The generated infographic icons are bold poster marks, not thin generic line icons. Cursor must not treat default Lucide stroke icons as the finished visual standard on hero, workflow, research, matchup, or section-header surfaces.

Icon requirements:

- Use `dashboard/mlbma_icons.js` as the shared icon owner.
- Prefer MLBMA custom poster marks for high-visibility concepts: matchups, rankings, trends, pitcher intelligence, research lab, offense, edge, slate, and signals.
- Lucide-style line icons are acceptable only for small utility affordances such as arrows, close controls, search, list toggles, and minor UI controls.
- High-visibility icons must sit inside circular or badge-like containers with violet glow, inset highlight, and sufficient stroke/fill weight.
- Icons should read at small sizes without looking like wireframes; use filled shapes, heavier strokes, and simple silhouettes where needed.
- Do not scatter raw SVGs across page files. Add or alias icons in `mlbma_icons.js`, then render through `MLBMAIcons.iconSvg`, `iconHtml`, or `iconCircleHtml`.

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

- Display/editorial text: Archivo at 72% width, served as `Chase Display` (Roboto Condensed until 2026-09-15, see §4.0.2)
- UI text, labels, controls, and numbers: Archivo at normal width, served as `Chase Sans` (DM Sans until 2026-09-15)

Both families load from `dashboard/assets/fonts/chase-fonts.css`, which every page must link before the token stylesheet. Rules name the families through `--font-ui` / `--font-display`, never the vendor face.

### 6.1 Display Typography

Use the display family (`--font-display`) for:

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

Use the UI family (`--font-ui`) for:

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
- a hairline border (`--border-card`), not a visible frame (§4.0.2)
- subtle inner highlight
- subtle shadow
- no violet rail; the accent belongs to navigation and active controls (§4.0.2)
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
- typography uses the `Chase Sans` / `Chase Display` families as specified in §6
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
- Use `Chase Sans` + `Chase Display` (Archivo) through the font tokens
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

---

## 18. PART 2 — Cross-sport design law (2026-09-08)

Binding acceptance for the programme. The living checkbox form is `docs/CROSS_SPORT_PROGRAMME_CHECKLIST.md` (P2-* rows). Index: `design/INDEX.md`.

### 18.1 Modes

| Mode | Surfaces | Forbidden |
|------|----------|-----------|
| Broadcast / scouting board | MLBMA dashboards | Betting-spam chrome, SCL theme |
| Betting board | model `board.json` UIs | Fake priced rows; hiding `unmet_gates` |
| Research table | Research Lab, rankings | Rainbow per-stat palettes |
| Marketing / site | public framing | Duplicate Opening Dashboard wordmark |
| Social / export | `/render/`, content-engine | Using `push_*.py` as a card renderer |

Pages may set `data-mode` (`slate`, `rank`, `entry`, …) for future adapters. WP1 must not restyle by mode.

### 18.2 Colour roles (mark vs value)

| Family | Role | Contrast on `--surface-panel` (`#12141D`) |
|--------|------|-------------------------------------------|
| `--mark-positive/negative/caution` | Non-text chrome | May sit below 4.5:1 if not the only cue |
| `--value-positive/negative/caution` | Readable values | **≥4.5:1** |
| `--text-primary` (`--text`) | Body / titles | ≥4.5:1 (`#F5F6FA` ≈ 17:1) |
| `--text-secondary` (`--text-2`) | Supporting / metadata floor | `#A4A8B6` ≈ **7.74:1** |
| `--text-meta` | Captions that still read as type | Prefer `--text-2`. `--text-3` `#6E7383` ≈ **3.89:1** — not body |
| `--text-disabled` (`--text-4`) | Inert chrome | `#4C5161` ≈ **2.32:1** — never informative |

50% group opacity of `#A4A8B6` / `#6E7383` composites to ≈ **2.85** / **1.89**. Informative regions must not use group opacity. Do not port NFL tile opacity.

Hex values are settled. Do not lighten `--text-3` to “fix” contrast; change usage, not the palette.

The ratios above were measured on the pre-2026-09-15 panel `#12141D`. The black panel (`--ca-ink-850` `#0D0D10`) is darker, so each is now a floor rather than the measured value.

### 18.3 Five concepts

1. **Surface** — opaque boards (`--surface-*`), not glass-only depth.
2. **Type** — `Chase Display` / `Chase Sans` (Archivo, §6); `tabular-nums`.
3. **Grade** — `--metric-very-weak` … `--metric-elite`; `valChipHtml` / `metricColor`.
4. **Mark vs value** — chrome ≠ data (§18.2).
5. **Identity** — three token tiers, one `DESIGN_LAYER_VERSION`.

### 18.4 Data honesty

No fake production stats. TBD stays TBD. Stale boards show DataStatus (WP3), not silent last-good. `may_bet` / `unmet_gates` are never rewritten true. Glossary labels must not collide two formulas (PP-Gap: ABQ−RCV vs projOSI−OSI).

### 18.5 Density

Rankings-level rhythm (~12–16px section gaps). No triple-wrapped empty cards. 375px is first-class.

### 18.6 Enforcement

| Gate | Tool |
|------|------|
| Token ownership, no `:root` hex outside TIER 1, design-layer `?v=` | `scripts/check_tokens.py` (`pages.yml` `token-guard`) |
| Contrast + group-opacity lock | `tests/test_contrast.py` |
| Stamp constant | `design/DESIGN_LAYER_VERSION`, `scripts/design_layer_version.py`, `dashboard/design_layer_version.js` |

TIER 1 (`design/tokens/chase-tokens.css` = `design/chase-tokens-v1.css`) is the only owner of color literals. TIER 2 (`mlbma_design_system.css` `:root` + `theme.css` `:root`) may only assign `var(...)`. Component rule-body hex is tolerated until a restyle pass.

### 18.7 Consolidation (§2.9)

See `docs/CROSS_SPORT_PROGRAMME_CHECKLIST.md` §2.9 table and `design/INDEX.md`.

