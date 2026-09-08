/**
 * GET /api/me — return the signed-in user's profile (safe fields only).
 *
 * Requires `Authorization: Bearer <Supabase access token>`. Validates the token, reads the
 * profile with the service role, and returns a whitelisted view. Never returns secrets or
 * raw provider tokens.
 */
import { getUserFromRequest, getProfile, safeProfile } from '../_shared/supabase.js';
import { json, errorResponse, requireEnv } from '../_shared/http.js';

export async function onRequestGet({ request, env }) {
  try {
    requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
    const user = await getUserFromRequest(request, env);
    const profile = await getProfile(env, user.id);
    return json({
      profile: safeProfile(profile) || {
        // Fall back to auth fields if the trigger-created row hasn't materialized yet.
        id: user.id,
        email: user.email || null,
        full_name: null,
        avatar_url: null,
        role: 'user',
        subscription_status: 'free',
        discord_user_id: null,
        discord_username: null,
        discord_avatar: null
      }
    });
  } catch (err) {
    return errorResponse(err);
  }
}
