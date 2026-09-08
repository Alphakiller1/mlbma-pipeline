# Chase Analytics Content Engine — Layout, Brand & Text Spec

Status: implemented in `outputs/content_engine.py` + `dashboard/card_compose.html`.
Last verified 2026-07-30 against the live dashboard and the hosted mlb-model deck.

---

## 1. The one principle

**Artifacts are captured pixels of the real product, never a re-implementation.**

Every chart, table and card in a post is a screenshot of the live dashboard (or the
mlb-model deck), taken through the site's own stylesheets. Post chrome — brand mark,
type, spacing — is a card route (`card_compose.html`) that links `theme.css` and
`mlbma_design_system.css` directly.

Consequence: a post cannot drift from the site's design, because there is no second
copy of the design. This is the reason the engine screenshots instead of rebuilding,
and it is the rule to protect when extending anything below.

---

## 2. Canvas

| Size | Ratio | Use |
|---|---|---|
| `1080x1350` | 4:5 | **Default.** Instagram feed post. |
| `1080x1080` | 1:1 | 3+ artifacts side by side; or a post with slack to spare. |
| `1080x1920` | 9:16 | Story; the rescue canvas for dense stacks. |
| `1600x900` | 16:9 | X / OG card. |

Padding (safe area) is set per canvas in `card_compose.html`: `44/48/36px` on 4:5,
`38/44/32` on 1:1, `84/48/72` on 9:16, `36/52/32` on 16:9. Nothing but the background
gradient may enter that margin.

**Auto-selection.** `--size` pins a canvas. Left unset:

- `preview` picks 1:1 for 3+ matchup cards, 4:5 for 1–2 (cards are fixed-height
  portraits; three across only fills a square).
- Any stacked post squeezed below the legibility floor re-renders on 9:16.
- Any stacked post leaving more than `SLACK_CEILING` (240px) of dead vertical space
  re-renders on 1:1.

---

## 3. Relative measurement model

This is the part that governs whether a post looks composed or assembled.

### 3.1 Native size

Artifacts are captured at `CAPTURE_DPR = 3`. An artifact's **native size** is its CSS
size on the source page: `bitmap ÷ CAPTURE_DPR`. All geometry below is in native units,
never bitmap units. (Measuring against the bitmap was a real defect: it reported half
the true scale and warned about perfectly legible posts.)

### 3.2 One zoom per post

Every artifact in a post is scaled by a **single shared zoom `Z`**, then centred.

```
stack:  Z = min( MAX_ZOOM,  availW / max(nativeW),
                 (availH − gaps − captionChrome) / Σ nativeH )
row:    Z = min( MAX_ZOOM,  (availW − gaps) / Σ nativeW,
                 (availH − captionChrome) / max(nativeH) )

MAX_ZOOM = CAPTURE_DPR  (3 — the point where a source pixel per output pixel runs out)
```

**Why shared, and not "fit each artifact to the column".** Fitting each artifact to the
column width means a 434px matchup card is scaled 2.27× while an 1140px stats table is
scaled 0.86× — a **2.6× difference in rendered type size inside one image**. Shared zoom
makes 11px type on the source render at the same size everywhere. Widths then differ;
that is the correct trade, and centring keeps it symmetric.

**Which term binds decides what `viewport_w` is for.** The site's tables are fluid, so
the usual advice is "capture narrower, get bigger type" — true only while the `availW`
term is the smaller one. A tall artifact (a 16-row board is ~758px, essentially the whole
vertical budget of a 1080×1350 post) is bound by the `availH` term instead, and native
height does not move with capture width. Capture such a board narrow and the type comes
out **exactly the same size**, just floating inset in the canvas. There, `viewport_w`
should be set so the board's own width lands on the artifact column (984px at 1080 wide):
same type, no dead margin. Check which term binds before tuning a width — `viewport_w`
is a two-purpose lever and picking the wrong purpose wastes the post.

### 3.3 Width classes

Artifacts cluster by native width:

| Class | Native width | Members |
|---|---|---|
| CARD | ~434px | matchup card |
| BOARD | ~1140px | banner, radar, offense, pitcher, bullpen, rankings tables |
| DECK | 496–1368px | mlb-model terminal panels |

