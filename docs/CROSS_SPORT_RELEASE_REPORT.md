# Cross-sport programme — honest release status

**Date:** 2026-09-08  
**Repo:** `Alphakiller1/mlbma-pipeline`  
**Branch:** `cursor/wp1-design-layer-4ee4` (draft PR #27; stacked #36–#38 merged into the trunk)  
**Not a production release.** No merge to `master`, no Pages/Cloudflare production deploy, no live `chase-analytics.com` cutover.

This report is the WP6-6 artefact **for this repo**. Items that live in other repositories are listed as blocked or out of scope, not as shipped.

## Done in mlbma-pipeline (evidence)

| Work | Evidence |
|------|----------|
| WP0 site trunk reconcile | Draft PR [#26](https://github.com/Alphakiller1/mlbma-pipeline/pull/26); `docs/RECONCILE_WP0.md` |
| WP1 A/B/D token spine | Draft PR [#27](https://github.com/Alphakiller1/mlbma-pipeline/pull/27); `design/tokens/chase-tokens.css`; `scripts/check_tokens.py`; `tests/test_contrast.py`; stamp `20260908b` |
| Design-doc INDEX | `design/INDEX.md` (WP6-7) |
| WP2 kits vendored (not applied to model remotes) | `docs/wp2-patches/` |
| WP3 DataStatus + Last_Updated collapse | `ChaseDataStatus.fetchLastUpdated` is the only Last_Updated probe. Failed fetches render `unknown`. |
| WP3 adapters + shell | `chase_board.js` + sport adapters; `ChaseShell` / Entity / ModelStatus. Sport builder no longer emits Python `None`. |
| WP4 Pilot A | Matchup Compare ScopeBar: window/segment/family; stated starter/park context. |
| WP4 Pilot B | `/{sport}/matchups.html` for MLB/NFL/WNBA/CFB; priced markets not labelled Picks. |
| WP4A | Public Team Rankings 301 → Matchup Compare; `/render/` capture targets; public demoted pages `noindex`; runtime smoke hits `render/team_rankings.html`. |
| WP5 | Real root `index.html` (`data-mode=entry`); `/{sport}/results.html` from `record.json`; `404.html`. |
| WP6-1 mlb-model contracts | Done on mlb-model `main` (`docs/DESIGN_INDEX.md`). |
| WP6 content-engine | Done on chase-content-engine `main` (bundled fonts, `validate_bundle`, no `or 0` fabricated OSI). |
| WP4 Pilot B (NFL matchups) | `/nfl/matchups.html` from `scripts/build_sport_routes.py`: chase_nav hamburger, expandable evidence, model/market/published columns, `edge_withheld_reason`, priced markets labelled **not Picks**, authority as **text** via `ChaseModelStatus`. |
| WP4A capture guards | `captureSlateRelax()` in `matchup_shared.js` (localhost, `/render/`, `hubdebug`/`capture`/`snapshot`). `render/pitcher_intelligence.html` sets `_captureBoot` and still mounts PitcherLab; `.pl-rank-table` can render from SP_Profiles when slate starters are empty. Capture script follows `.mc-slate-pick` and appends `hubdebug=1`. |
| WP4A `/render/` copies + 301s + glossary | PR #27; root `_redirects` |
| Artifact **NOW** pixel captures | `docs/artifact-parity/` — team_rankings, starters (render + index), card, banner, radar, offense, pitcher, bullpen all OK on 8766 |
| WP5 sport routes | `scripts/build_sport_routes.py` writes real `mlb/` `nfl/` `wnba/` `cfb/` `index.html`. Root `404.html` unchanged. `/mlb` 302 to dashboard **removed**. Sport selector (`chase_sport_select.js`) stores **per-sport** `localStorage` context and each page loads **only** that sport’s adapter. |
| WP0 OEM leftovers | Remaining dashboard nav/CTA/`matchup_compare` crumbs point at `index.html`. Stub `chase_analytics_mlb_oem_v7.html` still exists as a hop. `integrate_chase_nav.py` drawer tail no longer reintroduces the OEM filename. |
| D-08 hunt | **Resolved** — recovered at `82a5012a`, pushed to `origin/batter-profile-prop-rework`; see `docs/UNRECOVERED_WIP.md` |
| Root 404 | `404.html` (unvalidated vs a live Pages 404) |

## Remaining / blocked / impossible here

| Item | Owner | Status |
|------|-------|--------|
| Merge WP0/WP1 as a release | mlbma | **Must not** — draft PRs only |
| Production deploy chase-analytics.com | pages | **Not done** |
| 62 uncommitted files from the other machine | — | **Recovered** — commit `82a5012a` (170 files) is on origin; `docs/UNRECOVERED_WIP.md` |
| WP1.C model-repo token/board.css / smokes | four model repos | **done on each `main`** (mlb-model #31, wnba #12, nfl-model #1, cfb #1) |
| WP2 `board.json` producers | mlb/wnba | **code on `main`**; live Pages `board.json` still needs those deploys |
| WP4A-5 PP-Gap glossary collision | mlbma | Copy started in WP1 PR; keep watching |
| WP6-1 mlb-model three contracts | mlb-model | **Not this repo** — D-22 |
| WP6-2…5 chase-content-engine fonts / `render.py` 571 & 613–615 / `validate_bundle` / metallic headings | chase-content-engine | **Not this repo** — D-23 |
| Feature PitchScore CDF / Rotowire view picker | mlbma | **Not ported** — would rewrite master PitchScore compute / lineup scrape. Code is not in this tree. |
| Live Pages 404 vs `_redirects` | pages | Cannot prove without production deploy |
| Artifact PNGs for banner/radar/offense/pitcher/bullpen | mlbma | **Captured** on 8766 (CHC@MIA). Still data-dependent. |

## What “done” does not mean

- Token spine on a **draft** branch is not a live CORS `/design/chase-tokens-v1.css`.
- `/render/` files are capture targets; production `_redirects` do nothing until a **root** Pages deploy.
- Dual-render values still come from live Sheets/Supabase; pixels are data-dependent.
- Sport hubs fetch `board.json` when published; producers are still not on origin for MLB/WNBA.

## Verification

| Gate | Result |
|------|--------|
| `python3 scripts/check_tokens.py` | **OK** (stamp `20260908g`) |
| `python3 -m unittest discover -s tests -p 'test_*.py'` | **37 OK** |
| `dashboard_runtime_diag.py` team_rankings **8766** | **13/14** — table/model PASS; leftover console CORS on Supabase from `127.0.0.1:8766` (snapshot still paints `.lv-table`). Same class of leftover as the prior 8766 render report. |
| `scripts/capture_artifact_parity.py` **8766** | **9/9 required selectors OK** including render `.pl-rank-table` and compare banner/radar/offense/pitcher/bullpen |
