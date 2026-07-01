# MLBMA Pipeline — Scrape & Run Commands

Single reference for daily scrapes, full pipeline, partial reruns, and diagnostics.

**Project root:** `C:\Users\user\Documents\mlbma-pipeline`  
**Python (venv, Windows):** `C:\Users\user\Documents\mlbma-pipeline\crawl_env\Scripts\python.exe`  
**Python (venv, macOS/Linux):** `crawl_env/bin/python`  
**Local CSV output:** `data/` (repo root)  
**Google Sheet ID:** `1D28pC1lqMbsCcTBP67WhJPzYHn2UdtveMEv6RsUSczk`  
**Live dashboard:** https://alphakiller1.github.io/mlbma-pipeline/

Commands below are shown as PowerShell (Windows, the primary dev machine). Every
command has a direct macOS/Linux (bash/zsh) equivalent — swap
`crawl_env\Scripts\python.exe` for `crawl_env/bin/python` and backslash paths for
forward slashes. `pipeline/main.py` and `core/config.py` resolve both venv layouts
and both Chrome locations automatically (`_resolve_python()` / `_resolve_chrome_path()`),
so the same `-m module` commands work unchanged on either OS.

---

## Cross-platform setup (macOS / Linux)

```bash
cd ~/mlbma-pipeline
python3 -m venv crawl_env
crawl_env/bin/pip install -r requirements.txt
cp .env.example .env               # fill in FanGraphs + Supabase creds
# copy google_credentials.json into the repo root (see "Bringing credentials to
# another machine" below -- never via git)
```

Optional one-time editable install (`pyproject.toml`) puts the repo root on
`sys.path` and adds a single `mlbma-pipeline` entrypoint that mirrors
`python -m pipeline.main`:

```bash
crawl_env/bin/pip install -e .
mlbma-pipeline --check
```

**Full daily pipeline (macOS/Linux):**

```bash
cd ~/mlbma-pipeline
crawl_env/bin/python -m pipeline.main
```

**Shell script alternative** (mirrors `run_pipeline.bat`; logs to `pipeline_log.txt`):

```bash
./run_pipeline.sh
```

---

## Preflight / doctor — `--check`, `--dry-run`, `--skip-fangraphs`

Run this **before** a full pipeline run on any machine (with or without creds) to
see what will actually happen. It never scrapes or pushes anything.

```powershell
crawl_env\Scripts\python.exe -m pipeline.main --check
```

```bash
crawl_env/bin/python -m pipeline.main --check
```

Prints a readiness table (Python/venv resolved, `.env` present + which keys are
set, `google_credentials.json` present + valid JSON, Chrome found) followed by a
RUN / SKIP / FAIL plan for all 22 steps given the current creds and `data/`
contents.

- `--dry-run` — same step plan, without the environment/readiness section.
- `--skip-fangraphs` — skip the two FanGraphs Selenium steps
  (`scrapers.scrape_fangraphs`, `scrapers.scrape_batter_splits`); combine with
  `--check`/`--dry-run` to preview, or pass alone to a real run:

```powershell
crawl_env\Scripts\python.exe -m pipeline.main --skip-fangraphs
```

The no-arg `python -m pipeline.main` behavior (full 22-step run) is unchanged.

---

## Bringing credentials to another machine (e.g. a Mac)

`.env` and `google_credentials.json` are gitignored and must **never** go through
git, GitHub, or any other tracked/shared channel. Move them out-of-band instead:

1. AirDrop, a USB drive, or a password manager's secure-note/file attachment
   (1Password, Bitwarden, etc.) from this machine to the target machine.
2. Drop both files directly into the target repo root (same filenames:
   `.env`, `google_credentials.json`) after cloning the repo there.
3. Run `python -m pipeline.main --check` (or `crawl_env/bin/python -m pipeline.main --check`
   after the venv/setup steps above) to confirm both files are detected and valid
   before doing a real run.

For GitHub Actions / CI, don't copy files at all — use repository secrets (see below).

## Running on GitHub Actions (CI)

The pipeline can run on any GitHub-hosted runner via
`.github/workflows/run-pipeline.yml`, without FanGraphs (headless Selenium
bot-login is unreliable in CI, so the workflow always passes `--skip-fangraphs`;
run FanGraphs scrapes locally instead).

**One-time setup** — push this machine's real credentials to the repo's Actions
secrets (values are never printed or committed):