Mixing classes is legal and centred, but when the widest/narrowest ratio exceeds
`WIDTH_SPREAD_WARN` (1.5) the engine says so: the narrow artifact sits inset rather
than stretched. **Prefer one width class per stacked post.** Same-class artifacts share
exact left and right edges — that is the strongest alignment the layout can give.

### 3.4 Legibility

`LEGIBILITY_FLOOR = 0.62`. Below that zoom, stat tables stop being readable on a phone.
Crossing it triggers the 9:16 re-render; if it is still below afterwards the engine
prints the achieved percentage and tells you to use fewer artifacts (stack) or fewer
games (row). It never silently ships an unreadable post.

Rule of thumb: **one BOARD artifact per 400px of canvas height.** Three boards is the
practical maximum on 4:5; five needs 9:16 and reads as a reference graphic, not a post.

---

## 4. Symmetry & alignment rules

1. **One zoom** (§3.2) — type size is constant across artifacts.
2. **Centred on the vertical axis** — slots never stretch; mixed widths stay
   symmetric rather than edge-ragged.
3. **Equal gaps** — a single `gap` token per canvas drives both stack and row.
4. **Rows are equal-width by construction** — matchup cards share a native size, so a
   row of them is exactly symmetric.
5. **Captions are centred under their artifact**; post-level prose (`notes`) stays
   left-aligned. A caption belongs to one artifact, a note belongs to the post.
6. **Directional pairs are always both-or-neither.** The pitcher-splits and bullpen
   views show one lineup against the other side's pitching, so `pitching` and `bullpen`
   graphics carry the artifact *and* its reverse, labelled with the teams.

---

## 5. Brand layer

**Header carries the mark alone** — `assets/chase-icon-outline.png`, the violet arch,
1024px source. The wordmark is deliberately dropped to buy vertical room for artifacts;
the footer's `chase-analytics.com` carries the name.

| Canvas | Mark height |
|---|---|
| 1080x1350 | 46px |
| 1080x1080 | 40px |
| 1080x1920 | 54px |
| 1600x900 | 40px |

- Clear space around the mark ≥ 25% of its height; nothing may sit inside it.
- The mark gets `drop-shadow(0 0 12px rgba(124,77,255,0.45))` so it separates from the
  near-black field. Do not recolour it.
- **Never use `chase-logo-horizontal.png` on a dark post** — its "CHASE" text is black.
  Only the icon assets and the `-light` variants are dark-safe.
- Footer is fixed and non-negotiable: site URL, optional CTA, and
  `Model-generated research. Not betting advice. 21+.` on the right.

**The title must carry the site's own `ca-page-title` class.** `theme.css` contains
`h1:not(.ca-page-title):not(.ca-profile-hero__title) { -webkit-text-fill-color:
var(--v-heading) !important }`, so any other `h1` is forced to flat violet no matter what
the compose route declares — which is exactly what happened before 2026-07-30. Adding the
house class hands the element the real metallic silver
(`linear-gradient(180deg,#FFFFFF,#E9EAF0 38%,#9DA0AE 56%,#D7D9E2 72%,#FFFFFF)`) with
`!important`, so the compose route declares only geometry (size, tracking, case) and never
re-states the gradient. Same principle as the artifacts: use the site's component, don't
copy it.

Tokens: deep navy `--bg` #08090F, violet `--v-*` #5B2BE0→#9A6BFF, gold `--gold` #E8C24A
(eyebrow only), DM Sans body / Roboto Condensed display. All are read from the site's
stylesheets — never hard-code a hex in the compose route.

---

## 6. Text integration spec

The text layer exists so a post carries **your reading of the data**, not just the data.
Six slots, in reading order:

| Slot | Flag | Budget | Voice | Rendering |
|---|---|---|---|---|
| Eyebrow | `--eyebrow` | 28 | Category label | Gold, uppercase, tracked |
| Headline | `--headline` | 42 | **The hook** — the claim | Display, metal gradient, uppercase |
| Deck | `--sub` | 130 | Neutral one-sentence setup | Body, muted |
| **Take** | `--take` | 190 | **Your perspective / angle** | Italic, violet left rule |
| Notes | `--note` (×3) | 95 each | Supporting evidence | Violet bullets, left-aligned |
| CTA | `--cta` | 60 | Where to go next | Under the site URL |

