# Chase Analytics — visual matrix + GPT image prompts

**Audited:** live `https://chase-analytics.com` on 2026-09-09 (production stamp `20260908h`).
**Goal sources:** `design/MLBMA_CURSOR_DESIGN_CONTRACT.md` §§4–8, architecture v2 (public research vs Model Center), PR 41 branch work (not deployed yet).

Production is **not** the PR-41 desk. Treat this file as: what ships today vs what the product is supposed to look like, then paste-ready image prompts so GPT can render the target.

---

## Style lock (paste above every prompt)

```
Chase Analytics visual bible — obey exactly:
- Product: Chase Analytics, premium MLB/NFL/CFB/WNBA matchup intelligence. Broadcast scouting desk, not a betting app, not crypto, not generic SaaS.
- Canvas: near-black #08090F with faint violet radial glow (not a purple wash). No grid texture, no stadium photo, no bokeh, no fake crowd.
- Surfaces: opaque lacquered panels #12141D / #181B26, 1.5–2px borders #262A38, thin top-edge glint, deep shadow, inset highlight. Filled mass, not glassmorphism.
- Brand accent: #9A6BFF used as edge light, active pills, icon rings, one primary CTA. Never flood the page purple.
- Type: Roboto Condensed for display titles (metallic silver #F5F6FA, heavy, tight tracking, no negative tracking). DM Sans for UI, labels, numbers. Tabular nums. Compact all-caps editorial eyebrows in #A4A8B6.
- Metric chips: solid, saturated, green #3CCB7F elite → amber #E8C24A watch → red #F2545B poor. Violet/gold are brand only, never metric meaning.
- Icons: bold filled poster marks in circular violet-glow badges on hero/section headers. Thin line icons only for search/close/arrows.
- Logo: small filled upward triangle/mark + wordmark “Chase” + accent “Analytics”.
- Density: Athletic/FanGraphs scouting board — dense, aligned, credible. Not empty luxury. Not a spreadsheet skin.
- Public vs model: PUBLIC screens show schedules, lineups labeled confirmed/projected, weather, descriptive stats, splits, OSI/RCV/ABQ ranks. NEVER show projected scores, win probabilities, model lines, model-vs-market axes, may_bet, ATS records, “Need to Win”, or “before you bet”.
- UI chrome: sticky dark header, sport switcher MLB/NFL/WNBA/CFB, Matchups, Compare, Glossary, Model Center (star or lock). Context bar under header with honest freshness (“Slate shown: Sep 8” not “N games today” if stale).
- Photoreal UI mockup, 16:9 desktop 1440×900 unless specified 390×844 phone. Sharp UI, no watermark, no extra caption outside the browser frame. A thin browser chrome (dark URL bar showing chase-analytics.com) is OK.
```

---

## Visual matrix (live vs goal)

