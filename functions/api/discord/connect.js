/**
 * GET /api/discord/connect — begin Discord account linking for the signed-in user.
 *
 * Flow (called by the frontend via fetch with the Supabase Bearer token, NOT a top-level
 * navigation — that's how the JWT reaches this route):
 *   1. Validate the Supabase session.
 *   2. Mint a random `nonce` and bind it to the Supabase user id inside an HMAC-signed,
 *      short-lived, HttpOnly cookie (so the browser-driven /callback can trust the uid
 *      without re-sending the JWT).
 *   3. Respond with the Discord authorize URL (JSON). The frontend then navigates there.
 *
 * Same-origin requirement: the dashboard must be served from this Cloudflare Pages
 * deployment so the state cookie is first-party. See docs/CLOUDFLARE_DISCORD_SETUP.md.
 */
import { getUserFromRequest } from '../../_shared/supabase.js';
import { json, errorResponse, requireEnv, signPayload, setCookie, stateSecret } from '../../_shared/http.js';
import { buildAuthorizeUrl } from '../../_shared/discord.js';

const STATE_COOKIE = 'discord_oauth_state';
const STATE_TTL = 600; // seconds (10 minutes)

export async function onRequestGet({ request, env }) {
  try {
    requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DISCORD_CLIENT_ID', 'DISCORD_REDIRECT_URI']);
    const user = await getUserFromRequest(request, env);

    const nonce = crypto.randomUUID();
    const signed = await signPayload(stateSecret(env), { uid: user.id, nonce }, STATE_TTL);
    const url = buildAuthorizeUrl(env, nonce);

    return json({ url }, 200, { 'Set-Cookie': setCookie(STATE_COOKIE, signed, { maxAge: STATE_TTL }) });
  } catch (err) {
    return errorResponse(err);
  }
}