Over budget is a warning, not an error — the engine tells you a slot will wrap and
squeeze the artifacts, and lets you decide.

**Heading size.** `--heading-scale X` (0.7–1.6, default 1.0) multiplies the chrome
heading block — eyebrow, headline, deck — together. The sizes are declared as
`calc(px * var(--cc-head))` in the compose route, so one property moves them at every
canvas size instead of a size variant overriding a scaled title. The take, notes and
footer stay at reading size: this dial is for the heading, not the copy. Scaling up
takes room from the artifacts, so a large lede on a stacked post can trip the
legibility rescue onto a taller canvas.

### 6.1 The take — where perspective goes

`--take` is the only slot styled as opinion: italic, set off by a violet rule, visually
distinct from every machine-generated caption. Everything else in the image is either
measured (artifact pixels) or neutral labelling (auto captions).

That separation is the point: **a reader can always tell your argument from the
model's output.** Put the angle here — "the market is still pricing Miami's June, not
the lineup they run out today" — and leave the deck factual.

### 6.2 Authorship rules

- **Machine-authored, never editorial:** per-artifact captions, the meta line,
  directional labels ("PHI lineup vs MIA relief"), the footer.
- **Human-authored:** eyebrow, headline, deck, take, notes, CTA.
- The engine never invents a claim, and never states a number that also appears in an
  artifact. First pitch is a worked example: the slate CSV's time column was wrong for
  finished day games, and printing it beside a banner showing the true time produced a
  self-contradicting image. **Composed text does not state first pitch** — the artifact
  is the source of truth for anything visible in it.
- Anything a viewer could read as a betting instruction stays out. The disclaimer is
  not a licence to editorialise past research.

---

## 6.3 The key — assembling by language

`--artifacts` accepts any phrase from the key, not just the canonical name, so a post can
be described the way you'd say it out loud:

```
--artifacts "projected lineups,bullpen,leans"   ==   --artifacts card,bullpen,model_leans
--artifacts "matchup analysis,team profile"     ==   --artifacts banner,radar
--aspects   "relief"                            ==   --aspects bullpen
```

Resolution is case-, space-, hyphen- and underscore-insensitive, matches on substrings
when unambiguous, and fails with the closest candidates when it isn't. Run:

```
content.bat keys
```

to print every artifact with what it shows and the phrases that reach it, plus the aspect
sets and the text slots with their budgets. `ARTIFACT_DESC` and `ARTIFACT_ALIASES` in
`outputs/content_engine.py` are the single source for that key — add a phrase there and it
works everywhere immediately.

---

## 7. Artifact catalog

`scope: game` needs an away/home pair; `scope: slate` serves the whole post.

| Name | Source | Native | Scope |
|---|---|---|---|
| `card` | index.html matchups hero | 434×698 | game |
| `banner` | matchup_compare `.mc-header` (kicker stripped) | 1140×183 | game |
| `radar` | matchup_compare `.mc-radar-duo` | 1140×391 | game |
| `offense` | matchup_compare `.mc-os-duo` | 1140×776 | game |
| `pitcher` / `pitcher_rev` | matchup_compare lvP | 1140×860 | game |
| `bullpen` / `bullpen_rev` | matchup_compare lvB | 1140×727 | game |
| `starters_rankings` | Research Lab → Pitcher Intelligence | ~1140×var | slate |
| `team_rankings` | team_rankings.html (`family`, `window`) | ~1140×var | slate |
| `trends_heatmap` | Research Lab → Trends | ~var | slate |
| `model_kpis` | mlb-model `.terminal-kpi-row` | 1368×72 | slate |
| `model_slate` | mlb-model slate projections panel | 862×624 | slate |
| `model_leans` | mlb-model biggest-leans panel | 496×464 | slate |
| `model_props` | mlb-model props view | var | slate |
| `nfl_power_top` | nfl-model `#ratings table.pr`, rows 1–16 | 984×758 | slate |
| `nfl_power_bottom` | the same board, rows 17–32 | 984×757 | slate |
| `nfl_edges` | nfl-model `#disagreements`, all priced games | 982×726 | slate |
| `nfl_offense` | nfl-model `#units` offence block, rows 1–16 | 984×686 | slate |
| `nfl_defense` | the same section's defence block | 984×686 | slate |
| `nfl_seeds_afc` / `nfl_seeds_nfc` | nfl-model `#seeds` conference field | 984×686 | slate |
| `nfl_divisions_afc` / `nfl_divisions_nfc` | `#divisions`, four cards | 772×518 | slate |
| `nfl_gate_tiles` | nfl-model `#authority .tiles` | 984×131 | slate |
| `nfl_authority` | the whole `#authority` section | 984×956 | slate |
| `nfl_qb_props` … `nfl_k_props` | nfl-model `#players`, rows 1–16 | 984×738 | slate |
| `nfl_scheme_matrix` | nfl-model `#scheme` response matrix, rows 1–16 | 984×769 | slate |
| `nfl_game` | nfl-model `#board .bd-card` | 485×890 | game |
| `nfl_game_lines` | the same card, price blocks only | 485×463 | game |

