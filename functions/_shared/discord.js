/**
 * Discord OAuth helpers for Pages Functions.
 *
 * The Discord client secret is read from env only and used server-side for the token
 * exchange. The resulting Discord access token is used transiently to fetch the user's
 * identity and is then DISCARDED — it is never persisted or returned to the browser.
 */
import { HttpError } from './http.js';

const DISCORD_API = 'https://discord.com/api';
const AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';

// Identity scope only. NOTE(phase-4): add 'guilds.join' here once the bot assigns roles.
const SCOPE = 'identify';

export function buildAuthorizeUrl(env, state) {
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    state
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCode(env, code) {
  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.DISCORD_REDIRECT_URI
  });
  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) throw new HttpError(502, 'discord_token_failed', 'Discord token exchange failed');
  return res.json(); // { access_token, ... } — used immediately, never stored
}

export async function fetchDiscordUser(accessToken) {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new HttpError(502, 'discord_user_failed', 'Could not fetch Discord user');
  const u = await res.json();
  return {
    id: u.id || null,
    username: u.global_name || u.username || (u.id ? 'discord-' + u.id : null),
    avatar: (u.id && u.avatar) ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png` : null
  };
}

/* ── Bot role management (Phase 4) ─────────────────────────────────────────────────────────
 * The bot token is read from env only. Adding/removing a guild role requires the bot to have
 * the MANAGE_ROLES permission and to sit ABOVE the paid role in the guild's role hierarchy. */

const DISCORD_API_V10 = 'https://discord.com/api/v10';

export function discordRoleSyncConfigured(env) {
  return !!(env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID && env.DISCORD_PAID_ROLE_ID);
}

/**
 * Add (isPaid) or remove the paid role for a Discord user. Returns { action, ok, status }.
 * Never throws on a Discord HTTP error — returns ok:false so callers can log and move on.
 */
export async function syncPaidRole(env, discordUserId, isPaid) {
  if (!discordRoleSyncConfigured(env)) return { action: 'skipped', reason: 'discord_not_configured', ok: false };
  if (!discordUserId) return { action: 'skipped', reason: 'no_discord_user', ok: false };

  const url = `${DISCORD_API_V10}/guilds/${env.DISCORD_GUILD_ID}/members/${discordUserId}/roles/${env.DISCORD_PAID_ROLE_ID}`;
  const res = await fetch(url, {
    method: isPaid ? 'PUT' : 'DELETE',
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json', 'Content-Length': '0' }
  });
  // 204 No Content = success. 404 on DELETE/PUT can mean the member isn't in the guild.
  return { action: isPaid ? 'added' : 'removed', ok: res.status === 204, status: res.status };
}