| Surface | Live today | Goal | Gap |
|---|---|---|---|
| **Root `/`** | Thin left-aligned essay: one H1, two pills, sport chips, then **engineering footnote** (“Nested URLs use absolute paths…”). Huge empty black. Looks like a deploy stub, not a product. | Contract §8 first viewport: name + value + **live matchup module** + primary “open desk”. Dark boards, chips, condensed type. | High. No product preview. Internal infra copy on a public hero. |
| **Opening `/dashboard/`** | Production still marketing-hero (“The Edge You Need to Win.”), “Games Today”, Discord/Patreon signup in the first scroll, Lucide-thin icons, mixed token leftovers. PR 41 copy exists locally but is **not live**. | One H1 “Today’s research desk”. Factual lede. Signup **below** tools. Honest slate label. Poster-mark icons. Lacquered tool cards that preview real modules. | High. Voice is betting-urgency + SaaS signup. First viewport sells account, not the desk. |
| **NFL `/nfl/matchups.html`** | Confirmed in capture: header OK-ish; lede still “Model, market, and published are separate channels”; **Authority RESEARCH_ONLY · may_bet: false**; genesis-report dump; “Priced markets: 0 of 16 — not Picks”; card **MODEL 6.54 / MARKET 3 / PUBLISHED 3** + model–market gap axis. Developer terminal. | Public slate: kickoff-grouped cards (Wed Sep 9 8:20 ET), teams, attributed book line labeled “book price, not a Chase projection”, CTA “Open in Model Center”. No axis, no may_bet. | High. Public page **is** the model board. |
| **MLB `/mlb/`** | Hub: “Picks are priced markets… Gems are flagged tiles.” Loading placeholder. Matchups CTA still points at opening hash, not a public slate. | Research board: game count + freshness + link to scouting desk. Model Center for priced markets. | High. Producer jargon on a public hub. |
| **`/models/`** | **404.** | Separate authenticated product: projections, WP, gaps, priced markets. Stub may explain access with **zero preview numbers**. | High. Dual-product IA is invisible live. |
| **Compare** | “Loading matchup—” empty shell until query params. No selected game in first viewport. | Empty state: “Waiting for game selection” on a filled board, two-club Team context then lineups/splits. No projOSI. | Med. Honest empty exists in contract; live feels unfinished. |
| **Team Rankings** | Public URL loads compare loading (redirect). Nav no longer lists it (good). | Team context **inside** a two-club matchup, not a destination. | Med. Route still exists; visual destination is gone. |
| **Nav** | Opening / Matchups / Compare / NFL / Tools (Batter, boards) / Glossary. Sport switcher on sport routes. Freshness pill: “Published: unknown • no sheet id” on NFL. | Simple sport-first + Model Center. Freshness never says “no sheet id” on non-MLB. | Med. NFL freshness is a debug string. Tools dump is a junk drawer. |
| **Panels / gloss** | Dark, violet glow present. Cards are flat rounded rectangles; gap axis is a thin widget; lots of 12px grey log text. Not lacquered boards with 2px borders and metallic titles. | §4.0 glossy infographic on **existing** structure: opaque boards, glint, silver display, illuminated controls. | High. Token layer exists; the look is still a thin terminal. |
| **Type** | Mix of condensed wordmark and UI sans. Display titles not consistently metallic condensed. | Roboto Condensed display / DM Sans UI. | Med. |
| **Icons** | Thin Lucide on opening tools; grey initial circles for NE/SEA. | Poster marks in violet rings; team marks with weight. | Med. |
| **Mobile 375** | Root would stack but still empty. Opening capture failed headless; contract requires no overflow, ≥44px targets, cardify tables. | Phone is a first-class desk: stacked boards, drawer nav, readable chips. | High until verified on device. |
| **Copy tone** | Live: “Need to Win”, “priced markets are not Picks”, “may_bet”, “Unmet gates: out_of_sample…”. | Scouting: Matchup Edge, Analyst Take, Starter Form, Contact Quality. | High. |

**Bottom line:** Live Chase Analytics already has the **dark + violet brand**, but it currently reads as a **developer control plane** (gates, may_bet, model/market/published) sitting on a **marketing hero**. The goal is a **public research desk** that looks like a finished broadcast board, with model theater locked behind Model Center.

---

## How to use the prompts

1. Paste **Style lock**, then **one numbered prompt**.
2. Model: GPT Image / ChatGPT image gen. If it invents win% or spreads on a public screen, regenerate and add “PUBLIC: no forecasts”.
3. Values in mockups are **illustrative labels only** (OSI 62, Barrel% 12.4). Never treat them as tonight’s board.
4. Generate in this order so the set matches: 01 character sheet → 02 opening desktop → 03 opening phone → 04 MLB matchup → 05 NFL public slate → 06 Model Center → 07 root entry.

---

## Prompt 01 — Character sheet (UI kit)

