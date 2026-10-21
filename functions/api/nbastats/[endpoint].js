/**
 * GET /api/nbastats/{endpoint}?{league query}
 *
 * Read-only relay for the stats.nba.com tables the NBA matchup profiles use
 * (Synergy play types, Second Spectrum tracking, the defender dashboard,
 * shot locations, bio, staff). stats.nba.com does not answer GitHub's
 * runners, so the nba-model build reads these through chase-analytics.com.
 *
 * Only the endpoints below are relayed, only GET, and every answer is cached
 * at the edge for three hours: it is a mirror of seven public tables, not an
 * open proxy.
 */
import { json, errorResponse, HttpError } from '../../_shared/http.js';

const ALLOWED = new Set([
  'synergyplaytypes', 'leaguedashptstats', 'leaguedashptdefend', 'leaguedashteamshotlocations',
  'leaguedashplayershotlocations', 'leaguedashplayerbiostats', 'commonteamroster', 'leaguedashteamstats'
]);

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
  Referer: 'https://www.nba.com/',
  Origin: 'https://www.nba.com',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true'
};

export async function onRequestGet({ request, params }) {
  try {
    const endpoint = String(params.endpoint || '').toLowerCase();
    if (!ALLOWED.has(endpoint)) throw new HttpError(404, 'not_relayed', 'This table is not relayed');
    const url = new URL(request.url);
    if (url.search.length > 800) throw new HttpError(400, 'bad_query', 'Query too long');
    const target = 'https://stats.nba.com/stats/' + endpoint + url.search;
    const res = await fetch(target, { headers: HEADERS, cf: { cacheTtl: 10800, cacheEverything: true } });
    if (!res.ok) throw new HttpError(502, 'upstream_' + res.status, 'stats.nba.com answered ' + res.status);
    const body = await res.text();
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600' }
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function onRequest() {
  return json({ error: 'method_not_allowed' }, 405);
}
