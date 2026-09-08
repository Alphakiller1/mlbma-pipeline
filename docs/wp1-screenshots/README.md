# WP1 before/after-style captures (2026-09-08)

Playwright Chromium, `http://127.0.0.1:8766` (repo-root static server). **0 pageerrors** on all six loads.

| File | Viewport | Page |
|------|----------|------|
| `index-375.png` | 375×900 | `/dashboard/index.html` |
| `index-1440.png` | 1440×1100 | `/dashboard/index.html` |
| `team_rankings-375.png` | 375×900 | rankings hub deep-link |
| `team_rankings-1440.png` | 1440×1100 | rankings hub deep-link |
| `team_profile-375.png` | 375×900 | `team_profile.html?team=NYY` |
| `team_profile-1440.png` | 1440×1100 | `team_profile.html?team=NYY` |

These are post-token-spine captures, not a restyle pass. Runtime diag on **8765**: team_rankings 14/14 PASS.
