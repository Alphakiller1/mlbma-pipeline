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
    ASPECTS,
    LEGIBILITY_FLOOR,
    SIZES,
    SLACK_FRACTION,
    TEXT_BUDGETS,
)

OUT = REPO / "docs" / "CONTENT_ENGINE_GUIDE.md"

SLOT_ROLE = {
    "eyebrow": ("Small label above the title", "Gold, uppercase, tracked"),
    "headline": ("The claim - your hook", "Silver metallic display, uppercase"),
    "sub": ("Neutral one-sentence setup", "Muted body text"),
    "take": ("**Your angle** - the only slot styled as opinion", "Italic, violet rule"),
    "note": ("Evidence bullet, repeatable up to 3", "Violet bullets"),
    "cta": ("Where to go next", "Under the site URL"),
}

HEADER = """# Chase Analytics Content Engine — Command Guide & Key

Everything you need to drive the engine from a terminal: the commands, the components,
and the phrases that summon them.

*Generated from the code by `scripts/gen_content_guide.py` — re-run it after adding an
artifact or alias. Design rules and the reasoning behind the layout live in
[CONTENT_ENGINE_SPEC.md](CONTENT_ENGINE_SPEC.md).*

---

## Quickstart

```powershell
cd C:\\Users\\chase\\mlbma_pipeline

.\\content.bat keys                                    # print the key, no browser needed
.\\content.bat preview --games TEX@TBR,CHC@STL         # a post
```

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
The concise post: one card per game, placed in a row. Best at 2–3 games; 4 gets tight and
the engine will tell you so.

```powershell
.\\content.bat preview --games TEX@TBR,CHC@STL,PIT@CIN `
  --eyebrow "Wednesday Slate" --headline "Three To Watch" `
  --take "Two of these have a starter the market still prices on last month's form."
```

Picks the square canvas for 3+ games, the 4:5 feed post for 1–2.

### `deep` — one matchup, your choice of components
Assembles the components you name into a single image. Omit `--artifacts` in a terminal
and it prompts you with a numbered list.

```powershell
.\\content.bat deep --games PIT@CIN --artifacts "matchup analysis,team profile,lineup form"
```

Takes 1–3 games; each game gets its own image.

### `breakdown` — one matchup, up to three graphics
Splits a full matchup into aspect graphics — a carousel, essentially.

```powershell
.\\content.bat breakdown --games PIT@CIN --aspects pitching,offense,bullpen
```

### `full-card` — the whole slate
Every game as a banner, with the starters named underneath. `--per-post` controls how many
banners per image.

```powershell
.\\content.bat full-card --per-post 6
```

### `rankings` — unit rankings
Either today's starters, or all 30 clubs in one category and window.

```powershell
.\\content.bat rankings --type starters --rows 12
.\\content.bat rankings --type team --family winning --window L30
```

`--family`: `scoring` · `winning` · `difficulty` · `projection`
`--window`: `YTD` · `L30` · `L14` · `L7`

### `compose` — anything, from anywhere
The adaptive path. Use it for slate-wide components, the mlb-model deck, or any page on the
site with no code change at all.

```powershell
.\\content.bat compose --artifacts "model summary,projections,leans"

.\\content.bat compose --capture "label=Team Profile;page=team_profile.html;params=team%3DNYY;selector=.tp-trend-table"
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
"""


def phrase_cell(name: str) -> str:
    phrases = ARTIFACT_ALIASES.get(name) or []
    return " · ".join(f"`{p}`" for p in phrases) if phrases else f"`{name}`"


def build() -> str:
    out = [HEADER]

    for heading, scope, note in (
        ("Matchup components", "game",
         "Need `--games`. Used by `preview`, `deep` and `breakdown`."),
        ("Slate components", "slate",
         "No `--games` needed. Used by `rankings` and `compose`."),
    ):
        out.append(f"## {heading}\n\n{note}\n")
        out.append("| Key | What it shows | Say any of |")
        out.append("|---|---|---|")
        for name, spec in ARTIFACTS.items():
            if spec["scope"] != scope:
                continue
            desc = ARTIFACT_DESC.get(name, spec["label"]).replace("|", "\\|")
            out.append(f"| **`{name}`** | {desc} | {phrase_cell(name)} |")
        out.append("")

    out.append("---\n")
    out.append("## Aspect sets\n")
    out.append("`breakdown --aspects` takes these. Each builds one graphic.\n")
    out.append("| Aspect | Components | Also accepts |")
    out.append("|---|---|---|")
    extra = {"pitching": "`pitchers` · `starters` · `arms`",
             "offense": "`bats` · `hitting`",
             "bullpen": "`relief` · `pen`"}
    for aspect, spec in ASPECTS.items():
        comps = ", ".join(f"`{c}`" for c in spec["artifacts"])
        out.append(f"| **`{aspect}`** | {comps} | {extra.get(aspect, '')} |")
    out.append("")

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
