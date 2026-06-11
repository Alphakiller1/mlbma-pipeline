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

## Next steps

### A. Cloudflare Pages Functions (when migrating hosting)
Hosting is **not** being migrated yet (still GitHub Pages). When it moves to Cloudflare
Pages, add a `functions/` dir for server-side endpoints that need the service-role key:
- `functions/api/discord/callback.ts` — Discord OAuth code exchange.
- `functions/api/stripe/webhook.ts` — Stripe subscription events.
- `functions/api/me.ts` — return the caller's profile (verifies the Supabase JWT from the
  `Authorization` header).
Store secrets as Pages environment variables (Production + Preview). Keep the static
dashboard exactly as-is; Functions only add `/api/*` routes.

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