```powershell
gh secret set SUPABASE_SECRET_KEY
gh secret set FANGRAPHS_EMAIL
gh secret set FANGRAPHS_PASSWORD
gh secret set GOOGLE_CREDENTIALS < google_credentials.json
```

**Trigger a run:**

```powershell
gh workflow run run-pipeline.yml
gh run watch                      # follow the latest run
```

The workflow also runs on a daily schedule (`workflow_dispatch` + `schedule`). It
reconstructs `google_credentials.json` from the `GOOGLE_CREDENTIALS` secret at
runtime, exports the Supabase/FanGraphs env vars from secrets, and runs
`python -m pipeline.main --skip-fangraphs` — publishing to Google Sheets and the
Supabase `hub_dataset` mirror exactly like a local run, minus FanGraphs.

---

## Fast daily (reuse fresh `data/` CSVs — recommended)

Skips scrapes whose outputs are already dated **today**. Use instead of `pipeline.main` on routine mornings.

```powershell
cd C:\Users\user\Documents\mlbma-pipeline
crawl_env\Scripts\python.exe -m scripts.sync_from_cache          # audit + compute-only / targeted scrapes
crawl_env\Scripts\python.exe -m scripts.finish_pipeline_smart    # full smart finish + Sheets push
```

**Audit only** (no scrapes):

```powershell
crawl_env\Scripts\python.exe -m scripts.sync_from_cache --audit-only
```

**Sharp-money boards** (slate scrapes only if stale; never re-scrapes pitch_mix / gamelog / batter_splits):

```powershell
crawl_env\Scripts\python.exe -m scripts.refresh_sharp_money
crawl_env\Scripts\python.exe -m scripts.refresh_sharp_money --export-only   # boards only
```

| Smart skip | When |
|------------|------|
| `core.compute_sp_splits` | `sp_gamelog.csv` fresh but `sp_profiles.csv` stale |
| `scrapers.scrape_pitch_mix --l14-only` | season pitch mix fresh, L14 missing/stale |
| `scrapers.scrape_batter_splits --splits l14` | overall fresh, L14 stale |
| Slate scrapers + signals | output CSV mtime is today |

**Full cold start** — use only when season files are missing or multiple days stale:

```powershell
crawl_env\Scripts\python.exe -m pipeline.main
```

---

## Prerequisites

Run all commands from the repo root:

```powershell
cd C:\Users\chase\mlbma_pipeline
```

Optional session shortcut:

```powershell
$PY = "C:\Users\chase\crawl_env\Scripts\python.exe"
cd C:\Users\chase\mlbma_pipeline
```

### Required files (project root)

| File | Purpose |
|------|---------|
| `google_credentials.json` | Google Sheets API — push steps skip gracefully without it |
| `.env` | FanGraphs login (Selenium scrapers) + Supabase write key (hub_dataset mirror) |

Copy `.env.example` to `.env` and fill in the real values — it documents every
variable the pipeline reads (Supabase, FanGraphs, optional Chrome/Instagram
overrides). Both files are gitignored; **never commit them**.

Both are loaded centrally by `core/config.py` (`load_dotenv(ENV_FILE)` at import
time), so every module sees the same environment regardless of which script runs
first.

---

## One command — full daily pipeline (recommended)

Runs all 19 steps in order. Step 1 (Savant) is required; other steps log warnings and continue on failure.

```powershell
cd C:\Users\chase\mlbma_pipeline
C:\Users\chase\crawl_env\Scripts\python.exe -m pipeline.main
```

**Batch/shell alternative** (logs to `pipeline_log.txt`; uses repo-local `crawl_env` if present):

```powershell
.\run_pipeline.bat
```

```bash
./run_pipeline.sh
```

**Log file:** `pipeline_log.txt` (repo root)

---

## Full pipeline — step-by-step (manual)

Use for debugging or partial reruns. All commands assume:

```powershell
cd C:\Users\chase\mlbma_pipeline
```

Replace `C:\Users\chase\crawl_env\Scripts\python.exe` with `$PY` if you set the shortcut above.

