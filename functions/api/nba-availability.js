import { getDocumentProxy } from 'unpdf';
import { json } from '../_shared/http.js';
import { availabilityFeed, availabilityResponse } from '../_shared/availability_cache.js';
import { reportTimestamp, wallClock } from '../_shared/college_availability.js';

const NBA_OFFICIAL = 'https://official.nba.com/nba-injury-report-';
const STATUSES = new Set(['Out', 'Doubtful', 'Questionable', 'Probable', 'Available']);
const CLUB_CODES = { GSW: 'GS', NYK: 'NY', NOP: 'NO', SAS: 'SA', UTA: 'UTAH', WAS: 'WSH', BRK: 'BKN', PHO: 'PHX' };
const COLUMN_LABELS = ['Game', 'Matchup', 'Team', 'Player', 'Current', 'Reason'];
const DAY = 86400000;

const clubCode = code => CLUB_CODES[code] || code;
const clubName = name => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^losangelesclippers$/, 'laclippers');
const pair = value => value.split('@').map(clubCode).join('@');
const isoDate = value => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  return m ? m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0') : '';
};

export function nbaReportLinks(html, now = Date.now()) {
  const links = new Map();
  for (const [url, day, hour, minute, meridiem] of html.matchAll(
    /https:\/\/ak-static\.cms\.nba\.com\/referee\/injury\/Injury-Report_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})(AM|PM)\.pdf/g
  )) {
    const hh = String(Number(hour) % 12 + (meridiem === 'PM' ? 12 : 0)).padStart(2, '0');
    const published = reportTimestamp(day, hh + ':' + minute, 'ET');
    if (published && Date.parse(published) <= now + 60000) links.set(url, { url, day, published });
  }
  return [...links.values()].sort((a, b) => b.published.localeCompare(a.published));
}

function reportLines(words, bounds) {
  const rows = new Map();
  const footer = words.find(word => word.str === 'Page');
  const heading = words.find(word => word.str === 'Injury');
  for (const word of words) {
    if (!word.str?.trim() || !word.transform) continue;
    const [, , , , x, y] = word.transform;
    if ((footer && y <= footer.transform[5]) || (heading && y >= heading.transform[5])) continue;
    const column = bounds.findLastIndex(left => left <= x);
    if (column < 0) continue;
    const row = Math.round(y * 10) / 10;
    if (!rows.has(row)) rows.set(row, bounds.map(() => []));
    rows.get(row)[column].push({ x, text: word.str.trim() });
  }
  return [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([y, columns]) => [y, columns.map(
    column => column.sort((a, b) => a.x - b.x).map(word => word.text).join(' ')
  )]);
}

// The PDF prints a date, matchup and club once per block. Reasons can wrap
// above and below the player row, or a club can explicitly be pending.
export function parseNbaReport(pages) {
  const words = pages[0] || [];
  const bounds = COLUMN_LABELS.map(label => words.find(word => word.str?.trim().split(' ')[0] === label)?.transform?.[4] - 2);
  if (bounds.some((bound, i) => !Number.isFinite(bound) || (i && bound <= bounds[i - 1]))) {
    throw new Error('NBA injury report layout is unavailable');
  }
  const fixtures = {};
  let match, team, date;
  for (const page of pages) {
    const reasons = [], players = [];
    for (const [y, [day, matchup, club, name, status, reason]] of reportLines(page, bounds)) {
      if (matchup === 'Matchup') continue;
      const gameDay = isoDate(day.trim().split(/\s/)[0]);
      if (gameDay) date = gameDay;
      if (/^[A-Z]{2,4}@[A-Z]{2,4}$/.test(matchup) && date) {
        const key = date + '/' + pair(matchup);
        match = fixtures[key] ||= {};
        team = null;
      }
      if (club && match) team = match[clubName(club)] ||= { players: [], reported: false, invalid: false };
      if (team && name && STATUSES.has(status)) {
        const [last, first] = name.split(/,\s*/, 2);
        const row = { player_name: (first ? first + ' ' + last : name).trim(), status, fragments: [[y, reason]] };
        team.reported = true;
        team.players.push(row);
        players.push({ y, row });
      } else if (team && !name && /^no injuries(?: to report)?\.?$/i.test(reason)) {
        team.reported = true;
      } else if (!name && reason && reason !== 'NOT YET SUBMITTED') {
        reasons.push({ y, reason });
      } else if (team && name && status && !STATUSES.has(status)) {
        team.invalid = true;
      }
    }
    for (const fragment of reasons) {
      const nearest = players.filter(p => Math.abs(p.y - fragment.y) <= 12)
        .sort((a, b) => Math.abs(a.y - fragment.y) - Math.abs(b.y - fragment.y))[0];
      if (nearest) nearest.row.fragments.push([fragment.y, fragment.reason]);
    }
  }
  for (const fixture of Object.values(fixtures)) {
    for (const [club, team] of Object.entries(fixture)) {
      if (!team.reported || team.invalid) {
        delete fixture[club];
        continue;
      }
      fixture[club] = team.players.map(row => ({
        player_name: row.player_name, status: row.status, source: 'official',
        reason: row.fragments.sort((a, b) => b[0] - a[0]).map(([, text]) => text).filter(Boolean)
          .join(' ').replace(/(\w)- (\w)/g, '$1-$2').slice(0, 160)
      }));
    }
  }
  return fixtures;
}

