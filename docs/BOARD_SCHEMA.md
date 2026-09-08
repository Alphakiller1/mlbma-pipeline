# chase-board/1

Normalised adapter output used by `dashboard/sports/*.js`.

| Field | Meaning |
|-------|---------|
| `schema` | Always `chase-board/1` |
| `sport` | `mlb` \| `nfl` \| `wnba` \| `cfb` |
| `generated_at` | Producer timestamp (ISO if present) |
| `authority.level` | Opaque string or producer dict `level` |
| `authority.may_bet` | Boolean, never upgraded in the UI |
| `authority.unmet_gates` | String list, passed through |
| `games[].kickoff_utc` | Sort key when present |
| `games[].model_margin` / `market_margin` / `published_margin` | Separate channels |
| `games[].edge_points` | Often `null`; pair with `edge_withheld_reason` |
| `priced_markets` / `flagged_tiles` | MLB only (Picks / Gems semantics) |

Producers remain the source of truth. Adapters must not recompute edge.
