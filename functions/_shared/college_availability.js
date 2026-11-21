import { availabilityFeed, availabilityResponse } from './availability_cache.js';

const VIEWER = 'https://app.hdintelligence.com/api/';
const EASTERN = 'America/New_York';
const ZONES = { ET: EASTERN, CT: 'America/Chicago', MT: 'America/Denver', PT: 'America/Los_Angeles' };
const ALIASES = {
  centralflorida: 'ucf', connecticut: 'uconn', floridaatlantic: 'fau', floridaintl: 'fiu',
  louisianastate: 'lsu', miamifl: 'miami', mississippi: 'olemiss', ncs: 'ncstate',
  sanjosest: 'sanjosestate', southflorida: 'usf', southerncalifornia: 'usc',
  southernmethodist: 'smu', texaschristian: 'tcu',
  texaselpaso: 'utep', texassanantonio: 'utsa', louisianamonroe: 'ulm', ulmonroe: 'ulm', latech: 'louisianatech',
  appalachianstate: 'appstate', massachusetts: 'umass'
};
const STATUSES = {
  available: 'Available', probable: 'Probable', questionable: 'Questionable', doubtful: 'Doubtful',
  gametimedecision: 'Game Time Decision', gtd: 'Game Time Decision', out: 'Out',
  out1sthalf: 'Out (1st Half)', outfirsthalf: 'Out (1st Half)', outforseason: 'Out For Season',
  ofs: 'Out For Season', outindefinitely: 'Out Indefinitely', suspended: 'Suspended', susp: 'Suspended',
  injuredreserve: 'IR', ir: 'IR', exempt: 'Exempt'
};
const SOURCE = {
  SEC: ['SEC', 'https://www.secsports.com/fbreports'],
  ACC: ['ACC', 'https://theacc.com/sports/2025/8/28/availability-reporting-football.aspx'],
  B12: ['Big 12', 'https://big12sports.com/FBReporting'],
  B10: ['Big Ten', 'https://bigten.org/fb/availability-reports/'],
  SBC: ['Sun Belt', 'https://sunbeltsports.org/news/2025/8/11/football-availability-report-new.aspx'],
  P12: ['Pac-12', 'https://pac-12.com/news/2026/9/11/2026-football-reports.aspx']
};
const CONFERENCE_JSON = {
  SBC: 'https://sbcautostorage.blob.core.windows.net/availability-reports/sunbelt-football/prod/report.json',
  P12: 'https://sbcautostorage.blob.core.windows.net/availability-reports/pac12-football/prod/report.json'
};

const text = (value, limit = 100) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const key = (value) => text(value).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
export function collegeTeam(value) {
  const name = key(value);
  return Object.hasOwn(ALIASES, name) ? ALIASES[name] : name;
}
export function availabilityStatus(value) {
  const status = key(value);
  return Object.hasOwn(STATUSES, status) ? STATUSES[status] : '';
}

export function wallClock(date, timeZone = EASTERN) {
  return new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'medium', timeZone }).format(date);
}

// The viewer uses a calendar date and a clock in the conference's time zone.
// Convert with the zone's date-specific offset so November's DST change is safe.
export function reportTimestamp(day, time, zone) {
  if (!ZONES[zone] || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) return null;
  const wall = day + 'T' + time + (time.length === 5 ? ':00' : '');
  const asUtc = new Date(wall + 'Z');
  if (!Number.isFinite(asUtc.valueOf())) return null;
  const offset = new Intl.DateTimeFormat('en', { timeZone: ZONES[zone], timeZoneName: 'longOffset' })
    .formatToParts(asUtc).find(part => part.type === 'timeZoneName')?.value;
  const result = new Date(wall + (offset?.slice(3) || 'Z'));
  return Number.isFinite(result.valueOf()) ? result.toISOString() : null;
}

