# Chase Analytics — Instagram / Social Workflow (no Meta API)

A daily social workflow that needs **zero Meta developer / Graph API work**. It generates
captions + a posting **queue** from the pipeline data; you (or a scheduling tool) publish from
that queue. Upgrade to the API-based `push_instagram.py` later if/when you want full automation.

---

## The model
```
pipeline data (data/*.csv)
        │
        ▼
outputs/social_queue.py   ──►  outputs/social_queue/queue_YYYY-MM-DD.csv  (+ .json)
        │                        ├─ one row per recommended post (type, caption, hashtags, image)
        ▼
   you publish via:
     • manual upload to Instagram, OR
     • import the CSV into Buffer / Metricool / Later (bulk schedule), OR
     • a Zapier/Make zap watching the queue file / a Google Sheet
```
No tokens, no app review. The queue is just text + (optional) image paths.

## Recommended daily post types
| Type | Source | One-liner |
|---|---|---|
| `matchup_of_the_day` | today's largest lineup edge | "Today's biggest offensive mismatch." |
| `top_team_movement` | biggest L14-vs-YTD OSI swing | "Who's heating up / cooling off." |
| `pitcher_spotlight` | SP profile of note | "Arm to watch tonight." |
| `bullpen_warning` | exposed/overworked pen | "Pen on fumes — fade alert." |
| `trend_signal_snapshot` | top convergence play | "Where the model agrees." |

Post 1–2 per day; rotate types across the week.

## Generating the queue
```powershell
cd C:\Users\chase\mlbma_pipeline
& "C:\Users\chase\crawl_env\Scripts\python.exe" -m outputs.social_queue            # today
& "C:\Users\chase\crawl_env\Scripts\python.exe" -m outputs.social_queue --date 2026-06-12
```
Writes `outputs/social_queue/queue_<date>.csv` and `.json`. Non-destructive (only writes into
that folder). Re-run to regenerate after the morning pipeline.

## Queue file format (CSV columns / JSON keys)
```
date            2026-06-11
slot            1            # ordering within the day
type            matchup_of_the_day
status          draft        # draft | ready | scheduled | posted
caption         <ready-to-paste caption text>
hashtags        #MLB #MLBAnalytics ...
image_path      outputs/social_queue/cards/2026-06-11_matchup.png   # or "" / TODO
link            https://chase-analytics.com
notes           optional
```
- Import-friendly for **Buffer/Metricool/Later** (map `caption`→text, `image_path`→media,
  schedule by `date`/`slot`).
- The `image_path` column is where a card graphic goes — see below.

## Image / card exports
- For now `image_path` is left blank / `TODO` and you attach a graphic manually (a Canva
  template, a dashboard screenshot, or a branded card).
- **Recommended:** build one reusable 1080×1080 Canva/Figma template per post type; drop the
  caption's key numbers in. Save exports to `outputs/social_queue/cards/`.
- **Later (optional):** a local card renderer (PIL/Playwright screenshot of a styled HTML
  card) can auto-fill `image_path`. Not required to launch.

## File naming conventions
```
outputs/social_queue/queue_2026-06-11.csv
outputs/social_queue/queue_2026-06-11.json
outputs/social_queue/cards/2026-06-11_matchup.png
outputs/social_queue/cards/2026-06-11_team-movement.png
```
Format: `YYYY-MM-DD_<type-slug>.<ext>`. Lowercase, hyphenated slugs.

## Caption tone (from MARKETING_COPY_GUIDE.md)
Lead with the insight, 1–2 short lines, 3–6 hashtags, always close with:
`Model-generated research. Not betting advice. 21+. Bet responsibly.`

## Daily posting checklist
- [ ] Pipeline ran (data fresh).
- [ ] `python -m outputs.social_queue` generated today's queue.
- [ ] Reviewed captions for accuracy + tone (no "guaranteed/locks").
- [ ] Attached/created the card image(s).
- [ ] Set `status = ready`.
- [ ] Scheduled (Buffer/Metricool/Later) or posted manually.
- [ ] Marked `status = posted`.

## Tool options (pick one)
- **Buffer / Later / Metricool** — import the CSV, bulk-schedule. Easiest, free tiers exist.
- **Manual** — copy caption + image into the IG app. Zero setup.
- **Zapier / Make** — watch the JSON/Sheet → push to a scheduler. More automation, optional.
- **Meta Graph API (`push_instagram.py`)** — full auto-publish; needs the Meta dev app +
  `INSTAGRAM_ACCESS_TOKEN`/`INSTAGRAM_USER_ID`. Deferred — not needed now.
