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

// Base "signed-up member" role gate. Granted to anyone who links Discord to a Chase
// Analytics account, independent of whether they pay. Configured separately so the free
// access gate can ship without a paid role existing.
export function discordMemberRoleConfigured(env) {
  return !!(env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID && env.DISCORD_MEMBER_ROLE_ID);
}

/**
 * Add or remove a single guild role for a Discord user. Returns { ok, status }. Never throws
 * on a Discord HTTP error — callers log and move on. Requires the bot to have MANAGE_ROLES and
 * to sit ABOVE the target role in the guild hierarchy.
 */
async function setGuildRole(env, discordUserId, roleId, add) {
  const url = `${DISCORD_API_V10}/guilds/${env.DISCORD_GUILD_ID}/members/${discordUserId}/roles/${roleId}`;
  const res = await fetch(url, {
    method: add ? 'PUT' : 'DELETE',
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json', 'Content-Length': '0' }
  });
  // 204 No Content = success. 404 on DELETE/PUT can mean the member isn't in the guild.
  return { ok: res.status === 204, status: res.status };
}

/**
 * Add (isPaid) or remove the paid role for a Discord user. Returns { action, ok, status }.
 */
export async function syncPaidRole(env, discordUserId, isPaid) {
  if (!discordRoleSyncConfigured(env)) return { action: 'skipped', reason: 'discord_not_configured', ok: false };
  if (!discordUserId) return { action: 'skipped', reason: 'no_discord_user', ok: false };
  const r = await setGuildRole(env, discordUserId, env.DISCORD_PAID_ROLE_ID, isPaid);
  return { action: isPaid ? 'added' : 'removed', ok: r.ok, status: r.status };
}

/**
 * Add (isMember) or remove the base signed-up Member role for a Discord user.
 * Returns { action, ok, status }.
 */
export async function syncMemberRole(env, discordUserId, isMember) {
  if (!discordMemberRoleConfigured(env)) return { action: 'skipped', reason: 'member_role_not_configured', ok: false };
  if (!discordUserId) return { action: 'skipped', reason: 'no_discord_user', ok: false };
  const r = await setGuildRole(env, discordUserId, env.DISCORD_MEMBER_ROLE_ID, isMember);
  return { action: isMember ? 'added' : 'removed', ok: r.ok, status: r.status };
}