async function readPdf(url) {
  const response = await availabilityResponse(url);
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.length > 2000000 || String.fromCharCode(...body.slice(0, 4)) !== '%PDF') throw new Error('Invalid NBA report PDF');
  const doc = await getDocumentProxy(body);
  try {
    if (doc.numPages < 1 || doc.numPages > 25) throw new Error('NBA report page count is unavailable');
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) pages.push((await (await doc.getPage(i)).getTextContent()).items);
    return parseNbaReport(pages);
  } finally {
    await doc.cleanup();
  }
}

export async function onRequestGet(context) {
  const query = new URL(context.request.url).searchParams;
  const clubs = ['away', 'home'].map(side => clubCode(query.get(side)));
  const names = ['away_name', 'home_name'].map(side => clubName(query.get(side)));
  const time = Date.parse(query.get('kickoff'));
  if (!Number.isFinite(time) || !clubs.every(code => /^[A-Z]{2,4}$/.test(code || '')) || clubs[0] === clubs[1] ||
      !names.every(Boolean)) return json({ status: 'invalid_fixture' }, 400);
  const now = Date.now();
  if (time < now - 7 * DAY || time > now + 2 * DAY) return json({ status: 'not_published' });
  const kickoff = new Date(time);
  const day = wallClock(kickoff).slice(0, 10);
  const previous = wallClock(new Date(time - DAY)).slice(0, 10);
  const start = kickoff.getUTCFullYear() - (kickoff.getUTCMonth() < 7 ? 1 : 0);
  const missing = { status: 'not_published', reports: {} };
  try {
    const index = await availabilityFeed(context, 'nba-report-index-v1-' + start, 45, async () => {
      const url = NBA_OFFICIAL + start + '-' + String(start + 1).slice(-2) + '-season/';
      return nbaReportLinks(await (await availabilityResponse(url)).text());
    });
    // The reports include upcoming games before midnight. For an earlier
    // game, keep the reports from its own date and the final through tip.
    const candidates = index.data.filter(doc => doc.day >= previous && doc.day <= day).slice(0, 2);
    const reports = {};
    let failed = false;
    for (const source of candidates) {
      try {
        const feed = await availabilityFeed(context, 'nba-report-v1-' + source.published, 120, () => readPdf(source.url));
        const report = feed.data[day + '/' + clubs.join('@')];
        names.forEach((name, index) => {
          const side = index === 0 ? 'away' : 'home';
          if (!reports[side] && report?.[name]) reports[side] = {
            players: report[name], coverage: 'official', sources: 'NBA official injury report',
            source_url: source.url, published_at_utc: source.published, checked_at_utc: feed.checked_at_utc
          };
        });
        // Once a valid edition covers this game, a pending team in it is
        // still pending. An older edition cannot speak for that club.
        if (report) break;
      } catch (_) { failed = true; }
    }
    return json({ status: reports.away && reports.home ? 'ok' : (failed ? 'unavailable' : 'not_published'), reports });
  } catch (_) {
    return json({ ...missing, status: 'unavailable' });
  }
}
