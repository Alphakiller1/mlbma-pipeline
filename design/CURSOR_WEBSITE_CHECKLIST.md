# Chase Analytics public website release contract

This is the implementation gate for `chase-analytics.com`. The canonical public
experience is the root homepage plus `/mlb/`, `/nfl/`, and each sport's
`matchup.html`. The old `/dashboard/` and `/dashboard/matchup_compare.html`
documents are compatibility redirects, not alternate products.

## 1. Product boundary

- [ ] Public navigation exposes Home, Matchups, MLB, NFL, Glossary, and one Model Center destination.
- [ ] WNBA and CFB remain registered for future work but are disabled, `noindex`, and absent from public navigation and homepage content.
- [ ] Public `<main>` content never shows predicted scores/runs/points, win probability, picks, recommendations, confidence, performance records, or model-versus-market comparisons.
- [ ] Public JSON is allowlist-only and contains no sportsbook, price, line, or private-analysis fields.
- [ ] Model Center remains a separate authenticated destination. Public cards never repeat a Model Center call to action.
- [ ] Missing or stale facts are labeled honestly; browser time never masquerades as publication freshness.

## 2. Matchup-first information architecture

- [ ] `/` opens with one H1 and immediately presents MLB and NFL matchup slates.
- [ ] The same `ChaseMatchupCard` anatomy renders both sports.
- [ ] Every collapsed card includes status/time, official team logos, full team names, records when available, sport-specific participants, availability, venue, and two actions.
- [ ] Visible team abbreviations are forbidden; abbreviations remain internal identity keys only.
- [ ] Primary disclosure label is exactly `Expand matchup`; destination label is exactly `Full matchup analysis`.
- [ ] Only one card per slate may be expanded. Disclosure state uses `aria-expanded`, `aria-controls`, and a real hidden panel.
- [ ] MLB expansion contains probable starters, lineup status, bullpen availability, venue, and conditions.
- [ ] NFL expansion contains quarterbacks, player availability, rest/travel, venue, weather, and surface. It never contains MLB labels.
- [ ] NFL groups are derived from `kickoff_utc`; weekday names are never hardcoded.
- [ ] Full details resolve by stable `game` / `gamePk`, with away/home fallback for legacy links.

## 3. Design-layer ownership

- [ ] `design/chase-tokens-v1.css` is the only raw-color source and matches the vendored package copy byte-for-byte.
- [ ] Semantic, primitive, component, pattern, shell, navigation, then `chase-public.css` load in that order.
- [ ] Public routes never load `mlbma_design_system.css`, `responsive.css`, `matchup_compare.css`, or the private comparison scripts.
- [ ] `chase-public.css` owns public route geometry and uses semantic variables only.
- [ ] Collapsed cards use 3 columns at 1440px, 2 at 1024px, and 1 at 680px and below.
- [ ] Desktop collapsed card height stays between 240px and 360px across real slates.
- [ ] 360px and 390px have no horizontal overflow and every visible control is at least 44×44px.
- [ ] The design version in `design/DESIGN_LAYER_VERSION` matches every stamped public dependency.

## 4. Data and generators

- [ ] `scripts/build_sport_routes.py` deterministically emits MLB/NFL index, matchups, results, and matchup-detail routes plus parked future routes.
- [ ] `dashboard/sports/chase_public_slate.js` and `scripts/project_public_slate.py` share the factual allowlist.
- [ ] MLB combines the official schedule with matching published context without overwriting a valid official `gamePk`.
- [ ] NFL uses its published public slate and never imports MLB labels.
- [ ] Generated output is a fixed point: a second generator/stamp pass changes zero bytes.
- [ ] The negative restricted-field fixture is rejected before projection and clean after projection.

## 5. Release gate

Run from the repository root:

```bash
python scripts/_stamp_design_layer.py
python scripts/build_sport_routes.py
python scripts/check_tokens.py
python scripts/validate_public_fields.py
python -m unittest discover -s tests -p "test_*.py"
node --check dashboard/matchup_card.js
node --check dashboard/public_game_detail.js
python -m http.server 8765
python scripts/public_site_runtime_diag.py --base-url http://127.0.0.1:8765
python scripts/mobile_overflow_audit.py --base-url http://127.0.0.1:8765 --width 360 --height 800 --strict
python scripts/mobile_overflow_audit.py --base-url http://127.0.0.1:8765 --width 390 --height 844 --strict
```

Cloudflare production deployment must depend on every check above. A failed
boundary, unit, browser, or responsive check blocks deployment.

## 6. Future-sport extension rule

WNBA or CFB activation requires its own factual card modules and detail sections,
fixture coverage, logo/name registry coverage, responsive browser checks, and a
deliberate registry `enabled` change. Never expose a future sport by merely adding
it to navigation or pointing its adapter at a private producer payload.
