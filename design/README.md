# MLBMA Design

This folder holds the **Cursor design contract** for the dashboard and public website.

## Primary document

| File | Purpose |
|------|---------|
| [MLBMA_CURSOR_DESIGN_CONTRACT.md](./MLBMA_CURSOR_DESIGN_CONTRACT.md) | Full design + implementation contract (tokens, typography, structure lock, acceptance criteria) |

## Cursor integration

The contract is enforced via:

- **`.cursor/rules/mlbma-design-contract.mdc`** — always-on rule; points here and summarizes non-negotiables for agents editing `dashboard/` or `design/`.
- **`.cursor/rules/chase-brand-and-avatars.mdc`** — brand assets, nav sync, pitcher avatars (complementary; not replaced by this contract).

When updating the contract, edit `MLBMA_CURSOR_DESIGN_CONTRACT.md` first, then adjust the `.mdc` rule if summary bullets or file anchors change.

## Related specs

- `docs/CHASE_CONTENT_PLAN.md` — content pillars + **locked graphic design process** (templates over freehand AI art)
- `docs/TEAM_PROFILE_CONTENT_SPEC.md` — Team Profile content scope
- `docs/PIPELINE_COMMANDS.md` — data pipeline (separate from UI)

## Content / social graphics

Product UI follows this folder’s design contract. **Published graphics** (Instagram, X, exports) follow `docs/CHASE_CONTENT_PLAN.md`: assemble on locked templates with real data and brand assets — do not ship freehand AI-generated posters. Agent rule: `.cursor/rules/chase-content-graphics.mdc`.
