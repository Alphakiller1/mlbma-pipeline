# Chase Analytics Content Engine — Command Guide & Key

Everything you need to drive the engine from a terminal: the commands, the components,
and the phrases that summon them.

*Generated from the code by `scripts/gen_content_guide.py` — re-run it after adding an
artifact or alias. Design rules and the reasoning behind the layout live in
[CONTENT_ENGINE_SPEC.md](CONTENT_ENGINE_SPEC.md).*

---

## Quickstart

```powershell
cd C:\Users\chase\mlbma_pipeline

.\content.bat keys                                    # print the key, no browser needed
.\content.bat preview --games TEX@TBR,CHC@STL         # a post
```

Every command writes PNGs plus an appended `captions.txt` to:

```
outputs\social_cards\<slate-date>\
```

Open the folder with `explorer outputs\social_cards\<slate-date>`. The filename pattern is
`<command>_<subject>_<WIDTHxHEIGHT>.png`, so the size tells you the platform.

---

## The commands

### `keys` — print the component key
No browser, no data needed. The fastest way to remember what you can assemble.

```powershell
.\content.bat keys
```

### `preview` — a few matchups, side by side
The concise post: one card per game, placed in a row. Best at 2–3 games; 4 gets tight and
the engine will tell you so.

```powershell
.\content.bat preview --games TEX@TBR,CHC@STL,PIT@CIN `
  --eyebrow "Wednesday Slate" --headline "Three To Watch" `
  --take "Two of these have a starter the market still prices on last month's form."
```

Picks the square canvas for 3+ games, the 4:5 feed post for 1–2.

### `deep` — one matchup, your choice of components
Assembles the components you name into a single image. Omit `--artifacts` in a terminal
and it prompts you with a numbered list.

```powershell
.\content.bat deep --games PIT@CIN --artifacts "matchup analysis,team profile,lineup form"
```

Takes 1–3 games; each game gets its own image.

### `breakdown` — one matchup, up to three graphics
Splits a full matchup into aspect graphics — a carousel, essentially.

```powershell
.\content.bat breakdown --games PIT@CIN --aspects pitching,offense,bullpen
```

### `full-card` — the whole slate
Every game as a banner, with the starters named underneath. `--per-post` controls how many
banners per image.

```powershell
.\content.bat full-card --per-post 6
```

### `rankings` — unit rankings
Either today's starters, or all 30 clubs in one category and window.

```powershell
.\content.bat rankings --type starters --rows 12
.\content.bat rankings --type team --family winning --window L30
```

`--family`: `scoring` · `winning` · `difficulty` · `projection`
`--window`: `YTD` · `L30` · `L14` · `L7`

### `compose` — anything, from anywhere
The adaptive path. Use it for slate-wide components, the mlb-model deck, or any page on the
site with no code change at all.

```powershell
.\content.bat compose --artifacts "model summary,projections,leans"

.\content.bat compose --capture "label=Team Profile;page=team_profile.html;params=team%3DNYY;selector=.tp-trend-table"
```

`--capture` fields: `label` `url` **or** `page` `selector` (required), plus optional
`contains` `hash` `eval` `force_show` `hide` `unclip` `unstick` `wait` `framed` `name`.
Repeat the flag for more than one. `--layout row` puts them side by side; `--layout grid`
wraps them and picks its own column count.

---

## Labelling individual slots

`--captions` adds a label to each slot, in the order the slots appear. It is appended to
the caption the engine already derived, so the slot keeps its identity:

```powershell
.\content.bat preview --games TEX@TBR,NYY@CHW,CHC@STL,WSN@ATL,SEA@LAD `
  --captions ",AL,NL Central,NL East,"