Every native size above was measured on the hosted board, not estimated. The NFL
artifacts capture **the deployed page**, not nfl-model's committed `docs/index.html`:
Pages publishes that repo from its build workflow, so the two are allowed to differ,
and the live board is already further ahead — `#players` and `#scheme` exist only
there. Capture what the post's CTA points at.

`--games` for `nfl_game` / `nfl_game_lines` resolves against nfl-model's published
`board.json`, never the baseball slate, and the sport is read from the artifact's own
`sport` key rather than inferred: MLB and NFL share sixteen abbreviations, so `SEA@SF`
is a real fixture in both and a guess would silently pick the wrong one.

Pitcher headshots and team logos are remote images inside `card`, `pitcher*` and the
compare banner. The engine counts broken images inside every captured element and warns
when any failed to load, so a post never ships an empty headshot frame.

---

## 8. Extensibility

The engine is registry-driven; **nothing about baseball or the matchup brief is
hard-coded into the layout.** Two ways to reach new content:

### 8.1 Registry entry

```python
"my_artifact": {
    "label": "Human name",          # or label_fmt with {away}/{home}
    "scope": "slate",               # or "game"
    "page": "team_profile.html",    # local dashboard page ...
    "url": "https://…",             # ... or an absolute URL (other repos, staging)
    "params": {"team": "NYY"},      # query string
    "hash": "section-research-lab", # view to activate
    "eval": "window.showResearchSubtab('pitching');",  # app's own switcher
    "force_show": ["#v-props"],     # reveal an inactive tab
    "open_details": True,           # expand collapsed <details>
    "selector": ".terminal-panel",  # what to shoot
    "contains": "PROJ TOT",         # disambiguate; must match a VISIBLE element
    "match_data": "key",            # ...or disambiguate on a data- attribute
    "hide": [".hub-control-bar"],   # strip interactive affordances
    "unclip": [".table-wrap"],      # release fixed-height scrollers
    "unstick": ["thead th"],        # un-stick sticky headers
    "default_rows": 14,             # cap table rows (cut from the bottom)
    "rows_from": 17,                # drop the rows ABOVE this one (slide two)
    "drop_cols": ["Eff"],           # remove columns by header text
    "style": ".wrap{border-radius:0!important}",   # one-off CSS for this capture
    "viewport_w": 1032,             # capture width; see §3.2 before choosing one
    "sport": "NFL",                 # names the footer line; default is MLB
}
```

**Splitting a long board across slides.** `default_rows` cuts from the bottom and
`rows_from` cuts from the top, so a board too deep for one post ships as a pair of
artifacts over the same source. The site's own rank column is never rewritten — slide
two starts at 17, so it reads as a continuation rather than a second ranking. Give both
entries the *same* `viewport_w`, `drop_cols` and canvas: two slides of one carousel are
compared by the eye on the swipe, and a few percent of size difference between them is
visible where the same difference on a single post is not.

`default_rows` and `rows_from` are the entry's defaults; `--rows` and `--rows-from`
override them per run, so one registry entry ships both slides of a pair.

