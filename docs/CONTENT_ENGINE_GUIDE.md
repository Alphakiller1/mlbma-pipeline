# Chase Analytics Content Engine — Command Guide & Key

Everything you need to drive the engine from a terminal: the commands, the components,
and the phrases that summon them.

**The live chase-analytics.com is the design contract.** Matchup components are captured
off the site's current routes, and every post is styled with the site's own stylesheets,
mirrored fresh on each run. A site restyle shows up in the next post with no engine change.

*Generated from the code by `scripts/gen_content_guide.py` — re-run it after adding an
artifact or alias. Design rules and the reasoning behind the layout live in
[CONTENT_ENGINE_SPEC.md](CONTENT_ENGINE_SPEC.md).*

---

## Quickstart

```powershell
cd C:\Users\chase\mlbma_pipeline

.\content.bat keys                                    # print the key, no browser needed
.\content.bat preview --games TEX@TBR,CHC@STL         # an MLB post
.\content.bat preview --sport nfl --games DET@BUF      # an NFL post
```

Matchup games come from the site's own published slate
(`/data/public/<sport>/slate.json`), so `--games` must name a game the site is showing.
An MLB post must be dated for the slate the site is showing. After midnight, until the
morning pipeline publishes the new day, pass `--date` for last night's slate. An NFL post
can be dated any day from today through the week's last kickoff.

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
The concise post: the site's slate card for each game (`mlb_card` / `nfl_card`), in a
wrapping grid. Best at 2–3 games; more are split across images.

```powershell
.\content.bat preview --games TEX@TBR,CHC@STL,PIT@CIN `
  --eyebrow "Wednesday Slate" --headline "Three To Watch" `
  --take "Two of these have a starter the market still prices on last month's form."
```

Starts on the 4:5 feed post and steps down to square when the cards leave dead space.

### `deep` — one matchup, your choice of components
Assembles the components you name into a single image. Omit `--artifacts` in a terminal
and it prompts you with a numbered list.

```powershell
.\content.bat deep --games PIT@CIN --artifacts "matchup overview,team profile,last ten"
.\content.bat deep --games DET@BUF --artifacts nfl_hero,nfl_context
```

Takes 1–3 games; each game gets its own image. The post is one continuous capture of
the site's matchup page: the site's matchup banner as the heading, then the sections you
named, with the site's own spacing. No typed title unless you give one.
`--banner-facts` keeps the banner's venue/conditions tiles; `--segmented` goes back to
separate framed blocks under a typed title. The sport comes from the components; with
no `--artifacts` and no terminal it uses the overview plus last ten (MLB) or the overview
plus rest/travel (NFL) for `--sport`.

### `breakdown` — one matchup, up to three graphics
Splits a full matchup into aspect graphics — a carousel, essentially.

```powershell
.\content.bat breakdown --games PIT@CIN --aspects pitching,offense,bullpen
.\content.bat breakdown --sport nfl --games DET@BUF --aspects offense,defense,scheme
```

At most three aspects per run. Each graphic uses the same banner-headed layout as `deep`.
NFL `offense` / `defense` (and `_home`) are the injury-designation graphics: the
first-string formation with each starter's status, then injured backups listed by name.

### `full-card` — the whole slate
Every game as the site's slate card, in a two-column grid. Six per image by default;
`--per-post` changes it.

```powershell
.\content.bat full-card
.\content.bat full-card --sport nfl --per-post 2
```

### `rankings` — unit rankings
Either today's starters, or all 30 clubs in one category and window.

> **Legacy.** The site no longer has these boards, so `rankings` still captures this
> branch's retired dashboard pages and warns on every run. Don't publish it as the
> current site.

```powershell
.\content.bat rankings --type starters --rows 12
.\content.bat rankings --type team --family winning --window L30
```

`--family`: `scoring` · `winning` · `difficulty` · `projection`
`--window`: `YTD` · `L30` · `L14` · `L7`

### `booth` — record with the graphics live
Permanent recording studio: tonight's boards on the stage, your camera in the frame,
one take. With `--games` it builds a game pack first; without it, it opens the newest
pack already on disk. Desktop camera stays on the booth page; the phone can be the
microphone (`https://<LAN>:8791/mic`). Audio and video land in the same `.webm`.

```powershell
.\content.bat booth --sport nfl --games IND@KC --show "Week 3 Sunday Night Football" --tag SNF
.\content.bat booth --sport nfl
.\content.bat booth --pack props/pack/2026-09-20-IND-KC
```

