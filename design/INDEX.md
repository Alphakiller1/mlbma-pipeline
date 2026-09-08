# Chase Analytics / MLBMA design-document index

Status vocabulary: **Current** · **Product-specific** · **Medium-specific** · **Superseded**.

Do **not** treat mlb-model’s three on-repo contracts as reconciled. That is WP6.

| Document | Status | Scope |
|----------|--------|--------|
| [MLBMA_CURSOR_DESIGN_CONTRACT.md](./MLBMA_CURSOR_DESIGN_CONTRACT.md) | **Current** | MLBMA dashboard + public site. Includes 2026-09-08 structure-lock carve-out and PART 2 (modes, colour roles, five concepts, honesty, density, enforcement). |
| [tokens/chase-tokens.css](./tokens/chase-tokens.css) | **Current** | TIER 1 primitives (only raw color literals). |
| [chase-tokens-v1.css](./chase-tokens-v1.css) | **Current** | Published copy of TIER 1 at `/design/chase-tokens-v1.css`. Must stay byte-identical to `tokens/chase-tokens.css`. |
| [tokens/chase_tokens.vendor.css](./tokens/chase_tokens.vendor.css) | **Product-specific** (vendor snapshot) | Four-model vendored file, sha256 `13014f566ee570d283b12859a6578d12d179a4cc39aecf8845518700fb85e911`. Seed for values, not the live TIER 1 filename set. |
| [DESIGN_LAYER_VERSION](./DESIGN_LAYER_VERSION) | **Current** | Cache stamp `20260908g`. |
| [README.md](./README.md) | **Current** | Folder orientation. |
| `.cursor/rules/mlbma-design-contract.mdc` | **Current** | Agent summary of the contract. |
| `.cursor/rules/chase-brand-and-avatars.mdc` | **Current** | Brand assets / avatars (not colour tokens). |
| `dashboard/mlbma_design_system.css` | **Current** | TIER 2 semantic roles + component CSS. |
| `dashboard/theme.css` | **Current** | TIER 2 alias layer + remaining component rules. |
| `docs/MLBMA_UI_QUALITY_CHECKLIST.md` | **Current** | Implementation QA gate. |
| `docs/CROSS_SPORT_PROGRAMME_CHECKLIST.md` | **Current** | Cross-sport programme living checklist (WP0–WP6). |
| `docs/TEAM_PROFILE_CONTENT_SPEC.md` | **Product-specific** | Team Profile content, not visual law. |
| `docs/MARKETING_COPY_GUIDE.md` | **Medium-specific** | Marketing copy. |
| `docs/CONTENT_ENGINE_SPEC.md` / `CONTENT_ENGINE_GUIDE.md` | **Medium-specific** | Social/export renderer. |
| mlb-model report/board contracts (three files, contradictory) | **Superseded as a set** until WP6 | Do not import; do not pick a winner here. |
| Model-repo `board.css` + `BOARD_CONTRACT.sha256` | **Product-specific** / false SoT | Four-way fork; WP1.C blocked. |
| SCL theme / tokens | **Superseded** for this product | Do not import. |
