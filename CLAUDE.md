@AGENTS.md

# Claude Code — repo notes

The shared agent guide above (`AGENTS.md`) is authoritative, along with
`design/MLBMA_CURSOR_DESIGN_CONTRACT.md` (the visual law) and the `docs/` suite. Read these
before building.

A few Claude-specific notes:

- **This is a mature product, not greenfield.** It already has a token system
  (`dashboard/mlbma_design_system.css`), mobile handling (`mobile_cardify.js`), perf
  optimizations (snapshot boot), and a CI runtime smoke. Make **surgical, tested** upgrades —
  never a rewrite or a parallel architecture.
- **Two halves:** vanilla JS/CSS dashboards in `dashboard/` (no framework, no bundler) and a
  Python pipeline (`pipeline/`, `scrapers/`, `core/`, `outputs/`). Know which half you're in.
- **Design tokens are the law** — consume `mlbma_design_system.css`, never hard-code colors or
  redefine tokens elsewhere. Treat **375px** as a first-class viewport.
- **Validate before you push.** When editing `outputs/push_*.py`, gate on row counts, required
  columns, value ranges, and freshness — a bad scrape must never overwrite a good table.
- **Keep the runtime smoke green** (`scripts/dashboard_runtime_diag.py`) and keep `?v=` cache
  versions in sync when you change a JS/CSS file.
- **Default branch is `master`**; deploys fire on push (Cloudflare Pages + GitHub Pages). Branch
  + PR for non-trivial work.
- **Don't guess** — read `mlbma_design_system.css`, `MLBMA_CURSOR_DESIGN_CONTRACT.md`,
  `docs/PIPELINE_COMMANDS.md`, and the existing `*_shared.js` helpers, and match what's there.