Same studio as `booth.bat`. Keep the terminal open while you record. Keys, rundown and
phone-mic notes live in `video/README.md`.

### `compose` — anything, from anywhere
The adaptive path. Use it for slate-wide components, the mlb-model deck, or any page on the
site with no code change at all.

```powershell
.\content.bat compose --artifacts "model summary,projections,leans"

.\content.bat compose --capture "label=Team Profile;page=team_profile.html;params=team%3DNYY;selector=.tp-trend-table"
```

`--capture` fields: `label` `url` **or** `page` `selector` (required), plus optional
`contains` `hash` `eval` `force_show` `hide` `unclip` `unstick` `wait` `framed` `name`
`width` (capture viewport) `sport` (footer line) `style` (CSS injected before capture).
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

## Live site — matchup components

chase-analytics.com as served today. Need `--games`. The defaults for `preview`, `deep`, `breakdown` and `full-card`.

| Key | Scope | What it shows | Say any of |
|---|---|---|---|
| **`mlb_card`** | game | The slate card from /mlb/: venue, first pitch or live score, both clubs with records, probable starters, conditions and broadcast. | `matchup card` · `game card` · `the card` · `mlb card` · `slate card` · `card` |
| **`nfl_card`** | game | The slate card from /nfl/: venue, kickoff, both clubs, the starting quarterbacks, travel, availability and broadcast. | `nfl card` · `nfl matchup card` · `nfl slate card` |
| **`mlb_hero`** | game | The matchup page's opening panel: both clubs, score or first pitch, venue, conditions, broadcast and status. The compact matchup shot. | `matchup banner` · `analysis banner` · `matchup analysis` · `banner` · `overview` · `matchup overview` · `hero` · `strip` · `identity strip` · `banner` |
| **`nfl_hero`** | game | The NFL matchup page's opening panel. | `nfl matchup` · `nfl overview` · `nfl banner` · `nfl hero` |
| **`mlb_starters`** | game | Both probable starters: ERA, Pitch Score, QS%, IP, last start and splits by batter hand and home/road. Tall - best alone. | `starters` · `probable starters` · `pitchers` · `starter splits` · `pitcher splits` · `pitching` · `pitcher` |
| **`mlb_starter_away`** | game | The away starter's panel on its own, large enough for a phone. | `away starter` · `visiting starter` |
| **`mlb_starter_home`** | game | The home starter's panel on its own. | `home starter` |
| **`mlb_arsenal`** | game | Each starter's pitch mix: usage, count, velocity, run value per 100 and how the opposing club hits each pitch. | `arsenal` · `pitch mix` · `pitch types` · `repertoire` |
| **`mlb_lineups`** | game | Both batting orders against the opposing starter's hand. | `lineups` · `projected lineups` · `lineup vs starter` · `lineup card` · `batting orders` |
| **`mlb_splits`** | game | Both clubs' batting splits by opposing hand and home/road. | `club splits` · `batting splits` · `splits` · `offense splits` · `offensive splits` · `hitting` · `offense` |
| **`mlb_recent`** | game | Each club's last ten games. | `last ten` · `last 10` · `recent games` · `recent form` |
| **`mlb_form`** | game | Offensive form mirrored club against club, with league context. | `form` · `offensive form` · `lineup form` · `bats` · `league context` |
| **`mlb_radar`** | game | Two team-profile radars on the site's current axes. | `radar` · `team radar` · `profile radar` · `team profile` · `spider` · `spider chart` · `radar` |
| **`mlb_bullpens`** | game | Both bullpens' recent workload and who is available. | `bullpens` · `bullpen` · `relief` · `pen` · `relievers` · `bullpen workload` · `bullpen` |
| **`nfl_offense_away`** | game | Away club's injury designations on offense: the first-string formation with headshots and each starter's status, then any injured backups at offensive positions (and specialists) listed by name, no photo. Best alone. | `nfl away lineup` · `away offense` · `nfl_availability_away` · `away availability` · `nfl_injuries_away` · `away injuries` · `injury report` · `injuries` · `availability` · `injury designations` |
| **`nfl_offense_home`** | game | The same for the home club. | `nfl home lineup` · `home offense` · `nfl_availability_home` · `home availability` · `nfl_injuries_home` · `home injuries` · `home injury report` |
| **`nfl_defense_away`** | game | Away club's injury designations on defense: starters in formation with status, injured defensive backups listed by name. | `away defense` · `nfl away defense` · `away defense injuries` |
| **`nfl_defense_home`** | game | The same for the home club. | `home defense` · `nfl home defense` · `home defense injuries` |
| **`nfl_coverage`** | game | The matchup's coverage matrix from the scheme section. | `coverage matrix` · `nfl coverage` · `man zone` |
| **`nfl_situations`** | game | Situational scheme block (first block of the scheme section). | `situations` · `situational` · `down and distance` · `nfl situations` |
| **`nfl_scheme_grid`** | game | Scheme confrontation grid, offence against defence. | `scheme confrontation` · `scheme grid` · `nfl scheme` |
| **`nfl_form`** | game | Team form, mirrored club against club. | `nfl form` · `team form` |
| **`nfl_radar`** | game | Two team-profile radars. | `nfl radar` · `nfl team radar` |
| **`nfl_context`** | game | Rest, travel and venue for both clubs. | `rest travel venue` · `travel` · `rest` · `nfl context` · `team context` |

