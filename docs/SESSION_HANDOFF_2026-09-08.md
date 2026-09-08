# Session handoff — 2026-09-08

Written for Cursor. Covers what changed today across five repositories, which facts in the circulating handoff documents are now wrong, and what is worth picking up next.

**Branch:** `cursor/wp1-design-layer-4ee4` @ `cc0b59c8` (pushed, in sync with origin).

---

## 1. Read this before the master handoff

The "Claude master handoff — Chase Analytics architecture v2" document is still the product and design authority. **Its blocker list is not.** It was written against `35182fd`; five merges have landed since, and I verified each blocker rather than fixing from the list.

| Blocker | Doc says | Actual at `cc0b59c8` |
|---|---|---|
| B1 `= None` in generated JS | fatal | **already fixed** — routes emit `null` |
| B2 NFL infinite loading | fatal | **already fixed** — loads and renders |
| B3 generator uses Python `!r` | present | **already fixed** |
| B4 `chase_asyncstate.js` loaded twice | present | **already fixed** |
| B5 stamps churn `d`→`b`, not idempotent | present | **fixed today** — different root cause than described |
| B6–B14 | present | **not addressed** — Phase 2+ |

Do not re-fix B1–B4. `tests/test_sport_routes.py::test_generated_pages_do_not_emit_python_none` already pins B1.

---

## 2. State of the world

All four producers publish the full contract. Two of them published **nothing** this morning.

| Repo | board.json | build.json | record.json | last deploy |
|---|---|---|---|---|
| mlb-model | 200 | 200 | 200 | success |
| nfl-model | 200 | 200 | 200 | success |
| wnba-edge-model | 200 | 200 | 200 | success |
| cfb-model | 200 | 200 | 200 | success |

- **Supabase is healthy** — `hub_dataset` returns 200 in ~0.85 s. It was wedged this morning: the control plane reported `ACTIVE_HEALTHY` while every query, including Supabase's own management API, timed out. The owner restarted it.
- **NFL board** regenerates on schedule again; it had been frozen 5.3 days.
- **CFB board** is on **week 2**, 49 games, kickoffs Sep 11–13. It had been serving a completed week 1.

### Merged today

| Repo | PR | What it delivers |
|---|---|---|
| mlb-model | #31 | slate JSON export + WP1.C token CI |
| wnba-edge-model | #12 | board/build/record export + WP1.C token CI |
| nfl-model | #1 | WP1.C token CI, board.css pin, brand smokes |
| cfb-model | #1 | Sunday/Monday cache-only rebuild + WP1.C token CI |
| nfl-model | #2 | `simulate()` honours `--simulations 0` |
| cfb-model | #2 | publish the first *unplayed* week |

All four of the first group were **draft** PRs, green and mergeable, sitting untouched. That is why they looked "blocked".

---

## 3. Corrections to circulating claims

These were asserted confidently and are false. Several were mine.

**"cursor[bot] is getting 403 on the model repos."** Never true. All four repos are public and the owner is admin; `cursoragent` has commits in mlb-model and wnba-edge-model, and `cursor/*` branches exist in all four. The 403 belonged to a Codex sandbox's own token, scoped to mlbma-pipeline. I repeated this without verifying — the owner caught it.

**"The 62-file WIP set is unrecovered."** It is on origin. Commit `82a5012a` ("checkpoint before checking out cursor/wp1-design-layer-4ee4") holds 170 files including `card_matchup.html`, `card_market_map.html`, `outputs/render_social_cards.py` and the entire `video/` Remotion project. The hunt failed because it ran inside a sandbox clone whose reflog held only that clone. **A reflog is per-clone; "not in this environment" is not "lost."** `docs/UNRECOVERED_WIP.md` has been retracted and rewritten with retrieval commands.

**"The NFL deploy schedule is Tuesday-only."** Mine, and wrong. `origin/main` runs Tue plus Sun/Mon/Thu during NFL months. I read a checkout five commits behind. GPT caught this.

**"Median |market_gap| is 3.00."** Mine, and wrong — it is 2.92. I used `sorted(g)[n//2]`, which is not a median for even n. GPT caught this.

**"NFL week 1 opens Thursday."** Wrong. Week 1 has a **Wednesday** opener. Kickoff grouping must cluster on `kickoff_utc`, never day names.

**"The NFL board was generated Sep 2 while build.json says Sep 3."** GPT's, and wrong. Both are Sep 3 UTC; the board is one minute *after* the build.

**`design/CONTENT_DESIGN_CONTRACT.md` does not exist in this repo.** It lives in `chase-content-engine`. The local contract is `design/MLBMA_CURSOR_DESIGN_CONTRACT.md`. GPT caught this.

---

## 4. Root causes found today

Each was diagnosed to a specific line, not guessed.

**NFL deploys failing 5 days.** `RuntimeError: production build requires verified live DraftKings lines`. Not a code fault — the repo's `ODDS_API_KEY` secret was exhausted while a local key had 441 credits. The build succeeded locally with a good key. Secret rotated; deploy green.

