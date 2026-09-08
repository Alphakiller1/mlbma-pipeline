# WP6 vendor kits

Apply after WP1.C on mlb-model. Content-engine is its own repo.

```bash
# mlb-model
git am docs/wp6-patches/mlb/*.patch

# chase-content-engine
git am docs/wp6-patches/chase-content-engine/*.patch
```

- **mlb-model:** `governance/DESIGN-CONTRACT-V2-DESK.md` is **Current** (Chase: Roboto Condensed / DM Sans / `#08090F` / `#9A6BFF`). The other two contracts are **Superseded**, not deleted. `docs/DESIGN_INDEX.md` lists them.
- **chase-content-engine:** bundled DM Sans + Roboto Condensed; no `or 0` for missing OSI/market probs; `render_reports` calls `validate_bundle`; metallic heading fill; featured-matchup dropped from `report_contracts.json`.
