# Cross-sport programme — honest release status

**Date:** 2026-09-08  
**Repo:** `Alphakiller1/mlbma-pipeline`  
**Not a production release.** No merge to `master`, no Pages/Cloudflare production deploy, no live `chase-analytics.com` cutover.

This report is the WP6-6 artefact **for this repo**. Items that live in other repositories are listed as blocked or out of scope, not as shipped.

## Done in mlbma-pipeline (evidence)

| Work | Evidence |
|------|----------|
| WP0 site trunk reconcile | Draft PR [#26](https://github.com/Alphakiller1/mlbma-pipeline/pull/26); `docs/RECONCILE_WP0.md` |
| WP1 A/B/D token spine | Draft PR [#27](https://github.com/Alphakiller1/mlbma-pipeline/pull/27); `design/tokens/chase-tokens.css`; `scripts/check_tokens.py`; `tests/test_contrast.py`; stamp `20260908a` |
| Design-doc INDEX | `design/INDEX.md` (WP6-7) |
| WP2 kits vendored (not applied to model remotes) | `docs/wp2-patches/` |
| WP4A `/render/` copies + 301s + glossary Process vs Regression Gap | PR #27; root `_redirects` |
| WP4 Pilot A dual-render lens on Team Rankings | `dashboard/lineup_view.js` + `dashboard/chase_scope.js` — ScopeBar (window/segment/family), stated context, league ranks, compare-to-league expander, mobile cards |
| Content-engine capture route for pitching table | `dashboard/render/pitcher_intelligence.html` mounts `.pl-rank-table` |
| Artifact **NOW** pixel captures | `docs/artifact-parity/` + `docs/artifact-parity/PARITY.md` |
| D-08 hunt | `docs/UNRECOVERED_WIP.md` — named files still missing except committed `card_compose.html` |
| Root 404 + sport stubs | `404.html`, `/nfl/`, `/cfb/`, `/wnba/` scaffolding (unvalidated vs a live Pages 404) |

## Remaining / blocked

| Item | Owner | Status |
|------|-------|--------|
| Merge WP0/WP1 as a release | mlbma | **Must not** — draft PRs only |
| Production deploy chase-analytics.com | pages | **Not done** |
| 62 uncommitted files from the other machine | human | **Unrecovered** — `docs/UNRECOVERED_WIP.md` |
| WP1.C model-repo token/board.css / smokes | four model repos | **blocked** `cursor[bot]` 403 |
| WP2 `board.json` producers on origin | mlb/wnba/cfb | **blocked** 403; kits only in this repo |
| WP3 DataStatus replacing remaining `Last_Updated` parsers | mlbma | **Incomplete** — `chase_datastatus.js` exists as scaffolding; index/`mlbma_ui.js` still parse clocks |
| WP4 Pilot B (second surface) | mlbma | **not started** |
| WP4A-5 PP-Gap glossary collision | mlbma | Copy started in WP1 PR; keep watching |
| WP5 hub load-only-selected-sport | mlbma | **Incomplete** |
| WP6-1 mlb-model three contracts | mlb-model | **Not this repo** — D-22 |
| WP6-2…5 chase-content-engine fonts / `render.py` 571 & 613–615 / `validate_bundle` / metallic headings | chase-content-engine | **Not this repo** — D-23 |
| Feature PitchScore CDF / Rotowire view picker | mlbma | WP0 leftovers, not ported |
| Home `dashboard_runtime_diag` | mlbma | Still LineupView-only |

## What “done” does not mean

- Token spine on a **draft** branch is not a live CORS `/design/chase-tokens-v1.css`.
- `/render/` files are capture targets; production `_redirects` do nothing until a **root** Pages deploy.
- Dual-render values still come from live Sheets/Supabase; pixels are data-dependent.
- Sport hub stubs do not consume deployed `board.json` (producers not on origin).

## Verification this agent ran

Recorded in the PR / checklist after the test pass: `check_tokens.py`, `unittest discover`, `dashboard_runtime_diag` on team_rankings (and render copy if the server is up).
