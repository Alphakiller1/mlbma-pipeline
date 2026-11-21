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
  appalachianstate: 'appstate', massachusetts: 'umass', armywestpoint: 'army',
  niu: 'northernillinois'
};
const STATUSES = {
  available: 'Available', probable: 'Probable', questionable: 'Questionable', doubtful: 'Doubtful',
  gametimedecision: 'Game Time Decision', gtd: 'Game Time Decision', out: 'Out',
  out1sthalf: 'Out (1st Half)', outfirsthalf: 'Out (1st Half)', outforseason: 'Out For Season',
  ofs: 'Out For Season', outindefinitely: 'Out Indefinitely', suspended: 'Suspended', susp: 'Suspended',
  injuredreserve: 'IR', ir: 'IR', exempt: 'Exempt', outseason: 'Out For Season', outgame: 'Out'
};
const SOURCE = {
  SEC: ['SEC', 'https://www.secsports.com/fbreports'],
  ACC: ['ACC', 'https://theacc.com/sports/2025/8/28/availability-reporting-football.aspx'],
  B12: ['Big 12', 'https://big12sports.com/FBReporting'],
  B10: ['Big Ten', 'https://bigten.org/fb/availability-reports/'],
  SBC: ['Sun Belt', 'https://sunbeltsports.org/news/2025/8/11/football-availability-report-new.aspx'],
  P12: ['Pac-12', 'https://pac-12.com/news/2026/9/11/2026-football-reports.aspx'],
  American: ['American Conference', 'https://theamerican.org/sports/2026/8/6/football_player_availability.aspx'],
  MAC: ['Mid-American Conference', 'https://getsomemaction.com/sports/2026/7/28/FB_0728265050.aspx.aspx'],
  MW: ['Mountain West', 'https://themw.com/sports/2026/8/21/football_reports.aspx'],
  CUSA: ['Conference USA', 'https://conferenceusa.com/sports/2025/8/23/FB_0823254134.aspx']
};
const CONFERENCE_JSON = {
  SBC: 'https://sbcautostorage.blob.core.windows.net/availability-reports/sunbelt-football/prod/report.json',
  P12: 'https://sbcautostorage.blob.core.windows.net/availability-reports/pac12-football/prod/report.json'
};
const FAKTOR_CONFERENCES = new Set(['MW', 'CUSA']);

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
  // A morning post can read "9:00:00" (the American's game-day schedule).
  time = typeof time === 'string' ? time.replace(/^(\d):/, '0$1:') : time;
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
  const school = schoolKey(team.teamDisplayName, team.teamName);
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

function schoolKey(display, name) {
  return collegeTeam(collegeTeam(name) === 'miamioh' ? name : display || name);
}

