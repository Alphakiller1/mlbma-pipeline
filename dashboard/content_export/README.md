# Chase Analytics — Social Export Frames

Locked **1080×1350** HTML frames that render daily social graphics **by reusing the live
product's CSS/components** — the same design tokens (`mlbma_design_system.css`),
chip/board styling (`theme.css`), and matchup-card chrome (`landing_dashboard.css`) that
ship on ChaseAnalytics.com. Instead of reinventing the Chase look in Pillow, we screenshot
these frames so finals inherit the exact website look.

This is the **visual source of truth** path described in
[`docs/CHASE_CONTENT_PLAN.md`](../../docs/CHASE_CONTENT_PLAN.md). The content-engine design
contract (`chase-content-engine/design/CONTENT_DESIGN_CONTRACT.md`) still governs the
*rules* (canvas size, compact header, **no win-prob on Morning Slate**, opinion tags,
fail-closed data) — these frames *fulfill* those rules with website chrome.

## Files

| File | Role |
|------|------|
| `matchup_analysis_frame.html` | **Primary deep graphic** — live Matchup Analysis chrome (`.mc-header`, `.mc-sp-card`, `.mc-edge-panel`, `.mc-lineup-bar-*`, `.mc-h2h`) |
| `morning_slate_frame.html` | Multi-game slate — Opening `.hero-matchup-card` + Analysis SP badges/tiers/hand pills (`matchup_compare.css`) |
| `offensive_report_frame.html` | 2×2 `.ca-board` panels with `valChipHtml` OSI chips |
| `content_export.css` | Export-frame chrome **only** (canvas lock, safe margins, analysis density tweaks). Consumes design tokens. |
| `content_export.js` | Bundle → render; prefers `MLBMASharedMatchup` + `MLBMAAssets` |

## Visual SSOT

| Report | Website surface reused |
|--------|------------------------|
| **Matchup Analysis** | `matchup_compare.css` / `matchup_compare.js` patterns — `.mc-header`, `.mc-sp-compare`, `.mc-edge-panel`, run bar via `.mc-lineup-bar-*` |
| Morning Slate | Opening `.hero-matchup-card` + Analysis `.hand-pill` / `.tier-badge` / Pitch Score badge |
| Offensive Report | `.ca-board` + graded chips |

Optional `?game=NYY@BOS` selects which slate game the Matchup Analysis frame features (default = largest run separation).

## Data (bundle)

Both frames read a **content bundle** whose shape matches
[`chase-content-engine/examples/sample_bundle.json`](https://github.com/Alphakiller1/chase-content-engine/blob/main/examples/sample_bundle.json)
(`meta`, `games[]`, `offense{}`). Two ways to feed it:

1. **Embedded fallback** — each HTML ships a `<script type="application/json"
   id="bundle-data">…</script>` sample so the frame renders when opened directly.
2. **Runtime override** — append `?bundle=<url-to-bundle.json>` to fetch a live bundle.
   Example: `morning_slate_frame.html?bundle=/dist/2026-07-03/bundle.json`.

Optional `?report=morning_slate|offensive_report` overrides the frame's default report.

Fail-closed: with no usable bundle the frame renders an explicit error, never fake stats.

## Open the frames

Serve the `dashboard/` directory over static HTTP (needed so `?bundle=` fetches and the
`<base>`-relative assets resolve; team logos come from the ESPN CDN):

```bash
cd dashboard
python3 -m http.server 8099
# then open:
#   http://localhost:8099/content_export/matchup_analysis_frame.html
#   http://localhost:8099/content_export/matchup_analysis_frame.html?game=NYY@BOS
#   http://localhost:8099/content_export/morning_slate_frame.html
#   http://localhost:8099/content_export/offensive_report_frame.html
```

## Screenshot at 1080×1350 (deviceScaleFactor 2)

### Playwright (matches the repo's runtime-smoke tooling)

```python
from playwright.sync_api import sync_playwright

FRAMES = {
    "matchup-analysis": "http://localhost:8099/content_export/matchup_analysis_frame.html",
    "morning-slate": "http://localhost:8099/content_export/morning_slate_frame.html",
    "offensive-report": "http://localhost:8099/content_export/offensive_report_frame.html",
}

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(
        viewport={"width": 1080, "height": 1350},
        device_scale_factor=2,          # 2160×2700 px output
    )
    for name, url in FRAMES.items():
        page.goto(url, wait_until="networkidle")
        page.wait_for_function("document.documentElement.dataset.ceReady === '1'")
        page.screenshot(path=f"{name}.png")   # full 1080×1350 frame, no scroll
    browser.close()
```

`data-ce-ready="1"` is set on `<html>` after render completes — wait on it before shooting.

### Headless Chrome (no Playwright browser download)

```bash
google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=1080,1350 \
  --virtual-time-budget=6000 \
  --screenshot=morning-slate.png \
  "http://localhost:8099/content_export/morning_slate_frame.html"
```

(Chrome may linger after writing the PNG; wrap in `timeout 45 …` in CI.)

## Preferred daily pipeline

```
migrate → validate → open export frame with ?bundle=<bundle.json> → Playwright screenshot → human approve → publish
```

The Pillow renderer in `chase-content-engine/chase_content/render.py` remains a
transitional / offline fallback. New polish work goes into these frames + the shared
website CSS, not into parallel PIL drawing code.
