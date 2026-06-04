# MLBMA — Team Profile Content Spec (what goes in)

**Purpose:** define what a Team Profile shows — one team's **complete story** (offense + pitching staff + roster) in one page. Offense uses Team Rankings families and Compare Mode-1 metrics; pitching covers rotation, bullpen, and staff snapshot; roster lists qualified batters. **Layout = hybrid:** infographic-style header → functional offense sections → staff/roster block below.

Builds on `INFOGRAPHIC_PATTERNS_SPEC.md` (header, insight rails, split cards) and `PLATFORM_IDENTITY_SPEC.md` (chips, green=elite, bold faces). Presentation/wiring only; reuse `valChipHtml`/`metricColor`/`pickCol`.

---

## 0. Data reality (verified in repo — drives scope)

**Exists today** (offense splits + team profile + Team_Results): wRC+, wOBA, xwOBA, SLG, K%, BB%, HR/9, Barrel%, HardHit%, ISO; OSI, ABQ, RCV, OBR, projOSI, PP-Gap, PALS; windowed OSI/ABQ/RCV/OBR (YTD/L30/L14/L7); vs-RHP / vs-LHP and home/away splits; Win%, F5 Win%, Pitcher Win%, QS%-allowed-ish from `Team_Results`.

**Phase-1 (no real source yet — flag, don't fake):**
- **OBP, AVG, OPS** — dropped at the batter-scraper whitelist; need the one-line export fix (add to whitelist + `RATE_COL_MAP`). Until then: em-dash + "Phase 1" note.
- **QS% (team's own)** — needs game-results QS (the pipeline has `qs_pct`; if not wired to the profile, flag it).

This spec marks those inline; everything else is live.

---

## 1. Snapshot header (infographic style — the one "poster" part)

The identity block from the team infographics:
- **Giant team name** (Roboto Condensed 800), **violet eyebrow** ("#N OVERALL OFFENSE · {standout trait} · {TEAM}"), team **logo with a team-color glow** (e.g. orange for HOU — the glow uses the team's color, not always violet; this is identity framing, allowed alongside green=elite data).
- **WRC+ medallion** (big mono/display number + "wRC+ · MLB {tier}").
- **W/L record** (real, from `Team_Results`) + overall offense rank.
- **Insight rail** (3 rows, icon-in-violet-circle + bold label + one line) — the auto-picked standout callouts (e.g. "Barrel rate leader", "Regression watch: wOBA > xwOBA", "Power profile: 48 HR"). These are view-layer derived from the team's own metrics (see `INFOGRAPHIC_PATTERNS_SPEC.md` §2 + the callout-logic note).

This header is the hybrid's infographic half. Everything below is functional.

---

## 2. Scoring (metric cards) — Team Rankings Scoring family
Bold green=elite chips: **OSI · wRC+ · wOBA · RCV**. The headline offensive quality block.

## 3. Process & Projection — Team Rankings Difficulty + Status families
Chips: **ABQ · OBR · projOSI · PP-Gap · PALS**. "How the lineup is built and where it's trending vs expectation." (PP-Gap/PALS keep their contextual coloring per identity spec, not plain green/red.)

## 4. Full-season offense line — Compare Lineup-vs-Lineup metrics
A stat strip of the core line: **wRC+ · wOBA · xwOBA · SLG · HR · K% · BB% · Barrel% · HardHit%** (all real).
**Phase-1 slots in this strip:** **AVG · OBP · OPS** — show the label with an em-dash + dashed "Phase 1" underline until the export fix lands. (They belong here per your Compare Mode-1 list; honest-empty for now.)

## 5. Handedness splits (the centerpiece) — Compare handedness + infographic split-cards
The **vs-LHP / vs-RHP split-card pair** (`INFOGRAPHIC_PATTERNS_SPEC.md` §3): teal vs-LHP / orange vs-RHP, 4×2 grid, OPS medallion between, weaker/stronger badge.
- Grid stats (real): **wOBA · xwOBA · SLG · K% · BB% · HR · Barrel% · HardHit%** (8 = 4×2). Use what the vs-RHP/vs-LHP splits carry.
- Medallion differential: the headline gap (use wOBA or OPS-equivalent from available data; if OPS isn't there, use wOBA gap and label it).
- Numbers on the uniform green=elite scale (chips), per the divergence note in the patterns spec.

## 6. Home / Away splits — Team Rankings location filter
Same core offense metrics split home vs away (the scraper carries `Home_*`/`Away_*`). A compact two-column or split-card treatment. Real today.

## 7. Surface wins — Team Rankings Surface-wins (real, from Team_Results)
Chips: **Win% · F5 Win% · Pitcher Win%**, with the windowed trend (YTD/L30/L14/L7) if shown. Real now that Team_Results is wired.

## 8. Momentum / trends — the Trends heat map, single-team slice
The team's **OSI / RCV / OBR across YTD · L30 · L14 · L7** with Δ and a hot/cold flag (windowed data exists for these four). A mini heat-strip or sparkline row. "Is this offense heating up or cooling?"

## 9. Tonight's matchup (conditional) — Compare, compact
If the team plays today: opposing SP, the **lineup edge bar** (blue→violet→pink), a "view full matchup" link to `matchup_compare.html`. Honest-empty / hidden if no game or no SP data.

---

## 10. Analyst Take (bottom block — from the infographic)
A closing block of **3 generated insight rows**, each: Lucide icon in a violet circle + bold heading + 2 lines of plain-language analysis. From the Astros sheet: Contact Profile / Plate Discipline Drop / Betting Edge.
- These are **written analysis derived from the team's own real metrics** (e.g. "BB% collapses vs LHP — 7.4% vs 10.7%", "OPS vs LHP is the lowest in its tier"). This is **view-layer logic** that picks the notable angle and composes the sentence per team — a real build effort, not styling. Phase it: ship the icon-rail layout now with a few rule-based callouts (biggest split gap, wOBA−xwOBA delta, top/bottom metric), expand the prose logic later.
- Honest-empty if a callout can't be computed from real data; never fabricate a "betting edge."

---

## Composition reference (the Astros sheet = the full target)
Top→bottom, the complete profile maps to: **§1 header** (giant name + violet eyebrow + WRC+ medallion + team-color logo glow + Chase wordmark) → **insight rail** (§1, 3 icon rows) → **§4 full-season block** (5×2 stat grid in a bordered card + a summary line like "wOBA outpaces xwOBA by N points") → **§5 split-card pair** (teal/orange + medallion + weaker/stronger badges) → **§10 Analyst Take** (3 icon rows of analysis). §2/3 (Scoring, Process) sit between header and full-season; §6–9 (home/away, surface wins, momentum, tonight) follow the splits. That ordering *is* the infographic, made functional.

## CONSISTENCY CONSTRAINT (important)
The Astros sheet is **visual inspiration**, but the build must match the **existing website system**, not copy the poster literally:
- **Colors:** the infographic colors stats contextually (red AVG, green K%, gold BRL%, orange "2B MLB 1st"). The website uses **uniform green=elite chips** (`valChipHtml`). Use chips — do NOT reproduce the mixed per-stat palette. This is the one intentional divergence.
- **Tokens/faces:** use the site's existing `--font-display` / `--sans`, the two-purple chrome, the established `--bg/--card/--border` tokens — not new values eyeballed from the image.
- **Logo glow** may pick up the **team color** (the orange Astros glow) since that's identity framing, not data — allowed, like the teal/orange split borders.
- The header/medallion/insight-rail/Analyst-Take are the infographic's personality; the chips, type, and tokens are the website's. Blend: poster *structure*, website *system*.

---

## What belongs on Team Profile (full team)
- **Offense block (§1–§10):** snapshot header, scoring, process, full-season line, handedness splits, home/away, surface wins, momentum, tonight, analyst take.
- **Staff block:** today's projected lineup, pitching snapshot (Pitch Score / ERA), starting rotation table, bullpen overview + relievers, qualified batter roster (50+ PA).

## What to LEAVE OUT (belongs in other tools)
- Full 30-team rankings → that's **Team Rankings**.
- Head-to-head vs another specific team → that's **Compare** (tonight's matchup slice is OK).
- League-wide bullpen usage matrix → **Bullpen Profile** (team profile links there; shows this team's relievers).

---

## Layout (hybrid)
1. **Infographic header** (§1) — poster-style, the visual hook.
2. **Functional sections below** (§2–9) — cards/accordions/split-cards on the bold green=elite system, scannable, dense. Section heads in the bold display face; all numeric values are chips; Phase-1 metrics em-dashed with a clear note.

## Acceptance
- Header is infographic-style (giant name, medallion, logo glow, insight rail); sections below are functional cards.
- Every live metric is a green=elite chip; OBP/AVG/OPS/QS% show em-dash + "Phase 1", never fabricated.
- Content sourced from the Team Rankings families + Compare Mode-1 set; handedness split-cards present; momentum uses windowed OSI/RCV/OBR.
- No 30-team ranking, no head-to-head, no pitcher deep-dive (offense focus).
- Reuses `valChipHtml`/`metricColor`/`pickCol`; green=elite; `window.x=x`; no console errors.

---

*Team Profile = one team's offensive story: Snapshot + Scoring + Process/Projection + Full-season line + Handedness splits + Home/Away + Surface wins + Momentum + Tonight. Real-data-only now; OBP/AVG/OPS + QS% unlock with the export fix + game-results. Pairs with `INFOGRAPHIC_PATTERNS_SPEC.md`, `PLATFORM_IDENTITY_SPEC.md`, `COMPARE_TOOL_SPEC.md`.*