export function conferenceReports(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Unexpected conference feed');
  const games = [];
  for (const report of Object.values(payload)) {
    if (!Array.isArray(report?.games) || report.games.length !== 2) continue;
    // A report the conference has scheduled but not posted: when it is due,
    // never a report (no players, never matched as one).
    if (report.ReportType === 'Report Pending') {
      const due = reportTimestamp(report.publishDate, report.postedTime, report.conferenceTimeZone);
      const schools = report.games.map(team => schoolKey(team?.teamDisplayName, team?.teamName));
      if (due && /^\d{4}-\d{2}-\d{2}$/.test(report.footer?.date || '') && schools.every(Boolean)) {
        games.push({ date: report.footer.date, zone: ZONES[report.conferenceTimeZone], due, pending: true,
          teams: schools.map(school => ({ school, players: null })) });
      }
      continue;
    }
    const published = reportTimestamp(report.publishDate, report.postedTime, report.conferenceTimeZone);
    const date = report.footer?.date;
    const teams = report.games.map(conferenceTeam);
    if (!published || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !teams.every(Boolean)) continue;
    games.push({ date, zone: ZONES[report.conferenceTimeZone], published, teams,
      stage: ({ Initial: 'Initial report', 'Update 1': 'Update 1', 'Update 2': 'Update 2', 'Game Day': 'Game-day report' })[report.ReportType] || 'Availability report' });
  }
  if (!games.some(game => !game.pending) && Object.values(payload).some(report => report?.ReportType !== 'Report Pending')) {
    throw new Error('No valid conference reports');
  }
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

function htmlText(raw) {
  const entities = { amp: '&', apos: "'", lt: '<', gt: '>', quot: '"', nbsp: ' ' };
  return String(raw || '').replace(/<[^>]+>/g, '').replace(/&(#x[0-9a-f]+|#\d+|\w+);/ig, (entity, code) => {
    if (code[0] !== '#') return Object.hasOwn(entities, code) ? entities[code] : entity;
    const cp = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : entity;
  }).trim();
}

export function faktorReports(html) {
  const games = [];
  for (const [, card] of html.matchAll(/<article\b[^>]*data-availability-graphic-card[^>]*>([\s\S]*?)<\/article>/gi)) {
    const kickoff = Date.parse((/data-kickoff-at="([^"]+)"/.exec(card)?.[1] || '').replace(' ', 'T') + 'Z');
    const published = new Date((/data-updated-at="([^"]+)"/.exec(card)?.[1] || '').replace(' ', 'T') + 'Z');
    const stage = htmlText(/<h1>([\s\S]*?)<\/h1>/i.exec(card)?.[1]);
    const teams = [...card.matchAll(/<div class="availability-team-table" aria-label="([^"]+) availability">([\s\S]*?)<\/div>/gi)]
      .map(([, name, body]) => {
        const players = [];
        for (const [, group] of body.matchAll(/<tbody class="availability-status-section">([\s\S]*?)<\/tbody>/gi)) {
          const status = availabilityStatus(htmlText(/<th\b[^>]*>([\s\S]*?)<\/th>/i.exec(group)?.[1]));
          if (!status) return null;
          for (const [, row] of group.matchAll(/<tr class="availability-player-row">([\s\S]*?)<\/tr>/gi)) {
            const player = htmlText(/<td class="player-cell"[^>]*>([\s\S]*?)<\/td>/i.exec(row)?.[1]);
            const position = htmlText(/<td class="position-cell"[^>]*>([\s\S]*?)<\/td>/i.exec(row)?.[1]);
            if (!player) return null;
            players.push({ player: text(player, 75), position: text(position, 8), status });
          }
        }
        return { school: collegeTeam(htmlText(name)), players: players.length ? players : null };
      });
    if (teams.length === 2 && teams.every(team => team?.school) && Number.isFinite(kickoff) &&
        Number.isFinite(published.valueOf())) games.push({ kickoff, published: published.toISOString(), stage, teams });
  }
  if (!games.length && !/\bNO REPORTS\b/i.test(html)) throw new Error('Unexpected public availability report');
  return games;
}

async function hdReport(id, endpoint) {
  const response = await availabilityResponse(VIEWER + endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sport: 'Football', organization: id, conference: id })
  });
  return response.json();
}

async function currentConferenceReports(id) {
  if (CONFERENCE_JSON[id]) {
    const response = await availabilityResponse(CONFERENCE_JSON[id], { cache: 'no-store' });
    return jsonConferenceReports(await response.json());
  }
  if (FAKTOR_CONFERENCES.has(id)) {
    const hub = SOURCE[id][1];
    const headers = { 'user-agent': 'ChaseAnalytics/1.0 (+https://chase-analytics.com)', accept: 'text/html' };
    const source = await availabilityResponse(hub, { headers });
    const link = /<iframe\b[^>]*\bsrc="(https:\/\/faktorsports\.com\/k\/embed\/player-availability\/[^"]+)"/i.exec(await source.text())?.[1];
    if (!link) throw new Error('Missing public availability viewer');
    const response = await availabilityResponse(htmlText(link), {
      headers: { ...headers, referer: new URL(hub).origin + '/' }, redirect: 'manual'
    });
    return faktorReports(await response.text());
  }
  return conferenceReports(await hdReport(id, 'get-publish-public'));
}

