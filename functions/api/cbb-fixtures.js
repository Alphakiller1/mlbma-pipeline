/** Factual fixture refresh. Upstream extras never enter the Research client. */
import { json } from '../_shared/http.js';

export function factualEvents(payload) {
  return (payload.events || []).map(event => {
    const comp = (event.competitions || [])[0] || {};
    const type = (event.status || comp.status || {}).type || {};
    return {
      id: String(event.id), date: event.date,
      status: { type: { name: type.name, state: type.state } },
      competitions: [{
        neutralSite: comp.neutralSite === true,
        venue: { fullName: (comp.venue || {}).fullName, address: { city: ((comp.venue || {}).address || {}).city } },
        competitors: (comp.competitors || []).filter(c => c.homeAway === 'home' || c.homeAway === 'away').map(c => {
          const team = c.team || {};
          return {
            homeAway: c.homeAway, score: c.score,
            team: { id: String(team.id), displayName: team.displayName,
              logo: /^https:\/\/a\.espncdn\.com\//.test(team.logo || '') ? team.logo : null,
              color: /^[a-f0-9]{6}$/i.test(team.color || '') ? '#' + team.color : null },
            records: (c.records || []).filter(r => r.type === 'total').map(r => ({ type: 'total', summary: r.summary }))
          };
        })
      }]
    };
  });
}

export async function onRequestGet({ request }) {
  const day = new URL(request.url).searchParams.get('date') || '';
  const iso = day.slice(0,4) + '-' + day.slice(4,6) + '-' + day.slice(6,8);
  if (!/^\d{8}$/.test(day) || !Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString().slice(0,10) !== iso)
    return json({ error: 'invalid_date' }, 400);
  try {
    const upstream = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=50&limit=1000&dates=' + day,
      { cf: { cacheTtl: 30, cacheEverything: true }, signal: AbortSignal.timeout(6000) });
    if (!upstream.ok) return json({ error: 'fixture_unavailable' }, 503);
    return json({ events: factualEvents(await upstream.json()) }, 200, { 'cache-control': 'public, max-age=30' });
  } catch (_) { return json({ error: 'fixture_unavailable' }, 503); }
}
