# MLBMA Audit Backlog

Prioritized from codebase review (Team Rankings + Research Lab + pipeline). Pair with **`docs/ECOSYSTEM.md`** when writing your target UX spec.

**Last updated:** 2026-06-28

---

## Completed (since initial backlog)

| Item | Status | Notes |
|------|--------|-------|
| `verify_window_data.py` | Done | Pre-push gate for window CSV row counts and LAD PA/wOBA drift |
| Team Rankings shared JS alignment | Done | `matchup_shared.js?v=20260624c`, `mlbma_assets.js?v=20260618b` — matches OEM |
| Smart refresh / skip stale scrapes | Done | `scripts/pipeline_freshness.py`, `finish_pipeline_smart.py`, `refresh_sharp_money.py`, `sync_from_cache.py` (678276b, 2596a7d) |
| Scraper hardening | Done | `core/http_retry.py`, FanGraphs session retries, unbuffered subprocess logs |
| Sharp-money stack | Done | Full pitcher model layers, pitch-mix integration, `supabase/migrations/0002_projection_tracking.sql` |
| SP gamelog accent names | Done | `scrape_sp_gamelog.py` → `core.name_utils.normalize_player_name` (López etc.) |
| `finish_pipeline_smart` bootstrap | Done | `sys.path` / `ROOT` resolution fixed; parallel stale-step runner |
| `push_supabase` upsert | Done | Upsert path hardened in partial-run commits |
| `docs/ECOSYSTEM.md` | Done | Ecosystem map added |

### Batter splits refresh (2026-06-28)

| File | mtime | Rows | Notes |
|------|-------|------|-------|
| `batter_splits_overall.csv` | 2026-06-26 | 346 | Fresh |
| `batter_splits_recent.csv` (L30) | 2026-06-26 | 346 | Fresh |
| `batter_splits_l14.csv` | 2026-06-26 | 342 | Fresh |
| `batter_splits_rhp.csv` | 2026-06-26 | 318 | Fresh |
| `batter_splits_lhp.csv` | 2026-06-26 | 219 | Fresh |
| `batter_splits_l7.csv` | 2026-06-26 | 344 | Refreshed |
| `batter_splits_home.csv` | 2026-06-26 | 253 | Refreshed |
| `batter_splits_away.csv` | 2026-06-28 | 240 | Refreshed |
| `batter_splits_vsRP.csv` | 2026-06-28 | 50 | Refreshed |
| `batter_splits_vsSP.csv` | 2026-06-28 | 53 | Refreshed |

`verify_window_data` passes (346 / 342 / 344). `compute_batter_profile` + `compute_team_profile` re-run; `refresh_sharp_money --export-only` updated boards.

---

## P0 — Data correctness (Sheets / pipeline)

| # | Item | Current | Recommended |
|---|------|---------|-------------|
| 1 | **Rolling window freshness** | **Resolved (2026-06-28)** — all `batter_splits_*.csv` refreshed; `verify_window_data` OK | Spot-check LAD L30/L14/L7 on Team Rankings after next slate; `push_team_profiles` when sheet push is due |
| 2 | **PP-Gap semantics** | Sheet: `projOSI−OSI`; Hub/glossary: `ABQ−RCV` | Add both columns OR rename; one definition in UI |
| 3 | **Team Rankings build-tag drift** | Shared assets aligned with OEM; page still mixes `20260605a` / `20260608b` / `20260611a` comment tags | Cosmetic — align BUILD / `__MLBMA_EXPECT_HUB_BUILD` / console version strings (see P3 #18) |

---

## P1 — Architecture / redundancy

| # | Item | Action |
|---|------|--------|
| 4 | OEM inline fetch/score duplicates | Extract to `oem_dashboard.js`; delete inline copies |
| 5 | Triple `parseTeamProfileRows` / `mergeBoth` | Move to `matchup_shared.js` or `mlbma_scores.js` |
| 6 | Hidden `#pane-leaderboards` + `renderMasterTable` | Remove or restore as visible tab |
| 7 | `HUB` vs `STATE` vs `SPLITS_STATE` | Design single `FilterState` API for Rankings + RL |
| 8 | `TRENDS_STATE` not synced from global time bar | Wire or document as independent |
| 9 | Subtab hook triple-wrap | Collapse to one `showResearchSubtab` in `research_lab.js` |

---

## P2 — Google Sheets enhancements

| # | Item | Notes |
|---|------|-------|
| 10 | Optional `Team_Windows` audit tab | Export `osi_l30/l14/l7` + dates for QA |
| 11 | Document `pp_gap` in row 1 note | Link to glossary definition |
| 12 | `Last_Updated` per tab | Some tabs only update on full pipeline |
| 13 | PALS push separate from `push_sheets` | Already separate; document in runbook |

---

## P3 — UIX / product

| # | Item | Notes |
|---|------|-------|
| 14 | Team Rankings vs RL Trends overlap | Both show team × window; consolidate or differentiate copy |
| 15 | F5 hand mode | Hub recomputes OSI; RL splits use different F5 formula location |
| 16 | Location: profile `home_osi` vs batter home splits | Hub uses profile; Trends uses aggregates — align |
| 17 | Advanced columns (PP-Gap, ProjOSI, PALS) | Hub only; RL splits use different column sets |
| 18 | Build comment / script version drift | e.g. TR `20260605a` vs boot `20260608b` vs OEM `20260527s` on some scripts — cosmetic; align BUILD tags |

---

## P4 — Code hygiene (low risk)

| # | Item | Action |
|---|------|--------|
| 19 | `push_matchups.py` no-op | Keep; add comment in `pipeline/main.py` deps |
| 20 | Unused `savant_vs_RHP/LHP` | Stop scraping or use in RCV |
| 21 | `scripts/oem_*.py` one-off mutators | Archive to `scripts/archive/` if not in CI |
| 22 | `model_report.js` `STATE` name clash | Rename to `MR_STATE` |
| 23 | `normalize_pool` 0 vs `normalize` 50 | Document in glossary |

---

## Suggested order (remaining)

1. `python scripts/finish_pipeline_smart.py` (or full scrape) — refresh L7 + legacy splits
2. `python -m scripts.verify_window_data`
3. `python -m outputs.push_team_profiles`
4. Hard-refresh Team Rankings — confirm LAD L30 ≠ L14 ≠ L7
5. Write UX spec against **ECOSYSTEM §5–6**
6. Pick P0 #2 (PP-Gap) before large UIX refactor

**Fast path when CSVs are already fresh:** `python scripts/sync_from_cache.py` → verify → push.