export function archiveFixture(payload, kickoff, schools) {
  if (!Array.isArray(payload?.data)) throw new Error('Unexpected availability archive');
  const days = [wallClock(kickoff), wallClock(kickoff, ZONES.CT), wallClock(kickoff, ZONES.PT)].map(day => day.slice(0, 10));
  return schools.map((school, index) => {
    const players = [];
    const opponent = schools[1 - index];
    for (const row of payload.data) {
      const day = new Date(row.Week);
      const team = schoolKey(row.TeamDisplay, row.Team);
      const opponentName = schoolKey(
        text(row.OpponentDisplay).replace(/^(?:at|vs\.?)\s+/i, ''),
        text(row.Opponent).replace(/^(?:at|vs\.?)\s+/i, '')
      );
      const status = availabilityStatus(row['Game Day']);
      if (team !== school || opponentName !== opponent || !Number.isFinite(day.valueOf()) ||
          !days.includes(day.toISOString().slice(0, 10)) || !status || status === 'Exempt') continue;
      const player = text(row.Player, 75);
      if (player) players.push({ player, status });
    }
    return { school, players: players.length ? players : null };
  });
}

function sameFixture(game, kickoff, schools) {
  const sameDate = game.kickoff != null ? Math.abs(kickoff.valueOf() - game.kickoff) <= 3600000 :
    [wallClock(kickoff, game.zone), wallClock(kickoff)].some(date => game.date === date.slice(0, 10));
  return sameDate && schools.every(school => game.teams.some(team => team.school === school));
}

// When the conference has said this fixture's report is due, or null.
export function pendingFixture(games, kickoff, schools) {
  return games.find(game => game.pending && sameFixture(game, kickoff, schools))?.due || null;
}

export function conferenceFixture(games, kickoff, schools, now = Date.now()) {
  return games.filter(game => {
    if (game.pending) return false;
    const sameDate = game.kickoff != null ? Math.abs(kickoff.valueOf() - game.kickoff) <= 3600000 :
      [wallClock(kickoff, game.zone), wallClock(kickoff)].some(date => game.date === date.slice(0, 10));
    return sameDate && Date.parse(game.published) <= now + 60000 &&
      schools.every(school => game.teams.some(team => team.school === school));
  }).sort((first, second) => second.published.localeCompare(first.published))[0];
}

export function collegeConferences(value) {
  return [...new Set(String(value || '').split(','))].filter(id => Object.hasOwn(SOURCE, id)).slice(0, 2);
}

function conferenceFeed(context, id) {
  return availabilityFeed(context, 'cfb-conference-v3-' + id, 45, () => currentConferenceReports(id));
}

// When a conference's pending report for the fixture is due (its cached feed), or null.
export async function conferenceReportDue(context, id, kickoff, schools) {
  return pendingFixture((await conferenceFeed(context, id)).data, kickoff, schools);
}

export async function liveConferenceReport(context, id, kickoff, schools) {
  const feed = await conferenceFeed(context, id);
  let game = conferenceFixture(feed.data, kickoff, schools);
  let checkedAt = feed.checked_at_utc;
  if (!game && kickoff <= Date.now() && !CONFERENCE_JSON[id] && !FAKTOR_CONFERENCES.has(id)) {
    const archive = await availabilityFeed(context, 'cfb-archive-v1-' + id, 300,
      () => hdReport(id, 'get-archive-public'));
    game = { teams: archiveFixture(archive.data, kickoff, schools), stage: 'Archived game-day report' };
    checkedAt = archive.checked_at_utc;
  }
  if (!game) return null;
  const [sources, source_url] = SOURCE[id];
  const reports = Object.fromEntries(schools.flatMap((school, index) => {
    const team = game.teams.find(entry => entry.school === school);
    if (!team.players) return [];
    return [[index === 0 ? 'away' : 'home', {
      players: team.players.filter(entry => entry.status !== 'Available'),
      sources, source_url, stage: game.stage, published_at_utc: game.published,
      checked_at_utc: checkedAt, coverage: 'official'
    }]];
  }));
  return Object.keys(reports).length ? reports : null;
}