```
[PASTE STYLE LOCK]

UI character sheet / style frame for Chase Analytics, not a full page. Dark #08090F artboard, 1440×900.

Show a labeled kit in a 3×2 grid of lacquered panels:
1. Header fragment: logo mark + Chase Analytics wordmark, nav links Opening / Matchups / Compare / MLB / NFL / Model Center, freshness pill “Slate shown: Sep 8 · 6h”.
2. Display type samples: H1 “Today’s research desk” in Roboto Condensed metallic silver; eyebrow “CHASE ANALYTICS · MLB INTELLIGENCE” all-caps tracked; body in DM Sans #A4A8B6.
3. Buttons: solid primary #9A6BFF “Open scouting desk”; ghost “Compare”; small sport pills MLB (filled) NFL WNBA CFB.
4. Metric chips in a row: Elite OSI 71 green, Good RCV 58, Watch ABQ 51 amber, Poor BB% 4.2 red. Solid chips, not outlines.
5. A tiny matchup card: NYY @ BOS, 7:10 ET, “Lineups: projected”, book line “Spread −1.5 (book price, not a Chase projection)”, link “Open in Model Center”. No model column.
6. Icon badges: circular violet-glow poster icons for slate, matchup, bullpen, research.

Caption inside the sheet, small: “Public desk · descriptive stats only”.
No photographs. No light theme. No betting tickets. No win probability.
```

## Prompt 02 — Opening research desk (desktop)

```
[PASTE STYLE LOCK]

Full-page UI mockup of chase-analytics.com/dashboard at 1440×900, desktop browser.

Sticky header as in the bible. Under it a slim context bar: “MLB · Slate shown: Sep 8 · data cutoff 6h”.

Hero is a scouting desk, not a marketing splash:
- Eyebrow: CHASE ANALYTICS · MLB INTELLIGENCE
- Single H1: Today’s research desk
- Lede: Factual matchup intelligence — lineups, starters, splits, team context. Models stay in Model Center.
- Primary CTA: View slate
- Four compact stats: “15 games on Sep 8 slate” (not “Games Today”), 30 teams, 9 metrics, Last synced 6h
- Right side: lacquered brand mark card (triangle + CHASE / ANALYTICS), not a photo

Below the hero, a 2×2 board of tool cards (filled panels, violet top glint, circular poster icons — not thin Lucide):
1. Tonight’s matchups — probable SP, weather, OSI ranks
2. Matchup analysis — two-club team context inside the game
3. Trends — L7/L14 vs YTD grades
4. Compare — lineup vs lineup / vs pitcher

Signup / Discord / Patreon does NOT appear in this first viewport. No “Need to Win”. No Patreon. No projected scores. Dense but calm. Looks like The Athletic’s data desk mixed with FanGraphs, premium.
```

## Prompt 03 — Opening research desk (iPhone 375)

```
[PASTE STYLE LOCK]

Same Chase Analytics opening desk as a mobile UI, 390×844, iPhone frame optional.

Header: logo + hamburger (44px). No desktop link row. Closed drawer (do not show the drawer open).

Stacked first viewport:
- Same H1 “Today’s research desk”
- Short lede
- Full-width primary button “View slate”
- 2×2 stat tiles, “15 games on Sep 8 slate”
- Then vertically stacked tool cards, large tap targets, no horizontal scroll, no overflowing chips

Dark #08090F, violet accent only on the CTA and icon rings. Readable 14px+ UI type. Premium, not a shrunk desktop.
```

## Prompt 04 — MLB two-club matchup (public)

```
[PASTE STYLE LOCK]

Full-page UI mockup of chase-analytics.com/dashboard/matchup_compare.html?away=NYY&home=BOS at 1440×900.

H1 is the matchup: Yankees at Red Sox · tonight, not “Team Rankings”.
Scope bar: window L14, segment season — two controls, not a six-toggle grid.
Park / starter hand shown as stated context text.

Main column, in this order:
1. Section “Team context” — two club cards (NYY vs BOS) with descriptive ranks only: OSI, RCV, ABQ, OBR, Pitch Score. Green-to-red chips. NO projOSI, NO projected runs.
2. Lineup vs Lineup board (lacquered table, confirmed vs projected labeled).
3. Splits strip.
4. A small radar, descriptive.

Collapsed disclosure at bottom of team context: “Compare to league” (closed).

Right insight rail: Analyst take in condensed type, violet circle icon, no betting instruction.

Footer freshness honest. No model-vs-market plot. No win%. Looks like a broadcast scouting packet.
```

