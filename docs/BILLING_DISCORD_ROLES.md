# Billing (Stripe) + Discord role sync — Setup (Phase 4)

Adds subscription billing and ties a Discord "paid" role to subscription status. **Nothing is
gated yet** — `hub_dataset` stays public and the dashboard works signed-out. This phase only
adds the machinery: Checkout, Billing Portal, a signature-verified webhook that writes
subscription state, and automatic Discord role sync.

Builds on Phase 3 (see [CLOUDFLARE_DISCORD_SETUP.md](CLOUDFLARE_DISCORD_SETUP.md)).

---

## What was added

```
supabase/migrations/0004_billing.sql      # profile subscription/stripe columns + billing_events + RLS
functions/_shared/stripe.js               # Stripe REST helper, checkout/portal/customer, webhook verify, status map
functions/_shared/supabase.js  (extended) # billing reads/updates + idempotent insertBillingEvent
functions/_shared/discord.js   (extended) # syncPaidRole() bot role add/remove
functions/api/billing/
  create-checkout-session.js              # POST → Stripe Checkout URL (subscription mode)
  create-portal-session.js                # POST → Stripe Billing Portal URL
  webhook.js                              # POST ← Stripe events (signature-verified)
functions/api/discord/sync-role.js        # now performs real role add/remove
dashboard/mlbma_access.js                 # tiered-access scaffold (NOT enforced yet)
dashboard/mlbma_auth_ui.js     (extended) # Upgrade / Manage billing controls
```

## Data model (migration `0004`)

`public.profiles` gains: `stripe_customer_id` (unique), `stripe_subscription_id` (unique),
`subscription_current_period_end`, `subscription_cancel_at_period_end` (+ `subscription_status`
from 0002). All **server-controlled** — the authenticated column-grant from 0002 excludes
them, so clients still cannot change them.

`public.billing_events` — append-only audit log; `event_id` is unique (idempotency). RLS:
anon/authenticated get nothing; an optional admin-only read policy (`profiles.role = 'admin'`)
is included; the service role writes it.

> **Run order:** `0001` → `0002` → `0003` → `0004` (idempotent; safe to re-run).

## Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/billing/create-checkout-session` | POST | Supabase JWT | Ensure Stripe customer, return a subscription Checkout URL |
| `/api/billing/create-portal-session` | POST | Supabase JWT | Return a Stripe Billing Portal URL (requires existing customer) |
| `/api/billing/webhook` | POST | **Stripe signature** | Update subscription state + sync Discord role |
| `/api/discord/sync-role` | GET/POST | Supabase JWT | Manually reconcile the paid role with subscription status |

**Webhook endpoint path:** `https://<your-pages-domain>/api/billing/webhook`

## Status mapping (Stripe → local `subscription_status`)

| Stripe | Local |
|--------|-------|
| `active`, `trialing` | `active` |
| `past_due` | `past_due` |
| `canceled`, `unpaid`, `incomplete_expired` | `inactive` |
| `incomplete` | `incomplete` |

`active` ⇒ the Discord paid role is **added**; anything else ⇒ **removed**.

---

## Environment variables (Cloudflare Pages → Settings → Environment variables)

Encrypt the secret ones. Never in the repo or frontend.

| Name | Secret? | Notes |
|------|---------|-------|
| `SUPABASE_URL` | no | `https://mvxjcfriirguhjujurhf.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Supabase service_role key |
| `STRIPE_SECRET_KEY` | **yes** | `sk_test_…` (test mode first) |
| `STRIPE_PRICE_ID` | no | the recurring Price id (`price_…`) |
| `STRIPE_WEBHOOK_SECRET` | **yes** | `whsec_…` from the webhook endpoint |
| `STRIPE_SUCCESS_URL` | no | `https://<app>/index.html?billing=success` |
| `STRIPE_CANCEL_URL` | no | `https://<app>/index.html?billing=cancel` |
| `STRIPE_PORTAL_RETURN_URL` | no | `https://<app>/index.html` |
| `DISCORD_BOT_TOKEN` | **yes** | bot token (role sync) |
| `DISCORD_GUILD_ID` | no | your Discord server id |
| `DISCORD_PAID_ROLE_ID` | no | the role id granted to paid members |

(Phase 3 already needs `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`,
`STATE_SECRET` for account linking.)

## Stripe setup

1. **Product + Price:** Stripe Dashboard → Products → create a product with a **recurring**
   price → copy the Price id into `STRIPE_PRICE_ID`. Use **Test mode** first.
2. **API key:** Developers → API keys → Secret key → `STRIPE_SECRET_KEY`.
3. **Webhook:** Developers → Webhooks → Add endpoint →
   `https://<your-pages-domain>/api/billing/webhook`. Copy the **Signing secret** →
   `STRIPE_WEBHOOK_SECRET`. Enable these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. **Billing Portal:** Settings → Billing → Customer portal → activate (so the portal route works).

## Discord setup (role sync)

1. In your Discord app → **Bot** → add a bot, copy the **token** → `DISCORD_BOT_TOKEN`.
2. **Invite the bot** to your server with the **Manage Roles** permission.
3. **Role hierarchy:** drag the bot's role **above** the paid role, or it can't assign it.
4. Enable **Developer Mode** in Discord (User Settings → Advanced) → right-click the server →
   Copy Server ID → `DISCORD_GUILD_ID`; right-click the paid role → Copy Role ID →
   `DISCORD_PAID_ROLE_ID`.

Bot permission needed: **MANAGE_ROLES** (plus being higher than the target role).

---

## Local testing

- `/api/*` and Stripe don't run under `python -m http.server`; the Upgrade/Manage buttons show
  a graceful "needs the deployed app" message. Everything else works.
- Functions locally: `npx wrangler pages dev dashboard` with a `.dev.vars` file (uncommitted)
  holding the env vars. For webhooks: `stripe listen --forward-to localhost:8788/api/billing/webhook`
  and use the printed `whsec_…` as `STRIPE_WEBHOOK_SECRET`; trigger with `stripe trigger checkout.session.completed`.

## Production test checklist

- [ ] Free/inactive user sees **Upgrade**; clicking opens Stripe Checkout.
- [ ] Completing Checkout updates the profile (`subscription_status = active`, `stripe_*` set).
- [ ] Active user sees **Manage billing**; it opens the Stripe Billing Portal.
- [ ] A **failed payment** moves status to `past_due`; **cancellation** moves it to `inactive`.
- [ ] Active subscription **adds** the Discord paid role; canceled **removes** it.
- [ ] A **duplicate webhook** event (same `event_id`) is acknowledged and ignored (no double-processing).
- [ ] Discord sync failure does **not** fail the webhook (Stripe still gets a 200).
- [ ] No Stripe secret, service-role key, or bot token appears in any frontend file or network response.
- [ ] Signed-out dashboard still loads and shows data.

---

## Phase 5 (still TODO)

- Enforce **authenticated/subscription-gated `hub_dataset` RLS** (the dashboard already sends
  the JWT; flip the policy + populate `dashboard/mlbma_access.js` `PREMIUM_TABS`).
- Optionally **split free vs premium datasets**, or **proxy** sensitive datasets through a
  Cloudflare Function instead of exposing them via PostgREST.
- Launch the **Cloudflare Pages production** environment; run a full **Stripe test-mode +
  Discord test-server** end-to-end.
