/* Current DraftKings NFL prop thresholds. ESPN supplies no paired prices. */
const ROOT = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl';
const CLUBS = new Set('ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WSH'.split(' '));
const ALIASES = { WAS: 'WSH', LA: 'LAR', JAC: 'JAX' };
const MARKETS = {
  'total passing yards (incl. overtime)': 'passing_yards',
  'total passing touchdowns (incl. overtime)': 'passing_tds',
  'total pass completions (incl. overtime)': 'completions',
  'total pass attempts (incl. overtime)': 'pass_attempts',
  'total passing attempts (incl. overtime)': 'pass_attempts',
  'total passing interceptions (incl. overtime)': 'interceptions',
  'total rushing yards (incl. overtime)': 'rushing_yards',
  'total carries (incl. overtime)': 'carries',
  'total receiving yards (incl. overtime)': 'receiving_yards',
  'total receptions (incl. overtime)': 'receptions',
  'total rushing plus receiving yards (incl. overtime)': 'rush_receiving_yards',
  'total passing plus rushing yards (incl. overtime)': 'pass_rushing_yards',
  'total field goals made (incl. overtime)': 'fg_made',
  'total kicking points (incl. overtime)': 'kicking_points',
  'total extra points made (incl. overtime)': 'pat_made'
};

function club(value) {
  const key = String(value || '').toUpperCase();
  return ALIASES[key] || key;
}

export function rosterPlayers(payload, team, teamId) {
  const players = new Map();
  for (const group of payload.athletes || []) {
    for (const player of group.items || []) {
      if (!player.id || !player.displayName) continue;
      players.set(String(player.id), {
        espn_id: String(player.id), player: player.displayName,
        player_aliases: [...new Set([player.displayName, player.fullName].filter(Boolean))],
        team, ...(teamId ? { team_id: teamId } : {})
      });
    }
  }
  return players;
}

