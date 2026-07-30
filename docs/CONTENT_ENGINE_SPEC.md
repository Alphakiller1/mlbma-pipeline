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

Artifacts are captured at `CAPTURE_DPR = 2`. An artifact's **native size** is its CSS
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

MAX_ZOOM = CAPTURE_DPR  (2.0 — the point where a source pixel per output pixel runs out)
```

**Why shared, and not "fit each artifact to the column".** Fitting each artifact to the
column width means a 434px matchup card is scaled 2.27× while an 1140px stats table is
scaled 0.86× — a **2.6× difference in rendered type size inside one image**. Shared zoom
makes 11px type on the source render at the same size everywhere. Widths then differ;
that is the correct trade, and centring keeps it symmetric.

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

Tokens: deep navy `--bg` #08090F, violet `--v-*` #5B2BE0→#9A6BFF, gold `--gold` #E8C24A
(eyebrow only), `--metal-silver` title gradient, DM Sans body / Roboto Condensed display.
All are read from the site's stylesheets — never hard-code a hex in the compose route.

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
    "hide": [".hub-control-bar"],   # strip interactive affordances
    "unclip": [".table-wrap"],      # release fixed-height scrollers
    "unstick": ["thead th"],        # un-stick sticky headers
    "default_rows": 14,             # cap table rows
}
```

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

## 11. Command reference

```
compose     any registered/ad-hoc artifacts        --artifacts / --capture [--layout row]
preview     N matchup cards side by side           --games CLE@CIN,TEX@TBR,CHC@STL
deep        1-3 games, chosen artifacts, 1 image   --games PHI@MIA --artifacts banner,radar
breakdown   1 game, up to 3 graphics               --games PHI@MIA --aspects pitching,offense,bullpen
full-card   whole slate as banners + starters      --per-post 6
rankings    unit rankings                          --type starters | --type team --family winning --window L30
```

Text flags apply to every command: `--eyebrow --headline --sub --take --cta --note`
(repeatable). Run from the repo root, or via `content.bat`.
