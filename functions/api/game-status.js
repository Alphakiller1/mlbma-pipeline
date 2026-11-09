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

function nbaFixture(event, comp, day, status, away, home) {
  const kickoff = new Date(event.date);
  if (!Number.isFinite(kickoff.valueOf()) ||
      kickoff.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) !== day ||
      !away.team?.abbreviation || !home.team?.abbreviation) return null;
  return {
    id: status.id, kickoff_utc: kickoff.toISOString(), game_state: status.state,
    away: away.team.abbreviation, home: home.team.abbreviation,
    away_name: away.team.displayName || null, home_name: home.team.displayName || null,
    away_score: status.away.score, home_score: status.home.score,
    away_record: status.away.record, home_record: status.home.record,
    venue: comp.venue?.fullName || null, venue_city: comp.venue?.address?.city || null,
    broadcast: comp.broadcasts?.[0]?.names?.join(' / ') || null, neutral: comp.neutralSite === true
  };
}

function scores(events, fixtureDay) {
  return events.flatMap(event => {
    const comp = event.competitions?.[0];
    const state = gameState((event.status || comp?.status)?.type || {});
    const away = comp?.competitors?.find(c => c.homeAway === 'away');
    const home = comp?.competitors?.find(c => c.homeAway === 'home');
    if (!state || !away || !home || !/^\d+$/.test(String(event.id))) return [];
    const scored = state === 'live' || state === 'final';
    const status = { id: String(event.id), state, away: team(away, scored), home: team(home, scored) };
    if (!fixtureDay) return [status];
    const fixture = nbaFixture(event, comp, fixtureDay, status, away, home);
    return fixture ? [fixture] : [];
  });
}

export async function onRequestGet({ request }) {
  const params = new URL(request.url).searchParams;
  const sport = params.get('sport');
  let source, fixtureDay;
  if (sport === 'nfl') {
    source = ESPN + 'football/nfl/scoreboard?limit=100';
  } else if (sport === 'nba') {
    const day = params.get('date') || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) ||
        new Date(day).toISOString().slice(0, 10) !== day) return json({ error: 'invalid_date' }, 400);
    if (params.get('fixtures') === '1') fixtureDay = day;
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
      if (Array.isArray(events)) return json({ games: scores(events, fixtureDay) }, 200, { 'cache-control': 'public, max-age=30' });
    }
  } catch (_) { /* Keep the published slate during a scoreboard outage. */ }
  return json({ games: [], status: 'unavailable' });
}
