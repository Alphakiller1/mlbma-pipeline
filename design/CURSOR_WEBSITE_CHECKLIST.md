# Cursor website execution checklist

Use this file as the gate. Re-run the commands after every edit. Walk the list top to bottom, then walk it again after generators run.

## 0. Ownership and honesty
- [ ] Public Research work lives in `mlbma-pipeline`. Model desks may vendor `chase-tokens-v1.css` without changing formulas.
- [ ] Default branch is `master`. Feature branch matches `cursor/<slug>-1d6d`.
- [ ] Product language: Opening, Matchups, Matchup Analysis, MLB, NFL, Model Center, Glossary.
- [ ] Compare is not a first-class public nav item. Team Rankings is not a first-class public section. “Research Desk” is not public copy.
- [ ] Honest leftovers stay listed at the bottom. Do not mark DS-03 / DS-11 done.

## 1. Public / Model boundary (P0)
- [ ] Public Research pages do not fetch `board.json` / `build.json` / `record.json` from model GitHub Pages
- [ ] `dashboard/sports/mlb.js` and `nfl.js` expose `SLATE_URL` only (no `BOARD_URL`, no `github.io`)
- [ ] `chase_board.js` is not on `/mlb/` or `/nfl/` generated pages
- [ ] `dashboard/matchup_compare.html` does not load `chase_board.js` or `board.json`
- [ ] Public mapper is allowlist-only (`chase_public_slate.js` `pickAllowed`, `project_public_slate.py` `ALLOWED`)
- [ ] Negative fixture `tests/fixtures/restricted_board_leak.json` fails `assert_clean` and succeeds after `project_slate`
- [ ] Committed `data/public/{mlb,nfl}/slate.json` contain no forbidden keys
- [ ] `.gitignore` un-ignores `data/public/` so fixtures deploy with Cloudflare `_site` rsync
- [ ] Public cards have no props/slots for projections, gaps, WP, EV, picks, MAE/ATS
- [ ] Book numbers render only with book + market + side + quote time (`attributedBook` / `bookHtml`)
- [ ] Opening hero has no “OSI edges” / “daily model signals”
- [ ] Model Center deep link carries `sport` + `game` and shows no teaser values
- [ ] `/models` and `/models/` 301 to `/model-center`
- [ ] Nav SoT `dashboard/chase_nav.html` Model Center href is `/model-center/`
- [ ] `chase_nav.js` `sportNavKey` treats `/model-center` as `models`
- [ ] `chase_nav.js` maps `matchup_compare.html` to `matchups`, never `compare`
- [ ] NFL freshness reads public slate timestamps (`source: 'public-slate'`), not `unknownFields` / `'board'` stub
- [ ] `research_lab.js` model-link cards include Matchup Analysis (`matchup_compare.html`) and do not include `team_rankings.html`

## 2. Sport registry
- [ ] Enabled public sports: MLB, NFL only (`public_sport_registry.js` `enabled: true`)
- [ ] `chase_sport_select.js` lists only MLB and NFL
- [ ] WNBA/CFB parked `noindex`, copy “not on the public desk”, not in nav or sport select
- [ ] Preview tab ids live in `public_sport_registry.js`, not inside L2 tokens
- [ ] Parked adapters may still mention `BOARD_URL`; parked HTML must not load those adapters

## 3. Matchup cards
- [ ] Shared `ChaseMatchupCard` anatomy for MLB and NFL
- [ ] Compact card: status, teams, time/official score, participants, context, Expand + View full matchup
- [ ] Expand/Collapse, addressable `?game=&preview=`
- [ ] Preview tabs from registry; missing modules honest-empty
- [ ] Kickoff grouping uses `ChasePublicSlate.kickoffWindow` on `kickoff_utc`, not hardcoded Thursday/Sunday labels
- [ ] MLB View full matchup → `/dashboard/matchup_compare.html?away=&home=&game=`
- [ ] NFL View full matchup stays on `/nfl/matchups.html?game=`
- [ ] Model Center link is `/model-center/?sport=&game=`
- [ ] `.ca-matchup-card` chrome uses panel tokens (not overwritten by `[data-href]` cursor-only rules)
- [ ] Expand / primary actions `min-height: var(--touch-min)` (44px)

## 4. Shell
- [ ] `--shell-max: 1360px`
- [ ] `--shell-header-h: 64px` / `--shell-header-h-phone: 56px`
- [ ] `--shell-context-h: 36px` / `--shell-context-h-phone: 40px`
- [ ] Context bar `#caContextBar` is a sibling under the header (after `#mobileMenu`), not under the H1
- [ ] `ChaseShell.ensureContextBar` relocates a bar that landed inside `<main>`
- [ ] Sport pages `data-ca-product="research"`
- [ ] Stamp in `design/DESIGN_LAYER_VERSION` matches `?v=` on generated HTML

## 5. Generators (SoT)
- [ ] `scripts/build_sport_routes.py` writes `/mlb/` `/nfl/` parked WNBA/CFB, `models/`, `model-center/`
- [ ] Index and matchups both mount `ChaseMatchupCard` (home is the slate)
- [ ] HUB/MATCHUPS/RESULTS blobs never contain `BOARD_URL` or `chase_board.js`
- [ ] `scripts/integrate_chase_nav.py` uses `dashboard/chase_nav.html` and does not restore Compare / Team Rankings
- [ ] `scripts/_stamp_design_layer.py` after HTML/JS edits

## 6. Verification commands (run twice)
```bash
python3 scripts/build_sport_routes.py
python3 scripts/_stamp_design_layer.py
python3 scripts/integrate_chase_nav.py
python3 scripts/check_tokens.py
python3 scripts/validate_public_fields.py
python3 -m unittest discover -s tests -q
python3 -c "from pathlib import Path
for p in ['mlb/index.html','mlb/matchups.html','nfl/index.html','nfl/matchups.html','dashboard/matchup_compare.html']:
    t=Path(p).read_text(); assert 'chase_board.js' not in t, p
assert 'chase_public_slate.js' in Path('mlb/index.html').read_text()
assert Path('data/public/mlb/slate.json').is_file()
"
```

## 7. Pass/fail evidence
- [ ] `validate_public_fields.py` prints OK
- [ ] unittest discover is all green
- [ ] `git check-ignore -q data/public/mlb/slate.json` is non-zero (not ignored)
- [ ] Opening copy still says models stay in Model Center
- [ ] `_redirects` has `/models` → `/model-center`

## Remaining producer / ops work
- Cloudflare env must set `MLB_MODEL_BOARD_URL` / `NFL_MODEL_BOARD_URL` (never in client JS)
- Model repos should stop publishing unauthenticated `board.json` on GitHub Pages once those env URLs point at a private origin
- `scripts/deploy_cloudflare.py` must ship `data/public/{mlb,nfl}/slate.json` (private `data/` stays excluded)
