/** Factual fixture refresh. Upstream extras never enter the Research client. */
import { json } from '../_shared/http.js';

/* Posted market numbers only: the opening and current point spread (home
   side) and total from the first listed provider. Prices, links, moneylines
   and every model field stay upstream. */
export function marketLines(comp) {
  const o = (comp.odds || [])[0] || {};
  const num = (v, lo, hi) => {
    const text = String(v == null ? '' : v).trim().replace(/^[ou]/i, '');
    if (!/^[+-]?\d+(\.\d+)?$/.test(text) && !/^(pk|even)$/i.test(text)) return null;
    const n = /^(pk|even)$/i.test(text) ? 0 : Number(text);
    return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
  };
  const ps = ((o.pointSpread || {}).home) || {}, over = ((o.total || {}).over) || {};
  const lines = {
    provider: (function (pv) { var n = pv.displayName || pv.name; return typeof n === 'string' ? n.slice(0, 40) : null; })(o.provider || {}),
    home_open: num((ps.open || {}).line, -70, 70), home_current: num((ps.close || {}).line, -70, 70),
    total_open: num((over.open || {}).line, 60, 260), total_current: num((over.close || {}).line, 60, 260)
  };
  return lines.home_current == null && lines.total_current == null ? null : lines;
}

export function factualEvents(payload) {
  return (payload.events || []).map(event => {
    const comp = (event.competitions || [])[0] || {};
    const type = (event.status || comp.status || {}).type || {};
    return {
      id: String(event.id), date: event.date,
      status: { type: { name: type.name, state: type.state } },
      competitions: [{
        neutralSite: comp.neutralSite === true,
        market_lines: marketLines(comp),
        venue: { fullName: (comp.venue || {}).fullName, address: { city: ((comp.venue || {}).address || {}).city } },
        competitors: (comp.competitors || []).filter(c => c.homeAway === 'home' || c.homeAway === 'away').map(c => {
          const team = c.team || {};
          return {
            homeAway: c.homeAway, score: c.score,
            team: { id: String(team.id), displayName: team.displayName,
              abbreviation: /^[A-Z0-9&.'-]{1,8}$/i.test(team.abbreviation || '') ? team.abbreviation : null,
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
    if (upstream.ok) return json({ events: factualEvents(await upstream.json()) }, 200, { 'cache-control': 'public, max-age=30' });
  } catch (_) { /* The published fixtures still render. */ }
  return json({ events: [], status: 'unavailable' });
}