async function readJson(url, fetcher, ttl = 60) {
  const response = await fetcher(url, {
    cf: { cacheTtl: ttl }, signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('The prop-line source is unavailable');
  return response.json();
}

async function eventPropLines(root, eventId, homeRoster, awayRoster, checkedAt, fetcher) {
  const url = `${root}/events/${eventId}/competitions/${eventId}/odds/100/propBets?limit=1000`;
  const first = await readJson(url, fetcher);
  const pageCount = Number(first.pageCount || 1);
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 6) {
    throw new Error('The source returned unsupported prop pagination');
  }
  const pages = await Promise.all(Array.from({ length: pageCount - 1 }, (_, i) =>
    readJson(url + '&page=' + (i + 2), fetcher)));
  const players = new Map([...homeRoster, ...awayRoster]);
  return { lines: parsePropLines([first, ...pages].flatMap(page => page.items || []), players, eventId, checkedAt), pages: pageCount };
}

export function parsePropLines(items, players, eventId, checkedAt) {
  const selected = new Map();
  for (const item of items) {
    const metric = MARKETS[String(item.type?.name || '').trim().toLowerCase()];
    const id = String(item.athlete?.$ref || '').match(/\/athletes\/(\d+)(?:\?|\/|$)/)?.[1];
    const identity = players.get(id);
    const raw = item.current?.target?.value;
    if (!metric || !identity || raw == null || raw === '' || !Number.isFinite(Number(raw))) continue;
    const key = id + ':' + metric;
    const row = {
      ...identity, metric, line: Number(raw), event_id: eventId,
      book: 'draftkings', book_name: 'DraftKings', source: 'ESPN',
      over_price: null, under_price: null, priced: false,
      quote_updated_at: item.lastUpdated || null, checked_at: checkedAt
    };
    const prior = selected.get(key);
    if (!prior || String(row.quote_updated_at || '') > String(prior.quote_updated_at || '')) {
      selected.set(key, row);
    } else if (row.quote_updated_at === prior.quote_updated_at && row.line !== prior.line) {
      // Conflicting same-time thresholds are not an identifiable main line.
      prior.ambiguous = true;
    }
  }
  return [...selected.values()].filter(row => !row.ambiguous);
}

export async function loadNflPropLines(spec, fetcher = fetch) {
  const home = club(spec.home), away = club(spec.away);
  const season = Number(spec.season), week = Number(spec.week);
  if (!CLUBS.has(home) || !CLUBS.has(away) || home === away ||
      !Number.isInteger(season) || season < 2010 || season > 2100 ||
      !Number.isInteger(week) || week < 1 || week > 22) {
    throw new RangeError('A valid NFL matchup, season and week are required');
  }
  const read = (url, ttl) => readJson(url, fetcher, ttl);
  const checkedAt = new Date().toISOString();
  const scoreboard = await read(`${ROOT}/scoreboard?dates=${season}&seasontype=2&week=${week}&limit=1000`);
  const event = (scoreboard.events || []).find(row => {
    const competitors = row.competitions?.[0]?.competitors || [];
    return competitors.some(c => c.homeAway === 'home' && club(c.team?.abbreviation) === home) &&
      competitors.some(c => c.homeAway === 'away' && club(c.team?.abbreviation) === away);
  });
  if (!event) throw new Error('This matchup is not on the requested NFL slate');
  const receipt = {
    sport: 'nfl', home, away, event_id: String(event.id), checked_at: checkedAt,
    book: 'DraftKings', source: 'ESPN', lines: []
  };
  if (event.status?.type?.state !== 'pre') return { ...receipt, state: 'closed' };
  const eventId = String(event.id);
  if (!/^\d+$/.test(eventId)) throw new Error('Invalid event identity');
  const [homeRoster, awayRoster] = await Promise.all([
    read(`${ROOT}/teams/${home}/roster?season=${season}`, 3600),
    read(`${ROOT}/teams/${away}/roster?season=${season}`, 3600)
  ]);
  return { ...receipt, state: 'ok', ...await eventPropLines(CORE, eventId,
    rosterPlayers(homeRoster, home), rosterPlayers(awayRoster, away), checkedAt, fetcher) };
}

export async function loadCollegePropLines(spec, fetcher = fetch) {
  const eventId = String(spec.event_id || '');
  const season = Number(spec.season);
  if (!/^\d{6,12}$/.test(eventId) || !Number.isInteger(season) || season < 2010 || season > 2100) {
    throw new RangeError('A valid college football event and season are required');
  }
  const root = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';
  const summary = await readJson(`${root}/summary?event=${eventId}`, fetcher);
  const header = summary.header || {};
  if (String(header.id) !== eventId || Number(header.season?.year) !== season) {
    throw new Error('College event identity did not match the requested season');
  }
  const competition = header.competitions?.[0] || {};
  const competitors = competition.competitors || [];
  const home = competitors.find(team => team.homeAway === 'home')?.team;
  const away = competitors.find(team => team.homeAway === 'away')?.team;
  if (!/^\d+$/.test(String(home?.id)) || !/^\d+$/.test(String(away?.id))) {
    throw new Error('College clubs could not be identified');
  }
  const checkedAt = new Date().toISOString();
  const receipt = { sport: 'cfb', event_id: eventId, checked_at: checkedAt,
    book: 'DraftKings', source: 'ESPN', lines: [] };
  if (competition.status?.type?.state !== 'pre') return { ...receipt, state: 'closed' };
  const [homeRoster, awayRoster] = await Promise.all([
    readJson(`${root}/teams/${home.id}/roster?season=${season}`, fetcher, 3600),
    readJson(`${root}/teams/${away.id}/roster?season=${season}`, fetcher, 3600)
  ]);
  return { ...receipt, state: 'ok', ...await eventPropLines(
    'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football', eventId,
    rosterPlayers(homeRoster, '', String(home.id)), rosterPlayers(awayRoster, '', String(away.id)), checkedAt, fetcher) };
}
