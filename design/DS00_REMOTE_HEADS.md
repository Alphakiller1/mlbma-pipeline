# DS-00 — remote heads (fetched 2026-09-09T03:02Z)

Evidence class: **current remote**. Not live HTML, not a scratch clone.

| Product | Ref | SHA |
|---|---|---|
| mlbma-pipeline `master` | `origin/master` | `2b14c1b55e2624fbf36e32199db0f23328dfee8e` |
| mlbma-pipeline PR #41 | `origin/cursor/wp2-design-foundations-1d6d` (pre-merge) | `ce07a543ebbfca2a61c1645003835aa5340bd605` |
| mlb-model | `origin/main` | `ff997aff2ac23d8a9824b59dd0f39bcbf50146b0` |
| nfl-model | `origin/main` | `883a040474d21b17d1b9b83650387928337e9904` |
| wnba-edge-model | `origin/main` | `80100f00d93aa17186938ce78aed7f72998c3e75` |
| cfb-model | `origin/main` | `2ca8a275d421366f9490605522c053ae7b0e7996` |
| chase-content-engine | `origin/main` | `e09d8ac4159270dfb72f93a0ff5c4010998c6d74` |

Plan-audit SHAs that are now stale: mlb-model `73ad485` (moved), content-engine `ba6883f` (moved). NFL/WNBA/CFB matched the 2026-09-08 audit.

Master was 3 commits ahead of PR #41 (`5c3e869`, `fb11874`, `2b14c1b`). Those were merged into this branch rather than a 13-commit rebase (stamp conflicts on generated HTML).

Cursor owns `mlbma-pipeline` only in this change. Model repos and Content Engine are **not** restyled here (Codex workstream).
