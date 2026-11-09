import { json } from '../_shared/http.js';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/';

function gameState(type) {
  const name = type.name || '';
  if (/CANCEL/.test(name)) return 'canceled';
  if (/POSTPON/.test(name)) return 'postponed';
  if (/DELAY|SUSPEND/.test(name)) return 'delayed';
  if (type.state === 'post' && type.completed === true) return 'final';
  if (type.state === 'in') return 'live';
  if (type.state === 'pre') return 'scheduled';
  return null;
}

function team(side, scored) {
  const score = Number(side.score);
  const record = (side.records || []).find(r => r.type === 'total');
  return {
    score: scored && side.score != null && side.score !== '' && Number.isInteger(score) && score >= 0 ? score : null,
    record: record?.summary || null
  };
}

function scores(events) {
  return events.flatMap(event => {
    const comp = event.competitions?.[0];
    const state = gameState((event.status || comp?.status)?.type || {});
    const away = comp?.competitors?.find(c => c.homeAway === 'away');
    const home = comp?.competitors?.find(c => c.homeAway === 'home');
    if (!state || !away || !home || !/^\d+$/.test(String(event.id))) return [];
    const scored = state === 'live' || state === 'final';
    return [{ id: String(event.id), state, away: team(away, scored), home: team(home, scored) }];
  });
}

export async function onRequestGet({ request }) {
  const params = new URL(request.url).searchParams;
  const sport = params.get('sport');
  let source;
  if (sport === 'nfl') {
    source = ESPN + 'football/nfl/scoreboard?limit=100';
  } else if (sport === 'nba') {
    const day = params.get('date') || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) ||
        new Date(day).toISOString().slice(0, 10) !== day) return json({ error: 'invalid_date' }, 400);
    source = ESPN + 'basketball/nba/scoreboard?limit=100&dates=' + day.replace(/-/g, '');
  } else {
    return json({ error: 'invalid_sport' }, 400);
  }

  try {
    const upstream = await fetch(source, {
      cf: { cacheTtl: 30, cacheEverything: true },
      signal: AbortSignal.timeout(6000)
    });
    if (upstream.ok) {
      const { events } = await upstream.json();
      if (Array.isArray(events)) return json({ games: scores(events) }, 200, { 'cache-control': 'public, max-age=30' });
    }
  } catch (_) { /* Keep the published slate during a scoreboard outage. */ }
  return json({ games: [], status: 'unavailable' });
}
