# MLBMA / Chase Analytics — Agent Guide

This file is the shared source of truth for **every** AI agent working in this repo
(Claude Code, Cursor, Codex, Copilot). Read it before writing code. `CLAUDE.md` and
`.cursor/rules/` both point back here.

> This repo is a **mature, sophisticated product**, not a greenfield. It already has a design
> system, a token layer, mobile handling, performance optimizations, and a CI runtime smoke
> test. Your job is **targeted, surgical upgrades** — never a rewrite, never a parallel
> architecture. Read the real files first and adapt to them.

## What we're building

**Chase Analytics (MLBMA)** — a premium MLB matchup-intelligence product: a fast, dense,
editorial "scouting desk" of dashboards (team rankings, matchup compare, batter/pitcher/bullpen
profiles, research lab) fed by a data pipeline, plus the betting model outputs. The bar: every
screen should feel like a **premium broadcast/scouting desk** — credible, data-rich, fast — and
the public site should read as a serious analytics product, not a generic SaaS landing page.

This is a money-making property: the polish, trust, and reliability of the data **are** the
product. A change that ships stale/garbage data or a broken layout is worse than no change.

## Two halves of this repo

1. **The website/dashboards** — `dashboard/` — **vanilla HTML + CSS + JS, no framework, no
   bundler.** ~50 JS modules + 17 CSS files, loaded via raw `<script src>` / `<link>` with
   `?v=` cache-busting. Data is fetched client-side from **Google Sheets + Supabase**
   (`mvxjcfriirguhjujurhf`), with a `*_snapshot.json` warm-boot path for fast cold loads.
2. **The pipeline** — `pipeline/`, `scrapers/`, `core/`, `outputs/` — **Python.** Scrapes
   (Savant, FanGraphs, pitch-mix, matchups, Rotowire lineups, weather), computes, and **pushes**
   to Google Sheets + Supabase via the `outputs/push_*.py` modules. Runs today via
   `run_pipeline.bat` → `python -m pipeline.main` (see `docs/PIPELINE_COMMANDS.md`).

## Design system (read before touching UI)

- **The token layer is the law.** `dashboard/mlbma_design_system.css` defines the canonical
  tokens: `--bg`/`--bg-2..4`, `--text`/`--text-2..4`, `--border`, `--card`, and the brand
  `--ca-brand: #9A6BFF` (deep purple) on a near-black (`#08090F`) dark theme. **Consume these
  tokens — never hard-code colors and never redefine a token in another file.** A few duplicate
  definitions exist (`--text`, `--bg`, `--v-bg`); the direction is to *consolidate toward the
  design system*, not add more.
- The visual + structural contract is `design/MLBMA_CURSOR_DESIGN_CONTRACT.md` — the working
  source of truth for layout, section order, metric coloring, value chips, empty/loading states.
- **Metric coloring / grading chips** (`c-elite … c-poor` percentile chips) are shared brand
  lineage with SCL — keep them consistent.
- **Mobile.** `mobile_cardify.js` + `platform_viewport.js` adapt dense desktop layouts to
  phones. Treat **375px as a first-class viewport**, not an afterthought: no horizontal overflow,
  readable type, tap targets ≥ 44px. (`docs/RESPONSIVE_MIGRATION_PLAN.md` tracks this.)

## Architecture & conventions

- **Preserve information architecture.** Routing, dashboard section order, data contracts, and
  functional components must not change unless a task explicitly asks for it. Design work goes
  *through* existing patterns, shared styles, and helpers.
- **Shared modules** end in `_shared.js` (`matchup_shared.js`, `pitch_mix_shared.js`,
  `mlbma_shared`) — reuse them; don't fork logic.
- **Data is read client-side** from Sheets/Supabase; the snapshot JSON is the warm path. Don't
  add blocking network work to the cold-boot path (see the perf notes in `team_rankings.html`).
- **The pipeline writes the data the site reads.** Treat the pushed tables as a contract: the
  dashboards depend on exact column names and shapes.

## Quality bar (must pass before a change ships)

- **Runtime smoke test** (`scripts/dashboard_runtime_diag.py`, run in `pages.yml`) must stay
  green — it deep-links a dashboard and checks it boots without console/runtime errors. If you
  touch dashboard JS, run it locally against the page you changed.
- **No silent data corruption.** When editing `outputs/push_*.py`, **validate before you push**:
  row counts, required columns, value ranges, freshness. Reject + log instead of overwriting a
  good table with a bad scrape. (This is the one discipline the pipeline most needs — the SCL
  "never trust input, validate before write" rule applied here.)
- **Keep the cold-boot fast.** Don't regress the snapshot/preconnect path; keep `?v=` versions in
  sync when you change a JS/CSS file so caches bust correctly.
- Prefer small, reviewable changes. No dead code, no parallel implementations of an existing view.

## Security & data

- **Never commit secrets.** All secrets live in `.env` / GitHub Actions secrets (gitignored).
  Pipeline uses Google service-account creds + Supabase keys.
- Supabase project is `mvxjcfriirguhjujurhf` (shared with the mlb-model / mlbma ecosystem).
  Don't expose service-role keys to the client; dashboards use the anon/public read path only.
- Validate and sanitize any scraped input before it reaches a published table.

## Workflow

- The default branch is **`master`**. Deploys fire on push to `master`:
  `cloudflare-deploy.yml` (→ Cloudflare Pages, the domain chase-analytics.com is on) and
  `pages.yml` (→ GitHub Pages, gated by the runtime smoke).
- Branch for non-trivial work, open a PR, keep the runtime smoke green. Reference the relevant
  doc/issue. Update `docs/` and the `?v=` versions in the same change as the code.

## When unsure

Read the actual files first — `dashboard/mlbma_design_system.css` (tokens),
`design/MLBMA_CURSOR_DESIGN_CONTRACT.md` (visual law), `docs/PIPELINE_COMMANDS.md` (how the
pipeline runs), `docs/ECOSYSTEM.md` (how this fits with the model + SCL), and the existing
`*_shared.js` helpers — and match the patterns already there.
