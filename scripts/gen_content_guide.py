"""Generate docs/CONTENT_ENGINE_GUIDE.md from the engine's own tables.

The command guide's key MUST match what the code actually accepts, so the component
table, phrase list, aspect sets and text budgets are all read out of
outputs.content_engine rather than retyped. Prose sections are authored here.

    python scripts/gen_content_guide.py

Re-run it after adding an artifact, an alias or a text slot.
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))
sys.argv = [sys.argv[0]]  # content_engine parses argv at import time via argparse only in main()

from outputs.content_engine import (  # noqa: E402
    ARTIFACT_ALIASES,
    ARTIFACT_DESC,
    ARTIFACTS,
    ASPECT_ALIAS,
    ASPECTS,
    DEFAULT_ASPECTS,
    artifact_source,
    LEGIBILITY_FLOOR,
    SIZES,
    SLACK_FRACTION,
    TEXT_BUDGETS,
)

OUT = REPO / "docs" / "CONTENT_ENGINE_GUIDE.md"

SLOT_ROLE = {
    "eyebrow": ("Small label above the title", "Site accent (lavender), uppercase"),
    "headline": ("The claim - your hook",
                 "Site display face, silver, Title Case (type it that way)"),
    "sub": ("Neutral one-sentence setup", "Secondary grey body text"),
    "take": ("**Your angle** - the only slot styled as opinion",
             "Italic, brand-gradient rule"),
    "note": ("Evidence bullet, repeatable up to 3", "Accent bullets"),
    "cta": ("Where to go next", "Under the site URL"),
}

HEADER = """# Chase Analytics Content Engine — Command Guide & Key

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
cd C:\\Users\\chase\\mlbma_pipeline

.\\content.bat keys                                    # print the key, no browser needed
.\\content.bat preview --games TEX@TBR,CHC@STL         # an MLB post
.\\content.bat preview --sport nfl --games DET@BUF      # an NFL post
```

Matchup games come from the site's own published slate
(`/data/public/<sport>/slate.json`), so `--games` must name a game the site is showing.
An MLB post must be dated for the slate the site is showing. After midnight, until the
morning pipeline publishes the new day, pass `--date` for last night's slate. An NFL post
can be dated any day from today through the week's last kickoff.

Every command writes PNGs plus an appended `captions.txt` to:

```
outputs\\social_cards\\<slate-date>\\
```

Open the folder with `explorer outputs\\social_cards\\<slate-date>`. The filename pattern is
`<command>_<subject>_<WIDTHxHEIGHT>.png`, so the size tells you the platform.

---

## The commands

### `keys` — print the component key
No browser, no data needed. The fastest way to remember what you can assemble.

```powershell
.\\content.bat keys
```

### `preview` — a few matchups, side by side
The concise post: the site's slate card for each game (`mlb_card` / `nfl_card`), in a
wrapping grid. Best at 2–3 games; more are split across images.

```powershell
.\\content.bat preview --games TEX@TBR,CHC@STL,PIT@CIN `
  --eyebrow "Wednesday Slate" --headline "Three To Watch" `
  --take "Two of these have a starter the market still prices on last month's form."
```

Starts on the 4:5 feed post and steps down to square when the cards leave dead space.

### `deep` — one matchup, your choice of components
Assembles the components you name into a single image. Omit `--artifacts` in a terminal
and it prompts you with a numbered list.

```powershell
.\\content.bat deep --games PIT@CIN --artifacts "matchup overview,team profile,last ten"
.\\content.bat deep --games DET@BUF --artifacts nfl_hero,nfl_context
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
.\\content.bat breakdown --games PIT@CIN --aspects pitching,offense,bullpen
.\\content.bat breakdown --sport nfl --games DET@BUF --aspects offense,defense,scheme
```

At most three aspects per run. Each graphic uses the same banner-headed layout as `deep`.
NFL `offense` / `defense` (and `_home`) are the injury-designation graphics: the
first-string formation with each starter's status, then injured backups listed by name.

### `full-card` — the whole slate
Every game as the site's slate card, in a two-column grid. Six per image by default;
`--per-post` changes it.

```powershell
.\\content.bat full-card
.\\content.bat full-card --sport nfl --per-post 2
```

### `rankings` — unit rankings
Either today's starters, or all 30 clubs in one category and window.

> **Legacy.** The site no longer has these boards, so `rankings` still captures this
> branch's retired dashboard pages and warns on every run. Don't publish it as the
> current site.

```powershell
.\\content.bat rankings --type starters --rows 12
.\\content.bat rankings --type team --family winning --window L30
```

`--family`: `scoring` · `winning` · `difficulty` · `projection`
`--window`: `YTD` · `L30` · `L14` · `L7`

### `booth` — record with the graphics live
Permanent recording studio: tonight's boards on the stage, your camera in the frame,
one take. With `--games` it builds a game pack first; without it, it opens the newest
pack already on disk. Desktop camera stays on the booth page; the phone can be the
microphone (`https://<LAN>:8791/mic`). Audio and video land in the same `.webm`.

```powershell
.\\content.bat booth --sport nfl --games IND@KC --show "Week 3 Sunday Night Football" --tag SNF
.\\content.bat booth --sport nfl
.\\content.bat booth --pack props/pack/2026-09-20-IND-KC
```

