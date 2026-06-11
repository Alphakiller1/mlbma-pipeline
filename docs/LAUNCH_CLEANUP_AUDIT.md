# Chase Analytics — Launch Cleanup Audit

_Status snapshot for the public launch of **chase-analytics.com**. Updated during the
launch-prep pass. Legend: ✅ ready · 🟡 needs attention · 🔴 blocker · 💤 deferred._

---

## 1. Live site / domain readiness — ✅
- **Domain:** `chase-analytics.com` live via Cloudflare Pages (project `mlbma-pipeline-b`),
  registered through Cloudflare (DNS auto-managed). HTTPS auto-provisioned.
- **Deploy branch:** `batter-profile-prop-rework` (Pages production branch). Auto-deploys on
  push. GitHub Pages workflow (`master`) left intact as a separate target.
- **Functions:** `/api/*` live and env-wired (`/api/me`, `/api/discord/*` → 401 without token,
  which is correct).
- **Load speed:** landing page ~570ms / ~300KB after image optimization (was 3.6s / 2.6MB).
- 🟡 **www redirect** not set up yet (apex works; `www.` does not). See LIVE_SITE_SETUP.md.

## 2. Landing page / signup readiness — ✅
- `index.html` is the landing page: header + account/signup panel + open dashboard links.
- **Signup:** Google + email (magic link, with 6-digit code fallback). Renders fast (~45ms).
- **CTAs:** "Join our Discord" (invite) + "Join Premium on Patreon" + (signed-in) "Connect
  Discord". All sourced from the central `chase_links.js`.
- 🟡 Could add a fuller hero/value-prop (optional — see MARKETING_COPY_GUIDE.md option B).

## 3. Dashboard product polish — ✅ (mature)
- Full product live: opening dashboard, matchups, team rankings, batter/pitcher/team/bullpen
  profiles, research lab/signals, glossary. Data refreshes daily (~9am ET pipeline).
- Prior audit (this repo) confirmed 0 JS exceptions and 0 NaN/undefined across 11 views.
- 🟡 Premium content is **not gated** — intentional for launch (open dashboard = the pitch).

## 4. Visual / aesthetic consistency — ✅ (with minor notes)
- Strong centralized design system: `theme.css` tokens (`--bg/--card/--border/--v/--text…`),
  unified semantic colors (`--green/--red/--gold…`), `.ca-card` (16px), `.ca-pill` (999px).
  A prior pass already unified divergent greens/reds onto one palette.
- 🟡 Minor radius drift: auth panel card uses 14px vs `.ca-card` 16px / `.ca-stat-card` 12px —
  cosmetic, low priority.
- 🟡 The main dashboard HTML carries ~23 ad-hoc inline `@media` queries that fight the shared
  `responsive.css` contract (documented; unify later, not pre-launch).

## 5. Marketing copy consistency — 🟡
- Headline/positioning live in a few places (index header, OG tags, auth panel). Now governed
  by **docs/MARKETING_COPY_GUIDE.md** (created this pass). Apply the canonical one-liner +
  CTA wording across surfaces over time.

## 6. Patreon / Discord integration — ✅
- **Patreon** created + connected to Discord; paid tier maps to a Discord role (auto-grant on
  pledge, auto-remove on cancel). Verify the role hierarchy (Patreon bot above the paid role).
- **Discord:** public invite (`discord.gg/Fb3fHrqK`) on the site; OAuth "Connect Discord" links
  a user's Discord to their Supabase profile (optional now that Patreon handles roles).
- 🟡 Two-account setup: server owned by **chase@battlebetz**, dev app under **chase4sichi** —
  fine, just remember which is which (see DISCORD_BOT_UPDATE_PLAN.md).

## 7. Bot / update automation — ✅ (just shipped)
- `outputs/push_discord.py`: posts the daily signals embed to Discord via webhook (or bot).
  Commandable from terminal/Claude; importable by the pipeline. Webhook in `.env`.
- `functions/api/discord/sync-role.js`: server role sync — **dormant** (Patreon does roles now).
- 🟡 Auto-post is manual until wired into `pipeline/main.py` (planned this pass).

## 8. Instagram / social workflow — 🟡
- `outputs/push_instagram.py` exists but needs a Meta Graph API token (not doing Meta dev work
  yet). New **no-API** workflow + local queue in **docs/INSTAGRAM_WORKFLOW.md**.

## 9. Blockers before public launch — 🔴 / 🟡
- 🔴 **Reset exposed secrets** — the Discord client secret, bot token, and the Discord webhook
  were pasted in chat. Regenerate them (low-risk for webhook/bot, but do it).
- 🟡 **Verify Patreon → role** end-to-end (test pledge grants the role).
- 🟡 Decide **www redirect** + whether to merge to `master`.

## 10. Quick wins
- Add `www → apex` redirect (Cloudflare rule).
- Enable **Cloudflare Web Analytics** (dashboard toggle) for launch traffic.
- Make a real **1200×630 OG share image** (currently the logo) for nicer link cards.
- Wire the Discord daily auto-post into the pipeline.

## 11. High-risk changes to AVOID before launch
- ❌ Don't gate `hub_dataset` / make the dashboard private (kills the free-showcase pitch).
- ❌ Don't redesign the dashboard or rip up the design system.
- ❌ Don't change the Supabase **Site URL** again (it's correctly on the apex; that caused the
  earlier localhost-bounce).
- ❌ Don't add Stripe/Meta API work right now — Patreon + the no-API IG workflow cover launch.
- ❌ Don't commit any secret to the repo (GitHub Pages serves the whole repo publicly).
