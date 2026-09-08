# Unrecovered WIP (D-08) — **RESOLVED 2026-09-08**

**Status:** the WIP set is **recovered and on origin**. Nothing was lost.
**Where:** commit `82a5012a` — *"checkpoint before checking out cursor/wp1-design-layer-4ee4"*,
made 2026-09-08 05:31 -0400 on `batter-profile-prop-rework`, pushed to origin the same day.
**Size:** 170 files against its parent `c2afeb27`.

Retrieve any file with:

```bash
git show 82a5012a:<path>                     # read one file
git checkout 82a5012a -- <path>              # restore one file
git diff c2afeb27 82a5012a --stat            # the whole set
```

## Correction to the entries below

The three files this document called **Missing** are present in that commit:

| Path | Previously recorded | Actually |
|------|--------------------|----------|
| `dashboard/card_matchup.html` | **Missing** | present, 12,879 bytes |
| `dashboard/card_market_map.html` | **Missing** | present, 5,796 bytes |
| `outputs/render_social_cards.py` | **Missing** | present, 7,506 bytes |

The commit also carries the whole `video/` Remotion project (16 files under `video/src/`,
including `teams.ts` and the graphics components), `outputs/video_props.py`,
`outputs/content_engine.py`, the `scl/` mockups, and four `scrapers/` modules.

## Why the original hunt missed it

The hunt was run from a Codex sandbox clone at `/workspace`, whose `git reflog` contained
only that clone plus this programme's branches — the row *"`git reflog --all` | Clone + this
programme's branches only"* below is the tell. `82a5012a` was created on the **origin machine**
and existed only in that machine's reflog and on its local `batter-profile-prop-rework`, which
was 1 commit ahead of `origin/batter-profile-prop-rework` at the time. No amount of searching
inside the sandbox could have found it.

The lesson worth keeping: **a reflog is per-clone.** "Not in this environment" is not "lost",
and a checkpoint commit that has never been pushed is invisible to every other machine.

## Original record (2026-09-08, superseded — kept for history)

The searched-locations table and the named-files list from the original hunt are retained
below for provenance. Their **Status** column is superseded by the correction above.

**Result at the time:** the 62-file uncommitted set from the other `batter-profile-prop-rework`
working tree was not found *in that environment*. No contents were invented or reconstructed —
that discipline was correct and is why nothing had to be unwound.

| Location | Result |
|----------|--------|
| This worktree (`cursor/wp1-design-layer-4ee4`) | Clean; named files absent except `dashboard/card_compose.html` (already committed) |
| `origin/batter-profile-prop-rework` | `card_compose.html` only among the named set — **superseded: the branch has since advanced to `82a5012a`, which carries all of them** |
| All origin refs / `git log --all --full-history` | Never added as blobs — **superseded** |
| `git stash list` | Empty |
| `git reflog --all` | Clone + this programme's branches only — **this is why the hunt failed** |
| `git worktree list` | Single worktree `/workspace` |
| GitHub code search (owner Alphakiller1) | No extra copies |
| Other remotes | Only `origin` |

## What this no longer claims

The previous "does not claim" section said recovery still required the other working tree, and
flagged silent loss if that disk were wiped. Both are obsolete: the commit is on origin.