## Hosted boards

The nfl-model and mlb-model dashboards. Game-scoped ones need `--games` from that board.

| Key | Scope | What it shows | Say any of |
|---|---|---|---|
| **`model_slate`** | slate | Model projections per game: win probability, projected total, margin, lean and sharp flag. | `model slate` · `projections` · `model projections` · `win probability` · `projected totals` · `model board` |
| **`model_leans`** | slate | The model's biggest priced gaps, ranked by edge, with the model number and state. | `leans` · `biggest leans` · `model leans` · `edges` · `biggest edges` |
| **`model_kpis`** | slate | Model slate summary strip: game count, slate date, how many carry a sharp signal, priced markets, and the decision gate. | `model summary` · `slate summary` · `model kpis` · `model header` |
| **`model_props`** | slate | Model pitcher-prop board. | `model props` · `pitcher props` · `props` |
| **`nfl_power_top`** | slate | NFL power ratings, teams 1-16: opponent-adjusted Rating, the matchup model's Off and Def, and projected wins. | `nfl power ratings` · `nfl top 16` · `nfl rankings` · `nfl power rankings` · `power ratings top` |
| **`nfl_power_bottom`** | slate | The same board, teams 17-32 - slide two of the pair. | `nfl bottom 16` · `nfl power ratings bottom` · `nfl rankings bottom` · `power ratings bottom` |
| **`nfl_edges`** | slate | Every priced game ranked by how far the model sits from the DraftKings number, with both totals beside it. A map of where the model has an opinion - the board's own words - not a card. | `nfl edges` · `model vs market` · `disagreements` · `biggest gaps` · `where the model differs` · `nfl leans` · `market gaps` |
| **`nfl_offense`** | slate | Offensive units ranked by points per game above average, with EPA per play, first-down rate, explosive rate, sack rate and giveaway rate. Top 16; --rows-from 17 gives the other half. | `nfl offense` · `offense power ranking` · `offensive rankings` · `best offenses` · `offense units` |
| **`nfl_defense`** | slate | The same for defensive units, where the rates record what OPPONENTS did: low EPA allowed and high sack rate are both good. | `nfl defense` · `defense power ranking` · `defensive rankings` · `best defenses` · `defense units` |
| **`nfl_seeds_afc`** | slate | The AFC playoff field over 20,000 simulated seasons - playoff odds, division odds and top-seed odds, cut line drawn in. | `afc playoff field` · `afc seeds` · `afc playoff odds` · `afc` |
| **`nfl_seeds_nfc`** | slate | The same for the NFC. | `nfc playoff field` · `nfc seeds` · `nfc playoff odds` · `nfc` |
| **`nfl_divisions_afc`** | slate | All four AFC divisions: mean simulated record, division odds and playoff odds, with the division favourite named. | `afc divisions` · `afc division odds` · `afc division winners` |
| **`nfl_divisions_nfc`** | slate | The same four cards for the NFC. | `nfc divisions` · `nfc division odds` · `nfc division winners` |
| **`nfl_gate_tiles`** | slate | The accountability strip: the model's margin error against the market's on the same games, how its own disagreements actually covered, and the sample size. Stacks under any NFL board. | `accountability` · `track record` · `measured against the market` · `model accuracy` · `nfl tiles` · `receipts` |
| **`nfl_authority`** | slate | The full authority section - what the numbers may be used for, the production gates met and unmet, and why this model is research only. Prose-heavy; give it a canvas of its own. | `authority` · `research only` · `gates` · `what these numbers mean` · `why not a bet` |
| **`nfl_qb_props`** | slate | Next-game QB centres: attempts, completions, passing yards, touchdowns, interceptions and rushing yards, with a confidence grade. Ordered BY GAME, not ranked - the default 16 rows are the slate's first eight fixtures; --rows-from 17 walks the rest. | `qb props` · `quarterback projections` · `qb projections` · `passing props` |
| **`nfl_rb_props`** | slate | Next-game RB centres: carries, rushing yards, targets, receptions, receiving yards and touchdown rate. | `rb props` · `running back projections` · `rb projections` · `rushing props` |
| **`nfl_wr_props`** | slate | Next-game WR centres: targets, receptions, receiving yards and touchdown rate. | `wr props` · `receiver projections` · `wr projections` · `receiving props` · `wideouts` |
| **`nfl_te_props`** | slate | Next-game TE centres, same columns as the receivers. | `te props` · `tight end projections` · `te projections` |
| **`nfl_k_props`** | slate | Next-game kicker centres: attempts, makes, extra points and projected kicking points. | `kicker props` · `kicker projections` · `k props` · `kickers` |
| **`nfl_scheme_matrix`** | slate | This week's coverage and pressure matrix - each offence against the man/zone mix, blitz rate and pressure rate it is about to face. | `scheme` · `league scheme matrix` · `response matrix` · `scheme intelligence` · `coverage and pressure` · `matchup matrix` |
| **`nfl_game`** | game | One game's full board card: status, kickoff, both power ratings and projected scores, head coaches, DraftKings' live spread/total/moneyline, the model's own numbers beside them, and the derivation. Tall - post it at 1080x1920, or two across with --layout row. | `nfl board card` · `nfl model card` · `game card nfl` |
| **`nfl_game_lines`** | game | The same card cut to the two price blocks: what DraftKings is posting and what the model makes it. Proportioned for 4:5. | `nfl lines` · `market vs model` · `nfl price card` · `line card` · `nfl spread card` |
| **`nfl_game_why`** | game | The other half of that card: the offense, defense and rating edges behind the projection, plus the per-unit terms - home field, first downs, sacks, EPA/play, explosives, turnovers. | `why this projection` · `nfl why` · `game derivation` · `how the model got there` · `nfl game why` |