function conferenceTeam(team) {
  if (!team || !Array.isArray(team.rows) || !team.rows.length) return null;
  const school = collegeTeam(team.teamDisplayName || team.teamName);
  const players = [];
  for (const row of team.rows) {
    const status = availabilityStatus(row?.status);
    const match = /^([A-Z0-9/-]+)\s+(?:#\d+\s+)?([^#].*)$/.exec(text(row?.name));
    // Exempt players sit outside the published designations. An unexpected
    // shape or label invalidates this team rather than declaring it healthy.
    if (status === 'Exempt') continue;
    if (!status || !match) return null;
    players.push({ player: text(match[2], 75), position: text(match[1], 8), status });
  }
  return school && players.length ? { school, players } : null;
}

export function conferenceReports(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Unexpected conference feed');
  const games = [];
  for (const report of Object.values(payload)) {
    if (!Array.isArray(report?.games) || report.games.length !== 2) continue;
    const published = reportTimestamp(report.publishDate, report.postedTime, report.conferenceTimeZone);
    const date = report.footer?.date;
    const teams = report.games.map(conferenceTeam);
    if (!published || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !teams.every(Boolean)) continue;
    games.push({ date, zone: ZONES[report.conferenceTimeZone], published, teams,
      stage: ({ Initial: 'Initial report', 'Update 1': 'Update 1', 'Update 2': 'Update 2', 'Game Day': 'Game-day report' })[report.ReportType] || 'Availability report' });
  }
  if (!games.length && Object.keys(payload).length) throw new Error('No valid conference reports');
  return games;
}

export function jsonConferenceReports(payload) {
  if (!Array.isArray(payload?.games)) throw new Error('Unexpected conference feed');
  return payload.games.flatMap(report => {
    const published = new Date(report.updatedAtUTC || '');
    const kickoff = Date.parse(report.kickoffUTC);
    const teams = [report.away, report.home].map(team => {
      const school = collegeTeam(team?.name);
      const players = (Array.isArray(team?.players) ? team.players : []).map(row => ({
        player: text(row?.name, 75), position: text(row?.position, 8), status: availabilityStatus(row?.status)
      }));
      // For these feeds an empty array can mean that team's report is pending.
      const valid = players.length && players.every(row => row.player && row.status);
      return { school, players: valid ? players.filter(row => row.status !== 'Exempt') : null };
    });
    if (!Number.isFinite(kickoff) || !Number.isFinite(published.valueOf()) || !teams.every(team => team.school)) return [];
    return [{ kickoff, published: published.toISOString(), stage: text(report.notes, 45), teams }];
  });
}

export function conferenceFixture(games, kickoff, schools, now = Date.now()) {
  return games.filter(game => {
    const sameDate = game.kickoff != null ? Math.abs(kickoff.valueOf() - game.kickoff) <= 3600000 :
      [wallClock(kickoff, game.zone), wallClock(kickoff)].some(date => game.date === date.slice(0, 10));
    return sameDate && Date.parse(game.published) <= now + 60000 &&
      schools.every(school => game.teams.some(team => team.school === school));
  }).sort((first, second) => second.published.localeCompare(first.published))[0];
}

export function collegeConferences(value) {
  return [...new Set(String(value || '').split(','))].filter(id => Object.hasOwn(SOURCE, id)).slice(0, 2);
}

export async function liveConferenceReport(context, id, kickoff, schools) {
  const feed = await availabilityFeed(context, 'cfb-conference-v1-' + id, 45, async () => {
    if (CONFERENCE_JSON[id]) {
      const response = await availabilityResponse(CONFERENCE_JSON[id], { cache: 'no-store' });
      return jsonConferenceReports(await response.json());
    }
    const response = await availabilityResponse(VIEWER + 'get-publish-public', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sport: 'Football', organization: id, conference: id })
    });
    return conferenceReports(await response.json());
  });
  const game = conferenceFixture(feed.data, kickoff, schools);
  if (!game) return null;
  const [sources, source_url] = SOURCE[id];
  const reports = Object.fromEntries(schools.flatMap((school, index) => {
    const team = game.teams.find(entry => entry.school === school);
    if (!team.players) return [];
    return [[index === 0 ? 'away' : 'home', {
      players: team.players.filter(entry => entry.status !== 'Available'),
      sources, source_url, stage: game.stage, published_at_utc: game.published,
      checked_at_utc: feed.checked_at_utc, coverage: 'official'
    }]];
  }));
  return Object.keys(reports).length ? reports : null;
}
