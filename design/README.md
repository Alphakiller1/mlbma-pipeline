# MLBMA Design

This folder holds the **Cursor design contract** for the dashboard and public website.

## Primary documents

| File | Purpose |
|------|---------|
| [INDEX.md](./INDEX.md) | Current / product-specific / medium-specific / superseded map |
| [MLBMA_CURSOR_DESIGN_CONTRACT.md](./MLBMA_CURSOR_DESIGN_CONTRACT.md) | Full design + implementation contract (incl. 2026-09-08 PART 2) |
| [CURSOR_WEBSITE_CHECKLIST.md](./CURSOR_WEBSITE_CHECKLIST.md) | Authoritative public-site architecture and release gate |
| [GPT_IMAGE_PROMPTS_CHASE_DESK.md](./GPT_IMAGE_PROMPTS_CHASE_DESK.md) | Visual prompts aligned with the implemented public routes |
| [tokens/chase-tokens.css](./tokens/chase-tokens.css) | TIER 1 primitives |
| [chase-tokens-v1.css](./chase-tokens-v1.css) | Published TIER 1 (`/design/chase-tokens-v1.css`) |

## Cursor integration

The contract is enforced via:

- **`.cursor/rules/mlbma-design-contract.mdc`** — always-on rule; points here and summarizes non-negotiables for agents editing `dashboard/` or `design/`.
- **`.cursor/rules/chase-brand-and-avatars.mdc`** — brand assets, nav sync, pitcher avatars (complementary; not replaced by this contract).

For public-route work, `CURSOR_WEBSITE_CHECKLIST.md` is authoritative. The older MLBMA contract still governs retained internal and capture surfaces; it must not override the public matchup architecture.

## Related specs

- `docs/TEAM_PROFILE_CONTENT_SPEC.md` — Team Profile content scope
- `docs/PIPELINE_COMMANDS.md` — data pipeline (separate from UI)
