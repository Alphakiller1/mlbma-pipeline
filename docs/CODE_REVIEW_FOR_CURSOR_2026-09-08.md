# Code review for Cursor — 2026-09-08

Written after reviewing and merging Cursor's work across five repositories today. Everything here is evidence-backed with file:line. It is meant to be useful, not a scolding — several of the patterns below are the *good* ones, and the WP1.C design is better than what I would have specified.

---

## 1. What worked, and should be repeated

**`scripts/check_published_tokens.py` is the right shape.** Fetching the published release and comparing, instead of trusting a local manifest, fixes the defect by construction. `board.css` forked into four different files while every repo's `tests/test_board_contract.py` stayed green, because each manifest blessed its own drift. A self-comparison can never catch that. This pattern should be reused anywhere two repos must agree.

**Negative assertions in the deploy smokes.** Asserting `#B794FF` and `IBM Plex` are *absent* catches drift that positive assertions miss. The comment on it — that the graphite fork is what these products "silently drifted into once before" — is exactly the right instinct.

**Fail-closed guards.** `production build requires verified live DraftKings lines` and `bundled font missing` both did their job today. The NFL deploy failing for five days was the guard working; the fault was an exhausted API key, not the check. Keep writing these.

**mlb-model #32 was well-built.** Chunking at 40, retry on `{502,503,504,522,524}` with `(1.5, 3.0, 6.0)` backoff, 121 lines of tests, and — importantly — it raises `RuntimeError` when retries exhaust rather than swallowing. It also improved the error message to distinguish a transient origin timeout from a missing service key, which is a real diagnostic gain. Merged as-is.

**Honest PR descriptions.** mlb-model #29 documented its own negative finding: *"A Fanatics-only fetch with this key returned 15 games and zero prices. Fanatics on The Odds API is paid-plan only."* I re-verified — 26 MLB events, zero Fanatics books. Writing down the result that undermines your own PR is the behaviour that makes review cheap. More of this.

---

## 2. The pattern worth fixing: guards that cannot see what they guard against

This appeared **three times today, in two repos**, and it is the single highest-value habit to change.

**`scripts/_stamp_design_layer.py`, `data-mode`.** The guard read `if "data-mode" not in t[:4000]`. `dashboard/index.html`'s `<body>` is at line **2756**, far past that window. So the check never saw the attribute it had itself written, and appended another on every run. **Seven had accumulated** on a 403 KB file, growing with each regeneration.

**Same file, the token link.** The presence test compared against a `TOKEN_LINK` string carrying the *current* stamp. A page holding the *previous* stamp therefore failed the test and got a second link inserted. **Three `chase-tokens-v1.css` links per dashboard page.** The same omission left both design-layer assets out of `DS_FILES`, so `HREF_V` never rewrote their `?v=` at all — which is why stamps `b` through `g` were still scattered across the tree and `check_tokens` failed on any bump.

**The shared shape:** an idempotence guard whose predicate is narrower than the thing it is guarding. A window that does not reach the target; an equality test against a value that legitimately changes.

**What catches it:** run the generator twice and diff. That is the whole test, and it is now `tests/test_generation_idempotence.py`. Any script that rewrites files in place should have one.

---

## 3. Names that assert a fix the code does not implement

`chase-content-engine`, `chase_content/render.py`:

```python
def _model_separation_sort_key(game: dict) -> float:
    """Rank by observed favorite probability. Games with no probs sort last, not as 0.5."""
```

The function is named for run separation. It ranked by win probability. `render_morning_slate` calls `games.sort(key=_model_separation_sort_key, reverse=True)`, so anyone auditing contract §5.2 by searching for the sort key would conclude C6 was fixed. It was not — a coin-flip game with a lopsided probability outranked a four-run blowout.

The docstring was honest; the name was not. When a name and a docstring disagree, the name is what reviewers read.

This is worse than an ordinary bug because it **defeats the next review**. The fix is cheap: name functions after what they do, and when you fix half of a multi-part violation, say which half.

---

## 4. Partial fixes to multi-part contract violations

