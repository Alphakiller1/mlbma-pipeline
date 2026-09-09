# Chase Analytics image-generation prompts — implemented public architecture

These prompts visualize the same system implemented in the repository. Public
Chase Analytics supports MLB and NFL only. WNBA and CFB remain future design
references and must not appear in generated public screens.

## Shared style lock

Paste this block before one screen prompt:

```text
Create a precise high-fidelity product UI for Chase Analytics, a premium sports matchup research site. This is an implementation reference, not concept art.

CANVAS AND GRID
- Desktop frame 1440×900 unless stated otherwise; centered content max-width 1360px; 24px outer gutters.
- Sticky 64px header and 36px factual context bar.
- 12-column layout; 12px card gaps; 3 matchup cards per row at 1440px, 2 at tablet, 1 on phone.
- Dark opaque canvas #08090F. Opaque panels #12141D and inset fields #181B26. Fine low-contrast borders. No glass, no stadium photography, no gradients dominating the page.

BRAND AND TYPE
- Chase Analytics violet brand mark and wordmark at left. Violet #9A6BFF is reserved for active navigation, the 3px card edge, links, and focus—not data grading.
- Condensed strong display type for headings; calm sans serif for UI; highly legible tabular numbers.
- Compact editorial density inspired by an elite broadcast research desk and modern baseball analysis tools.

PUBLIC NAVIGATION
- Desktop links: Home, Matchups, MLB, NFL, Glossary. One separate Model Center button at the far right.
- Mobile: logo and 44px hamburger. No visible WNBA or CFB.

PUBLIC CONTENT HARD RULES
- Use official team logos and full team names everywhere. Never show team abbreviations as the visible identity.
- Public cards and detail sections show factual schedules, official scores when games are live/final, records, probable starters or quarterbacks, lineup or player availability, bullpens for MLB, rest/travel for NFL, venues, weather, surface, broadcasts, sources, and freshness.
- Every collapsed card has exactly two actions: “Expand matchup” and “Full matchup analysis”.
- Do not show predicted or projected scores, projected runs/points, win probability, picks, recommendations, confidence, an advantage/edge score, betting lines, odds, model-versus-market axes, or model-performance tiles.
- Do not place another Model Center link inside a card or public content module.
- Missing facts say “Not published” or “Report pending”; do not invent data.

SURFACE ANATOMY
- Collapsed matchup card: 272–350px tall desktop; top row time/broadcast plus status pill; center identity band with two official logos and full names; three compact factual cells; bottom action row.
- Expanded card spans the row and reveals two balanced team columns plus sport-specific factual context.
- All controls are at least 44px tall; clear focus rings; no horizontal overflow.
```

## Prompt 1 — matchup-centered homepage

```text
[PASTE SHARED STYLE LOCK]

Render chase-analytics.com at 1440×900.

The page begins directly under the context bar with eyebrow “MLB · NFL · MATCHUP RESEARCH”, H1 “Every game. The context that matters.”, and a one-line factual description. No marketing splash, pricing block, or empty hero illustration.

Below, show “MLB matchups” and the first two rows of a 3-column card grid. Use plausible teams with official logos and full names, such as Minnesota Twins at Detroit Tigers, Toronto Blue Jays at Athletics, and St. Louis Cardinals at San Francisco Giants. Each card follows the exact collapsed anatomy from the style lock.

Below that, begin “NFL matchups”, grouped by kickoff window derived from date/time. Show New England Patriots at Seattle Seahawks with quarterbacks and availability rather than baseball labels.

Make the result feel like a finished, deployable research product: disciplined spacing, no decorative emptiness, no visible abbreviations, no predictive content.
```

## Prompt 2 — one expanded MLB card

```text
[PASTE SHARED STYLE LOCK]

Render the MLB matchup page at 1440×900. Header has MLB active. Toolbar contains Previous day, a centered date, Next day, search, and factual status filters.

Show a 3-column grid. The first Minnesota Twins at Detroit Tigers card is expanded and spans all three columns. Its persistent collapsed header shows official logos, full names, records, first pitch, broadcast, probable starters, lineup status, and Comerica Park. The disclosure button now reads “Collapse matchup” with an upward chevron; “Full matchup analysis” remains beside it.

Inside the expanded area show two equal starter panels with headshots, names, throwing hand, and season ERA; separate Minnesota and Detroit lineup states; separate bullpen-availability cells; ballpark and weather. Missing data is explicitly labeled. Other cards remain collapsed beneath it.

No betting data, no predicted score, no probability, no private-workspace call to action.
```

## Prompt 3 — MLB full matchup analysis

```text
[PASTE SHARED STYLE LOCK]

Render chase-analytics.com/mlb/matchup.html at 1440×900.

Top hero: small “MLB · MATCHUP ANALYSIS” eyebrow, status and broadcast, Minnesota Twins official logo + full name + record on the left, first pitch and Scheduled in the center, Detroit Tigers official logo + full name + record on the right. Under it, four factual cells: Venue, Conditions, Broadcast, Status.

Add a sticky local section nav: Overview, Starters, Lineups, Bullpens, Conditions, Sources.

Page sections are opaque lacquered panels with a 3px violet left edge:
1. Probable starters — two balanced team panels, headshot, full name, hand, ERA, lineup status.
2. Lineup availability — independent team states and opposing-starter context.
3. Bullpen availability — recent workload status per team.
4. Ballpark and conditions — venue, city, weather, surface, start time.
5. Sources and freshness — readable publication/source sentence.

No chart exists merely to fill space. No predictive, betting, probability, confidence, or recommendation content.
```

## Prompt 4 — NFL slate and expanded card

```text
[PASTE SHARED STYLE LOCK]

Render chase-analytics.com/nfl/ at 1440×900 with NFL active.

Heading “NFL Matchups”. Group cards by real kickoff windows such as “Wednesday, Sep 9 · night” and “Sunday, Sep 13 · 1:00 PM ET”; never assume the opener is Thursday.

Use official logos and full names. Show New England Patriots at Seattle Seahawks expanded across the row. Persistent facts: kickoff, broadcast, records, expected quarterbacks, player-availability status, Lumen Field. Expanded team columns contain quarterback, official player-availability summary, rest days, road/home travel. Environment row contains venue, city, weather, and surface.

Do not show lineup, probable-pitcher, ERA, bullpen, or other baseball language. Do not show a spread, total, odds, predicted score, probability, advantage score, pick, or recommendation.
```

## Prompt 5 — mobile public flow

```text
[PASTE SHARED STYLE LOCK]

Render a 390×844 iPhone viewport of the Chase Analytics homepage.

Header is 56px with the violet mark/wordmark and one 44px hamburger. A 40px context bar follows. Show the H1 and one MLB matchup card in a single column. Within the card, retain official logos and full team names in a balanced two-team identity band; use compact two-column factual cells with venue spanning the width; keep “Expand matchup” and “Full matchup analysis” side by side as 44px controls when possible.

Show the top of the next card to communicate scrolling. No horizontal overflow, clipped copy, tiny controls, visible abbreviations, dense desktop table, or private analysis values.
```

## Anti-drift line

Append if the generator ignores the boundary:

```text
Regenerate: remove every visible team abbreviation, WNBA/CFB item, predicted/projected score, probability, pick, recommendation, confidence, betting line, odds, advantage/edge metric, model-versus-market chart, performance tile, and in-card Model Center link. Keep official logos, full names, factual matchup context, Expand matchup, and Full matchup analysis.
```