**Match on text, or on a data attribute.** `contains` searches `innerText` and is right
for a block with a heading ("Offense power ranking"). It is wrong for anything whose
identity is a short code: the NFL board's game cards would match `NE` on every card
carrying the words MONITOR or MONEYLINE. Those cards key themselves
(`data-key="2026_01_NE_SEA"`), so `match_data` compares the attribute instead and
matches the fixture exactly.

**The footer names a sport.** It is derived from the artifacts in the post via their
`sport` key (default `MLB`), so an NFL board can never ship under "Access Premium MLB
Research". A post mixing sports says "Sports". The same key decides which league's
fixture list `--games` names.

**A capped table must not carry the uncapped table's count.** Several boards label
themselves ("QB projections · 32 players", "32 team matchups"). Cut to 16 rows, that
label is a claim the image itself disproves, so those entries hide the count in `style`
along with the `<details>` disclosure marker. Check for a self-describing count
whenever you add `default_rows` to a new source.

### 8.2 Ad-hoc, no code change

```
--capture 'label=Edge Board;url=https://alphakiller1.github.io/mlb-model/;selector=#v-today .terminal-panel;contains=PROJ TOT'
--capture 'label=Team Profile;page=team_profile.html;params=team%3DNYY;selector=.tp-trend-table'
```

Repeatable, and composable with registered artifacts via
`compose --artifacts model_slate --capture '…'`.

### 8.3 Capture-hardening rules (learned the hard way)

1. Resolve **which** element to shoot *before* applying `hide` — the disambiguating
   text often lives in the header being stripped.
2. Hide via an injected **stylesheet**, not inline styles: these views re-render as data
   lands and would resurrect an inline-hidden node.
3. Wait for **stability** (element count + text length unchanged between samples), then
   retry the screenshot — re-renders detach elements mid-capture.
4. `contains` must match a **visible** element (area > 40×40). A match inside a
   collapsed `<details>` or an inactive tab has no box and cannot be screenshotted.
5. Always hide site chrome (`GLOBAL_HIDE`): the sticky header paints over the top of an
   element screenshot and ate a table's column headers.
6. **Capture width sets type size.** The site's tables are fluid: the team board lays
   out 1350px wide at a 1600px viewport and 730px at 780px — same font size, same rows.
   The composer fits ONE artifact to ~1040 CSS px either way, so a wide capture is
   scaled *down* and the site's own 15px type lands at ~11px in the post. Capturing
   narrow is therefore the lever for readable numbers, not a bigger canvas: `viewport_w`
   in the registry, `--capture-width` to override. Floor: 768px, below which the
   responsive contract card-ifies tables.
7. **Bleed guard (horizontal twin of `unclip`).** `fitwidth`/`width:100%` cannot take a
   table below its **min-content** width, so a too-narrow capture leaves the board wider
   than the wrapper that *paints* its background, and the element screenshot picks up
   the page behind it as a seam down the right edge (the starters board bled 77px
   through its OOR column). The capturer measures the artifact against its first painted
   ancestor and widens the viewport until it is covered.
8. **Lazy images must be forced eager.** Headshots and team logos carry
   `loading="lazy"`, so they do not start loading until the element is scrolled into
   view - about 500ms before the shot. A slow headshot shipped as an empty circle on a
   matchup card. The capturer sets `loading=eager` and waits for every `img.complete`
   inside the target.
9. **A stretched card wastes post height.** A grid/flex item with `min-height:100%` is
   captured at its taller sibling's height, and the composer then spends a third of the
   canvas on the void. Measure the children against the card before blaming the
   composer, then fix it with the artifact's `style` hook (free-form CSS in the
   registry entry). `lineup_vs_hand` needs
   `{min-height:0;height:auto;flex:0 0 auto;align-self:start}` and renders ~1.5x rather
   than 0.93x as a result.
10. **Half-boards for social.** The lvP board is two 535px cards side by side; it cannot
   capture under ~1140px, and narrowing it clips the allowed-vs-hand tables rather than
   reflowing them. `lineup_vs_hand` / `lineup_vs_hand_rev` register each half on its own
   so a post can carry one at legible size. Use the full board only where the reader has
   a screen.
