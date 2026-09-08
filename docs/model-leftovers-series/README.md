# Complete leftover patch series (owner `git am` from main)

Each folder is ordered from that repo’s `main`. Push remains 403 for `cursor[bot]`.

```bash
cd /path/to/mlb-model && git am /path/to/mlbma-pipeline/docs/model-leftovers-series/mlb/*.patch
cd /path/to/wnba-edge-model && git am .../model-leftovers-series/wnba/*.patch
cd /path/to/cfb-model && git am .../model-leftovers-series/cfb/*.patch
cd /path/to/nfl-model && git am .../model-leftovers-series/nfl/*.patch
cd /path/to/chase-content-engine && git am .../model-leftovers-series/chase-content-engine/*.patch
```

Local commits already exist on:

| Repo | Branch |
|------|--------|
| mlb-model | `cursor/mlb-board-export-4ee4` |
| wnba-edge-model | `cursor/wnba-board-export-4ee4` |
| cfb-model | `cursor/cfb-sunday-cron-4ee4` |
| nfl-model | `cursor/wp1-c-tokens-4ee4` |
| chase-content-engine | `cursor/content-engine-renderer-4ee4` |