## Prompt 05 — NFL public slate (the replacement for live)

```
[PASTE STYLE LOCK]

Full-page UI mockup of chase-analytics.com/nfl/matchups.html at 1440×900.

This is the PUBLIC research slate, the opposite of a model terminal.

Header + sport pills with NFL filled. Context bar: “NFL · Week 2 · kickoffs in ET · book lines attributed”.

H1: NFL matchups
Lede: Kickoffs and published book prices. Model versus market lives in Model Center.

Do NOT show: Model / Market / Published columns, may_bet, unmet gates, genesis reports, priced-markets counts, gap axis.

Instead group cards by kickoff date:
Section “Wednesday, Sep 9”
Card: New England at Seattle, 8:20 PM ET, two team marks, one line “Published book line: SEA −3 (book price, not a Chase projection)”, text link “Open this matchup in Model Center”.

Section “Sunday, Sep 13”
Two more factual cards, same pattern.

Search “Find a team or game” exists, quiet. Empty of debug text. Dense editorial, not a log dump.
```

## Prompt 06 — Model Center (authenticated, gated)

```
[PASTE STYLE LOCK]

Full-page UI mockup of chase-analytics.com/models/ for a signed-in analyst, 1440×900.

Visually related to the public desk (same chrome) but clearly a different product: a small lock/star in the header on “Model Center”, eyebrow “AUTHENTICATED · NOT A PUBLIC FORECAST PAGE”.

Selected game: NE at SEA.
Now it IS allowed to show three channels as separate labeled boards (not mixed into public):
- Model margin
- Market / book
- Published
Plus a gap axis captioned “A gap is disagreement with the market, not a betting edge.”
Win probability and priced markets live here only, with a status text “Authority: research only” as words, not a may_bet boolean.

Do not look like a sportsbook ticket. No “tail this”, no parlays, no neon green money. Same lacquered dark boards, more instruments, still editorial.
```

## Prompt 07 — Public root entry (replace the stub)

```
[PASTE STYLE LOCK]

Full-page UI mockup of chase-analytics.com/ (root) at 1440×900.

NOT a blank essay. First viewport must sell the product:

Left: Chase Analytics wordmark.
H1: Chase Analytics
Sub: Matchup intelligence for MLB, NFL, CFB, and WNBA — a scouting desk, not a tip sheet.
Primary: Enter research desk
Secondary: Open Model Center (visually quieter, with a lock)

Right or below: a real product preview — a miniature lacquered matchup card (NYY @ BOS, OSI chips, lineup row), so the site looks connected to the dashboard (contract §8.3).

Sport pills MLB NFL WNBA CFB.

Zero engineering copy. Zero “Nested URLs”. Zero empty black void. Feels like a serious analytics product homepage that is the same family as the desk.
```

## Prompt 08 — Empty / loading / freshness states

```
[PASTE STYLE LOCK]

A 1440×900 sheet of three side-by-side Chase Analytics boards (same chrome):

Left: Loading — skeleton bars on a lacquered panel, not a spinner-only void. Caption “Loading slate”.
Center: Honest empty — “No matchup data loaded” / “Waiting for game selection”. Calm, compact.
Right: Stale slate — context bar “Slate shown: Sep 5 · 4 days old” and a retry control. Does NOT say “15 games today”.

No fake stats. No lorem. No error stack traces.
```

---

## Anti-prompts (if the model drifts)

Add this line if needed:

`Avoid: sportsbook coupons, betting slips, predicted final scores, 64% win, crypto charts, light mode, Inter-only UI, glassmorphism, neon purple wash, stadium photography, “The Edge You Need to Win”, Team Rankings as a top-level page, may_bet, debug logs.`