```

gives `TEX @ TBR`, `NYY @ CHW · AL`, `CHC @ STL · NL CENTRAL`, `WSN @ ATL · NL EAST`,
`SEA @ LAD` — an empty entry keeps just the default.

- Prefix a label with `=` to **replace** the caption instead of appending.
- One flag with commas is a list. **Repeat the flag** when a label itself contains a
  comma; each occurrence is then one slot, verbatim.
- Extra labels beyond the slot count are reported, never silently dropped.

---

## Matchup components

Need `--games`. Used by `preview`, `deep` and `breakdown`.

| Key | What it shows | Say any of |
|---|---|---|
| **`card`** | Full game card: both starters with pitch scores and K/BB/ERA, the lineup edge bar, and both projected lineups with handedness. | `matchup card` · `game card` · `the card` · `lineup card` · `projected lineups` · `lineups` |
| **`banner`** | Wide identity strip: records, last-10 form pips, first pitch, venue and weather. The compact way to show a matchup. | `matchup banner` · `analysis banner` · `matchup analysis` · `strip` · `identity strip` · `form` |
| **`radar`** | Two five-axis radars comparing the lineups on process composite (RCV/ABQ/OSI/OBR/projOSI) and offense vs schedule. | `team radar` · `profile radar` · `team profile` · `process radar` · `spider` · `spider chart` |
| **`offense`** | Both lineups' wRC+/OPS/wOBA/SLG ranks over L7, L14, L30 and YTD, split overall, by opposing hand, and home/road. | `offense splits` · `offensive split comparison` · `offensive splits` · `bats` · `lineup form` · `splits` · `hitting` |
| **`pitcher`** | Away lineup batter-by-batter vs the home starter, that starter's allowed splits by batter hand, and career hitter-vs-pitcher history. | `pitcher splits` · `starter splits` · `starter` · `lineup vs starter` · `hitter vs pitcher` · `matchup history` · `pitcher history` |
| **`pitcher_rev`** | The same board with the sides swapped: home lineup vs away starter. | `reverse pitcher splits` · `other starter` · `home lineup vs starter` · `pitcher splits reversed` |
| **`bullpen`** | Away lineup batter-by-batter vs the home bullpen only (starters excluded). | `relief` · `bullpen splits` · `lineup vs relief` · `pen` · `relievers` |
| **`bullpen_rev`** | The same board swapped: home lineup vs the away bullpen. | `reverse bullpen` · `other bullpen` · `bullpen reversed` · `home lineup vs relief` |

## Slate components

No `--games` needed. Used by `rankings` and `compose`.

| Key | What it shows | Say any of |
|---|---|---|
| **`starters_rankings`** | Every projected starter on the slate ranked by Pitch Score, with K%/BB%/ERA/FIP, what they allow, and stuff flags. | `starters rankings` · `todays starters` · `pitcher rankings` · `ranked starters` · `best to worst` · `pitch score` · `pitching score` |
| **`trends_heatmap`** | League-wide trend heat map from the Research Lab. | `trends` · `heat map` · `heatmap` · `trends heat map` |
| **`model_slate`** | Model projections per game: win probability, projected total, margin, lean and sharp flag. | `model slate` · `projections` · `model projections` · `win probability` · `projected totals` · `model board` |
| **`model_leans`** | The model's biggest priced gaps, ranked by edge, with the model number and state. | `leans` · `biggest leans` · `model leans` · `edges` · `biggest edges` |
| **`model_kpis`** | Model slate summary strip: game count, slate date, how many carry a sharp signal, priced markets, and the decision gate. | `model summary` · `slate summary` · `model kpis` · `model header` |
| **`model_props`** | Model pitcher-prop board. | `model props` · `pitcher props` · `props` |
| **`team_rankings`** | All 30 clubs ranked in one category (scoring, winning, difficulty or projection) over a chosen window. | `team rankings` · `league rankings` · `all 30` · `club rankings` · `team board` |

---

## Aspect sets

`breakdown --aspects` takes these. Each builds one graphic.

| Aspect | Components | Also accepts |
|---|---|---|
| **`pitching`** | `pitcher`, `pitcher_rev` | `pitchers` · `starters` · `arms` |
| **`offense`** | `banner`, `offense`, `radar` | `bats` · `hitting` |
| **`bullpen`** | `bullpen`, `bullpen_rev` | `relief` · `pen` |

---

## Text slots

Available on every command. Over budget is a warning, not an error — the engine tells you a slot will wrap and squeeze the components.

| Flag | Max chars | Role | Rendered as |
|---|---|---|---|
| `--eyebrow` | 28 | Small label above the title | Gold, uppercase, tracked |
| `--headline` | 42 | The claim - your hook | Silver metallic display, uppercase |
| `--sub` | 130 | Neutral one-sentence setup | Muted body text |
| `--take` | 190 | **Your angle** - the only slot styled as opinion | Italic, violet rule |
| `--cta` | 60 | Where to go next | Under the site URL |
| `--note` | 95 | Evidence bullet, repeatable up to 3 | Violet bullets |

`--take` is where your read goes. It is the only slot styled as opinion, so a reader can always separate your argument from the measured artifact. Keep `--sub` factual.

> The engine renders whatever claim you type — it does not check your notes against the data. A wrong note ships as confidently as a right one.


---

## Canvas sizes

| Size | Ratio | Use |
|---|---|---|
| `1080x1350` | 4:5 | **Default** — Instagram feed |
| `1080x1080` | 1:1 | 3+ cards in a row, or a light post |
| `1080x1920` | 9:16 | Story, and the rescue size for dense stacks |
| `1600x900` | 16:9 | X / link preview |

`--size` pins one. Left alone, the engine picks and will re-render itself when a post is
either too squeezed or too empty:

- **Squeezed** below 62% of captured size → re-renders at `1080x1920`, and warns if
  it's still tight. Use fewer components.
- **More than 240px of dead space** → drops to `1080x1080`.

Both decisions are printed, so you always know why a file came out at a given size.

---

## Captions

`captions.txt` in the same folder gets a block appended per post — title, deck, your take,
notes, and the site line — ready to paste into the caption box. It accumulates in run
order, newest at the bottom.

---

## When something goes wrong

The engine fails closed: it would rather write nothing than ship a wrong graphic.

| Message | What it means |
|---|---|
| `slate date(s) [...] != requested` | `data/today_matchups.csv` is for another day. The slate rolls forward once every game has started — pass `--date` for a past slate. |
| `no .hero-matchup-card matched this game` | Card components come from the **live** dashboard, so the local slate has to match what the site is serving. Slate-wide components (rankings, model deck) are never affected. |
| `is a doubleheader on this slate` | Two games share that pairing — say `CLE@CIN#1` or `#2`. |
| `does not name an artifact` | Run `keys`; the error lists the closest matches. |
| `artifacts squeezed to NN%` | Too much in one image. Fewer components, or let it use the story canvas. |
| `N image(s) failed to load` | A headshot or logo didn't load. Re-run; the artifact is otherwise fine. |

---

## Adding to the key

`ARTIFACT_DESC` and `ARTIFACT_ALIASES` in `outputs/content_engine.py` are the single source
for the key. Add a phrase there and it works in every command immediately — then re-run
`python scripts/gen_content_guide.py` to refresh this document.
