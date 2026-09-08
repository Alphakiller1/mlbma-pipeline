# Cross-sport programme — honest release status

**Date:** 2026-09-08  
**Repo:** `Alphakiller1/mlbma-pipeline`  
**Branch:** `cursor/wp1-design-layer-4ee4` (draft PR #27)  
**Not a production release.** No merge to `master`, no Pages/Cloudflare production deploy, no live `chase-analytics.com` cutover.

This report is the WP6-6 artefact **for this repo**. Items that live in other repositories are listed as blocked or out of scope, not as shipped.

## Done in mlbma-pipeline (evidence)

| Work | Evidence |
|------|----------|
| WP0 site trunk reconcile | Draft PR [#26](https://github.com/Alphakiller1/mlbma-pipeline/pull/26); `docs/RECONCILE_WP0.md` |
| WP1 A/B/D token spine | Draft PR [#27](https://github.com/Alphakiller1/mlbma-pipeline/pull/27); `design/tokens/chase-tokens.css`; `scripts/check_tokens.py`; `tests/test_contrast.py`; stamp `20260908a` |
| Design-doc INDEX | `design/INDEX.md` (WP6-7) |
| WP2 kits vendored (not applied to model remotes) | `docs/wp2-patches/` |
| WP3 DataStatus + Last_Updated collapse | `dashboard/chase_datastatus.js` is the parser (`parseLastUpdatedCsv`, `fetchLastUpdated`). `mlbma_ui.js` footer, `chase_nav.js`, `index.html` `syncFreshnessIndicator` / `parseLastUpdatedFromText` consume it. **`formatClock()` removed.** Failed fetches render `unknown`, never a wall clock. Rankings ScopeBar hosts `#lvDataStatus`. NFL/CFB age uses 5-day stale window at view time. |
| WP3 adapters `chase-board/1` | `dashboard/sports/chase_board.js` + thin `mlb.js`/`nfl.js`/`wnba.js`/`cfb.js`. Games map `kickoff_utc`, three margin channels, `edge_withheld_reason`, `priced`. MLB passes through `priced_markets` / `flagged_tiles` (Picks/Gems). Missing `board.json` is an error state. |
| WP4 Pilot B (NFL matchups) | `/nfl/matchups.html` from `scripts/build_sport_routes.py`: chase_nav hamburger, expandable evidence, model/market/published columns, `edge_withheld_reason`, priced markets labelled **not Picks**, authority as **text** via `ChaseModelStatus`. |
| WP4A capture guards | `captureSlateRelax()` in `matchup_shared.js` (localhost, `/render/`, `hubdebug`/`capture`/`snapshot`). `render/pitcher_intelligence.html` sets `_captureBoot` and still mounts PitcherLab; `.pl-rank-table` can render from SP_Profiles when slate starters are empty. Capture script follows `.mc-slate-pick` and appends `hubdebug=1`. |
| WP4A `/render/` copies + 301s + glossary | PR #27; root `_redirects` |
| WP5 sport routes | `scripts/build_sport_routes.py` writes real `mlb/` `nfl/` `wnba/` `cfb/` `index.html`. Root `404.html` unchanged. `/mlb` 302 to dashboard **removed**. Sport selector (`chase_sport_select.js`) stores **per-sport** `localStorage` context and each page loads **only** that sport’s adapter. |
| WP0 OEM leftovers | Remaining dashboard nav/CTA/`matchup_compare` crumbs point at `index.html`. Stub `chase_analytics_mlb_oem_v7.html` still exists as a hop. `integrate_chase_nav.py` drawer tail no longer reintroduces the OEM filename. |
| D-08 hunt | `docs/UNRECOVERED_WIP.md` — 62-file set still not on this disk |
| Root 404 | `404.html` (unvalidated vs a live Pages 404) |

## Remaining / blocked / impossible here

| Item | Owner | Status |
|------|-------|--------|
| Merge WP0/WP1 as a release | mlbma | **Must not** — draft PRs only |
| Production deploy chase-analytics.com | pages | **Not done** |
| 62 uncommitted files from the other machine | human | **Unrecovered** — `docs/UNRECOVERED_WIP.md` |
| WP1.C model-repo token/board.css / smokes | four model repos | **blocked** `cursor[bot]` 403 |
| WP2 `board.json` producers on origin | mlb/wnba/cfb | **blocked** 403; kits only in this repo. Adapters tolerate missing JSON. |
| WP4A-5 PP-Gap glossary collision | mlbma | Copy started in WP1 PR; keep watching |
| WP6-1 mlb-model three contracts | mlb-model | **Not this repo** — D-22 |
| WP6-2…5 chase-content-engine fonts / `render.py` 571 & 613–615 / `validate_bundle` / metallic headings | chase-content-engine | **Not this repo** — D-23 |
| Feature PitchScore CDF / Rotowire view picker | mlbma | **Not ported** — would rewrite master PitchScore compute / lineup scrape. Code is not in this tree. |
| Live Pages 404 vs `_redirects` | pages | Cannot prove without production deploy |
| Artifact PNGs for banner/radar/offense/pitcher/bullpen | mlbma | Code path is in; **pixels depend on a reachable slate**. Recapture on port **8766**. |

## What “done” does not mean

- Token spine on a **draft** branch is not a live CORS `/design/chase-tokens-v1.css`.
- `/render/` files are capture targets; production `_redirects` do nothing until a **root** Pages deploy.
- Dual-render values still come from live Sheets/Supabase; pixels are data-dependent.
- Sport hubs fetch `board.json` when published; producers are still not on origin for MLB/WNBA.

## Verification

Run on this agent after the close-gaps commit (update this table with actual results):

| Gate | Result |
|------|--------|
| `python3 scripts/check_tokens.py` | pending |
| `python3 -m unittest discover -s tests -p 'test_*.py'` | pending |
| `dashboard_runtime_diag.py` team_rankings **8766** | pending |
