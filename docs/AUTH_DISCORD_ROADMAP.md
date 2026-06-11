# Auth + Discord Roadmap

Turning the static MLBMA dashboard into an auth-gated product, in safe increments.
**Phase 1 (this change) is additive only** — the dashboard and its data loading are
untouched, and nothing is gated yet.

---

## Phase 1 — what was added

| File | What it does |
|------|--------------|
| `supabase/migrations/0002_profiles.sql` | `public.profiles` table (1:1 with `auth.users`), RLS, column-scoped update grants, an auto-create-profile trigger on signup, and an `updated_at` trigger. **Does not touch `hub_dataset`.** |
| `dashboard/mlbma_auth.js` | Browser auth shell. Loads supabase-js from CDN on demand, reads `window.MLBMA_CONFIG.SUPABASE` (publishable key only), exposes `window.MLBMA_AUTH` (`init`, `getSession`, `getUser`, `getAccessToken`, `signInWithGoogle`, `signInWithMagicLink`, `signOut`, `onAuthStateChange`, `isConfigured`). |
| `dashboard/mlbma_auth_ui.js` | Reusable, self-mounting auth panel. Renders into any `[data-mlbma-auth-panel]` element: signed-out → Google + email magic-link; signed-in → email + Sign out. Styled with existing design-system CSS vars. |
| `dashboard/index.html` | Adds one `[data-mlbma-auth-panel]` and the two scripts. **Non-blocking** — the dashboard remains fully accessible. |

### Design notes
- **No secrets in the frontend.** The browser only uses the `sb_publishable_…` key that
  was already in `dashboard/mlbma_config.js`. The service-role key never appears here.
- **`role` / `subscription_status` are server-controlled.** Authenticated users have no
  column-level `UPDATE` privilege on them, so a client cannot self-upgrade. They are
  written only via the service-role key (Stripe / Discord webhooks, later phases).
- **`hub_dataset` is still public-read** so anonymous visitors keep seeing data. The
  migration documents exactly how to lock it down later (do not do it until pages
  require a session).
- The auth client uses an isolated `storageKey` (`mlbma-auth`) and does not interfere
  with the dashboard's existing raw `hub_dataset` REST fetches.

---

## Phase 2 — what was added

Still additive; `hub_dataset` is still public and nothing is gated.

