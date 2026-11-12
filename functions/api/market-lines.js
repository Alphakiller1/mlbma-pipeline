/** Posted market lines for the NFL, CFB and NBA matchup cards: the same
 * spread and total the CBB cards carry, read from ESPN's scoreboard for each
 * day the slate covers. Only the posted numbers and enough identity to place
 * them on a card leave this function. */
import { json } from '../_shared/http.js';
import { marketLines } from '../_shared/market-lines.js';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/';
const FEEDS = {
  nfl: 'football/nfl/scoreboard?limit=100',
  cfb: 'football/college-football/scoreboard?groups=80&limit=400',
  nba: 'basketball/nba/scoreboard?limit=100'
};
const MAX_DAYS = 8;

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 60) : null;
}

function club(competitor) {
  const team = (competitor || {}).team || {};
  return {
    abbr: /^[A-Z0-9&.'-]{1,8}$/i.test(team.abbreviation || '') ? team.abbreviation : null,
    name: text(team.displayName),
    location: text(team.location)
  };
}

export function linedGames(payload, sport) {
  return ((payload || {}).events || []).flatMap(event => {
    const comp = (event.competitions || [])[0] || {};
    const sides = comp.competitors || [];
    const away = sides.find(c => c.homeAway === 'away'), home = sides.find(c => c.homeAway === 'home');
    const lines = marketLines(comp, sport);
    if (!away || !home || !lines || !/^\d+$/.test(String(event.id))) return [];
    return [{ id: String(event.id), kickoff_utc: text(event.date), away: club(away), home: club(home), lines }];
  });
}

function validDay(day) {
  const iso = day.slice(0, 4) + '-' + day.slice(4, 6) + '-' + day.slice(6, 8);
  return /^\d{8}$/.test(day) && Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString().slice(0, 10) === iso;
}

export async function onRequestGet({ request }) {
  const params = new URL(request.url).searchParams;
  const sport = params.get('sport');
  if (!Object.prototype.hasOwnProperty.call(FEEDS, sport)) return json({ error: 'invalid_sport' }, 400);
  const days = [...new Set(String(params.get('dates') || '').split(',').filter(Boolean))];
  if (!days.length || days.length > MAX_DAYS || !days.every(validDay)) return json({ error: 'invalid_date' }, 400);
  const feeds = await Promise.all(days.map(day =>
    fetch(ESPN + FEEDS[sport] + '&dates=' + day, { cf: { cacheTtl: 60, cacheEverything: true }, signal: AbortSignal.timeout(6000) })
      .then(r => (r.ok ? r.json() : null)).catch(() => null)));
  if (feeds.every(feed => !feed)) return json({ games: [], status: 'unavailable' });
  const byId = new Map();
  feeds.forEach(feed => linedGames(feed, sport).forEach(game => byId.set(game.id, game)));
  return json({ games: [...byId.values()] }, 200, { 'cache-control': 'public, max-age=60' });
}
