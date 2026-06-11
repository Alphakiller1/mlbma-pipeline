/**
 * POST /api/billing/create-portal-session — open the Stripe Billing Portal for the user.
 *
 * Requires a Supabase JWT and an existing stripe_customer_id on the profile. Returns the
 * portal URL. If the user has never started a subscription, returns a clean 409.
 */
import { getUserFromRequest, getFullProfileById } from '../../_shared/supabase.js';
import { json, errorResponse, requireEnv, HttpError } from '../../_shared/http.js';
import { createPortalSession } from '../../_shared/stripe.js';

export async function onRequestPost({ request, env }) {
  try {
    requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_PORTAL_RETURN_URL']);
    const user = await getUserFromRequest(request, env);
    const profile = await getFullProfileById(env, user.id);

    if (!profile || !profile.stripe_customer_id) {
      throw new HttpError(409, 'no_customer', 'No billing account yet — start a subscription first.');
    }

    const session = await createPortalSession(env, {
      customer: profile.stripe_customer_id,
      returnUrl: env.STRIPE_PORTAL_RETURN_URL
    });
    return json({ url: session.url });
  } catch (err) {
    return errorResponse(err);
  }
}
