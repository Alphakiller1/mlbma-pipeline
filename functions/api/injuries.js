/** Live NBA injury lists: ESPN's league injury feed as it stands when the desk
 * loads, in the nba-model slate's own shape, so the desk can lay it over a
 * snapshot that GitHub's scheduler may have published hours earlier (owner
 * 2026-11-12: injury designations were going stale through the day). */
import { json } from '../_shared/http.js';

const FEEDS = { nba: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries' };
// ESPN lists every club carrying an injury, ordinarily most of the league; a
// short answer is an outage, not a healthy league.
const MIN_TEAMS = 15;

function text(value, max) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

export function nbaInjuries(payload) {
  const teams = {};
  for (const block of (payload && payload.injuries) || []) {
    for (const item of block.injuries || []) {
      const athlete = item.athlete || {};
      const team = text((athlete.team || {}).abbreviation, 6);
      const name = text(athlete.displayName, 60);
      const status = text(item.status, 30);
      if (!team || !name || !status || /^active$/i.test(status)) continue;
      const href = String(((athlete.links || [])[0] || {}).href || '');
      const details = item.details || {};
      const side = details.side && details.side !== 'Not Specified' ? details.side : null;
      const detail = [side, details.type, details.detail].filter(part => typeof part === 'string' && part).join(' ');
      (teams[team] = teams[team] || []).push({
        player_id: (href.match(/\/id\/(\d+)\//) || [])[1] || null,
        player_name: name, status, detail: detail ? detail.slice(0, 80) : null,
        comment: text(item.shortComment, 400), date: text(item.date, 30),
        return_date: text(details.returnDate, 12)
      });
    }
  }
  return teams;
}

export async function onRequestGet({ request }) {
  const sport = new URL(request.url).searchParams.get('sport');
  if (!Object.prototype.hasOwnProperty.call(FEEDS, sport)) return json({ error: 'invalid_sport' }, 400);
  try {
    const upstream = await fetch(FEEDS[sport], { cf: { cacheTtl: 120, cacheEverything: true }, signal: AbortSignal.timeout(6000) });
    if (upstream.ok) {
      const teams = nbaInjuries(await upstream.json());
      if (Object.keys(teams).length >= MIN_TEAMS) {
        return json({ teams, retrieved_at_utc: new Date().toISOString() }, 200, { 'cache-control': 'public, max-age=120' });
      }
    }
  } catch (_) { /* The published slate's lists still stand. */ }
  return json({ status: 'unavailable' });
}