| Step | Description | Command |
|------|-------------|---------|
| 1 | Baseball Savant team stats (**required**) | `C:\Users\chase\crawl_env\Scripts\python.exe -m scrapers.scrape_savant` |
| 2 | FanGraphs team + SP stats (Selenium) | `C:\Users\chase\crawl_env\Scripts\python.exe -m scrapers.scrape_fangraphs` |
| 3 | Compute ABQ, RCV, OBR, OSI, OOR, PitchScore | `C:\Users\chase\crawl_env\Scripts\python.exe -m core.compute` |
| 4 | Push core metrics → Sheets | `C:\Users\chase\crawl_env\Scripts\python.exe -m outputs.push_sheets` |
| 5 | Rotowire lineups (+ refreshes `Today_Matchups`) | `C:\Users\chase\crawl_env\Scripts\python.exe -m scrapers.scrape_lineups` |
| 6 | Today's matchups only (optional; lineups step already refreshes this) | `C:\Users\chase\crawl_env\Scripts\python.exe -m scrapers.scrape_matchups` |
| 7 | Game weather | `C:\Users\chase\crawl_env\Scripts\python.exe -m scrapers.scrape_weather` |
| 8a | MLB game results scrape | `C:\Users\chase\crawl_env\Scripts\python.exe -m scrapers.scrape_results` |
| 8b | Team Win%, F5, saves, etc. | `C:\Users\chase\crawl_env\Scripts\python.exe -m core.compute_results` |
| 8c | Push → `Team_Results` | `C:\Users\chase\crawl_env\Scripts\python.exe -m outputs.push_team_results` |
| 9 | PALS (pitcher difficulty faced) | `C:\Users\chase\crawl_env\Scripts\python.exe -m scrapers.scrape_pals` |
| 10 | Betting / model signals | `C:\Users\chase\crawl_env\Scripts\python.exe -m core.compute_signals` |
| 11a | SP game logs (MLB API) | `C:\Users\chase\crawl_env\Scripts\python.exe -m scrapers.scrape_sp_gamelog` |
| 11b | SP split profiles | `C:\Users\chase\crawl_env\Scripts\python.exe -m core.compute_sp_splits` |
| 11c | Push → `SP_Profiles`, `SP_Metric_Splits`, `SP_L14` | `C:\Users\chase\crawl_env\Scripts\python.exe -m outputs.push_sp_splits` |
| 12 | Reliever game logs | `C:\Users\chase\crawl_env\Scripts\python.exe -m scrapers.scrape_reliever_gamelog` |
| 13a | Bullpen unit metrics | `C:\Users\chase\crawl_env\Scripts\python.exe -m core.compute_bullpen_profile` |
| 13b | Push → `Bullpen_Unit`, `Bullpen_Individual` | `C:\Users\chase\crawl_env\Scripts\python.exe -m outputs.push_bullpen` |
| 14 | MLB player ID registry | `C:\Users\chase\crawl_env\Scripts\python.exe -m scrapers.scrape_player_registry` |
| 15 | FanGraphs batter splits (long; needs step 14) | `C:\Users\chase\crawl_env\Scripts\python.exe -m scrapers.scrape_batter_splits` |
| 16 | Batter profile metrics | `C:\Users\chase\crawl_env\Scripts\python.exe -m core.compute_batter_profile` |
| 17 | Push → `Batter_Profiles` + split rate tabs | `C:\Users\chase\crawl_env\Scripts\python.exe -m outputs.push_batter_profiles` |
| 18 | Team profiles (YTD + L30/L14/L7) | `C:\Users\chase\crawl_env\Scripts\python.exe -m core.compute_team_profile` |
| 19 | Push → `Team_Profiles` | `C:\Users\chase\crawl_env\Scripts\python.exe -m outputs.push_team_profiles` |

### What each push step writes (Google Sheets tabs)

| Push module | Primary tabs |
|-------------|--------------|
| `outputs.push_sheets` | `vs_RHP`, `vs_LHP`, `OOR`, `Pitching_Score`, `Last_Updated` |
| `outputs.push_team_results` | `Team_Results` |
| `outputs.push_sp_splits` | `SP_Profiles`, `SP_Metric_Splits`, `SP_L14`, … |
| `outputs.push_bullpen` | `Bullpen_Unit`, `Bullpen_Individual` |
| `outputs.push_batter_profiles` | `Batter_Profiles`, `Batter_Splits_*` |
| `outputs.push_team_profiles` | `Team_Profiles` |

