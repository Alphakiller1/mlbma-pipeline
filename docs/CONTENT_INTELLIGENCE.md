# Content intelligence

What to film, for which app, and when, and how that plan learns from real results.

- **Playbook:** `outputs/content_playbook.json` (platforms, pillars, segments, sports calendar, compliance)
- **Planner and learning loop:** `outputs/content_intel.py` (`content intel ...`)
- **Where you use it:** the site booth's **Show plan** panel (`site-booth.bat`)
- **State:** `video/intel/` (gitignored). Holds `performance.csv` (your results; back it up), `roadmap.json` and `roadmap.md`.

## The weekly loop

1. **Plan.** `content intel roadmap` (or **Refresh** in the booth) plans the next 14 days. It uses the live site slates, the sports calendar and every result logged so far.
2. **Record.** In the booth, pick the episode under **Show plan**, then press **Set up stage**. That sets the format (9:16 or 16:9) and opens the episode's pages as tabs. Press R to record. Press **G** at each beat: the beat list tracks time per beat, and each G is also a chapter.
3. **Post.** Each take writes `NAME.post.md` next to the mp4. It has the title, caption, hashtags, post text and best time for each app, and says whether the take's length fits each app.
4. **Log results.** After a few days, click **Results** on the take in the booth, once per app. You can also run `content intel log ...` or `content intel import export.csv --platform tiktok`.
5. **Repeat.** The next roadmap moves toward what is working on each app. `content intel scores` shows what the numbers say.

One recording feeds several apps. A 9:16 take is cut for TikTok, Shorts and X. A 16:9 take is the YouTube video, and X gets a clip of it.

## Platforms

These are starting points. The details are in the playbook.

| App | Format | Best length | What drives reach |
|---|---|---|---|
| TikTok | 9:16 | 30-75 s | completion and rewatches, then shares and saves; the first 2 s decide it |
| YouTube Shorts | 9:16 | 20-58 s | viewed vs swiped away, average % viewed; loops count |
| X | 9:16 or a clip of 16:9 | 20-90 s | replies, reposts and quotes, bookmarks; plays muted, so captions carry it |
| YouTube | 16:9 | 8-25 min | thumbnail click-through, then average view duration; chapters |

Platform rules on gambling content:

- TikTok does not allow promoting gambling services: no sportsbook logos, promo codes or links to books.
- YouTube limits content that promises returns or points viewers to unapproved gambling sites.
- Analysis and education are fine on all of these apps.
- `content intel lint "text"` checks a caption against the playbook's `compliance` list.

## Segments

| Segment | Pillar | Format | When | Starting fit |
|---|---|---|---|---|
| Matchup Lab: one game, one or two deciding stats | Game breakdowns | 9:16 | game day | TikTok 4, Shorts 4, X 4 |
| One Stat: a 20 s loop | Game breakdowns | 9:16 | game day | Shorts 5, TikTok 4, X 4 |
| Why It Moved: a line move explained | Sports trading | 9:16 | game day | X 5 |
| Sharp School: betting math lessons | Betting education | both | any day | TikTok 5, YouTube 4 |
| Myth vs Math: a common belief tested | Betting education | 9:16 | any day | TikTok 5, X 5 |
| Trading Desk: bets as positions, hedging, timing | Sports trading | both | any day | X 4, YouTube 4 |
| Model Room: how the model is built, and where it fails | Matchup modeling | both | any day | YouTube 5 |
| The Rundown: the full slate on the site | Game breakdowns | 16:9 | eve of the slate | YouTube 5 |
| Report Card: hits and misses | Results & community | both | Sun/Mon/Tue | X 5 |
| Ask the Desk: answering a comment | Results & community | 9:16 | any day | TikTok 5 |

- **Pillar targets:** Game breakdowns 35%, Betting education 25%, Sports trading 15%, Matchup modeling 15%, Results & community 10%.
- **Topics rotate:** Sharp School, Myth vs Math, Trading Desk and Model Room carry topic lists. The planner picks the least-used topic next.

## How the scoring works (and what it does not know)

**Priors are hypotheses.** The 1-5 starting fits are judgements about how each app distributes video. Nothing here has measured them for this account. They count as `prior_strength` (4) posts, so a handful of your own results starts to outweigh them.

**A post's lift.** Each metric is compared with your median post *on the same app*:

- watch %, share, save, comment, like and follow rates
- CTR on YouTube

Each comparison is a log ratio. The ratios are weighted by that app's `metric_weights`.

- 0 means a typical post.
- +0.5 means about 1.6 times typical.

An X post is never judged against TikTok numbers.

**Planning.** Each slot (cadence per weekday and format) takes the best-scoring segment, after these adjustments:

- an exploration bonus for segments with few posts
- a pull toward the pillar targets
- the sport's weight, raised during tentpoles such as the MLB Postseason or March Madness
- a small bonus when a real game is on the slate
- `gap_days` between repeats of the same segment

**Dropping a segment.** A segment drops off an app only after `drop_after` (3) posts there that still score below `drop_below` (-0.25).

**Games.** Games come from the live site slates, with the most interesting first: national windows, primetime and records. Matchup links carry `away`/`home`, plus `date` for MLB. CFB pages list the model board's games, which are keyed by school name, and MLB pages otherwise open on the browser's date. Days past the published slate get the slot now and the game when the slate posts. Refresh then.

**Sports without a site desk yet.** College basketball, NBA and WNBA are in the calendar and get evergreen and education content. They get no matchup pages until the site covers them.

## Commands

```
content intel roadmap [--start YYYY-MM-DD] [--days 14] [--offline]
content intel today | brief EPISODE_ID | scores | segments
content intel log --platform tiktok --segment matchup_lab --views 5400 --watch-pct 41 --shares 45 --saves 60
content intel log --take site-20261009-191058 --platform x --impressions 9000 --shares 40 --comments 25
content intel import tiktok_export.csv --platform tiktok [--segment one_stat] [--dry-run]
content intel lint "caption text"
```

- **How `import` finds the segment:** from a `segment` column, or from the series hashtag (`#MatchupLab` etc.) in the title or caption. That is one reason every caption carries it.
- **Updated numbers:** logging the same post again (same URL or take) replaces its numbers.

## Booth additions

- **Show plan:** the episode picker, the hook (click it to cycle), and the beat list with live per-beat timing. A "fits" line shows which apps the take's length still suits. **Set up stage** and **Next beat (G)** are here too. A beat with its own page (each game in The Rundown) switches the stage to that page.
- **Guide:** shades where TikTok, Shorts or Reels paint their own UI on a 9:16 video. The numbers are read from `video/src/ds/safe.ts`, the one place they are defined. The guide hides the moment recording arms, so it is never in a take.
- **Takes:** each take shows its episode, and a **Results** form logs its numbers through `content_intel` (validated: likes can't exceed views, watch % is 0-100, and so on). `NAME.post.md` is the posting kit.