**CFB deploys failing.** Same symptom, two causes. The secret, *and* a real bug: CFBD's calendar keeps a week current for a grace day past its `endDate`. 2026 week 1 ran Aug 29 – Sep 7, so on Sep 8 `official_week` still answered week 1 — a week fully played, therefore with no live book lines, therefore failing the odds guard. Fixed in cfb-model #2: resolve from the schedule (lowest week with an unplayed game) ahead of the calendar, keying off `completed` rather than a missing score, because two week-1 games against non-D1 opposition are completed with no points recorded. Falls back to the calendar on a CFBD outage.

**Generation was not idempotent.** Two insert-if-absent bugs in `_stamp_design_layer.py`:

- `data-mode` — the guard read only `t[:4000]`, but `dashboard/index.html`'s `<body>` is at line **2756**. It never saw what it had written, so it appended another every run. **Seven** had accumulated.
- `chase-tokens-v1.css` — the presence test compared against a link carrying the *current* stamp, so a page on the previous stamp failed it and got another inserted. **Three token links per dashboard page.** The same omission left both design-layer assets out of `DS_FILES`, so their `?v=` was never rewritten — which is why stamps `b` through `g` were scattered and `check_tokens` failed on any bump.

**Async regions never left `loading`.** `ChaseAsyncState.render()` owns `innerHTML`, so a route writing its own markup left `data-state="loading"` over rendered content. Verified in-browser: `nfl/matchups.html` held **7,736 characters of real content** while still reporting `loading` and `role="status"`. Assistive tech treats an entire slate as a status announcement, and a genuine hang becomes indistinguishable from success — which is how the `= None` crash shipped green. Added `ChaseAsyncState.ready()`.

**`--simulations 0` crashed.** The CLI documents "0 skips them" and two of three call sites guarded it; `build-site` did not, so it reached `totals[team] / simulations`. Moved the contract into `simulate()`.

---

## 5. Working with GPT/Codex — what to carry forward

GPT did the substantive WP1–WP5 implementation. Two process notes that cost real time:

**It worked in a sandbox at `C:\Users\user\Documents\Codex\...`, not this machine.** Its report described completed work — six ink primitives, `blue400` removed, `RECORD_URL` gone — none of which existed in the owner's repo. I verified against the real checkout and found the tree untouched. The work was real; it was just somewhere else. It arrived later via the remote branch. **Always verify a completion claim against the repo that will ship it.**

**Its corrections to me were mostly right, and mine to it were mostly right.** The pattern in both directions was identical: reading a stale or isolated copy and reporting it as current. I read checkouts 5, 11, 12 and 25 commits behind. It read a sandbox with no history. Neither was carelessness; the environment lied in both cases.

**Practical rule:** `git fetch && git log -1 origin/<branch>` before quoting any fact about a repo, and fetch the *live* artifact before quoting its contents. The stale local `nfl-model/docs/board.json` is schema/2 and lacks `kickoff_utc`; the published one is schema/3 and has it. That single difference produced wrong conclusions in two different documents.

**One more, from today's own testing:** an orphaned `http.server` held port 8766 and served stale files for several browser checks; later launches silently failed to bind. Any verification on 8766 should confirm what the port is actually serving first. My first smoke run also reported 12/12 PASS because its predicate was wrong — it only failed after I deliberately reintroduced the bug. **Prove a new test fails before trusting it to pass.**

---

## 6. Phase 0/1 complete — what Cursor can pick up

Phase 0 and Phase 1 of the master handoff are done and pushed. The gate says stop before visual migration, so I did.

**Commits:** `fc1c381f` (stamping idempotence), `cc0b59c8` (terminal async states + smoke tests).

**New tooling to use:**

```bash
python scripts/sport_routes_smoke.py --base-url http://127.0.0.1:8766
python -m unittest tests.test_generation_idempotence
```

The smoke loads all twelve generated sport routes, fails on any uncaught page error or non-ignorable console error, and requires each async region to reach a terminal state. Both tests were verified to fail when their bug is reintroduced.

**Current gate status:**

```
12/12 routes terminal, no console errors  (mlb/nfl/cfb ready, wnba empty)
generator: 3 consecutive passes, identical diff
58 python tests OK · slate_resolution PASS · supabase_breaker PASS · check_tokens exit 0
```

**Open, in rough priority order:**

1. **Phase 2+ blockers B6–B14** — 1280 px status-capsule overflow, mobile freshness hidden until the footer, "15 games today" beside a 3-day-old slate, heading semantics (three H1s on Opening), sub-12 px text, Oswald in the shared shell, inline styles/scripts, `dashboard/index.html` at ~403 KB.
2. **Dedicated Odds API keys.** All four repos now share one 500/month quota, and NFL and CFB crons overlap on Sundays and Mondays. Whichever fires first can starve the others — plausibly how today's keys reached 61. **This is the most likely thing to break next.**
3. **`.gitignore`** for the 284 untracked artifacts (`outputs/social_cards/`, `video/out/`, `video/props/`, `video/public/`). Deliberately left to the owner; they are preserved untracked and must not be committed.
4. **cfb-model has 14 uncommitted local files**, including a `current_week` rewrite that overlaps cfb-model #2. Same `completed`-based approach, but on a 12-commit-old base predating `official_week` — applying it as-is would regress the fix. Reconcile before committing.
5. **Public/model boundary (Phase 4)** — note `constants.time_forward_performance` is embedded in NFL `board.json` and states the model's margin MAE is 10.2274 against the market's 9.7644. Any generic "render the constants block" leaks the performance comparison the owner asked to remove.
