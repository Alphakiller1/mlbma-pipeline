# Chase Analytics — GPT image prompts (MLB + NFL public desk)

**Use this pack, not older four-sport prompts.** Public Chase Analytics **posts MLB and NFL only.** WNBA and CFB are not in nav, not in sport pills, not on the homepage. Do not draw them.

**Goal look:** premium broadcast scouting desk (The Athletic / FanGraphs / glossy infographic). Dark `#08090F`, brand `#9A6BFF`. Public pages are research. Model numbers live in Model Center.

**Live site is not the target.** Production still shows four-sport copy, model/market columns on NFL, and a marketing hero. These prompts render the **intended** desk.

---

## How to generate

1. Paste **Style lock**, then **one numbered prompt**. One image per prompt.
2. ChatGPT image / GPT Image. If it draws WNBA, CFB, win%, or a sportsbook ticket, regenerate and add the **Anti-line**.
3. Chip values are **illustrative** (OSI 62), not tonight’s board.
4. Order: 01 kit → 02 root → 03 opening desktop → 04 opening phone → 05 MLB matchup → 06 MLB slate → 07 NFL slate → 08 Model Center → 09 empty/stale.

---

## Style lock (paste above every prompt)

```
Chase Analytics visual bible — obey exactly:

PRODUCT
- Chase Analytics. Public product posts TWO sports only: MLB and NFL.
- Never show WNBA, CFB, college football, basketball, or a four-sport switcher.
- Sport chrome is exactly two pills: MLB and NFL. One is filled #9A6BFF when active.
- Nav: Opening · Matchups · Compare · MLB · NFL · Model Center · Glossary. No Team Rankings. No Tools junk-drawer of extra sports.
- Broadcast scouting desk, not a betting app, not crypto, not generic SaaS, not a developer terminal.

COLOR / SURFACE
- Canvas #08090F, faint violet radial glow, not a purple wash. No grid, no stadium photo, no bokeh, no crowd.
- Lacquered opaque panels #12141D / #181B26, 1.5–2px borders #262A38, top-edge glint, deep shadow, inset highlight. Filled mass, not glassmorphism.
- Accent #9A6BFF on edge light, active pill, icon rings, one primary CTA only.

TYPE / ICONS
- Roboto Condensed for H1 and section titles: metallic silver #F5F6FA, heavy, tracked, no negative tracking.
- DM Sans for UI, labels, numbers; tabular nums. Eyebrows all-caps #A4A8B6.
- Metric chips solid: elite #3CCB7F, watch #E8C24A, poor #F2545B. Violet is never a metric grade.
- Poster-mark icons in circular violet-glow badges. Thin line icons only for search/close/arrows.
- Logo: filled upward triangle + “Chase” + accent “Analytics”.

PUBLIC vs MODEL (hard split)
- PUBLIC screens: schedules, kickoffs in ET, lineups labeled confirmed or projected, weather, descriptive stats, splits, OSI / RCV / ABQ / OBR / Pitch Score ranks.
- PUBLIC never shows: projected scores, win probability, model spread/total/margin, Model/Market/Published columns, gap axis, may_bet, ATS record, “Need to Win”, “before you bet”, unmet gates, genesis reports, priced-markets counts.
- Book prices on public NFL cards only if labeled “book price, not a Chase projection”.
- Model Center is a separate product (lock/star in nav). Forecasts only there.

CHROME
- Sticky dark header. Context bar under it with honest freshness: “Slate shown: Sep 8 · 6h” — never “N games today” on a stale slate, never “no sheet id”.
- Photoreal UI, 1440×900 desktop unless the prompt says 390×844 phone. Optional dark browser bar with chase-analytics.com. No watermark.
```

---

## Anti-line (append if the model drifts)

```
Avoid: WNBA, CFB, four sport pills, Team Rankings as a top nav item, sportsbook tickets, parlays, predicted final scores, 64% win, model vs market axis on a public URL, may_bet, debug logs, “The Edge You Need to Win”, Nested URLs footnote, light mode, glassmorphism, neon purple wash, stadium photography, crypto charts.
```

---

## Prompt 01 — Character sheet

