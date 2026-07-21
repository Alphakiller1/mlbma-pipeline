# Chase Analytics — Content Plan & Graphic Design Process

**Purpose:** Define what Chase publishes, and a **locked, system-first** process for making graphics that look like Chase — not like generic AI sports art.

**Audience:** Chase (founder), anyone producing social/export/marketing graphics, and AI agents assisting content work.

**Related:**
- Visual law (product UI): [`design/MLBMA_CURSOR_DESIGN_CONTRACT.md`](../design/MLBMA_CURSOR_DESIGN_CONTRACT.md)
- Brand assets / logos / avatars: [`.cursor/rules/chase-brand-and-avatars.mdc`](../.cursor/rules/chase-brand-and-avatars.mdc)
- Instagram publish hook: `outputs/push_instagram.py` (caption + URL only — not a graphic renderer)

---

## 0. The problem this document solves

Freehand AI image generation (ChatGPT / Midjourney / “make me an MLB infographic”) produces:

- inconsistent layouts from post to post
- generic neon sports mush that any tipster account could use
- fake stadiums, fake glow, fake players, wrong logos
- mixed metric coloring that fights the product’s green→red system
- a look that signals **generated content**, not **credible research**

That is counterintuitive to the brand. Chase Analytics wins on **authenticity**: real metrics, real product boards, honest empty states, baseball-native language. Graphics that look AI-generic erode the same trust the dashboards are built to create.

**Rule of the house:** Graphics are assembled from the Chase system. AI may draft copy or suggest structure against a locked template. AI does **not** invent final pixels.

---

## 1. Brand north star for content

Chase content should feel like:

- a scouting desk / broadcast research board before first pitch
- The Athletic + FanGraphs seriousness, with Chase’s violet-on-near-black boards
- dense, editorial, specific — one clear claim backed by real numbers
- the **same product** people see on chase-analytics.com

Chase content should **not** feel like:

- AI-art sports posters
- betting-spam carousels
- crypto/SaaS gradient decks
- stock stadium photography with floating badges
- “revolutionize your picks with AI synergy” marketing

### Authenticity test (gate every graphic)

Ask all three before publish:

1. **Product test** — Could this graphic have been cropped from a real Chase board (or a locked export of one)?
2. **Logo-off test** — Remove the Chase mark. Does it still read as Chase (tokens, type, chips, density), or as generic AI sports?
3. **Trust test** — Would a serious handicapper believe these numbers came from a live system, not a prompt?

Fail any one → do not publish. Rebuild on a template.

---

## 2. Content pillars (what we publish)

Keep the calendar thin. Depth over volume.

| Pillar | Job | Cadence (default) | Primary proof |
|--------|-----|-------------------|---------------|
| **A. Slate / Matchup** | Tonight’s edges before first pitch | Daily on game days | Matchup cards, Lineup Edge, starter Pitching Score |
| **B. Team / Pitcher Snapshot** | One unit’s story in one frame | 3–5× / week | OSI / projOSI / OOR / staff metrics from profiles |
| **C. Signal / Convergence** | Multi-signal agreement, not hot takes | When pipeline flags plays | `signals_convergence` + named metrics |
| **D. Method / Trust** | Why Chase is credible | 1–2× / week | Formula names, data sources, green→red legend |
| **E. Product Surface** | Show the real tool | 1× / week | Cropped dashboard screenshots (Opening, Rankings, Compare) |

Every post maps to **one** pillar. Do not mix five jobs into one graphic.

---

## 3. Locked graphic system (not freehand art)

### 3.1 Principle: templates > prompts

| Layer | Owner | May change freely? |
|-------|--------|--------------------|
| **Canvas size + safe margins** | Template spec (§4) | No |
| **Grid / zones** (header, hero metric, chip row, footer) | Template | No |
| **Typefaces** | Roboto Condensed + DM Sans | No |
| **Colors / chips** | Design tokens + `metricColor` / green→red | No |
| **Brand marks** | `dashboard/assets/chase-*` only | No |
| **Icons** | `dashboard/mlbma_icons.js` poster marks | No |
| **Numbers / labels / copy** | Today’s data + brief | Yes |
| **Which template** | Editor choice from catalog | Yes |
| **Decorative AI backgrounds** | — | **Forbidden** |

### 3.2 Approved asset kit (only these)

| Asset | Source | Use |
|-------|--------|-----|
| Chase horizontal wordmark (dark) | `chase-logo-horizontal.png` | Dark graphic headers / corners |
| Chase icon | `chase-icon-filled.png` | Compact mark, stories, watermarks |
| Chase light marks | `*-light.png` inside grey badge only | Light/export surfaces |
| Team logos | Existing dashboard logo helpers | Identity framing only |
| Pitcher/batter photos | `pitcherAvatar()` / MLB headshot path | Real people, fixed crop rules |
| Metric chips | Same green→elite … red→poor language as UI | Never rainbow per-stat |
| Poster icons | `mlbma_icons.js` | Insight rows, pillar marks |
| Product screenshots | Live dashboard at 1280+ width | Pillar E; crop, don’t restyle |

