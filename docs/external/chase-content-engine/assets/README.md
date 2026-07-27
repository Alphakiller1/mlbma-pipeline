# Renderer assets

Required by `chase_content/render.py` (fail-closed if missing):

| Path | Purpose |
|------|---------|
| `brand/chase-logo-horizontal-light.png` | Approved horizontal Chase mark (dark-ink wordmark + purple curve, transparent) |
| `fonts/RobotoCondensed-*.ttf` | Display + numerics |
| `fonts/DMSans-*.ttf` | Labels / metadata |
| `team_logos/<espn-slug>.png` | Cached ESPN team marks (`mlbma_assets.js` map) |

Team logos are fetched from the ESPN CDN on first use and cached here. Do not invent or redraw marks.

The Chase mark is the approved dark-ink horizontal artwork; on the near-black report canvas the
renderer places it inside the sanctioned soft-grey brand plate (`.ca-brand-badge-light`, see
`.cursor/rules/chase-brand-and-avatars.mdc`) rather than recoloring/tracing it (§2.13). When a true
transparent light/metallic-wordmark variant is supplied, drop it in under the same filename and the
header can render it bare per contract §3.4.
