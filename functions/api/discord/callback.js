/**
 * GET /api/discord/callback — Discord redirects the user's browser here with ?code&state.
 *
 *   1. Verify the signed state cookie and that its nonce matches the `state` query param
 *      (CSRF protection); recover the Supabase user id from the cookie.
 *   2. Exchange the code for a Discord access token (server-side, with the client secret).
 *   3. Fetch the Discord identity and write discord_user_id/username/avatar to the profile
 *      with the service role.
 *   4. Redirect back to the dashboard with a ?discord=connected|error flag.
 *
 * Errors never surface internals — they redirect with a generic reason flag.
 */
import { setDiscordIdentity } from '../../_shared/supabase.js';
import { requireEnv, verifyPayload, readCookie, clearCookie, stateSecret } from '../../_shared/http.js';
import { exchangeCode, fetchDiscordUser } from '../../_shared/discord.js';

const STATE_COOKIE = 'discord_oauth_state';

function redirect(to, extraHeaders = {}) {
  return new Response(null, { status: 302, headers: { Location: to, ...extraHeaders } });
}

export async function onRequestGet({ request, env }) {
  const appBase = env.APP_REDIRECT_PATH || '/index.html';
  const fail = (reason) => redirect(`${appBase}?discord=error&reason=${encodeURIComponent(reason)}`, { 'Set-Cookie': clearCookie(STATE_COOKIE) });

  try {
    requireEnv(env, [
      'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
      'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_REDIRECT_URI'
    ]);

    const u = new URL(request.url);
    const code = u.searchParams.get('code');
    const state = u.searchParams.get('state');
    const oauthError = u.searchParams.get('error');
    if (oauthError) return fail(oauthError);
    if (!code || !state) return fail('missing_params');

    const payload = await verifyPayload(stateSecret(env), readCookie(request, STATE_COOKIE) || '');
    if (!payload || !payload.uid || payload.nonce !== state) return fail('bad_state');

    const tokens = await exchangeCode(env, code);
    const discordUser = await fetchDiscordUser(tokens.access_token);
    if (!discordUser.id) return fail('no_identity');

    await setDiscordIdentity(env, payload.uid, discordUser);
    return redirect(`${appBase}?discord=connected`, { 'Set-Cookie': clearCookie(STATE_COOKIE) });
  } catch (err) {
    return fail('server');
  }
}
