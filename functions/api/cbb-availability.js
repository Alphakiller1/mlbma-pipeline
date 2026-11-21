import { json } from '../_shared/http.js';
import { availabilityFeed, availabilityResponse } from '../_shared/availability_cache.js';
import { availabilityStatus, wallClock } from '../_shared/college_availability.js';

const ACTION = 'https://www.actionnetwork.com/ncaab/injury-report';
const ROTO = 'https://www.rotowire.com/cbasketball/injury-report.php';
const ROTO_JSON = 'https://www.rotowire.com/cbasketball/tables/injury-report.php?team=ALL&pos=ALL';
const COVERS = 'https://www.covers.com';
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/';
const COVERS_GAME = COVERS + '/sport/basketball/ncaab/matchup/';
const COVERS_HEADERS = { 'user-agent': 'ChaseAnalytics/1.0 (+https://chase-analytics.com)', accept: 'text/html' };
const DAY = 86400000;

const plain = value => String(value || '').replace(/<[^>]+>/g, ' ')
  .replace(/&(?:apos|rsquo|#39|#x27);/gi, "'").replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const key = value => plain(value).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
const playerName = row => plain(row).slice(0, 80);

async function requestJson(url) {
  return (await availabilityResponse(url)).json();
}

export function cbbRoster(payload, team, season) {
  if (String(payload?.team?.id) !== team || Number(payload?.season?.year) !== season || !Array.isArray(payload?.athletes)) {
    throw new Error('Unexpected CBB roster');
  }
  const school = payload.team;
  return {
    names: [school.displayName, school.location, school.abbreviation].map(key).filter(Boolean),
    players: payload.athletes.filter(player => player.id && player.displayName).map(player => ({
      player_id: String(player.id), player: playerName(player.displayName),
      position: plain(player.position?.abbreviation).slice(0, 8),
      names: [player.displayName, player.fullName].map(key).filter(Boolean)
    }))
  };
}

export function cbbListings(rows, source) {
  if (!Array.isArray(rows)) throw new Error('Unexpected CBB injury listings');
  const action = source === 'Action Network';
  return rows.flatMap(row => {
    const name = playerName(action ? row.player?.full_name : row.player);
    const team = action ? [row.team?.full_name, row.team?.display_name] : [row.team];
    const status = availabilityStatus(row.status);
    if (!name || !status || status === 'Exempt') return [];
    const updated = action ? Date.parse(row.updated_at) : NaN;
    return [{ team: team.map(key).filter(Boolean), name, status,
      injury: playerName(action ? row.comment?.match(/\bwith ([\w /-]{2,45})\s*$/i)?.[1] : row.injury) || null,
      detail: action ? playerName(row.description) || null : null,
      updated: Number.isFinite(updated) ? new Date(updated).toISOString() : null,
      source, source_url: action ? ACTION : ROTO }];
  });
}

export function coversGames(html) {
  const fixtures = [];
  for (const [tag, id] of html.matchAll(/<article\b[^>]*id="ncaab-(\d+)"[^>]*>/gi)) {
    const teams = ['away', 'home'].map(side => [...tag.matchAll(
      new RegExp('data-' + side + '-team-(?:shortname|fullname|name|displayname)=["\']?([^"\'>]+?)(?=\\s+data-|["\'>])', 'gi')
    )].map(match => key(match[1])).filter(Boolean));
    if (teams.every(names => names.length)) fixtures.push({ id, teams });
  }
  if (!fixtures.length && !html.includes('scoreboard')) throw new Error('Unexpected Covers scoreboard');
  return fixtures;
}

export function coversReport(html, id) {
  let event;
  for (const [, body] of html.matchAll(/<script\b[^>]*\btype="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      let parsed;
      try { parsed = JSON.parse(body); }
      catch (_) { parsed = JSON.parse(body.replace(/}\s*$/, '')); }
      if (parsed['@type'] === 'SportsEvent') { event = parsed; break; }
    } catch (_) { /* Other blocks can be ratings or linked articles. */ }
  }
  const kickoff = Date.parse(String(event?.startDate || '').replace(/&#x2b;|&#43;/ig, '+'));
  if (!Number.isFinite(kickoff)) return null;
  const source_url = COVERS_GAME + id + '#injuries';
  const teams = ['away', 'home'].map(side => {
    const sections = [...html.matchAll(new RegExp('<section class="' + side + '-team-section[^"]*"[^>]*>([\\s\\S]*?)<\\/section>', 'gi'))];
    const body = sections.find(([, markup]) =>
      /Injuries$/i.test(plain(/<h[234][^>]*>([\s\S]*?)<\/h[234]>/i.exec(markup)?.[1])))?.[1];
    if (!body) return null;
    if (/No injuries to report\./i.test(body)) return [];
    const players = [];
    for (const [, row] of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(([, text]) => text);
      if (cells.length !== 5) continue;
      const link = /href=['"]([^'"]+)['"]/i.exec(cells[0])?.[1];
      const name = playerName(link ? link.replace(/\/$/, '').split('/').at(-1) : cells[0]);
      const [label, injury] = plain(cells[2].replace(/<span class="mobile-date[^"]*"[^>]*>[\s\S]*?<\/span>/ig, '')).split(' - ', 2);
      const status = availabilityStatus(label);
      const stamp = Date.parse(plain(cells[3]).replace(/'/g, '') + ' 12:00:00 GMT');
      if (!name || !status) continue;
      players.push({ name, status, injury: playerName(injury) || null,
        updated: Number.isFinite(stamp) ? new Date(stamp).toISOString() : null, source: 'Covers', source_url });
    }
    return players.length ? players : null;
  });
  const names = ['away', 'home'].map(side => key(event[side + 'Team']?.name));
  return { kickoff, names, teams, source_url };
}

export function verifiedCbbPlayers(candidates, roster, kickoff) {
  const players = new Map();
  for (const row of candidates) {
    const ts = Date.parse(row.updated);
    if (Number.isFinite(ts) && (ts > Math.min(Date.now() + DAY, kickoff + DAY) || ts < kickoff - 14 * DAY)) continue;
    const hits = roster.players.filter(player => player.names.includes(key(row.name)));
    if (hits.length !== 1) continue;
    const { player, player_id, position } = hits[0];
    const prior = players.get(player_id);
    if (!prior || (row.updated || '') > (prior.updated || '') ||
        (row.updated === prior.updated && row.source === 'Covers')) {
      players.set(player_id, { player, player_id, position, status: row.status, updated: row.updated,
        injury: row.injury || null, detail: row.detail || null, source: row.source, source_url: row.source_url });
    }
  }
  return [...players.values()];
}

export async function onRequestGet(context) {
  const query = new URL(context.request.url).searchParams;
  const kickoff = Date.parse(query.get('kickoff'));
  const ids = ['away', 'home'].map(side => query.get(side));
  const season = Number(query.get('season'));
  if (!ids.every(id => /^\d{1,6}$/.test(id || '')) || ids[0] === ids[1] || !Number.isFinite(kickoff) ||
      !Number.isInteger(season) || Math.abs(season - new Date().getUTCFullYear()) > 1) return json({ status: 'invalid_fixture' }, 400);
  const day = wallClock(new Date(kickoff)).slice(0, 10);
  if (day !== wallClock(new Date()).slice(0, 10)) return json({ status: 'not_published' });
  const [action, roto, schedule, ...rosters] = await Promise.allSettled([
    availabilityFeed(context, 'cbb-action-v1', 45, async () => {
      const page = await (await availabilityResponse(ACTION)).text();
      const raw = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i.exec(page)?.[1];
      return cbbListings(JSON.parse(raw || '{}').props?.pageProps?.injuries, 'Action Network');
    }),
    availabilityFeed(context, 'cbb-roto-v1', 45, async () => cbbListings(await requestJson(ROTO_JSON), 'RotoWire')),
    availabilityFeed(context, 'cbb-covers-v1-' + day, 180, async () =>
      coversGames(await (await availabilityResponse(COVERS + '/sports/ncaab/matchups?selectedDate=' + day,
        { headers: COVERS_HEADERS })).text())),
    ...ids.map(id => availabilityFeed(context, 'cbb-roster-v1-' + season + '-' + id, 900,
      async () => cbbRoster(await requestJson(ESPN + id + '/roster?season=' + season), id, season)))
  ]);
  let fixture = null;
  const names = rosters.map(result => result.value?.data.names || []);
  const matching = (schedule.value?.data || []).filter(game => game.teams.every((team, i) => team.some(name => names[i].includes(name))));
  if (matching.length === 1) {
    try {
      const id = matching[0].id;
      const feed = await availabilityFeed(context, 'cbb-covers-game-v1-' + id, 45, async () =>
        coversReport(await (await availabilityResponse(COVERS_GAME + id, { headers: COVERS_HEADERS })).text(), id));
      if (feed.data && Math.abs(feed.data.kickoff - kickoff) <= 3600000 &&
          feed.data.names.every((name, i) => names[i].includes(name))) fixture = feed.data;
    } catch (_) { /* Team listings still supply partial coverage. */ }
  }
  const listings = [action, roto].flatMap(result => result.value?.data || []);
  const reports = {};
  rosters.forEach((result, i) => {
    const roster = result.value?.data;
    if (!roster) return;
    const onFixture = fixture?.teams[i];
    const candidates = listings.filter(row => row.team.some(name => roster.names.includes(name))).concat(onFixture || []);
    const players = verifiedCbbPlayers(candidates, roster, kickoff);
    if (players.length || onFixture) reports[i === 0 ? 'away' : 'home'] = {
      players, coverage: 'secondary',
      sources: [...new Set(players.map(player => player.source).concat(onFixture ? ['Covers'] : []))].join(', '),
      fixture_listings: onFixture?.length,
      source_url: onFixture ? fixture.source_url : undefined
    };
  });
  const checkedAt = [action, roto].map(result => result.value?.checked_at_utc).filter(Boolean).sort().at(-1);
  return json({ reports, status: checkedAt || fixture ? 'ok' : 'unavailable',
    sources: [action.value && 'Action Network', roto.value && 'RotoWire', fixture && 'Covers'].filter(Boolean),
    checked_at_utc: checkedAt || (fixture ? new Date().toISOString() : undefined) });
}
