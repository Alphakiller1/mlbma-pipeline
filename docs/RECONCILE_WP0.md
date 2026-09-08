# WP0 reconcile log — `master` ← `batter-profile-prop-rework`

Merge-base: `41e99cfd` (2026-06-10).
- `origin/master` at branch creation: `858424ba` (67 unique commits vs merge-base; brief said 52 / `b9e99c16` — master moved including pipeline-accuracy backport #25).
- `origin/batter-profile-prop-rework`: `c2afeb27` (88 unique commits; `git cherry origin/master` still all `+`).

## Uncommitted work on `batter-profile-prop-rework`

This checkout started **on `master`, clean**. There were **no 62 uncommitted files** here (including `dashboard/index.html`, `team_rankings.html`, `matchup_shared.js`, `card_matchup.html`, `card_market_map.html`, `outputs/render_social_cards.py`).

**Discarded from this workspace: nothing.** Those files were not present to commit or discard. They exist only on some other working tree. They are **not on `origin/batter-profile-prop-rework`**. If they still exist locally for someone, they must be recovered from that machine — they were not silently deleted here because they were never in this tree.

## Home-page decision (explicit)

| Path | Winner | Why |
|------|--------|-----|
| `dashboard/index.html` | **feature** (8,770-line dashboard) | Single home. |
| `dashboard/chase_analytics_mlb_oem_v7.html` | **feature** stub → `index.html` | Legacy filename. |
| `index.html` (repo root) | **rewritten** | Absolute `/dashboard/index.html` so Cloudflare Pages 200 catch-all cannot loop nested relative redirects. |

## `_redirects`

Moved from `dashboard/_redirects` (inert) to repo-root `_redirects`. Added 301s for `/chase_analytics_mlb_oem_v7(.html)` and `/dashboard/chase_analytics_mlb_oem_v7(.html)` → `/dashboard/index.html`. Live 308s remain Pages automatic; this file is the product contract.

## Conflicted files (~29 content conflicts; overlap set was 52)

Convention: **ours** = `master`, **theirs** = `batter-profile-prop-rework`.

### Dashboard / site (product UI)

| File | Winner | Why |
|------|--------|-----|
| `dashboard/index.html` | theirs | Specified 8,770-line home. |
| `dashboard/chase_analytics_mlb_oem_v7.html` | theirs | Specified stub. |
| `dashboard/batter_profile.html` | theirs | Product batter hub. |
| `dashboard/bullpen_report.html` | theirs | Product bullpen page. |
| `dashboard/chase_nav.css` | theirs | Feature nav chrome. |
| `dashboard/chase_nav.js` | theirs | Feature nav (incl. auth/timestamp). |
| `dashboard/glossary.html` | theirs | Feature glossary page. |
| `dashboard/glossary.js` | theirs | Feature glossary copy. |
| `dashboard/matchup_compare.html` | theirs | Product compare page. |
| `dashboard/matchup_compare.js` | theirs | Product compare logic. |
| `dashboard/matchup_sheet.html` | theirs | Feature redirect/page. |
| `dashboard/mlbma_ui.js` | theirs | Feature UI helpers. |
| `dashboard/pitcher_lab.js` | theirs | Feature pitcher lab. |
| `dashboard/pitcher_profile.html` | theirs | Feature pitcher profile (pitcher-keyed). |
| `dashboard/responsive.css` | theirs | Feature mobile layer. |
| `dashboard/team_card.html` | theirs | Feature team card. |
| `dashboard/team_profile.html` | theirs | Feature team profile. |
| `dashboard/team_rankings.html` | theirs | Feature rankings shell. |
| `dashboard/league_baselines.json` | theirs | Newer `generated_at` (2026-07-19 vs 07-17). |
| `dashboard/team_rankings_snapshot.json` | theirs | Newer snapshot (2026-07-19 vs 07-05). |
| `dashboard/mlbma_design_system.css` | **merged** | Feature file; `responsive.css?v=` kept at feature `20260610f` to match the file we took. |
| `dashboard/matchup_shared.js` | **ours (master)** | Keep live-site slate guard (`requireCurrentSlateRows`, published `Slate_Date_ET`), MLB pitcher-rate hydrate, WHIP pool PitchScore. Feature CDF PitchScore / wx concurrency helpers **not** ported (leftover risk). |
| `dashboard/platform_dashboard.js` | **ours (master)** | Keep `gamePk` compare URLs and TBD pitcher honesty. |

### Pipeline / Python

| File | Winner | Why |
|------|--------|-----|
| `.gitignore` | **union** | Keep `_site/` (master Cloudflare deploy) **and** feature social/mockup ignores. |
| `core/config.py` | **theirs hunk** | Dynamic `CHROME_VERSION` resolver; rest auto-merged. |
| `core/slate_date.py` | **theirs** | MLB Stats API status rollover matches the module docstring; master’s 5 PM clock is the less accurate client-era heuristic. |
| `pipeline/main.py` | **merged** | Master CLI (`--check`/`--dry-run`/`--skip-fangraphs`) + slate guardrail `expected_date` **plus** feature `run_bullpen_social_charts`, `run_batter_splits_mlb/fallback`, `run_ecosystem_publish`, `run_discord_autopost`. |
| `scrapers/scrape_matchups.py` | **ours (master)** | People-API pitch hands + exact-name SP stats + WHIP/PitchScore. Feature registry-only hands and older `EMPTY_SP_STATS` dropped. |
| `scrapers/scrape_lineups.py` | **ours (master)** | Duplicate-card filter, API first-pitch, tomorrow Rotowire URL. Feature Rotowire multi-view picker **not** taken (leftover risk; master dual-URL + API reconcile covers stale Rotowire). |

### Overlap files that auto-merged (no conflict markers)

`core/compute_baselines.py`, `core/compute_pals.py`, `core/compute_pitching.py`, `core/compute_sp_l14.py`, `core/compute_sp_splits.py`, `dashboard/batter_profile.css`, `dashboard/icon_preview.html`, `dashboard/landing_dashboard.css`, `dashboard/lineup_view.js`, `dashboard/mlbma_assets.js`, `dashboard/mlbma_backgrounds.css`, `dashboard/mlbma_config.js`, `dashboard/team_profile_sections.js`, `dashboard/team_rankings_boot.js`, `dashboard/theme.css`, `pipeline/smoke_imports.py`, `scrapers/scrape_reliever_gamelog.py`, `scrapers/scrape_sp_gamelog.py`, `scrapers/scrape_sp_hand_splits.py`, `scrapers/scrape_sp_season_standard.py`, `scripts/backfill_pitcher_hand.py`, `scripts/validate_xfip_source.py`, plus `compare_metrics.js` if present.

Git combined both sides; these were not hand-resolved. `lineup_view.js` still deletes `scope`/`team` query params (smoke URL updated).

## Intentionally dropped / not in this PR

- The **62 uncommitted files** from the other `batter-profile-prop-rework` working tree (not in this checkout; not on origin).
- Feature **PitchScore CDF** (`psNormCdf` / `PS_ANCHORS`) and weather-request limiter in `matchup_shared.js`.
- Feature **Rotowire view picker** in `scrape_lineups.py`.
- Master **5 PM ET** `core/slate_date.py` clock (replaced by API rollover). Client `matchup_shared.js` still uses published slate day + 17:00 fallback.
- Restyling / WP1 cross-sport IA (out of scope).

## Docs / CI (this WP)

- `docs/LIVE_SITE_SETUP.md` — production is `master`; whole-repo rsync; no bundler; redirects at deploy root.
- `docs/ECOSYSTEM.md` §5/§6/§9/§11 — removed nonexistent `matchup_hub.js`, `rl_tab_uix.js`, `mlbma_signals.js`.
- `.github/workflows/pages.yml` — dropped `&scope=team&team=NYY`.
