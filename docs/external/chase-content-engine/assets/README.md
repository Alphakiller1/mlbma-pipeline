# Renderer assets

Required by `chase_content/render.py` (fail-closed if missing):

| Path | Purpose |
|------|---------|
| `brand/chase-logo-horizontal-light.png` | Approved Chase mark for dark canvases |
| `fonts/RobotoCondensed-*.ttf` | Display + numerics |
| `fonts/DMSans-*.ttf` | Labels / metadata |
| `team_logos/<espn-slug>.png` | Cached ESPN team marks (`mlbma_assets.js` map) |

Team logos are fetched from the ESPN CDN on first use and cached here. Do not invent or redraw marks.
