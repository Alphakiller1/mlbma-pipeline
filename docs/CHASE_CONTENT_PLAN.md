# Chase Analytics — Content Plan (pipeline bridge)

**Authority for daily social graphics lives in a separate repo.** This file only maps how
`mlbma-pipeline` feeds that system. Do not invent a second template language here.

| Layer | Repo | Owns |
|-------|------|------|
| **Content engine (canonical)** | [`Alphakiller1/chase-content-engine`](https://github.com/Alphakiller1/chase-content-engine) | Daily schedule, report contracts, design contract, PNG renderer, opinion overlays, validate/build CLI |
| **This repo (upstream data)** | `mlbma-pipeline` | Slate identity, offense vs RHP/LHP, team trajectory CSVs consumed by migrate |
| **Sibling upstreams** | `mlb-model`, `sharp-money-tracker` | Game/pitcher projections; market observations (see content-engine `docs/MIGRATION.md`) |

---

## 1. Read these first (content engine)

| File | Role |
|------|------|
| [`content_plan/daily_schedule.json`](https://github.com/Alphakiller1/chase-content-engine/blob/main/content_plan/daily_schedule.json) | When each report ships (ET) |
| [`content_plan/report_contracts.json`](https://github.com/Alphakiller1/chase-content-engine/blob/main/content_plan/report_contracts.json) | Per-report data slots + prohibitions |
| [`design/CONTENT_DESIGN_CONTRACT.md`](https://github.com/Alphakiller1/chase-content-engine/blob/main/design/CONTENT_DESIGN_CONTRACT.md) | Pixel-enforceable visual law (tokens, header, cards, logos, QA) |
| [`design/CHATGPT_IMAGE_MOCKUP_PROMPT.md`](https://github.com/Alphakiller1/chase-content-engine/blob/main/design/CHATGPT_IMAGE_MOCKUP_PROMPT.md) | **Concept mockups only** — never final art |
| [`docs/MIGRATION.md`](https://github.com/Alphakiller1/chase-content-engine/blob/main/docs/MIGRATION.md) | Upstream authority map + cutover |

Agent rule in this repo: `.cursor/rules/chase-content-graphics.mdc` → points at the content engine.

---

## 2. Why freehand AI graphics fail the brand

Chase is an authentic sports-information brand. Freehand AI posters look generic and tipster-like.

The content engine already encodes the correct split:

1. **Final graphics** = `chase_content/render.py` assembling **live bundle data + approved logo files + design tokens**.
2. **AI image models** = optional **concept mockups** only, using the locked prompt, with `[CHASE LOGO]` / `[TEAM LOGO]` placeholders — never drawn marks, never published as the post.
3. **Contract > renderer.** `CONTENT_DESIGN_CONTRACT.md` §14 lists current `render.py` violations (typeset eyebrow, Arial fallback, non-token blue, win-prob bars on Morning Slate, missing team logos, etc.). Those make output look generic even without Midjourney. Fix the renderer to the contract; do not “regen with a better prompt.”

Authenticity test (from the design contract’s definition of done): a random graphic must be unmistakable as ChaseAnalytics.com — real logo, exact tokens, metallic headings, dimensional cards, league-anchored number colors — not AI sports mush.

---

## 3. Daily reports (engine catalog — do not rename here)

| Report | Cadence (ET) | Job |
|--------|--------------|-----|
| **Morning Slate** | 09:00 (+ refresh before first pitch) | Games ranked by model run separation; projected runs + pitcher IP/ER/K; personal-opinion tag separate |
| **Offensive Report** | 11:30 | Top vs RHP / vs LHP, risers, fallers (OSI + window deltas) |
| **Public vs Sharp** | 15:00 (+ market freshness refresh) | Pitching / ML / totals divergence as **observation**, never “lock” |

Source of schedule and field contracts: the JSON files in the content engine, not this doc.

---

## 4. Pipeline’s job in the content loop

```text
mlbma-pipeline/data  ──┐
mlb-model            ──┼──►  chase-content migrate ──► validate ──► build PNGs
sharp / market JSON  ──┘         (+ opinions/*.json)
                                      │
                                      ▼
                               human approve → publish
```

Daily command (run from the content-engine checkout):

```bash
chase-content daily \
  --pipeline-data ../mlbma-pipeline/data \
  --model-repo ../mlb-model \
  --sharp-json ../sharp-money-tracker/docs/data.json \
  --opinions opinions/YYYY-MM-DD.json \
  --out dist/YYYY-MM-DD
```

### Upstream fields the engine expects from this repo

Per content-engine `docs/MIGRATION.md`, daily exports should carry (when available):

- `Slate_Date`, `MLB_Game_PK`, `Run_ID`, `Generated_At`
- Atomic slate publish (do not bump freshness when only one component succeeded)
- Offense vs-RHP / vs-LHP + YTD/L7 team profiles for the Offensive Report

Instagram hooks inside this repo (`outputs/push_instagram.py`) are optional **caption/URL publish** only. They do not own layout. Hosted image URLs should point at **engine-built** PNGs that already passed the design contract checklist.

---

## 5. Concrete design process (use the engine)

Do this every publishing day — in the **content-engine** repo:

1. **Ensure upstream data** — pipeline + model (+ markets) current for the slate date.
2. **Review opinions** — `opinions/YYYY-MM-DD.json`; tags only `MY BET` / `LEAN` / `WATCH` / `PASS` / `NO OPINION`. Opinions never auto-inherit from the model.
3. **`chase-content migrate`** → one canonical bundle.
4. **`chase-content validate --require-today`** — fail closed on empty/stale/duplicate slate.
5. **`chase-content build`** — PNGs from `render.py` under the design contract (not from an image model).
6. **Human QA** — content-engine checklist §16 (header, logo, team logos, runs-only Morning Slate, metricColor, fonts, no invented marks).
7. **Approve → upload.** Keep the bundle so every published asset is reproducible.

### AI’s allowed role

| Allowed | Forbidden |
|---------|-----------|
| Concept mockup via `CHATGPT_IMAGE_MOCKUP_PROMPT.md` (placeholders for logos) | Final Instagram/X PNG from an image model |
| Draft caption copy from real bundle numbers | Invent metrics, logos, faces, stadiums |
| Help implement `render.py` against `CONTENT_DESIGN_CONTRACT.md` §14 | Weaken the contract to match a broken renderer |
| Suggest opinion wording for human edit | Auto-tag `MY BET` from model output |

---

## 6. What not to do in mlbma-pipeline

- Do not add a parallel T1–T5 / Figma-only content system that competes with Morning Slate / Offensive Report / Public vs Sharp.
- Do not treat May 2026 ChatGPT infographics as a license to ship freehand social art (product UI aesthetic reference ≠ publishable graphic).
- Do not hardcode fake production stats into graphics or captions.
- Visual-token changes for **dashboard UI** still follow `design/MLBMA_CURSOR_DESIGN_CONTRACT.md` here; **social PNG** rules follow the content-engine design contract (same token family, different enforcement surface).

---

## 7. One-line policy

**Data is produced here; branded daily graphics are manufactured in `chase-content-engine` from locked contracts and `render.py`. AI drafts mockups and copy — it does not invent Chase’s published face.**

---

*If the content-engine schedule, report list, or design contract changes, update that repo first, then adjust this bridge doc if the upstream data contract changed.*
