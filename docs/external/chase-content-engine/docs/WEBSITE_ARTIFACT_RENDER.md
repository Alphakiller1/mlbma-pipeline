# Website-artifact rendering (visual source of truth)

**Polished finals are produced by screenshotting the live product, not by drawing in Pillow.**

The ChaseAnalytics.com dashboard is more refined than this engine's `render.py`, and it already
encodes the locked brand (design tokens, metallic headings, dimensional cards, league-anchored
metric colors, real logos). To stop reinventing that look in PIL, the **mlbma-pipeline** repo
ships *social export frames* that reuse the live CSS/components:

```
mlbma-pipeline/dashboard/content_export/
  morning_slate_frame.html      # 1080×1350 Morning Slate (real .hero-matchup-card chrome)
  offensive_report_frame.html   # 1080×1350 Offensive Report (real .ca-board + valChipHtml chips)
  content_export.css            # export-frame chrome only (canvas lock, safe margins)
  content_export.js             # bundle → cards via MLBMAAssets (metricColor / valChipHtml / logos)
  README.md                     # open + inject bundle + screenshot instructions
```

These frames read a **content bundle** whose shape matches this engine's
[`examples/sample_bundle.json`](../examples/sample_bundle.json) — i.e. the exact output of
`chase-content migrate`. So the two systems compose cleanly.

## Relationship to this engine

| Concern | Owner |
|---------|-------|
| Report **rules** (canvas 1080×1350, compact header, no win-prob on Morning Slate, opinion tags, fail-closed data) | `design/CONTENT_DESIGN_CONTRACT.md` (this repo) |
| Canonical bundle (`migrate` / `validate`) | this repo |
| **Visual chrome for finals** | mlbma-pipeline `dashboard/content_export/*_frame.html` (live website CSS) |
| **Transitional / offline fallback renderer** | `chase_content/render.py` (Pillow) |

`render.py` stays as a headless/offline fallback (no browser needed). New visual polish goes
into the website frames + shared CSS — never into a parallel PIL brand.

## Preferred daily flow

```bash
# 1) Build + validate the canonical bundle (this repo)
chase-content migrate --pipeline-data ../mlbma-pipeline/data \
  --model-repo ../mlb-model --sharp-json ../sharp-money-tracker/docs/data.json \
  --opinions opinions/YYYY-MM-DD.json --out dist/YYYY-MM-DD/bundle.json
chase-content validate --bundle dist/YYYY-MM-DD/bundle.json --require-today

# 2) Render finals by screenshotting the website frames (visual SSOT)
chase-content build --bundle dist/YYYY-MM-DD/bundle.json --report all \
  --backend html \
  --frames-dir ../mlbma-pipeline/dashboard \
  --out dist/YYYY-MM-DD

# (fallback, offline / no browser)
chase-content build --bundle dist/YYYY-MM-DD/bundle.json --report all --out dist/YYYY-MM-DD
```

`--backend html` is implemented in [`chase_content/html_render.py`](../chase_content/html_render.py).
It serves `--frames-dir` (the pipeline `dashboard/` directory) over a local static server, opens
each `content_export/*_frame.html?bundle=<bundle>` in Playwright Chromium at **1080×1350,
deviceScaleFactor 2**, waits for `document.documentElement.dataset.ceReady === '1'`, and writes
`morning-slate-01.png` / `offensive-report.png`.

## Requirements for the HTML backend

The HTML backend needs Playwright (an **optional** dependency — the default Pillow backend has
no browser requirement):

```bash
pip install -e ".[html]"      # installs playwright
python -m playwright install chromium
```

If Playwright (or the frames dir) is missing, `--backend html` fails closed with a clear
message and you can fall back to the Pillow backend.

See `mlbma-pipeline/dashboard/content_export/README.md` for the raw screenshot recipes
(Playwright and headless-Chrome).