```
[PASTE STYLE LOCK]

UI kit / style frame for Chase Analytics, not a full website. Dark #08090F, 1440×900.

3×2 lacquered panels, labeled:
1. Header: logo + Chase Analytics. Links Opening, Matchups, Compare, MLB, NFL, Model Center, Glossary. Exactly two sport names in the header. Freshness pill “Slate shown: Sep 8 · 6h”.
2. Type: H1 “Today’s research desk” in Roboto Condensed metallic silver. Eyebrow “CHASE ANALYTICS · MLB · NFL”. Body in DM Sans #A4A8B6.
3. Controls: primary #9A6BFF “Open scouting desk”; ghost “Compare”; sport pills MLB (filled) and NFL (outline). No third or fourth pill.
4. MLB chips: Elite OSI 71, Good RCV 58, Watch ABQ 51, Poor OBR 42. Solid chips.
5. Mini MLB card: NYY @ BOS, 7:10 ET, “Lineups: projected”, no spread, link “Open scouting desk”.
6. Mini NFL card: NE @ SEA, 8:20 PM ET, “Published book line: SEA −3 (book price, not a Chase projection)”, link “Open in Model Center”. No Model column.

Footer caption: “Public desk · MLB and NFL only”.
```

---

## Prompt 02 — Root homepage (replace the stub)

```
[PASTE STYLE LOCK]

Full-page UI of chase-analytics.com/ at 1440×900.

This is the public front door for a TWO-SPORT research product.

Left:
- Wordmark Chase Analytics
- H1: Matchup intelligence for MLB and NFL.
- Lede: A scouting desk — lineups, splits, and team context. Forecasts stay in Model Center.
- Primary: Enter MLB desk
- Secondary: Enter NFL slate
- Quiet tertiary: Model Center (lock)
- Sport pills: MLB | NFL only. Empty black void is forbidden. No engineering footnote. No “Nested URLs”. No CFB. No WNBA.

Right: two stacked product previews so the homepage looks like the desk (not a marketing poster):
- MLB preview card: Yankees at Red Sox, OSI chips, “projected lineup”
- NFL preview card: Patriots at Seahawks, kickoff 8:20 ET, attributed book line with the disclaimer

Same dark lacquered family as the dashboards. Dense, premium, finished.
```

---

## Prompt 03 — Opening research desk (desktop)

```
[PASTE STYLE LOCK]

Full-page UI of chase-analytics.com/dashboard at 1440×900.

Sticky header with MLB and NFL only. Context bar: “MLB · Slate shown: Sep 8 · data cutoff 6h”.

Hero is a scouting desk, not a splash ad:
- Eyebrow: CHASE ANALYTICS · MLB INTELLIGENCE
- One H1: Today’s research desk
- Lede: Factual MLB matchups — lineups, starters, splits, team context. NFL slate is one click in the header. Models stay in Model Center.
- Primary CTA: View MLB slate
- Secondary text link: NFL matchups
- Stats: “15 games on Sep 8 slate” (not Games Today), 30 teams, 9 metrics, Last synced 6h
- Right: lacquered brand mark (triangle + CHASE / ANALYTICS), no photo

Below, 2×2 lacquered tool cards with poster-mark icon rings:
1. Tonight’s matchups
2. Matchup analysis (team context inside the game)
3. Trends
4. Compare (lineup vs lineup / vs pitcher)

Signup, Discord, and Patreon are NOT in the first viewport. No “Need to Win”. No four-league hero. Looks like The Athletic data desk × FanGraphs.
```

---

## Prompt 04 — Opening desk (iPhone)

```
[PASTE STYLE LOCK]

Same opening desk, 390×844. iPhone frame optional.

Header: logo + 44px hamburger. Desktop links hidden. Drawer closed.

Stacked:
- H1 Today’s research desk
- Lede: MLB research now. NFL in the menu. No other leagues.
- Full-width primary “View MLB slate”
- Full-width ghost “NFL matchups”
- 2×2 stats including “15 games on Sep 8 slate”
- Vertical tool cards, tap targets ≥44px, no horizontal scroll

Sport switcher if shown is only MLB | NFL.
```

---

## Prompt 05 — MLB two-club matchup (public)

