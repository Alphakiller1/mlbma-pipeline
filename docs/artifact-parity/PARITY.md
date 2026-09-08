# Content-engine artifact pixel parity (NOW)

**Captured:** 2026-09-08  
**Server:** `http://127.0.0.1:8766` (do not use 8765)  
**Tool:** Playwright Chromium, `animation:none` / `transition:none` injected, **two screenshots** per selector (`*-a.png` / `*-b.png`).  
**BEFORE set:** not available (other-machine WIP / prior captures gone). This is a **NOW** recapture, not a before/after diff.

`lineup_vs_hand` is **not** in `outputs/content_engine.py` `ARTIFACTS` — not captured.

Live Sheets/Supabase (and slate-date guards) **do** change pixels. Treat these as data-dependent.

## Results

| Registry key | Selector | Capture target | Files | Notes |
|--------------|----------|----------------|-------|--------|
| `team_rankings` | `.lv-table` | `/dashboard/render/team_rankings.html` | `team_rankings-a.png` `team_rankings-b.png` | Two passes identical (446393 bytes). Dual-render table ≥768px. |
| `starters_rankings` | `.pl-rank-table` | `/dashboard/index.html#section-research-lab` + `showResearchSubtab('pitching')` | `starters_rankings-a.png` `starters_rankings-b.png` (copies of `starters_rankings_index-*`) | Working same selector. |
| `starters_rankings` (render route) | `.pl-rank-table` | `/dashboard/render/pitcher_intelligence.html` | — | Route **mounts PitcherLab** and keeps `showResearchSubtab('pitching')`. On this VM `fetchSheetTab('Today_Matchups')` **fails closed**: `stale Today_Matchups slate (wanted 2026-09-08)`, so the starters table is empty (`Projected starters unavailable`). Not a selector mismatch. |
| `card` | `.hero-matchup-card` | index `#section-matchups-hero` | `card-a.png` `card-b.png` | Passes identical. Pair on this slate paint: CLE@BAL. |
| `banner` | `.mc-header` | `matchup_compare.html` | — | **Not captured.** Compare page: `No slate row for CLE @ BAL` (same current-slate guard). No `.mc-header` in the empty state. |
| `radar` | `.mc-radar-duo` | compare | — | Same as banner. |
| `offense` | `.mc-os-duo` | compare | — | Same as banner. |
| `pitcher` / `pitcher_rev` | `.mc-lvp-section` | compare `compare=lvP` | — | Same as banner. |
| `bullpen` / `bullpen_rev` | `.mc-lvb-section` | compare `compare=lvB` | — | Same as banner. |

Log: `capture-log.json`. Script: `scripts/capture_artifact_parity.py`.

## How to recapture

```bash
python3 -m http.server 8766   # if not already up; do not kill 8765
PYTHONIOENCODING=utf-8 python3 scripts/capture_artifact_parity.py
```

When `Today_Matchups` matches the pipeline slate day, the render pitching route and compare selectors should populate without code changes.