PALS is pushed inside `scrapers.scrape_pals` → tab `PALS`.  
Signals are pushed inside `core.compute_signals` → `Signals_Today`, `Signals_Convergence`.  
Matchups/lineups are pushed from their scrapers → `Today_Matchups`, `Today_Lineups`.

---

## Typical daily workflow (copy-paste block)

```powershell
cd C:\Users\chase\mlbma_pipeline
C:\Users\chase\crawl_env\Scripts\python.exe -m pipeline.main
```

## Automation — run after last final

Use this command for a Codex local cron automation scheduled hourly from 6 PM
through 2 AM Eastern. It checks the MLB scoreboard first, uses the prior slate
date for after-midnight checks, and only runs the full pipeline once every game
on that slate is final.

```powershell
cd C:\Users\chase\mlbma_pipeline
C:\Users\chase\crawl_env\Scripts\python.exe -m scripts.run_after_last_final
```

Dry-run the watcher without launching the pipeline:

```powershell
C:\Users\chase\crawl_env\Scripts\python.exe -m scripts.run_after_last_final --dry-run
```

## Instagram auto-posting

Build a safe preview manifest from the latest pipeline artifacts:

```powershell
cd C:\Users\chase\mlbma_pipeline
C:\Users\chase\crawl_env\Scripts\python.exe -m outputs.push_instagram
```

Publish a post after setting Instagram credentials and a public image URL:

```powershell
C:\Users\chase\crawl_env\Scripts\python.exe -m outputs.push_instagram --publish --image-url "https://example.com/mlbma-card.png"
```

Required `.env` values for publishing:

```
INSTAGRAM_USER_ID=your-instagram-professional-account-id
INSTAGRAM_ACCESS_TOKEN=your-long-lived-access-token
INSTAGRAM_IMAGE_URL=https://public-url-to-image.png
```

Optional `.env` values:

```
INSTAGRAM_GRAPH_VERSION=v24.0
INSTAGRAM_AUTO_POST=1
INSTAGRAM_PUBLISH=0
```

`INSTAGRAM_AUTO_POST=1` adds the Instagram step to `pipeline.main`. Keep
`INSTAGRAM_PUBLISH=0` for dry-run manifests; switch it to `1` only when the
account, token, and public image URL are ready.

Instagram requirements: the account must be an Instagram Professional account
connected through Meta, the app/token must have content-publishing permission,
and the media must be reachable at a public HTTPS URL. The Graph API publish
flow creates a media container and then publishes it through `media_publish`.

---

## Batter window refresh (L30 / L14 / L7)

Use when `Team_Profiles` window columns are flat or empty (~15 min + recompute).

```powershell
cd C:\Users\chase\mlbma_pipeline
C:\Users\chase\crawl_env\Scripts\python.exe -m scrapers.scrape_batter_splits --windows-only
C:\Users\chase\crawl_env\Scripts\python.exe -m scripts.verify_window_data
C:\Users\chase\crawl_env\Scripts\python.exe -m core.compute_team_profile
C:\Users\chase\crawl_env\Scripts\python.exe -m outputs.push_team_profiles
```

**Full batter splits re-scrape:**

```powershell
C:\Users\chase\crawl_env\Scripts\python.exe -m scrapers.scrape_batter_splits
```

**Specific split keys only:**

```powershell
C:\Users\chase\crawl_env\Scripts\python.exe -m scrapers.scrape_batter_splits --splits recent,l14,l7
```

---

## Common partial reruns

### Core offense only

