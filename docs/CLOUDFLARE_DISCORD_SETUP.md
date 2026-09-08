# Cloudflare Pages + Discord OAuth — Setup (Phase 3)

This is the server-side foundation for Discord account linking. It adds Cloudflare Pages
**Functions** (the `functions/` directory → `/api/*` routes) alongside the existing static
dashboard. **Nothing is gated and `hub_dataset` stays public** — this only links a Discord
identity onto each user's profile.

> The existing **GitHub Pages** deploy (`.github/workflows/pages.yml`) is untouched and keeps
> working. Cloudflare Pages is a **separate, additional** deploy target. Discord linking only
> works on the Cloudflare Pages deployment, because the `/api/*` routes (and the first-party
> state cookie) only exist there.

---

## What was added

```
wrangler.toml                          # Pages config: build output = dashboard/, functions at root
functions/
  _shared/
    http.js                            # JSON responses, errors, bearer, HMAC-signed state, cookies
    supabase.js                        # validate JWT (GoTrue), service-role profile read/update
    discord.js                         # authorize URL, code exchange, identity fetch
  api/
    me.js                              # GET  /api/me                — caller's profile (safe fields)
    discord/
      connect.js                       # GET  /api/discord/connect   — start OAuth (returns authorize URL)
      callback.js                      # GET  /api/discord/callback  — finish OAuth, write profile
      sync-role.js                     # GET/POST /api/discord/sync-role — Phase 4 placeholder (dry run)
```

Frontend: `dashboard/mlbma_auth_ui.js`'s "Connect Discord" button is now live — it calls
`/api/discord/connect` with the Supabase JWT and navigates to Discord; on return it reads
`?discord=connected|error` and refreshes the Discord status line.

---

## Routes

| Route | Auth | Does |
|-------|------|------|
| `GET /api/me` | `Authorization: Bearer <Supabase JWT>` | Returns the caller's profile — `id, email, full_name, avatar_url, role, subscription_status, discord_user_id, discord_username, discord_avatar`. No secrets, no provider tokens. |
| `GET /api/discord/connect` | Bearer JWT (sent via `fetch`) | Mints a random `nonce`, binds it to the user id in an **HMAC-signed, HttpOnly, 10-min cookie**, returns `{ url }` (Discord authorize URL). |
| `GET /api/discord/callback` | Signed state cookie | Verifies state, exchanges the code (server-side secret), fetches the Discord identity, writes `discord_*` to the profile with the **service role**, redirects to `…/index.html?discord=connected|error`. |
| `GET/POST /api/discord/sync-role` | Bearer JWT | **Placeholder.** Returns a dry-run `{ would_sync: … }`; performs no Discord writes. Phase 4. |

**Why `connect` returns a URL instead of a 302:** a top-level browser navigation can't carry
the `Authorization` header, so the frontend `fetch`es `connect` (JWT in the header), receives
the authorize URL + the state cookie, then navigates. The browser-driven `callback` is a
normal top-level GET, so the `SameSite=Lax` state cookie rides along and identifies the user.

---

## 1. Cloudflare Pages project

1. **Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git** → pick the
   `mlbma-pipeline` repo.
2. Build settings:
   - **Framework preset:** None
   - **Build command:** *(empty)*
   - **Build output directory:** `dashboard`
   - **Root directory:** *(repo root — leave default)*
3. Deploy. Static pages serve from `dashboard/`; `functions/` is detected automatically and
   serves `/api/*`. (`wrangler.toml` pins `pages_build_output_dir = "dashboard"`.)

Your app will be at `https://<project>.pages.dev` (and any custom domain you add).

## 2. Environment variables / secrets

Pages → your project → **Settings → Environment variables** (set for **Production** and
**Preview**). Mark the secret ones as **Encrypted**. **None of these go in the repo or the
frontend.**

| Name | Secret? | Value |
|------|---------|-------|
| `SUPABASE_URL` | no | `https://mvxjcfriirguhjujurhf.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Supabase → Project Settings → API → `service_role` key |
| `DISCORD_CLIENT_ID` | no | Discord app → OAuth2 → Client ID |
| `DISCORD_CLIENT_SECRET` | **yes** | Discord app → OAuth2 → Client Secret |
| `DISCORD_REDIRECT_URI` | no | `https://<project>.pages.dev/api/discord/callback` |
| `STATE_SECRET` | **yes** | a long random string (e.g. `openssl rand -hex 32`) — signs the OAuth state cookie. (`COOKIE_SECRET` is accepted as an alias.) |
| `DISCORD_BOT_TOKEN` | **yes** | *Phase 4 only* — bot token for role sync |
| `DISCORD_GUILD_ID` | no | *Phase 4 only* — your Discord server id |
| `APP_REDIRECT_PATH` | no | *(optional)* where callback returns to; defaults to `/index.html` |

CLI alternative for secrets: `wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY` (etc.).

## 3. Discord Developer Portal

1. <https://discord.com/developers/applications> → **New Application**.
2. **OAuth2 → Redirects → Add Redirect:** exactly your `DISCORD_REDIRECT_URI`
   (`https://<project>.pages.dev/api/discord/callback`). Must match byte-for-byte.
3. Copy **Client ID** and **Client Secret** into the Cloudflare env vars above.
4. Scope used: `identify` (id, username, avatar). No bot/guild scopes needed yet.

## 4. Supabase Auth

No new Supabase Auth change is required for Discord linking itself (the server uses the
service role to read the JWT and write the profile). Keep the redirect allow-list from Phase 1/2
current — add your Pages origin so Google/email sign-in works there too:
- **Authentication → URL Configuration → Redirect URLs:** add `https://<project>.pages.dev/**`.
- **Site URL:** set to the Pages URL (or custom domain) if that becomes the canonical app.

---

## Local testing notes

- `python -m http.server` does **not** run Functions, so `/api/*` returns 404 and the
  "Connect Discord" button shows a graceful "only on the deployed app" message. Everything
  else (sign-in, dashboard, data) works as before.
- To run Functions locally: `npx wrangler pages dev dashboard` (serves `dashboard/` + the
  `functions/` routes at `http://localhost:8788`). Provide env vars via a local
  `.dev.vars` file (key=value lines) — **do not commit it**. Add `http://localhost:8788/api/discord/callback`
  as a second Discord redirect URI for local OAuth.

## Production testing checklist

- [ ] `GET /api/me` with a valid Bearer token returns your profile; with no/invalid token → `401`.
- [ ] Signed in on the Pages site, **Connect Discord** → Discord consent → back to the app with
      `?discord=connected`, and the panel shows your `@username`.
- [ ] `profiles.discord_user_id` / `discord_username` / `discord_avatar` are populated (Table Editor).
- [ ] Tampering with the `state` query param (or a missing/expired cookie) → redirect with
      `?discord=error&reason=bad_state`, no profile write.
- [ ] `GET /api/discord/sync-role` returns `{ implemented: false, dry_run: true, … }`.
- [ ] No secret appears in any browser request/response or in the static bundle.
- [ ] The static dashboard still loads exactly as before (data, Sheets fallback, etc.).

---

## Still TODO (Phase 4)

- **Discord bot role sync** — implement `sync-role` with `DISCORD_BOT_TOKEN` + `DISCORD_GUILD_ID`
  to add/remove a guild role from `subscription_status`.
- **Stripe Checkout** + **webhook** to set `profiles.subscription_status` (service role).
- **Authenticated-only `hub_dataset` RLS** (the wiring already sends the JWT) and **premium
  row/content gating** by `subscription_status`.
- Migration to **revoke `discord_*`** from the authenticated UPDATE grant (server-only identity).
