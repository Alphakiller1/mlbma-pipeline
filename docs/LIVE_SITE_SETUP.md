# Chase Analytics — Live Site Setup & Checklist

Everything needed to keep `chase-analytics.com` deployed, connected, and verifiable. Tick
through this before/after each significant change.

---

## Hosting — Cloudflare Pages
- **Project:** `mlbma-pipeline-b` (Workers & Pages).
- **Connected repo:** `Alphakiller1/mlbma-pipeline`.
- **Production branch:** `batter-profile-prop-rework` ⚠️ (NOT `master` — the code lives here).
- **Build command:** *(empty)* · **Build output dir:** `dashboard`.
- **Functions:** `functions/` → `/api/*` (deployed automatically).
- Auto-deploys on every push to the production branch.

## Domain — chase-analytics.com
- Registered + DNS via Cloudflare (auto-managed).
- Custom domain attached to the Pages project → apex `chase-analytics.com`.
- [ ] **www redirect:** add `www.chase-analytics.com` → apex. Cloudflare → the domain →
      **Rules → Redirect Rules**: if hostname = `www.chase-analytics.com`, 301 to
      `https://chase-analytics.com/$1`. (Or add `www` as a second custom domain + redirect.)
- **HTTPS:** auto (Cloudflare Universal SSL). Force HTTPS in SSL/TLS → Edge Certificates →
  "Always Use HTTPS" = On.

## Environment variables (Cloudflare Pages → Settings → Environment variables, Production)
Secrets = 🔒 (Encrypt). Never in the repo.
```
SUPABASE_URL                = https://mvxjcfriirguhjujurhf.supabase.co
SUPABASE_SERVICE_ROLE_KEY   🔒
STATE_SECRET                🔒
DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET       🔒
DISCORD_REDIRECT_URI        = https://chase-analytics.com/api/discord/callback
DISCORD_BOT_TOKEN           🔒   (only used by the dormant sync-role fn)
DISCORD_GUILD_ID            = 1438230062867550461
DISCORD_PAID_ROLE_ID        = 1514493940055802007
```
After ANY env change → **Retry deployment** (env only applies to a fresh build).

## Supabase (Authentication → URL Configuration)
- **Site URL:** `https://chase-analytics.com`  ⚠️ keep on the apex (do not revert to localhost).
- **Redirect URLs:** `https://chase-analytics.com/**`  (+ re-add `http://localhost:8766/**`
  only when doing local dev).
- Google provider enabled (callback `https://mvxjcfriirguhjujurhf.supabase.co/auth/v1/callback`
  — unchanged by the domain).

## Outbound links (single source of truth)
- Frontend: **`dashboard/chase_links.js`** (`window.CHASE_LINKS`).
- Python: **`core/config.py`** (`CHASE_ANALYTICS_DOMAIN`, `DISCORD_INVITE_URL`, `PATREON_URL`).
- Patreon: `https://www.patreon.com/ChaseAnalytics`
- Discord invite: `https://discord.gg/Fb3fHrqK`
- Discord OAuth redirect (must match env): `https://chase-analytics.com/api/discord/callback`

## Billing links — Stripe
- 💤 **Not configured.** Premium runs through **Patreon** for now. The `functions/api/billing/*`
  routes exist but are inert (no `STRIPE_*` env). The "Upgrade" CTA points to Patreon.
- If/when Stripe is added: see `docs/BILLING_DISCORD_ROLES.md`.

## Cache / versioning strategy
- JS/CSS referenced with `?v=YYYYMMDD<x>` query strings — **bump the suffix when you change a
  file** so returning visitors fetch fresh (e.g. `mlbma_auth_ui.js?v=20260611c`).
- Images referenced without `?v=` rely on Cloudflare etag revalidation; new visitors always
  get the latest. For a forced refresh, rename or add a `?v=`.
- After any content change, hard-refresh (Ctrl+Shift+R) to verify locally; new visitors are
  unaffected by your cache.

## Smoke test URLs (expect HTTP 200, page renders, no console errors)
- [ ] https://chase-analytics.com/
- [ ] https://chase-analytics.com/chase_analytics_mlb_oem_v7.html
- [ ] https://chase-analytics.com/team_rankings.html
- [ ] https://chase-analytics.com/batter_profile.html
- [ ] https://chase-analytics.com/pitcher_profile.html
- [ ] https://chase-analytics.com/api/me  → JSON `401 missing_token` (functions alive)
- [ ] Sign in (Google) on the live domain → panel shows your email, stays on apex.
- [ ] "Connect Discord" → Discord authorize (only if you keep that feature).

## Post-deploy verification (quick)
```
curl -s -o NUL -w "%{http_code}" https://chase-analytics.com/            # 200
curl -s https://chase-analytics.com/api/me                                # {"error":"missing_token"...}
```