```
[PASTE STYLE LOCK]

Full-page UI of chase-analytics.com/dashboard/matchup_compare.html?away=NYY&home=BOS at 1440×900.

Header still only MLB + NFL. MLB is current.

H1: Yankees at Red Sox — not “Team Rankings”.
Scope bar: two controls only (window L14, segment season).
Starter hand / park as stated context text.

Column order:
1. Team context — two club cards, descriptive ranks OSI RCV ABQ OBR Pitch Score, green-to-red chips. No projOSI. No projected runs.
2. Lineup vs Lineup, confirmed vs projected labeled.
3. Splits strip.
4. Small descriptive radar.

“Compare to league” disclosure collapsed.
Insight rail: Analyst take, violet circle icon, no betting copy.
No NFL model widgets on this MLB page. No win%. Broadcast scouting packet.
```

---

## Prompt 06 — MLB public slate

```
[PASTE STYLE LOCK]

Full-page UI of chase-analytics.com/mlb/matchups.html at 1440×900.

Public MLB research slate. Sport pills: MLB filled, NFL outline. No other sports.

H1: MLB matchups
Lede: Tonight’s games, probable starters, weather, descriptive context. Forecasts in Model Center.

Kickoff groups in Eastern time, e.g. “Monday, Sep 8”.
Each card: away at home, time ET, probable SPs, weather one-liner, “Open scouting desk” primary button, “Open this matchup in Model Center” as text link.
No model columns. No gems/picks jargon. No “priced markets”.

Search field “Find a team or game”. Honest context bar freshness. Dense editorial board.
```

---

## Prompt 07 — NFL public slate (replace the live terminal)

```
[PASTE STYLE LOCK]

Full-page UI of chase-analytics.com/nfl/matchups.html at 1440×900.

This is the opposite of the live site’s model terminal.

Header + pills: NFL filled, MLB outline. Context bar: “NFL · Week 2 · kickoffs ET · book lines attributed”.

H1: NFL matchups
Lede: Kickoffs and published book prices. Model versus market lives in Model Center.

FORBIDDEN on this page: Model / Market / Published columns, 6.54 vs 3, gap axis, may_bet, unmet gates, genesis reports, “Priced markets: 0 of 16”, CFB, WNBA.

Instead, cards grouped by kickoff:
Wednesday, Sep 9 — New England at Seattle, 8:20 PM ET, “Published book line: SEA −3 (book price, not a Chase projection)”, text link Open this matchup in Model Center.
Sunday, Sep 13 — two more factual cards, same pattern.

Quiet search. No debug dump. Lacquered cards, metallic H1, premium desk.
```

---

## Prompt 08 — Model Center (MLB or NFL game, gated)

```
[PASTE STYLE LOCK]

Full-page UI of chase-analytics.com/models/ signed-in, 1440×900.

Same chrome as the public desk (MLB | NFL only) but Model Center is active with a lock/star.
Eyebrow: AUTHENTICATED · NOT THE PUBLIC DESK

A segmented control: MLB | NFL (only two). NFL selected.
Game: NE at SEA.

Here — and only here — show three separate boards: Model margin · Market / book · Published.
Gap axis caption: “A gap is disagreement with the market, not a betting edge.”
Status as words: “Authority: research only”. No may_bet boolean. No sportsbook ticket. No parlays.

Public-desk pages must never look like this. This frame is the locked product.
```

---

## Prompt 09 — Loading, empty, stale

```
[PASTE STYLE LOCK]

1440×900 sheet, three Chase Analytics boards, same two-sport header (MLB | NFL):

Left: Loading slate — skeleton bars on a lacquered panel, not a spinner void.
Center: Empty — “Waiting for game selection”. Calm. MLB compare with no teams picked.
Right: Stale — context bar “Slate shown: Sep 5 · 4 days old” + Retry. Does not say “15 games today”.

No fake stats, no lorem, no stack traces, no extra leagues.
```

---

## Visual matrix (why these frames exist)

| Surface | Live today | These prompts draw |
|---|---|---|
| Root | Four-sport essay + engineering footnote | MLB + NFL product door with two preview cards |
| Opening | “Need to Win”, signup first | Research desk, MLB primary, NFL in chrome |
| NFL matchups | Model 6.54 / Market 3 / gap axis | Kickoff groups + attributed book line |
| MLB hub | Picks/Gems jargon | Public slate + scouting-desk CTA |
| Nav / pills | WNBA + CFB | MLB + NFL only |
| `/models/` | 404 | Gated forecast desk, two sports |
| Team Rankings | Not a nav item (keep it that way) | Team context inside the MLB matchup |
