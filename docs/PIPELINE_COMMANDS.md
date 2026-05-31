# MLBMA Pipeline — Scrape & Run Commands

Single reference for daily scrapes, full pipeline, partial reruns, and diagnostics.

**Project root:** `C:\Users\chase\mlbma_pipeline`  
**Python (venv):** `C:\Users\chase\crawl_env\Scripts\python.exe`  
**Local CSV output:** `C:\Users\chase\mlbma_pipeline\data\`  
**Google Sheet ID:** `1D28pC1lqMbsCcTBP67WhJPzYHn2UdtveMEv6RsUSczk`  
**Live dashboard:** https://alphakiller1.github.io/mlbma-pipeline/

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
| `google_credentials.json` | Google Sheets API — push steps fail without it |
| `.env` | FanGraphs login for Selenium scrapers |

`.env` example:

```
FANGRAPHS_EMAIL=your@email
FANGRAPHS_PASSWORD=yourpassword
```

---

## One command — full daily pipeline (recommended)

Runs all 19 steps in order. Step 1 (Savant) is required; other steps log warnings and continue on failure.

```powershell
cd C:\Users\chase\mlbma_pipeline
C:\Users\chase\crawl_env\Scripts\python.exe -m pipeline.main
```

**Batch alternative** (logs to `pipeline_log.txt`; uses repo-local `crawl_env` if present):

```powershell
cd C:\Users\chase\mlbma_pipeline
.\run_pipeline.bat
```

**Log file:** `C:\Users\chase\mlbma_pipeline\pipeline_log.txt`

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

*Last updated: 2026-05-31. Source of truth for step order: `pipeline/main.py`.*
