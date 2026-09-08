# Unrecovered WIP (D-08)

**Date hunted:** 2026-09-08  
**Result:** the 62-file uncommitted set from the other `batter-profile-prop-rework` working tree was **not found** in this environment. No contents were invented or reconstructed.

## Hunt (what was searched)

| Location | Result |
|----------|--------|
| This worktree (`cursor/wp1-design-layer-4ee4`) | Clean; named files absent except `dashboard/card_compose.html` (already committed) |
| `origin/batter-profile-prop-rework` | `card_compose.html` only among the named set |
| All origin refs / `git log --all --full-history` for `card_matchup.html`, `card_market_map.html`, `outputs/render_social_cards.py` | Never added as blobs |
| `git stash list` | Empty |
| `git reflog --all` | Clone + this programme’s branches only |
| `git worktree list` | Single worktree `/workspace` |
| `/tmp`, `/home/ubuntu`, other paths named `card_matchup.html` / `card_market_map.html` / `render_social_cards.py` | No hits |
| GitHub code search (`filename:card_matchup.html`, `filename:render_social_cards.py`, owner Alphakiller1) | No extra copies |
| Other remotes | Only `origin` |

The 62-file **manifest itself was never written down** in this repo. WP0 and D-08 name a handful of paths plus an ellipsis. The list below is every **filename actually named** in `docs/RECONCILE_WP0.md` and checklist **D-08**. It is **not** a reconstruction of 62 paths.

## Named files (from WP0 + D-08)

| Path | What it was for (from those docs only) | Status here |
|------|----------------------------------------|-------------|
| `dashboard/card_matchup.html` | Social/matchup card capture route in the unrecovered WIP set (D-08) | **Missing** |
| `dashboard/card_market_map.html` | Market-map card capture route in the unrecovered WIP set (D-08) | **Missing** |
| `dashboard/card_compose.html` | Content-engine compose canvas (`outputs/content_engine.py`); D-08 marked `card_compose.html?` | **Present** (committed; not the lost WIP stamp) |
| `outputs/render_social_cards.py` | Alternate/older social-card renderer named in D-08 / WP4A-1 leftover | **Missing** (engine is `outputs/content_engine.py`) |
| `dashboard/index.html` (WIP) | Uncommitted home WIP on the other machine; not on origin | **Present on origin** as the reconciled 8770-line home — **WIP delta unknown** |
| `dashboard/team_rankings.html` (WIP) | Uncommitted rankings WIP on the other machine | **Present on origin**; **WIP delta unknown** |
| `dashboard/matchup_shared.js` (WIP) | Uncommitted shared-matchup WIP; WP0 kept **master** slate identity | **Present on origin** (master-line); **WIP delta unknown** |

## What this does **not** claim

- It does not list 62 filenames. Those names exist only on the other disk.
- It does not recreate `card_matchup.html`, `card_market_map.html`, or `render_social_cards.py`.
- Recovery still requires that other working tree (D-08 leftover risk: silent loss if that disk is wiped).
