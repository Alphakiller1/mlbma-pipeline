/**
 * GET /api/model-center/board?sport=mlb|nfl
 *
 * Entitled sessions only. Board URLs live in Cloudflare env, never in public JS.
 * Unentitled callers get 403 with no payload. Missing env is 503 without numbers.
 */
import { getUserFromRequest, getProfile, hasModelCenterAccess } from '../../_shared/supabase.js';
import { json, errorResponse, requireEnv, HttpError } from '../../_shared/http.js';

const SPORTS = {
  mlb: 'MLB_MODEL_BOARD_URL',
  nfl: 'NFL_MODEL_BOARD_URL'
};

export async function onRequestGet({ request, env }) {
  try {
    requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
    const user = await getUserFromRequest(request, env);
    const profile = await getProfile(env, user.id);
    if (!hasModelCenterAccess(profile)) {
      throw new HttpError(403, 'not_entitled', 'Model Center requires an active Premium subscription');
    }
    const url = new URL(request.url);
    const sport = String(url.searchParams.get('sport') || 'mlb').toLowerCase();
    const envKey = SPORTS[sport];
    if (!envKey) throw new HttpError(400, 'bad_sport', 'sport must be mlb or nfl');
    const boardUrl = env[envKey];
    if (!boardUrl || !/^https:\/\//i.test(String(boardUrl))) {
      throw new HttpError(503, 'board_unconfigured', 'Model board source is not configured');
    }
    const res = await fetch(boardUrl, { cache: 'no-store' });
    if (!res.ok) throw new HttpError(502, 'board_fetch_failed', 'Model board was not reachable');
    let board;
    try {
      board = await res.json();
    } catch (parseErr) {
      throw new HttpError(502, 'board_fetch_failed', 'Model board was not reachable');
    }
    return json({ sport, schema: (board && board.schema) || 'chase-board/1', board });
  } catch (err) {
    return errorResponse(err);
  }
}
