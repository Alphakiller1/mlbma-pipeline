/**
 * POST /api/billing/create-checkout-session — start a Stripe subscription Checkout.
 *
 * Requires `Authorization: Bearer <Supabase access token>`. Ensures the profile has a Stripe
 * customer (creates one on first use), creates a subscription-mode Checkout Session, and
 * returns its URL. The Stripe secret key never reaches the browser.
 */
import { getUserFromRequest, getFullProfileById, updateProfileById } from '../../_shared/supabase.js';
import { json, errorResponse, requireEnv } from '../../_shared/http.js';
import { createCustomer, createCheckoutSession } from '../../_shared/stripe.js';

export async function onRequestPost({ request, env }) {
  try {
    requireEnv(env, [
      'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
      'STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID', 'STRIPE_SUCCESS_URL', 'STRIPE_CANCEL_URL'
    ]);
    const user = await getUserFromRequest(request, env);
    const profile = await getFullProfileById(env, user.id);

    let customerId = profile && profile.stripe_customer_id;
    if (!customerId) {
      const customer = await createCustomer(env, {
        email: user.email || (profile && profile.email) || undefined,
        metadata: { supabase_user_id: user.id }
      });
      customerId = customer.id;
      await updateProfileById(env, user.id, { stripe_customer_id: customerId });
    }

    const session = await createCheckoutSession(env, {
      customer: customerId,
      priceId: env.STRIPE_PRICE_ID,
      successUrl: env.STRIPE_SUCCESS_URL,
      cancelUrl: env.STRIPE_CANCEL_URL,
      clientReferenceId: user.id,
      metadata: { supabase_user_id: user.id }
    });

    return json({ url: session.url });
  } catch (err) {
    return errorResponse(err);
  }
}
