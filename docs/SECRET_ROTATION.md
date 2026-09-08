# Secret Rotation Runbook

Some Discord secrets were pasted in chat during setup and should be treated as
**compromised** — rotate them. Code audit (2026-06-13): no secret *values* are
committed in any repo (`git grep` clean across mlbma_pipeline, chase-discord-bot,
bet-evaluator, sharp-money-tracker); everything reads from env, and `.env` is
gitignored. So rotation is purely a portal + env-var task — no code changes needed.

> **Not secret, no rotation needed:** Discord *client ID*, *guild/server ID*, and
> *role IDs* are public identifiers. Only **tokens, client secrets, webhook URLs,
> and API/service-role keys** are sensitive.

## What to rotate (and where each is consumed)

| Secret | Env var | Used by |
|---|---|---|
| Discord **bot token** | `DISCORD_BOT_TOKEN` / `DISCORD_TOKEN` | Cloudflare Pages Functions (role sync), `chase-discord-bot` |
| Discord **client secret** | `DISCORD_CLIENT_SECRET` | Cloudflare Pages Functions (OAuth callback) |
| Discord **webhook URL** | `DISCORD_WEBHOOK_URL` | `outputs/push_discord.py` (local `.env`) |
| Supabase **service-role key** (precaution) | `SUPABASE_SERVICE_ROLE_KEY` | Cloudflare Pages Functions |

## Steps

### 1. Bot token
1. Discord Developer Portal → your app → **Bot** → **Reset Token** → copy the new token.
2. Update everywhere it's stored:
   - Cloudflare Pages → project → Settings → Environment variables (Production) → `DISCORD_BOT_TOKEN` → Save.
   - `chase-discord-bot` host `.env` → `DISCORD_TOKEN=...`.
3. Cloudflare → Deployments → **Retry deployment** (env vars only apply on a new build).

### 2. Client secret
1. Developer Portal → **OAuth2** → **Reset Secret** → copy.
2. Cloudflare env → `DISCORD_CLIENT_SECRET` → Save → **Retry deployment**.
3. Test: open `/api/discord/connect` from the site → should redirect to Discord and back without `invalid_client`.

### 3. Webhook URL
1. Discord → **Server Settings → Integrations → Webhooks** → delete the old webhook → **New Webhook** → copy URL.
2. Update the local `.env` (gitignored): set `DISCORD_WEBHOOK_URL=<new url>` (do not commit; do not paste the URL into chat).
3. Test: `python -m outputs.push_discord --daily --send` → expect HTTP 204/200 and a post in the channel.

### 4. Supabase service-role key (only if you suspect exposure)
1. Supabase → Project Settings → API → roll the `service_role` key.
2. Cloudflare env → `SUPABASE_SERVICE_ROLE_KEY` → Save → **Retry deployment**.
3. The browser **publishable** key (`sb_publishable_…`) is public by design — no rotation needed.

## After rotating
- Verify the live probes: `/api/me` returns `401 missing_token` (not `500 config_error`); a daily Discord post lands; OAuth connect round-trips.
- Going forward: never paste a token/secret/webhook into chat or a commit. Share only the **env-var name** and set the value yourself in Cloudflare / `.env`.