**Forbidden assets:** AI-generated stadiums, AI faces, AI “player cards,” Midjourney baseball action, fake trophies, emoji clusters, stock neon light leaks, random Lucide dumps as hero icons.

### 3.3 Visual language (content graphics)

Translate the product — do not invent a second brand:

- Near-black board (`--bg` family), solid lacquered panels — not glass mush
- Violet accent for edges, icon badges, active emphasis — not a purple flood
- Metallic / condensed display headings; DM Sans for numbers
- Compact editorial caps for eyebrows (`MATCHUP EDGE`, `ANALYST TAKE`)
- 1.5–2px neon-ish borders on the **outer board** only; thin rules inside
- Metric chips: solid, high-contrast, semantic green→red
- Honest `--` / “unavailable” when data is missing — never invent stats

Mirror design-contract §4 / §5 / §6. Content graphics are an **export face** of that system.

---

## 4. Template catalog (locked compositions)

Build these once (Figma **or** HTML/CSS export frames). Every post is a fill-in, not a redesign.

### T1 — Daily Matchup Card (1080×1350 feed / 1080×1920 story)

```
┌─────────────────────────────────────┐
│ CHASE · TONIGHT'S MATCHUP     [icon]│  ← eyebrow + compact mark
│─────────────────────────────────────│
│  AWAY @ HOME          7:10 PM ET    │  ← Roboto Condensed
│  [logo]  SP name · RHP              │
│  [logo]  SP name · LHP              │
│─────────────────────────────────────│
│  LINEUP EDGE    +X.X                │  ← one hero number
│  [chip][chip][chip][chip]           │  ← OSI / PitchScore / etc.
│─────────────────────────────────────│
│  One sentence analyst take          │
│  chase-analytics.com                │
└─────────────────────────────────────┘
```

**Slots that change:** teams, SPs, time, hero metric, ≤4 chips, one sentence.  
**Slots that never change:** zone order, fonts, chip style, footer URL, brand placement.

### T2 — Team / Pitcher Snapshot (1080×1080)

Zones: giant name · team logo glow (team color OK for identity) · one medallion metric · 3 insight rows (icon-in-violet-circle + label + one line) · Chase mark footer.

Same structure as Team Profile “poster header” in `docs/TEAM_PROFILE_CONTENT_SPEC.md` — **export that language**, don’t invent a new poster.

### T3 — Signal Strip (1080×1080 or 1200×675 X)

Zones: pillar label `CONVERGENCE` · 2–4 signal lines from real CSV · one “why it matters” line · source note (`signals_convergence` / slate date).

### T4 — Method Card (1080×1350)

Zones: title (`HOW OSI IS BUILT`) · 3–5 formula lines in plain English · green→red legend · “numbers from FanGraphs + Savant → Chase pipeline” · no promises of profit.

### T5 — Product Crop (any size)

Zones: real screenshot (Opening Dashboard, Rankings, Compare, Profile) · thin Chase caption bar below or corner mark · **no** AI restyle overlay, no fake UI chrome drawn on top.

### Template freeze rule

If a new idea needs a sixth zone, a new font, or a new color story → **stop**. Either fit an existing template or open a short design task to add a named template (T6+) with the same token rules. Do not “just prompt it.”

---

## 5. Concrete design process (run this every time)

### Step 1 — Brief (5 minutes, written)

Fill before touching pixels:

```
Pillar:        A / B / C / D / E
Template:      T1–T5
Claim (1 line): ________________________________
Hero metric:   name + value + direction (higher/lower better)
Supporting:    ≤4 chips or ≤3 insight rows
Audience:      IG feed / IG story / X / LinkedIn / Stories archive
Data as-of:    slate date / pipeline run time
Do not claim:  ________________________________
```

No brief → no graphic.

### Step 2 — Pull real data (never invent)

Sources, in order:

1. Live dashboard / current Sheets or Supabase-backed view
2. Local pipeline CSVs (`data/today_matchups.csv`, `team_profiles.csv`, `signals_convergence.csv`, etc.)
3. Explicit “sample / demo” label if using non-live numbers

If the hero metric is missing → change the claim or skip the post. Do not hallucinate.

### Step 3 — Assemble on the locked template

Allowed tools:

- **Preferred:** Figma (or similar) file with Chase templates + component library synced to tokens
- **Preferred for product crops:** browser screenshot → crop → caption bar
- **Allowed assist:** HTML/CSS frame that reuses `mlbma_design_system.css` tokens, then screenshot
- **Disallowed as final art:** freehand AI image generators, “redesign this in Midjourney,” random Canva sports packs

### Step 4 — AI assist policy (narrow)

| Allowed | Forbidden |
|---------|-----------|
| Draft the one-sentence analyst take from real numbers you paste in | Generate the full poster image |
| Suggest which template fits a brief | Invent metrics, ranks, or odds |
| Rewrite caption for X vs IG length | Create player likenesses or stadium backgrounds |
| Checklist review against §6 QA | Change brand colors / fonts / chip semantics |

When using an LLM, paste **the brief + real numbers + template id**. Instruct: *“Fill slots only. Do not describe a new visual style.”*