The WP6 renderer work (chase-content-engine #3) addressed the audit's font, `0.5`-fallback and `validate_bundle` findings — genuinely good. But four violations from the same contract survived, and they interlock:

| Contract | Rule | State after WP6 |
|---|---|---|
| §5.2 (C6) | rank by `abs(home_runs − away_runs)` | ranked by win probability |
| §5.5 (C7) | labels from run separation | labels from probability at 65/60/55% |
| line 29 (C12) | `#60A5FA` "must be removed" | live on LEAN label, WATCH chip, bar fill |
| §96-97, §5.5 | win probability MUST NOT appear at all | probability bar + both sides' percentages |

The result was internally inconsistent in a way that is hard to spot from a diff: a board whose ranking and whose labels disagreed about what they measured. Fixed in chase-content-engine #4.

**Suggestion:** when a contract lists numbered conflicts (this one has C1–C14 in §14), close them by number and state which remain. "Addressed C2, C6, C11; C7 and C12 outstanding" is a far better handoff than a PR title.

---

## 5. State set but never cleared

`dashboard/chase_asyncstate.js`: `render()` owns `innerHTML`. A route that writes its own markup into the same element therefore leaves `data-state` at whatever was set last.

Measured in the browser: `nfl/matchups.html` held **7,736 characters of real content** while still reporting `data-state="loading"` and `role="status"`.

Two costs. The container keeps `role="status" aria-live`, so assistive tech treats an entire rendered slate as a status announcement. And a genuine hang becomes indistinguishable from success for CSS, tests and monitoring — which is precisely how the `window.CHASE_SPORT_GEMS_LABEL = None` crash shipped with a green suite.

Fixed by adding `ChaseAsyncState.ready()`. The general rule: if a module owns a lifecycle, it needs an exit as well as an entry, and callers that bypass the module must be given one.

---

## 6. Draft PRs are invisible work

Four PRs — mlb-model #31, nfl-model #1, wnba-edge-model #12, cfb-model #1 — were **`MERGEABLE`, `CLEAN`, tests passing, and left as drafts.** They delivered WP1.C token CI in all four repos plus the `board.json` producers for WNBA and MLB.

Because they were drafts, they read as blocked. A handoff document recorded them as *"blocked `cursor[bot]` 403"*, which was never true: all four repos are public, the owner is admin, and `cursoragent` already had commits in two of them. That wrong conclusion then propagated into planning.

**WNBA and MLB published no machine-readable artifact at all this morning.** Both had been finished and sitting for hours.

If work is done, mark it ready. If it is deliberately parked, say why in the description.

---

## 7. Two verification habits worth adopting

Both cost me time today; neither is hypothetical.

**Prove a new test fails before trusting it to pass.** My first version of `scripts/sport_routes_smoke.py` reported **12/12 PASS** — on a broken predicate. Its text fallback overrode `data-state`, so a region explicitly marked `loading` still passed. It only surfaced when I deliberately reintroduced the `= None` bug and the smoke stayed green. Every check added today was subsequently verified to fail against its own bug: the idempotence test reports `churned: ['dashboard/index.html']`, the smoke reports `pageerror: None is not defined`, and the odds guard test fails when the guard is removed.

**`git fetch` before quoting any repo fact.** Local checkouts here have been 5, 11, 12, 25 and 31 commits behind. Two separate handoff documents contained wrong conclusions traceable to a stale read — including mine. The stale local `nfl-model/docs/board.json` is schema/2 and lacks `kickoff_utc`; the published one is schema/3 and has it. Same filename, different truth.

A related one, from today's own testing: an orphaned `python -m http.server` held port 8766 and served stale files while later launches silently failed to bind. Before trusting a local browser result, confirm what the port is actually serving.

---

## 8. Open items owned by others

- **mlb-model #30** — worth rebasing, not closing. `ledger.py` (380 lines) is genuinely absent from `main`; 31 commits behind but only 3 conflict hunks. Assessment posted on the PR, including what to decide about the Aug 22 data seed.
- **mlb-model #33** and **chase-content-engine #4** — open, green, awaiting review.
- **`wip/codex-renderer-2026-07`** (chase-content-engine) — snapshot only, deliberately not for merge. It holds `assets.py` and run-based separation labels that `main` lacks; `main` holds bundled fonts and `validate_bundle` that it lacks. Neither satisfies the contract alone.
- **Odds API keys** — four repos now share one 500/month quota, and NFL and CFB crons overlap on Sundays and Mondays. Most likely thing to break next.
