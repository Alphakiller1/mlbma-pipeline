/**
 * GET|POST /api/discord/sync-role — reconcile the caller's Discord paid role with their
 * current subscription status.
 *
 * Requires a Supabase JWT and a linked Discord account. Uses DISCORD_BOT_TOKEN +
 * DISCORD_GUILD_ID + DISCORD_PAID_ROLE_ID. The Stripe webhook also calls the same role-sync
 * helper automatically on billing changes; this route is the manual / self-serve trigger.
 */
import { getUserFromRequest, getProfile } from '../../_shared/supabase.js';
import { json, errorResponse, requireEnv } from '../../_shared/http.js';
import { syncPaidRole, syncMemberRole, discordRoleSyncConfigured } from '../../_shared/discord.js';

async function handle(request, env) {
  try {
    requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
    const user = await getUserFromRequest(request, env);
    const profile = await getProfile(env, user.id);

    if (!profile || !profile.discord_user_id) {
      return json({ ok: false, action: 'noop', reason: 'discord_not_linked' }, 409);
    }
    if (!discordRoleSyncConfigured(env)) {
      return json({ ok: false, action: 'skipped', reason: 'discord_not_configured' }, 503);
    }

    // A linked account is always a member (free gate); paid layers on top for subscribers.
    const member = await syncMemberRole(env, profile.discord_user_id, true);
    const isPaid = profile.subscription_status === 'active';
    const result = await syncPaidRole(env, profile.discord_user_id, isPaid);
    return json({
      ok: result.ok || member.ok,
      action: result.action,
      member_action: member.action,
      is_paid: isPaid,
      subscription_status: profile.subscription_status,
      discord_status: result.status
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function onRequestGet({ request, env }) { return handle(request, env); }
export async function onRequestPost({ request, env }) { return handle(request, env); }
