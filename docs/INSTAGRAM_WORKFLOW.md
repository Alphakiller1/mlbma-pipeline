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

## One-command daily build (stages 4–5)

```
python -m outputs.social_queue --render
```

This now does the whole pre-scheduling pass:
1. **Captions** → `outputs/social_queue/queue_<date>.csv|.json` (5 post types).
2. **Cards** (`--render`) → `outputs/social_queue/cards/card_<date>_<type>.png` — branded
   1080×1350 PNGs drawn with Pillow from the same pipeline CSVs (no browser needed).
   Render alone: `python -m outputs.render_cards`.
3. **Scheduler import** → `outputs/social_queue/schedule_<date>.csv` — one row per
   (post × platform: instagram, twitter) with default ET time slots, platform-trimmed
   text (X kept < 280), the card path in `media_path`, and the link. Drop straight into
   **Publer / Metricool / SocialBee** bulk upload.

All three live under `outputs/social_queue/` (gitignored — regenerated daily). Review
captions, tweak times/media in the scheduler, schedule. ~10 minutes, one person.

## Tool options (pick one)
- **Publer / Metricool / SocialBee** — import `schedule_<date>.csv` directly (columns
  already match their bulk format). Recommended.
- **Buffer / Later** — import `queue_<date>.csv`, bulk-schedule. Free tiers exist.
- **Manual** — copy caption + card image into the IG app. Zero setup.
- **Zapier / Make** — watch the JSON/Sheet → push to a scheduler. More automation, optional.
- **Meta Graph API (`push_instagram.py`)** — full auto-publish; needs the Meta dev app +
  `INSTAGRAM_ACCESS_TOKEN`/`INSTAGRAM_USER_ID`. Deferred — not needed now.