## Legacy — retired pages

Captured from this branch's own `dashboard/` pages, which the site no longer serves. They still run and warn every time.

| Key | Scope | What it shows | Say any of |
|---|---|---|---|
| **`legacy_banner`** | game | Wide identity strip: records, last-10 form pips, first pitch, venue and weather. The compact way to show a matchup. | `legacy_banner` |
| **`legacy_bullpen`** | game | Away lineup batter-by-batter vs the home bullpen only (starters excluded). | `legacy_bullpen` |
| **`legacy_bullpen_rev`** | game | The same board swapped: home lineup vs the away bullpen. | `bullpen_rev` |
| **`legacy_card`** | game | Full game card: both starters with pitch scores and K/BB/ERA, the lineup edge bar, and both projected lineups with handedness. | `legacy_card` |
| **`legacy_lineup_vs_hand`** | game | One lineup batter-by-batter against the hand the opposing starter throws - the left half of the pitcher board, captured on its own so it renders large enough for a phone. | `lineup_vs_hand` · `lineup vs hand` · `bats vs hand` |
| **`legacy_lineup_vs_hand_rev`** | game | The same for the other lineup. | `lineup_vs_hand_rev` · `reverse lineup vs hand` · `other lineup vs hand` |
| **`legacy_offense`** | game | Both lineups' wRC+/OPS/wOBA/SLG ranks over L7, L14, L30 and YTD, split overall, by opposing hand, and home/road. | `legacy_offense` |
| **`legacy_pitcher`** | game | Away lineup batter-by-batter vs the home starter, that starter's allowed splits by batter hand, and career hitter-vs-pitcher history. | `hitter vs pitcher` · `matchup history` · `pitcher history` |
| **`legacy_pitcher_rev`** | game | The same board with the sides swapped: home lineup vs away starter. | `pitcher_rev` |
| **`legacy_radar`** | game | Two five-axis radars comparing the lineups on process composite (RCV/ABQ/OSI/OBR/projOSI) and offense vs schedule. | `legacy_radar` |
| **`legacy_starters_rankings`** | slate | Every projected starter on the slate ranked by Pitch Score, with K%/BB%/ERA/FIP, what they allow, and stuff flags. | `starters_rankings` · `starters rankings` · `todays starters` · `pitcher rankings` · `ranked starters` · `best to worst` · `pitch score` · `pitching score` |
| **`legacy_team_rankings`** | slate | All 30 clubs ranked in one category (scoring, winning, difficulty or projection) over a chosen window. | `team_rankings` · `team rankings` · `league rankings` · `all 30` · `club rankings` · `team board` |
| **`legacy_trends_heatmap`** | slate | League-wide trend heat map from the Research Lab. | `trends_heatmap` · `trends` · `heat map` · `heatmap` · `trends heat map` |

