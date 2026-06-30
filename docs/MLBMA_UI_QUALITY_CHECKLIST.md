# MLBMA UI Quality Checklist — the gate

Every UI change must pass this before it ships. It turns the
`design/MLBMA_CURSOR_DESIGN_CONTRACT.md` from *guidance* into an enforceable **gate**, and adds
the engineering checks this mature, no-bundler codebase needs. Cite the relevant items in your
PR. When in doubt, the design contract wins on visuals; this file wins on "did you actually
verify it."

> This is chase-specific on purpose. It enforces *our* contract (token families, component
> contract, website contract, copy tone) — not a generic checklist. Adjust it as the contract
> evolves; keep them in lockstep.

## 1. Tokens are the law (Contract §5)
- [ ] No hard-coded colors. Every color comes from a token in `dashboard/mlbma_design_system.css`.
- [ ] No new `:root` token defined outside `mlbma_design_system.css`. If you need a value, add it
      there once and consume it — never redefine `--bg`, `--text`, `--v-bg`, etc. in a second file.
      **Machine-enforced:** `scripts/check_tokens.py` runs in CI (`pages.yml` → `token-guard`) and
      fails the build if any other CSS file redefines a canonical token. Run it locally before you push.
- [ ] Used the correct **semantic family** (§5.2) — surface/border/text/brand — not a raw hex or a
      neighbor's per-page token.
- [ ] Violet accent (`--ca-brand` #9A6BFF) used per the §5.4 violet rule (accent, not flood).

## 2. Component contract honored (Contract §7)
- [ ] Section containers, **metric chips** (§7.3, the `c-elite…c-poor` grade scale), **metric
      rows** (§7.4), and **tabs** (§7.5) match the contract — no bespoke one-off variants.
- [ ] **Insight rail / Analyst take** (§7.6) styling and placement preserved.
- [ ] **Empty state** (§7.7) and **loading state** (§7.8) exist for every async surface you touched
      — no blank flashes, no raw spinners where a skeleton is specified.
- [ ] Reused the shared helpers (`*_shared.js`, metric-coloring/value-chip/format helpers) instead
      of forking logic.

## 3. Typography & copy (Contract §6)
- [ ] Display vs UI/number type used per §6.1–6.2; numbers are tabular where the contract requires.
- [ ] Copy follows the §6.3 tone — editorial/scouting-desk, not generic-SaaS marketing voice.

## 4. Structure preserved (Contract §3)
- [ ] No change to information architecture, routing, dashboard **section order**, or data
      contracts unless the task explicitly asks (§3.2 / §3.3 stop rule). State the edit plan first.
- [ ] Change is **scoped** — no parallel implementation of an existing view, no dead code.

## 5. Mobile is first-class (Contract §8.8)
- [ ] Verified at **375px**: no horizontal overflow, readable type, tap targets ≥ 44px.
      Run `scripts/mobile_overflow_audit.py` (the same audit `pages.yml` runs informationally)
      against the page you changed — overflow must not increase, ideally hit 0.
- [ ] Dense tables/grids degrade correctly (via `mobile_cardify.js`) — not just shrunk-to-unreadable.

## 6. Website surfaces (Contract §8, only if you touched the public site)
- [ ] First viewport (§8.2), section set (§8.4), cards/modules (§8.6), nav (§8.7) match the
      Website Contract; it reads as a serious analytics product, not a SaaS landing page (§8.1).
- [ ] The site's visual relationship to the dashboard (§8.3) is preserved.

## 7. Engineering gates (the SCL discipline this repo was missing)
- [ ] **Runtime smoke is green.** Run `scripts/dashboard_runtime_diag.py` against the page you
      changed (the same check `pages.yml` runs) — boots with no console/runtime errors.
- [ ] **`?v=` cache versions bumped** for every JS/CSS file you edited, so the no-bundler cache
      busts correctly on deploy.
- [ ] **Cold-boot path not regressed** — didn't add blocking network work before the snapshot/
      preconnect warm path; snapshot JSON still loads first.
- [ ] No secrets added to client code; dashboards read via the anon/public path only.

## 8. Data-driven views (when the change depends on pipeline data)
- [ ] The columns/shape you read still match what `outputs/push_*.py` writes (the table is a
      contract). If you needed a new field, the pipeline push was updated **and validated** first.
- [ ] Any destructive write (Sheets `clear()`+`update`, Supabase upsert) is gated by
      `outputs/validate.py` (`check_dataframe` / `check_rows`) so an empty or error-page scrape
      is **rejected**, never overwriting a healthy table.

---

### How to use this
1. State your edit plan (Contract §2.2).
2. Make scoped changes against the existing patterns/tokens/helpers.
3. Walk this checklist; run the runtime smoke; bump `?v=`.
4. Note which sections you verified in the PR. A change that can't cite §1, §2, §5, and §7 isn't done.