Requires `savant_team_leaderboard.csv` + FanGraphs `vs_*` CSVs in `data\`.

```powershell
cd C:\Users\chase\mlbma_pipeline
C:\Users\chase\crawl_env\Scripts\python.exe -m core.compute
C:\Users\chase\crawl_env\Scripts\python.exe -m outputs.push_sheets
```

### Slate / matchups only

```powershell
cd C:\Users\chase\mlbma_pipeline
C:\Users\chase\crawl_env\Scripts\python.exe -m scrapers.scrape_lineups
C:\Users\chase\crawl_env\Scripts\python.exe -m scrapers.scrape_weather
C:\Users\chase\crawl_env\Scripts\python.exe -m core.compute_signals
```

### Pitchers + bullpen only

```powershell
cd C:\Users\chase\mlbma_pipeline
C:\Users\chase\crawl_env\Scripts\python.exe -m scrapers.scrape_sp_gamelog
C:\Users\chase\crawl_env\Scripts\python.exe -m core.compute_sp_splits
C:\Users\chase\crawl_env\Scripts\python.exe -m outputs.push_sp_splits
C:\Users\chase\crawl_env\Scripts\python.exe -m scrapers.scrape_reliever_gamelog
C:\Users\chase\crawl_env\Scripts\python.exe -m core.compute_bullpen_profile
C:\Users\chase\crawl_env\Scripts\python.exe -m outputs.push_bullpen
```

### Team results only

```powershell
cd C:\Users\chase\mlbma_pipeline
C:\Users\chase\crawl_env\Scripts\python.exe -m scrapers.scrape_results
C:\Users\chase\crawl_env\Scripts\python.exe -m core.compute_results
C:\Users\chase\crawl_env\Scripts\python.exe -m outputs.push_team_results
```

---

## Smoke / diagnostic commands

**Fast smoke test** (Savant → compute → push; skips FanGraphs and PALS):

```powershell
cd C:\Users\chase\mlbma_pipeline
C:\Users\chase\crawl_env\Scripts\python.exe -m pipeline.smoke_pipeline
```

**Import check:**

```powershell
C:\Users\chase\crawl_env\Scripts\python.exe -m pipeline.smoke_imports
```

**Verify batter window CSVs:**

```powershell
C:\Users\chase\crawl_env\Scripts\python.exe -m scripts.verify_window_data
```

**Hub / sheet data diagnostic:**

```powershell
C:\Users\chase\crawl_env\Scripts\python.exe -m scripts.diagnose_hub_sheet_data
```

---

## Terminal research CLI (optional)

Not part of the scrape/push pipeline — local analysis only.

```powershell
cd C:\Users\chase\mlbma_pipeline
C:\Users\chase\crawl_env\Scripts\python.exe dashboard.py lineup NYY --hand RHP --window L14
C:\Users\chase\crawl_env\Scripts\python.exe dashboard.py pitcher "Gerrit Cole" --hand RHP --team NYY
C:\Users\chase\crawl_env\Scripts\python.exe dashboard.py matchup NYY BOS --window L14
```

---

## Dashboard / config (not data pipeline)

**Regenerate sheet tab names in JS** (after editing `core/config.py`):

```powershell
cd C:\Users\chase\mlbma_pipeline
C:\Users\chase\crawl_env\Scripts\python.exe dashboard\generate_mlbma_config_js.py
```

**Sync nav into HTML pages** (after editing `dashboard/chase_nav.html`):

```powershell
C:\Users\chase\crawl_env\Scripts\python.exe scripts\integrate_chase_nav.py
```

---

## Pipeline order reference (orchestrator)

`pipeline/main.py` runs steps in this order:

1. `scrapers.scrape_savant` — **required** (pipeline exits on failure)
2. `scrapers.scrape_fangraphs`
3. `core.compute`
4. `outputs.push_sheets`
5. `scrapers.scrape_lineups` (also refreshes `Today_Matchups` via `scrape_matchups`)
6. `scrapers.scrape_weather`
7. `scrapers.scrape_results` → `core.compute_results` → `outputs.push_team_results`
8. `scrapers.scrape_pals`
9. `core.compute_signals`
10. `scrapers.scrape_sp_gamelog` → `core.compute_sp_splits` → `outputs.push_sp_splits`
11. `scrapers.scrape_reliever_gamelog`
12. `core.compute_bullpen_profile` → `outputs.push_bullpen`
13. `scrapers.scrape_player_registry`
14. `scrapers.scrape_batter_splits`
15. `core.compute_batter_profile` → `outputs.push_batter_profiles`
16. `core.compute_team_profile` → `outputs.push_team_profiles`

---

## Notes

- **Savant (step 1)** is the only hard failure in the full orchestrator.
- **FanGraphs** steps need Chrome, Selenium, and `.env` credentials; they are slow.
- **Batter splits (step 15)** requires player registry (step 14) first.
- **SP splits** require `sp_gamelog.csv` (step 11a) and `sp_standard.csv` (FanGraphs step 2).
- Window splits (L7/L14/L30) use `startDate` / `endDate` on FanGraphs; see `docs/ECOSYSTEM.md` for metric details.

---

*Last updated: 2026-07-01. Source of truth for step order: `pipeline/main.py`; smart skips: `scripts/finish_pipeline_smart.py`, `scripts/sync_from_cache.py`.*