---

## Aspect sets

`breakdown --aspects` takes these. Each builds one graphic.

| Sport | Aspect | Components | Also accepts |
|---|---|---|---|
| MLB | **`pitching`** | `mlb_starters` | `pitchers` · `starters` · `arms` |
| MLB | **`arsenal`** | `mlb_arsenal` | `pitch mix` |
| MLB | **`offense`** | `mlb_splits` | `offence` · `bats` · `hitting` · `splits` |
| MLB | **`lineups`** | `mlb_lineups` | `batting orders` |
| MLB | **`form`** | `mlb_form` |  |
| MLB | **`bullpen`** | `mlb_bullpens` | `relief` · `pen` · `bullpens` |
| NFL | **`offense`** | `nfl_offense_away` | `injuries` · `injury report` · `availability` · `offence` |
| NFL | **`offense_home`** | `nfl_offense_home` |  |
| NFL | **`defense`** | `nfl_defense_away` | `defence` |
| NFL | **`defense_home`** | `nfl_defense_home` |  |
| NFL | **`scheme`** | `nfl_coverage` | `coverage` |
| NFL | **`form`** | `nfl_form` |  |
| NFL | **`context`** | `nfl_hero`, `nfl_context` | `travel` · `rest` |

Defaults: MLB `pitching,offense,bullpen`; NFL `scheme,form,context`.

---

## Text slots

Available on every command. Over budget is a warning, not an error — the engine tells you a slot will wrap and squeeze the components.

| Flag | Max chars | Role | Rendered as |
|---|---|---|---|
| `--eyebrow` | 28 | Small label above the title | Site accent (lavender), uppercase |
| `--headline` | 42 | The claim - your hook | Site display face, silver, Title Case (type it that way) |
| `--sub` | 130 | Neutral one-sentence setup | Secondary grey body text |
| `--take` | 190 | **Your angle** - the only slot styled as opinion | Italic, brand-gradient rule |
| `--cta` | 60 | Where to go next | Under the site URL |
| `--note` | 95 | Evidence bullet, repeatable up to 3 | Accent bullets |

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
- **Dead space over 9% of the canvas height** → steps down a canvas (1920 → 1350 → 1080).

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
| `is not on the <date> slate` | The site isn't showing that game. The error lists the games it is showing. |
| `the live MLB slate is for ...` | The post date doesn't match the slate the site is showing. The error gives the `--date` to pass. |
| `the live NFL slate runs through ...` | NFL posts can be dated from today through the week's last kickoff. |
| `cannot mirror the site style` | The site was unreachable and no earlier style copy exists. With an earlier copy, the run warns and uses it. |
| `design tokens did not load` / `brand face(s) ... did not load` | The post would have rendered in fallback styling, so nothing was written. |
| `WARNING legacy_...` | That component captures a page the site no longer serves. |
| `cannot mix matchup artifacts from different sources` | Live-site, nfl-model board and legacy components identify games differently. Use one source per post. |
| `slate date(s) [...] != requested` | Legacy components only: `data/today_matchups.csv` is for another day. |
| `is a doubleheader on this slate` | Two games share that pairing — say `CLE@CIN#1` or `#2`. |
| `does not name an artifact` | Run `keys`; the error lists the closest matches. |
| `artifacts squeezed to NN%` | Too much in one image. Fewer components, or let it use the story canvas. |
| `N image(s) failed to load` | A headshot or logo didn't load. Re-run; the artifact is otherwise fine. |

---

## Adding to the key

`ARTIFACT_DESC` and `ARTIFACT_ALIASES` in `outputs/content_engine.py` are the single source
for the key. Add a phrase there and it works in every command immediately — then re-run
`python scripts/gen_content_guide.py` to refresh this document.