11. **Trim columns to buy type size.** `--drop-cols 'OSI Allowed,ABQ Allowed,OOR'`
   removes columns by header text before capture (last `thead` row, prefix match so the
   sort arrow does not break it). Every column removed narrows the board, and the zoom
   rises to fill the frame. Fails closed on a label that matches nothing — a typo would
   otherwise silently ship the untrimmed board.
6. Strip interactive affordances — "View Full Analysis →", window pills, and any copy
   telling the reader to click something.

---

## 9. Validation gates

**Fail closed (exit non-zero, write nothing):**

- slate CSV missing, empty, or not the requested date
- an artifact's selector never renders, or no visible element matches
- `--games` naming a game not on the slate, or an ambiguous doubleheader
  (`CLE@CIN` with two entries → must say `CLE@CIN#1`)
- `--capture` missing `selector=` or both `url=`/`page=`
- the compose page never signalling ready

**Warn (still writes):** broken images inside an artifact; zoom below the legibility
floor after rescue; width spread over 1.5×; text slots over budget; more than one
lineup card per team in the source data.

*A wrong graphic is worse than no graphic.*

---

## 10. Operational constraints

- **Game artifacts come from the live dashboard**, so they exist only for the slate the
  dashboard is currently serving. The slate date rolls forward once every game has
  started (`MLBMA_SLATE_ROLLOVER`), after which the dashboard shows tomorrow while
  `data/today_matchups.csv` still holds today — the engine refuses to mix them. Pin with
  `--date` (and `MLBMA_SLATE_DATE`) when working a past slate.
- Slate-scope artifacts (rankings, model deck) are unaffected by that skew.
- Output: `outputs/social_cards/YYYY-MM-DD/<command>_*.png` plus an appended
  `captions.txt` carrying each post's title, deck, take and notes for the caption box.

---

## 10.1 The video bridge

`--video` emits the motion version of whatever post was just built:

```
compose --artifacts nfl_edges --rows 10 --video --video-platform reels
  -> video/public/captures/<date>/<stem>-N.png      the same captures the still used
  -> video/props/<league>/<stem>.json               BoardMotion props
  -> the npx remotion render line, printed
```

**It reuses the still's capture rather than rebuilding the board in React.** That is
the same decision as §1 and for the same reason: a React reimplementation of these
tables would be a second copy of the site's design, free to fall out of date — the
drift that killed chase-content-engine. Consuming the capture also means every artifact
the still engine can reach is animatable for free, including ad-hoc `--capture` ones
that were never written into any registry.

The directive is written **after** the still lands, so a post that failed its
legibility or slack rescue never leaves a directive pointing at rejected captures.

Props carry each artifact's **native** (CSS) size alongside the file, which is
`CAPTURE_DPR` times larger in pixels. `BoardMotion` lays boards out in those native
units at ONE shared zoom — §3.2's rule, unchanged — and has the source pixels to scale
up to 2× without softening.

**A board sized for a still is not automatically sized for a Reel.** A still is
studied; a Reel is watched, and a 9:16 frame gives a board roughly 1032px of width once
the platform's safe areas are taken out. The engine reports the scale each directive
will get and warns when a board is too wide to render at native size — cut columns
(`--drop-cols`) or rows (`--rows`) rather than shipping type smaller than the site's
own. Platform safe areas live in exactly one place, `SAFE` in
`video/src/graphics/ShowTemplate.tsx`, and are deliberately not restated in Python.

---

## 11. Command reference

```
compose     any registered/ad-hoc artifacts        --artifacts / --capture [--layout row]
preview     N matchup cards side by side           --games CLE@CIN,TEX@TBR,CHC@STL
deep        1-3 games, chosen artifacts, 1 image   --games PHI@MIA --artifacts banner,radar
breakdown   1 game, up to 3 graphics               --games PHI@MIA --aspects pitching,offense,bullpen
full-card   whole slate as banners + starters      --per-post 6
rankings    unit rankings                          --type starters | --type team --family winning --window L30
```

```
--rows N / --rows-from N     row window; splits a long board across two slides
--video                      also write the BoardMotion props + captures (§10.1)
--video-platform NAME        reels | reels-ads | tiktok | shorts | youtube
```

Text flags apply to every command: `--eyebrow --headline --sub --take --cta --note`
(repeatable). Run from the repo root, or via `content.bat`.