Same studio as `booth.bat`. Keep the terminal open while you record. Keys, rundown and
phone-mic notes live in `video/README.md`.

### `compose` — anything, from anywhere
The adaptive path. Use it for slate-wide components, the mlb-model deck, or any page on the
site with no code change at all.

```powershell
.\\content.bat compose --artifacts "model summary,projections,leans"

.\\content.bat compose --capture "label=Team Profile;page=team_profile.html;params=team%3DNYY;selector=.tp-trend-table"
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
.\\content.bat preview --games TEX@TBR,NYY@CHW,CHC@STL,WSN@ATL,SEA@LAD `
  --captions ",AL,NL Central,NL East,"
```

gives `TEX @ TBR`, `NYY @ CHW · AL`, `CHC @ STL · NL CENTRAL`, `WSN @ ATL · NL EAST`,
`SEA @ LAD` — an empty entry keeps just the default.

- Prefix a label with `=` to **replace** the caption instead of appending.
- One flag with commas is a list. **Repeat the flag** when a label itself contains a
  comma; each occurrence is then one slot, verbatim.
- Extra labels beyond the slot count are reported, never silently dropped.

---
"""

FOOTER_TEMPLATE = """
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

- **Squeezed** below {floor:.0%} of captured size → re-renders at `1080x1920`, and warns if
  it's still tight. Use fewer components.
- **Dead space over {slack:.0%} of the canvas height** → steps down a canvas (1920 → 1350 → 1080).

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
"""


def phrase_cell(name: str) -> str:
    phrases = ARTIFACT_ALIASES.get(name) or []
    return " · ".join(f"`{p}`" for p in phrases) if phrases else f"`{name}`"


def build() -> str:
    out = [HEADER]

    groups = (
        ("Live site — matchup components",
         "chase-analytics.com as served today. Need `--games`. The defaults for "
         "`preview`, `deep`, `breakdown` and `full-card`.",
         lambda n, sp: artifact_source(n) == "site"),
        ("Hosted boards",
         "The nfl-model and mlb-model dashboards. Game-scoped ones need `--games` "
         "from that board.",
         lambda n, sp: artifact_source(n) == "hosted"),
        ("Legacy — retired pages",
         "Captured from this branch's own `dashboard/` pages, which the site no longer "
         "serves. They still run and warn every time.",
         lambda n, sp: artifact_source(n) == "legacy"),
    )
    for heading, note, keep in groups:
        out.append(f"## {heading}\n\n{note}\n")
        out.append("| Key | Scope | What it shows | Say any of |")
        out.append("|---|---|---|---|")
        for name, spec in ARTIFACTS.items():
            if not keep(name, spec):
                continue
            desc = ARTIFACT_DESC.get(name, spec["label"]).replace("|", "\\|")
            scope = "game" if spec["scope"] == "game" else "slate"
            out.append(f"| **`{name}`** | {scope} | {desc} | {phrase_cell(name)} |")
        out.append("")

    out.append("---\n")
    out.append("## Aspect sets\n")
    out.append("`breakdown --aspects` takes these. Each builds one graphic.\n")
    out.append("| Sport | Aspect | Components | Also accepts |")
    out.append("|---|---|---|---|")
    for sport, sets in ASPECTS.items():
        for aspect, spec in sets.items():
            comps = ", ".join(f"`{c}`" for c in spec["artifacts"])
            also = " · ".join(f"`{k}`" for k, v in ASPECT_ALIAS[sport].items()
                              if v == aspect)
            out.append(f"| {sport.upper()} | **`{aspect}`** | {comps} | {also} |")
    out.append("")
    out.append("Defaults: " + "; ".join(
        f"{sport.upper()} `{v}`" for sport, v in DEFAULT_ASPECTS.items()) + ".\n")

    out.append("---\n")
    out.append("## Text slots\n")
    out.append("Available on every command. Over budget is a warning, not an error — "
               "the engine tells you a slot will wrap and squeeze the components.\n")
    out.append("| Flag | Max chars | Role | Rendered as |")
    out.append("|---|---|---|---|")
    for slot, limit in TEXT_BUDGETS.items():
        role, render = SLOT_ROLE[slot]
        out.append(f"| `--{slot}` | {limit} | {role} | {render} |")
    out.append("")
    out.append("`--take` is where your read goes. It is the only slot styled as opinion, "
               "so a reader can always separate your argument from the measured artifact. "
               "Keep `--sub` factual.\n")
    out.append("> The engine renders whatever claim you type — it does not check your "
               "notes against the data. A wrong note ships as confidently as a right one.\n")

    out.append(FOOTER_TEMPLATE.format(floor=LEGIBILITY_FLOOR, slack=SLACK_FRACTION))
    return "\n".join(out)


def main() -> None:
    text = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(text)
    print(f"wrote {OUT.relative_to(REPO)} "
          f"({len(text.splitlines())} lines, {len(ARTIFACTS)} components, "
          f"{sum(len(v) for v in ARTIFACT_ALIASES.values())} phrases, "
          f"{len(SIZES)} canvas sizes)")


if __name__ == "__main__":
    main()
