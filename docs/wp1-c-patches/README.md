# WP1.C vendor kits (not product UI)

`cursor[bot]` cannot push to the sport-model remotes (403). Apply these **after** the WP2 producer patches (or from `docs/model-leftovers-series/`).

```bash
# mlb-model (after wp2-patches/mlb)
git am docs/wp1-c-patches/mlb/*.patch
# then WP6
git am docs/wp6-patches/mlb/*.patch

# wnba-edge-model
git am docs/wp1-c-patches/wnba/*.patch

# cfb-model
git am docs/wp1-c-patches/cfb/*.patch

# nfl-model (no WP2 producer patch)
git am docs/wp1-c-patches/nfl/*.patch
```

What these do:

- CI `scripts/check_published_tokens.py` fetches `https://chase-analytics.com/design/chase-tokens-v1.css`, then the WP1-branch raw file, then a sibling `mlbma-pipeline` copy. Local `chase_tokens.css` must stay seed `13014f56…`. If neither URL is CSS yet, the job still passes on the seed pin and prints SKIP.
- `BOARD_CONTRACT.sha256` no longer claims board.css is byte-identical across sports. Tokens are shared; board.css is sport-specific.
- Deploy/CI smokes forbid `#B794FF`, `IBM Plex`, Barlow, and SCL `#BA008E` in rendered HTML.
