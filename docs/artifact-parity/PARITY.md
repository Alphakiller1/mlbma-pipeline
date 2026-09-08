# Content-engine artifact pixel parity (NOW)

**Captured:** 2026-09-08 (recapture after WP4A guard + render pitching boot)  
**Server:** `http://127.0.0.1:8766` (do not use 8765)  
**Tool:** Playwright Chromium, `animation:none` / `transition:none` injected, **two screenshots** per selector (`*-a.png` / `*-b.png`).  
**BEFORE set:** not available (other-machine WIP / prior captures gone). This is a **NOW** recapture, not a before/after diff.

`lineup_vs_hand` is **not** in `outputs/content_engine.py` `ARTIFACTS` — not captured.

Live Sheets/Supabase (and slate-date guards) **do** change pixels. Local capture uses `hubdebug=1` / `capture=1` / `/render/` slate relax plus snapshot boot so selectors can paint when Today_Matchups is dated off the wall clock.

## Results

| Registry key | Selector | Capture target | Files | Notes |
|--------------|----------|----------------|-------|--------|
| `team_rankings` | `.lv-table` | `/dashboard/render/team_rankings.html` | `team_rankings-a.png` `team_rankings-b.png` | Dual-render table ≥768px. |
| `starters_rankings` | `.pl-rank-table` | `/dashboard/render/pitcher_intelligence.html?capture=1&hubdebug=1` | `starters_rankings-a.png` `starters_rankings-b.png` | **Painted.** Route mounts PitcherLab; capture boot + SP_Profiles fallback. |
| `starters_rankings` (index) | `.pl-rank-table` | `/dashboard/index.html#section-research-lab` + `showResearchSubtab('pitching')` | `starters_rankings_index-*` | Working same selector. |
| `card` | `.hero-matchup-card` | index `#section-matchups-hero` | `card-a.png` `card-b.png` | Hero pair on this run: CLE@BAL. |
| `banner` | `.mc-header` | `matchup_compare.html?hubdebug=1&snapshot=1` | `banner-a.png` `banner-b.png` | Resolved to CHC@MIA via compare/slate pick. |
| `radar` | `.mc-radar-duo` | compare | `radar-a.png` `radar-b.png` | Same game. |
| `offense` | `.mc-os-duo` | compare | `offense-a.png` `offense-b.png` | Same game. |
| `pitcher` / `pitcher_rev` | `.mc-lvp-section` | compare `compare=lvP` | `pitcher-a.png` `pitcher-b.png` | Same game. |
| `bullpen` / `bullpen_rev` | `.mc-lvb-section` | compare `compare=lvB` | `bullpen-a.png` `bullpen-b.png` | Same game. |

Log: `capture-log.json`. Script: `scripts/capture_artifact_parity.py`.

## How to recapture

```bash
python3 -m http.server 8766   # if not already up; do not kill 8765
PYTHONIOENCODING=utf-8 python3 scripts/capture_artifact_parity.py
```
