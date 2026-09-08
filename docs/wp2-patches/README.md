# WP2 vendor application kits (not product code)

These git patches were produced locally against `/home/ubuntu/src/{mlb-model,wnba-edge-model,cfb-model}` on 2026-09-08. They are **vendor application kits**: apply them in those repositories. They are **not** Chase Analytics product UI and must not be imported as dashboard code.

Push to those repos is **BLOCKED** (`cursor[bot]` 403 on origin). Owner must apply:

```bash
# mlb-model
git am docs/wp2-patches/mlb/0001-Export-a-slate-JSON-bundle-beside-the-Pages-HTML.patch
# from this copy, or from /tmp/wp2-patches/mlb/ on the WP2 agent machine

# wnba-edge-model
git am .../wnba/0001-Publish-board.json-build.json-and-record.json-from-c.patch

# cfb-model
git am .../cfb/0001-Rebuild-the-board-Sunday-and-Monday-without-extra-Od.patch
```

Constraints preserved in the patches: no `--fetch-odds`; `authority` / `may_bet` / `unmet_gates` unchanged; Picks = `priced_markets`; Gems = `flagged_tiles`.

Sample URLs (after owner applies + deploys — not live from this PR):

| Sport | Local sample |
|-------|----------------|
| MLB | `/tmp` pytest `_site/board.json` after export tests; intended `https://<mlb-model-pages>/board.json` |
| WNBA | `/tmp/wnba-sample2/board.json` (this environment) |
| CFB | Sunday/Monday rebuild path in patch; `board.json` already existed |
| NFL | already publishes board; freshness is WP3 view-time, not this producer patch |

NFL was not patched in WP2 (board exists; 5-day stale is a consumer DataStatus issue).
