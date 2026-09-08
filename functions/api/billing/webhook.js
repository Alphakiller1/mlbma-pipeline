/**
 * POST /api/billing/webhook — Stripe webhook receiver.
 *
 *   1. Verify the Stripe signature (STRIPE_WEBHOOK_SECRET).
 *   2. Record the event idempotently in billing_events (unique event_id) — duplicates are
 *      acknowledged and skipped, so Stripe retries are safe.
 *   3. Update the matching profile's subscription fields with the service role.
 *   4. Best-effort: sync the user's Discord paid role (failures are logged, never fail the
 *      webhook — Stripe must still get a 200 or it will keep retrying).
 *
 * Stripe must POST the RAW body here, so signature verification reads request.text() before
 * any parsing. This route requires NO Supabase JWT (it is authenticated by the signature).
 */
import { constructWebhookEvent, mapSubscriptionStatus } from '../../_shared/stripe.js';
import {
  updateProfileById, updateProfileByCustomer, insertBillingEvent
} from '../../_shared/supabase.js';
import { syncPaidRole, discordRoleSyncConfigured } from '../../_shared/discord.js';
import { json } from '../../_shared/http.js';

export async function onRequestPost({ request, env }) {
  // Our own misconfiguration → 500 (Stripe will retry once we fix env).
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    return json({ error: 'config_error' }, 500);
  }

  const rawBody = await request.text();
  const sig = request.headers.get('Stripe-Signature') || request.headers.get('stripe-signature');

  let event;
  try {
    event = await constructWebhookEvent(env, rawBody, sig);
  } catch (e) {
    return json({ error: 'invalid_signature' }, 400);
  }

  // Idempotency gate: first writer wins; duplicates short-circuit.
  let recorded;
  try {
    recorded = await insertBillingEvent(env, {
      event_id: event.id,
      event_type: event.type,
      stripe_customer_id: extractCustomer(event),
      stripe_subscription_id: extractSubscription(event),
      payload: event
    });
  } catch (e) {
    console.log('billing_events insert failed (continuing):', e && e.message);
    recorded = { inserted: true };
  }
  if (!recorded.inserted) {
    return json({ received: true, duplicate: true });
  }

  try {
    await processEvent(env, event);
  } catch (e) {
    // Ack 200 anyway: the event is recorded and can be reprocessed; returning non-200 would
    // make Stripe retry a poison event forever.
    console.log('webhook processing error:', event.type, e && e.message);
  }
  return json({ received: true });
}

function extractCustomer(event) {
  const o = event.data && event.data.object;
  if (!o) return null;
  if (o.object === 'customer') return o.id;
  return o.customer || null;
}
function extractSubscription(event) {
  const o = event.data && event.data.object;
  if (!o) return null;
  if (o.object === 'subscription') return o.id;
  return o.subscription || null;
}

async function processEvent(env, event) {
  const o = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed': {
      // Links Stripe ids to the user; status is set authoritatively by subscription.* events.
      const userId = o.client_reference_id;
      if (!userId) break;
      let profile = await updateProfileById(env, userId, {
        stripe_customer_id: o.customer || undefined,
        stripe_subscription_id: o.subscription || undefined,
        subscription_status: o.subscription ? 'active' : undefined
      });
      await maybeSyncDiscord(env, profile);
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const status = event.type === 'customer.subscription.deleted'
        ? 'inactive'
        : mapSubscriptionStatus(o.status);
      const profile = await updateProfileByCustomer(env, o.customer, {
        subscription_status: status,
        stripe_subscription_id: o.id,
        subscription_current_period_end: o.current_period_end
          ? new Date(o.current_period_end * 1000).toISOString() : null,
        subscription_cancel_at_period_end: !!o.cancel_at_period_end
      });
      await maybeSyncDiscord(env, profile);
      break;
    }
    case 'invoice.payment_succeeded': {
      const profile = await updateProfileByCustomer(env, o.customer, { subscription_status: 'active' });
      await maybeSyncDiscord(env, profile);
      break;
    }
    case 'invoice.payment_failed': {
      const profile = await updateProfileByCustomer(env, o.customer, { subscription_status: 'past_due' });
      await maybeSyncDiscord(env, profile);
      break;
    }
    default:
      // Unhandled event types are still recorded in billing_events above.
      break;
  }
}

// Best-effort Discord role sync — never throws into the webhook response.
async function maybeSyncDiscord(env, profile) {
  try {
    if (!profile || !profile.discord_user_id || !discordRoleSyncConfigured(env)) return;
    const isPaid = profile.subscription_status === 'active';
    const r = await syncPaidRole(env, profile.discord_user_id, isPaid);
    console.log('discord role sync', profile.discord_user_id, isPaid ? 'add' : 'remove', '->', r.status || r.reason);
  } catch (e) {
    console.log('discord role sync failed (non-fatal):', e && e.message);
  }
}