| File | What it does |
|------|--------------|
| `dashboard/mlbma_supabase_headers.js` | **Single source of truth for hub_dataset request headers.** `window.MLBMA_supabaseHeaders(publishableKey)` returns `{ apikey, Authorization }`, where `Authorization` is the signed-in user's JWT when a Supabase session is persisted (storageKey `mlbma-auth`), else the publishable key (anon). Pure synchronous localStorage read — never loads the SDK, so anonymous pages pay nothing. |
| `dashboard/matchup_shared.js` | The shared `doSupabaseFetch` builds headers via `MLBMA_supabaseHeaders` (with a guarded fallback copy for pages that don't load the helper). Google Sheets fallback unchanged. |
| `dashboard/chase_analytics_mlb_oem_v7.html`, `team_rankings.html` | The inline `<head>` hub_dataset prefetches now route through `MLBMA_supabaseHeaders` too (helper script loaded just before them). |
| `dashboard/mlbma_auth.js` | New `getProfile()` (reads the caller's own `profiles` row via RLS; never throws) and `verifyEmailOtp(email, code)` (6-digit code sign-in). |
| `dashboard/mlbma_auth_ui.js` | Signed-out panel adds a 6-digit-code fallback form (revealed after the email sends). Signed-in panel adds a **Discord status** line ("Not connected" / `@username`) + a disabled "Connect Discord (coming soon)" button (TODO → `/api/discord/connect`). |
| `dashboard/index.html` | `preconnect` + `dns-prefetch` to Supabase & jsDelivr and `preload` of the supabase-js bundle so the first sign-in click doesn't pay DNS/TLS + a cold CDN download. |

**Why authenticated reads now, but the table stays public:** sending the user's JWT is a
harmless no-op while `hub_dataset` is public-read, but it means locking the table down
later (Phase 3+) is a one-line RLS change — no fetch site has to be touched.

### Email sign-in without Google (6-digit code)
Magic-link emails can be pre-consumed by corporate/Gmail link-scanners (→ `otp_expired`).
To give every email user a reliable path, the UI also accepts the **6-digit code** from the
same email. For the code to be present, the email must include the token:
- Supabase → **Authentication → Email Templates → Magic Link** → ensure the body contains
  both the link and `{{ .Token }}`. Keeping both means a user can click *or* type the code.

---

## Configure Supabase Auth (one-time, in the Supabase dashboard)

1. **Apply the migration.** Either `supabase db push` (Supabase CLI) or paste
   `0002_profiles.sql` into the SQL editor and run it.
2. **Authentication → Providers → Google:** enable it; paste the Google OAuth client ID
   and secret from Google Cloud Console (OAuth consent screen + Web client). In Google
   Cloud, add the authorized redirect URI:
   `https://<PROJECT_REF>.supabase.co/auth/v1/callback`.
3. **Authentication → URL Configuration:**
   - **Site URL:** the canonical site, e.g. the GitHub Pages URL (currently deploys from
     `master` via `.github/workflows/pages.yml`) or the custom domain once set.
   - **Redirect URLs (allow-list):** add every origin the app runs from. The client sends
     `redirectTo = origin + pathname`, so allow-list patterns like:
     - `http://localhost:8765/**` and `http://127.0.0.1:8765/**` (local `python -m http.server`)
     - `https://<user>.github.io/**` (or `https://<your-domain>/**`)
   - Email provider is on by default, which is all the magic-link flow needs.

### Env vars / secrets
- **Frontend:** none beyond the publishable key already in `mlbma_config.js` (public).
- **Server side (future phases only), kept OUT of the repo / frontend:**
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (Stripe/Discord webhooks, profile writes — never shipped to the browser)
  - `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` (Discord OAuth)
  - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (subscriptions)

> Do not place any of the above in `dashboard/`, `mlbma_config.js`, `.env` committed to
> git, or `google_credentials.json`. Use the host's secret store.

---

## Migration order
Apply in numeric order (Supabase SQL editor, or `supabase db push`):
1. `0001_hub_dataset.sql` — `hub_dataset` table + public read policy (already live).
2. `0002_profiles.sql` — `profiles` table, RLS, column-scoped grants, signup + `updated_at`
   triggers.
3. `0003_hardening.sql` — pins `set_updated_at()`'s `search_path` (clears the Supabase
   "Function Search Path Mutable" linter warning). **Run this if 0002 is already applied.**

All are idempotent (`create ... if not exists` / `create or replace` / `drop ... if
exists`), so re-running is safe.

## Supabase redirect URL checklist
**Authentication → URL Configuration:**
- **Site URL:** the canonical production origin — GitHub Pages
  `https://alphakiller1.github.io/mlbma-pipeline/`, or the custom domain once set.
- **Redirect URLs (allow-list):** the client sends `redirectTo = origin + pathname`, so add
  a `/**` pattern per origin you run from:
  - `http://localhost:8766/**` (local `python -m http.server 8766 --directory dashboard`)
  - `http://127.0.0.1:8766/**`
  - `https://alphakiller1.github.io/**`
  - `https://<custom-domain>/**` (when added)

**Google Cloud → OAuth client → Authorized redirect URIs** (this is Supabase's callback,
NOT your site): `https://mvxjcfriirguhjujurhf.supabase.co/auth/v1/callback`

## Manual test checklist
- [ ] **Signed-out dashboard still loads** — open in a private window; data renders.
- [ ] **Google sign-in** completes; panel flips to your email.
- [ ] **Magic link** signs you in (click the link on the machine serving the page).
- [ ] **6-digit code** signs you in (after adding `{{ .Token }}` to the email template).
- [ ] **Profile auto-created** — Table Editor → `profiles` has your row after first sign-up.
- [ ] **Read/update allowed fields** — `MLBMA_AUTH.getProfile()` returns your row; updating
      e.g. `full_name` succeeds.
- [ ] **role / subscription_status locked** — a normal user UPDATE of those columns fails
      with a permission error (column-level grant). Quick check in the browser console:
      `await MLBMA_AUTH._rawClient().from('profiles').update({ role: 'admin' }).eq('id', (await MLBMA_AUTH.getUser()).id)`
      → returns an error / 0 rows changed, never success.
- [ ] **Authenticated hub_dataset fetch sends JWT** — DevTools → Network → a
      `/rest/v1/hub_dataset` request → Request Headers shows `Authorization: Bearer <JWT>`
      (a long token, not the `sb_publishable_…` key) while signed in.
- [ ] **Public fallback still works** — signed out, `hub_dataset` reads still return data.
- [ ] **Google Sheets fallback still works** — block `*.supabase.co` in DevTools; data still
      loads from Sheets.

---

## Next steps

### A. Cloudflare Pages — Phase 3 preparation (do NOT migrate hosting yet)

> ✅ **Phase 3 is now implemented** — the `functions/` routes (`/api/me`,
> `/api/discord/connect`, `/api/discord/callback`, `/api/discord/sync-role`), `wrangler.toml`,
> and the wired "Connect Discord" button all exist. See
> [CLOUDFLARE_DISCORD_SETUP.md](CLOUDFLARE_DISCORD_SETUP.md) for the as-built routes, env
> vars, and step-by-step setup. The outline below is the original plan.

Hosting stays on GitHub Pages for now. Move to Cloudflare Pages when you need server-side
endpoints (Discord OAuth + Stripe use secrets that can never ship to the browser).

**Project setup**
- Cloudflare Pages → Create project → connect the `mlbma-pipeline` GitHub repo.
- **Build command:** none (static site).
- **Build output directory:** `dashboard`.
- Keep the static dashboard exactly as-is; Functions only add `/api/*` routes.

**Functions routes** (add a `functions/` dir; Pages maps files → routes):
- `functions/api/me.ts` — verify the Supabase JWT (`Authorization` header) and return the
  caller's profile.
- `functions/api/discord/connect.ts` — start Discord OAuth (redirect to Discord authorize
  with `state` = a short-lived nonce / the Supabase access token).
- `functions/api/discord/callback.ts` — exchange the Discord code, fetch the Discord user,
  write `discord_user_id` / `discord_username` / `discord_avatar` to `profiles` with the
  **service-role key**.
- `functions/api/discord/sync-role.ts` — reconcile Discord guild roles against
  `profiles.subscription_status` (bot token).

**Environment variables / secrets** (Pages → Settings → Environment variables, Production +
Preview; never in the repo or frontend):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_BOT_TOKEN`
- `DISCORD_GUILD_ID`

**After Discord lands:** revoke the `discord_*` columns from the authenticated UPDATE grant
in a follow-up migration (TODO already noted in `0002_profiles.sql`) so only the server can
set Discord identity.

### B. Discord OAuth (account linking)
1. Create a Discord application; add redirect `https://<site>/api/discord/callback`.
2. Frontend: a "Link Discord" button (visible only when signed in) → Discord authorize URL
   with `state` = the Supabase access token (or a short-lived nonce).
3. Cloudflare Function exchanges the code, fetches the Discord user, and writes
   `discord_user_id` / `discord_username` / `discord_avatar` to `profiles` **with the
   service-role key**.
4. Then tighten the migration: revoke `discord_*` from the authenticated column grant so
   only the server can set identity (TODO already noted in `0002_profiles.sql`).
5. The Discord bot can later read `profiles.discord_user_id` ↔ subscription to gate
   commands/roles.

### C. Authenticated `hub_dataset` RLS (gating the data)
Only after the dashboard pages require a session (otherwise anon users see empty data):
1. `drop policy "hub_dataset_public_read" on public.hub_dataset;`
2. `create policy "hub_dataset_auth_read" on public.hub_dataset for select to authenticated using (true);`
   — or gate premium tabs on `subscription_status` via a join to `profiles`.
3. `revoke select on public.hub_dataset from anon;`
4. Update the dashboard fetches to send the user's access token (`MLBMA_AUTH.getAccessToken()`)
   as the `Authorization: Bearer` header instead of the bare publishable key.

### D. Stripe / subscription gating

> ✅ **Phase 4 is now implemented** — Stripe Checkout + Billing Portal + a signature-verified
> webhook update `profiles.subscription_status`, and Discord paid-role sync runs on billing
> changes. Migration `0004_billing.sql` adds the schema. See
> [BILLING_DISCORD_ROLES.md](BILLING_DISCORD_ROLES.md). Not yet done: enforcing gated
> `hub_dataset` RLS (Phase 5). The outline below is the original plan.
1. Stripe Checkout (Payment Link or session) keyed to the Supabase user id (in metadata).
2. `functions/api/stripe/webhook.ts` verifies the signature and, with the service-role
   key, sets `profiles.subscription_status` (`active` / `past_due` / `canceled`).
3. Frontend reads `subscription_status` (own profile via RLS) to show/hide premium UI;
   real enforcement stays server-side (RLS + Functions), never trust the client.
4. Combine with (C) so premium `hub_dataset` tabs require an active subscription.

---

## Phase 1 explicitly does NOT
- migrate hosting, add Stripe, implement Discord OAuth, or make `hub_dataset` private.
- block or change any existing dashboard behavior.