### Step 5 — Brand QA (§6) → export → publish

Export PNG (sRGB), keep a copy of the brief + data timestamp in a dated folder:

```
content/YYYY-MM-DD/<pillar>-<template>-<slug>/
  brief.md
  graphic.png
  caption.txt
  source-notes.md   # which CSV/dashboard values were used
```

Publishing may later hook `outputs/push_instagram.py` with a **hosted image URL** of a system-built graphic — never an AI-random URL.

---

## 6. QA checklist (ship gate)

### Visual

- [ ] Uses T1–T5 (or an approved T6+) with zones intact
- [ ] Roboto Condensed + DM Sans only
- [ ] Near-black board + violet accent restraint (not purple wash)
- [ ] Metric chips follow green=elite → red=poor
- [ ] Chase mark from approved assets, correct light/dark treatment
- [ ] Icons are poster marks / approved kit — not thin random strokes as heroes
- [ ] No AI background, fake stadium, fake face, or decorative bokeh

### Data & copy

- [ ] Every number traces to pipeline/dashboard for the stated slate date
- [ ] Missing values shown as unavailable — not zero, not invented
- [ ] One claim; baseball-native; no “AI-powered synergy” hype
- [ ] No guaranteed profit / “locks” language
- [ ] Caption states what the metric is (e.g. Lineup Edge, OSI L14)

### Authenticity

- [ ] Passes Product test, Logo-off test, Trust test (§1)
- [ ] Looks like the same brand as the live dashboard

Fail → fix on template. Do not “regen with a better prompt.”

---

## 7. Channel specs

| Channel | Size | Template fit | Notes |
|---------|------|--------------|-------|
| Instagram feed | 1080×1350 | T1, T2, T4 | One idea per post |
| Instagram story | 1080×1920 | T1 story crop, T5 | Keep mark clear of UI chrome |
| X / Twitter | 1200×675 | T3, T5 | Prefer crop of real board |
| LinkedIn | 1200×627 or 1080×1080 | T4, T5 | Method + product trust |
| Archive / newsletter | flexible | T5 | Screenshots age better than AI art |

Captions: specific > hype. Lead with the claim and the metric name. End with product URL when useful. Hashtags: sparse, baseball-relevant, never spam walls.

---

## 8. Weekly operating rhythm (concrete)

| Day | Action |
|-----|--------|
| Pre-slate (morning) | Pull slate; pick 1–2 Matchup (T1) briefs with real edges |
| Afternoon | Assemble T1/T3 from templates; QA; schedule |
| 2–3 midweek slots | One Snapshot (T2) or Method (T4) |
| Weekly | One Product Crop (T5) from a real dashboard state |
| Never | Blank-day panic → open Midjourney |

Volume target: **quality over count**. A quiet day with no honest edge beats a generic AI post.

---

## 9. Anti-patterns (reject on sight)

1. “Generate an MLB infographic in ChatGPT and post it”
2. New layout every day “to keep it fresh”
3. Rainbow stat colors (red AVG, gold barrels, orange ranks) copied from random posters
4. Fake player art or AI headshots
5. Violet flooding the whole canvas
6. Multiple competing claims / pill clusters / emoji rows
7. Invented convergence counts or odds
8. Detached floating badges over stock stadium photos
9. Using Chase light logos on dark boards (or dark wordmarks crushed to black-on-black)
10. Treating Lucide thin icons as the hero visual language

---

## 10. Build backlog (to make this process fast)

These are product/process investments, not prompt engineering:

1. **Figma (or HTML) Chase Template File** — T1–T5 as components, token colors, chip components, logo master
2. **Export presets** — one-click sizes for IG/X
3. **Data paste sheet** — small CSV→clipboard helper for today’s T1 slots (optional script later)
4. **Screenshot SOP** — which dashboard URL, zoom, and crop for T5
5. **Caption bank** — 10 approved voice lines per pillar (fill blanks with metrics)
6. **Only then** consider automation: render T1 from `today_matchups.csv` via HTML→PNG — still template-locked, still not freehand AI

Until (1) exists, produce graphics manually on the zone maps in §4. Do not wait for automation to start publishing on-brand.

---

## 11. Agent / collaborator instructions

If an AI agent is asked to “make a graphic,” “design a post,” or “generate an infographic” for Chase:

1. Open this file and the design contract.
2. Demand a completed brief (§5 Step 1) or draft one for approval.
3. Select T1–T5; refuse freehand visual invention.
4. Use only approved assets and real data.
5. Deliver: filled zone map + copy + caption + QA checklist — **not** a synthetic AI poster as the final.
6. If the user explicitly wants AI image gen, warn that it conflicts with brand authenticity and propose template assembly instead.

---

## 12. One-line policy

**Chase graphics are manufactured from locked templates, design tokens, and live baseball data. AI drafts words and checks lists; it does not invent the brand’s face.**

---

*Pairs with `design/MLBMA_CURSOR_DESIGN_CONTRACT.md` (product visual law) and `.cursor/rules/chase-brand-and-avatars.mdc` (logo/avatar rules). Update this file when a new template (T6+) is approved — never by one-off social experiments.*
