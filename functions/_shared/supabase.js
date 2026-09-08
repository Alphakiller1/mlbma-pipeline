/**
 * Server-side Supabase helpers for Pages Functions.
 *
 * - Validates a user's access token by asking GoTrue who it belongs to (works for any JWT
 *   signing algorithm — no JWT secret/JWKS handling needed here).
 * - Reads/updates `public.profiles` with the SERVICE-ROLE key, which bypasses RLS. The
 *   service-role key lives ONLY in Cloudflare env vars and never reaches the browser.
 */
import { HttpError, bearerToken } from './http.js';

const SAFE_PROFILE_FIELDS = [
  'id', 'email', 'full_name', 'avatar_url', 'role', 'subscription_status',
  'discord_user_id', 'discord_username', 'discord_avatar'
];

export { SAFE_PROFILE_FIELDS };

function serviceHeaders(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra
  };
}

/** Validate the caller's Supabase access token and return the auth user ({ id, email, ... }). */
export async function getUserFromRequest(request, env) {
  const token = bearerToken(request);
  if (!token) throw new HttpError(401, 'missing_token', 'Authorization: Bearer <access token> required');
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY }
  });
  if (!res.ok) throw new HttpError(401, 'invalid_token', 'Invalid or expired session');
  const user = await res.json();
  if (!user || !user.id) throw new HttpError(401, 'invalid_token', 'Invalid session');
  return user;
}

/** Read one profile row (service role; scoped by id). Returns the row or null. */
export async function getProfile(env, userId) {
  const url = `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=${SAFE_PROFILE_FIELDS.join(',')}`;
  const res = await fetch(url, { headers: serviceHeaders(env) });
  if (!res.ok) throw new HttpError(502, 'profile_read_failed', 'Could not read profile');
  const rows = await res.json();
  return (rows && rows[0]) || null;
}

/**
 * Write ONLY the Discord identity fields. The service role can set these even after the
 * authenticated column-grant on `discord_*` is revoked (Phase 4 TODO in 0002_profiles.sql).
 */
export async function setDiscordIdentity(env, userId, discord) {
  const url = `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`;
  const body = {
    discord_user_id: discord.id || null,
    discord_username: discord.username || null,
    discord_avatar: discord.avatar || null
  };
  const res = await fetch(url, {
    method: 'PATCH',
    headers: serviceHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new HttpError(502, 'profile_update_failed', 'Could not update profile');
  const rows = await res.json();
  return (rows && rows[0]) || null;
}

/** Whitelist a profile object down to the safe, returnable fields. */
export function safeProfile(profile) {
  if (!profile) return null;
  const out = {};
  for (const f of SAFE_PROFILE_FIELDS) out[f] = profile[f] != null ? profile[f] : null;
  return out;
}

/* ── Billing (Phase 4) — server-side only; these reads include Stripe/subscription columns
 *    and must never be returned wholesale to the browser. ───────────────────────────────── */

async function readProfile(env, filter) {
  const url = `${env.SUPABASE_URL}/rest/v1/profiles?${filter}&select=*`;
  const res = await fetch(url, { headers: serviceHeaders(env) });
  if (!res.ok) throw new HttpError(502, 'profile_read_failed', 'Could not read profile');
  const rows = await res.json();
  return (rows && rows[0]) || null;
}

export function getFullProfileById(env, userId) {
  return readProfile(env, `id=eq.${encodeURIComponent(userId)}`);
}
export function getProfileByStripeCustomer(env, customerId) {
  return readProfile(env, `stripe_customer_id=eq.${encodeURIComponent(customerId)}`);
}

async function patchProfiles(env, filter, fields) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?${filter}`, {
    method: 'PATCH',
    headers: serviceHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(fields)
  });
  if (!res.ok) throw new HttpError(502, 'profile_update_failed', 'Could not update profile');
  const rows = await res.json();
  return (rows && rows[0]) || null; // null when no row matched the filter
}

export function updateProfileById(env, userId, fields) {
  return patchProfiles(env, `id=eq.${encodeURIComponent(userId)}`, fields);
}
export function updateProfileByCustomer(env, customerId, fields) {
  return patchProfiles(env, `stripe_customer_id=eq.${encodeURIComponent(customerId)}`, fields);
}

/**
 * Record a Stripe event idempotently. Uses INSERT ... ON CONFLICT (event_id) DO NOTHING via
 * PostgREST. Returns { inserted } — false means we've already processed this event_id.
 */
export async function insertBillingEvent(env, evt) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/billing_events?on_conflict=event_id`, {
    method: 'POST',
    headers: serviceHeaders(env, {
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=representation'
    }),
    body: JSON.stringify(evt)
  });
  if (!res.ok && res.status !== 409) {
    throw new HttpError(502, 'billing_event_insert_failed', 'Could not record billing event');
  }
  const rows = await res.json().catch(() => []);
  return { inserted: Array.isArray(rows) && rows.length > 0, row: (rows && rows[0]) || null };
}
