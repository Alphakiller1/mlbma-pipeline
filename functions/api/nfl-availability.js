import { json } from '../_shared/http.js';
import { availabilityFeed, availabilityResponse } from '../_shared/availability_cache.js';
import { nflPracticeUrl, parseNflPractice, nflPostPracticeUpdate } from '../_shared/nfl_practice.js';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=';
const ESPN_INJURIES = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries';
const NFL = 'https://www.nfl.com/injuries/league/';
const TEAM_ALIASES = { WAS: 'WSH', AZ: 'ARI', JAC: 'JAX' };
const PRACTICE = {
  'did not participate in practice': ['Did Not Practice', 'DNP'],
  'limited participation in practice': ['Limited Practice', 'Limited'],
  'full participation in practice': ['', 'Full']
};
const GAME_STATUS = { out: 'Out', doubtful: 'Doubtful', questionable: 'Questionable' };
const ROSTER = /^(injured reserve|ir|pup|physically unable to perform|suspended|suspension|non.football (injury|illness))$/i;
const HOUR = 3600000;

const teamCode = code => TEAM_ALIASES[code] || code;
const playerKey = name => (String(name || '').normalize('NFKD').toLowerCase().match(/[a-z0-9]+/g) || [])
  .join('').replace(/(?:jr|sr|ii|iii|iv)$/, '');
const htmlText = value => String(value || '').replace(/<[^>]+>/g, ' ')
  .replace(/&(?:rsquo|apos|#39);/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();

export function officialNflReports(html) {
  const fixtures = {};
  const units = html.split('<section class="nfl-o-injury-report__unit">').slice(1);
  if (!units.length) throw new Error('NFL report layout unavailable');
  for (const section of units) {
    const chunk = section.split('</section>', 1)[0];
    const codes = [...chunk.matchAll(/nfl-c-matchup-strip__team-abbreviation">\s*([A-Z]{2,4})\s*</g)]
      .map(([, code]) => teamCode(code));
    const names = [...chunk.matchAll(/nfl-c-matchup-strip__team-fullname"[^>]*>\s*([^<]+?)\s*</g)]
      .map(([, name]) => htmlText(name));
    if (codes.length !== 2 || names.length !== 2) continue;
    const reports = {};
    for (const part of chunk.split('d3-o-section-sub-title"><span>').slice(1)) {
      const team = codes[names.indexOf(htmlText(part.split('</span>', 1)[0]))];
      if (!team) continue;
      const players = [];
      for (const [, row] of part.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(([, cell]) => htmlText(cell));
        if (cells.length !== 5 || !cells[0]) continue;
        const [name, position, detail, practiceText, statusText] = cells;
        const [practiceStatus, practice] = PRACTICE[practiceText.toLowerCase()] || [];
        const gameStatus = GAME_STATUS[statusText.toLowerCase()];
        players.push({ name, position, detail, practice: practice || null, status: gameStatus || practiceStatus || '' });
      }
      // NFL.com uses an identical empty card before a report is filed.
      if (players.length) reports[team] = players;
    }
    if (Object.keys(reports).length) fixtures[codes.join('@')] = reports;
  }
  return fixtures;
}

export function espnNflFixture(payload) {
  const header = payload?.header;
  const competition = header?.competitions?.[0];
  const listed = (competition?.competitors || []).map(club => teamCode(club.team?.abbreviation));
  const kickoff = Date.parse(competition?.date);
  if (!listed.every(Boolean) || listed.length !== 2 || !Number.isFinite(kickoff)) throw new Error('Unexpected ESPN fixture');
  const injuries = {};
  for (const block of payload.injuries || []) {
    const code = teamCode(block.team?.abbreviation);
    if (!listed.includes(code) || !Array.isArray(block.injuries)) continue;
    injuries[code] = block.injuries.flatMap(row => {
      const name = row?.athlete?.displayName;
      const ts = Date.parse(row?.date);
      const status = String(row?.status || '');
      if (!name || !(ts <= Math.min(Date.now() + 60000, kickoff + 20 * 60000))) return [];
      const inactive = row.details?.fantasyStatus?.description === 'INACTIVE' && ts >= kickoff - 3 * HOUR;
      const roster = ROSTER.test(status);
      if (!inactive && !roster && (!GAME_STATUS[status.toLowerCase()] || ts < kickoff - 72 * HOUR)) return [];
      return [{ name, position: row.athlete.position?.abbreviation || '', status: inactive ? 'Inactive' : status,
        detail: [row.details?.side, row.details?.type, row.details?.detail].filter(part => part && part !== 'Not Specified')
          .filter((part, i, all) => all.indexOf(part) === i).join(' '),
        updated_at_utc: new Date(ts).toISOString(), inactive, roster }];
    });
  }
  return { year: Number(header.season?.year), kind: ['', 'pre', 'reg', 'post'][header.season?.type],
    week: Number(header.week), listed, kickoff, injuries };
}

export function espnNflLeagueUpdates(payload) {
  const reports = {};
  for (const club of payload.injuries || []) {
    for (const row of club.injuries || []) {
      const code = teamCode(row.athlete?.team?.abbreviation || club.team?.abbreviation);
      const name = row.athlete?.displayName, status = String(row.status || ''), stamp = Date.parse(row.date);
      if (!/^[A-Z]{2,3}$/.test(code || '') || !name || !Number.isFinite(stamp) || stamp > Date.now() + 60000 ||
          (!ROSTER.test(status) && !GAME_STATUS[status.toLowerCase()])) continue;
      const announced = /downgraded to out|ruled out|will not play|won.t play|\bplaced\b.{0,120}\binjured reserve\b/i.test(row.shortComment || '');
      (reports[code] ||= []).push({ name, status, position: row.athlete?.position?.abbreviation || '',
        updated_at_utc: new Date(stamp).toISOString(), roster: ROSTER.test(status),
        ...(announced ? { announced_out: true } : {}) });
    }
  }
  return reports;
}

export function mergeNflReports(official, updates, practices = {}, kickoff) {
  const rows = new Map((official || []).map(row => [playerKey(row.name), row]));
  // A report clearing every player is still authoritative for this fixture.
  const hasOfficial = Array.isArray(official);
  for (const next of updates || []) {
    const key = playerKey(next.name), prior = rows.get(key);
    const newer = nflPostPracticeUpdate(next, practices[key] || Object.values(practices)[0], kickoff);
    if (next.inactive || (next.roster && (!prior || newer)) ||
        ((!hasOfficial || newer) && !next.roster && GAME_STATUS[next.status.toLowerCase()])) {
      rows.set(key, { ...prior, ...next, practice: prior?.practice || null,
        announced_out: Boolean(next.announced_out || next.inactive || /^Out$/i.test(next.status)) });
    }
  }
  const fallback = Object.values(practices)[0];
  return [...rows.values()].filter(row => row.status).map(row => ({ ...row,
    ...(practices[playerKey(row.name)] ? { practice_report: practices[playerKey(row.name)] } :
      fallback ? { practice_report: { listed: false, season: fallback.season, week: fallback.week,
        source_url: fallback.source_url, checked_at_utc: fallback.checked_at_utc, history: [] } } : {}) }));
}

export async function onRequestGet(context) {
  const query = new URL(context.request.url).searchParams;
  const id = query.get('game');
  const teams = ['away', 'home'].map(side => teamCode(query.get(side)));
  const kickoff = Date.parse(query.get('kickoff') || '');
  const delta = kickoff - Date.now();
  if (!/^\d{8,10}$/.test(id || '') || !teams.every(code => /^[A-Z]{2,3}$/.test(code || '')) ||
      teams[0] === teams[1] || !Number.isFinite(kickoff)) return json({ status: 'invalid_fixture' }, 400);
  if (Math.abs(delta) > 7 * 24 * HOUR) return json({ status: 'not_published' });
  let failure = false;
  let espn, nfl, club, league, sourceUrl;
  try {
    espn = await availabilityFeed(context, 'nfl-fixture-v1-' + id, 45,
      async () => espnNflFixture(await (await availabilityResponse(ESPN + id)).json()));
  } catch (_) { failure = true; }
  if (espn?.data && (!teams.every(team => espn.data.listed.includes(team)) || Math.abs(espn.data.kickoff - kickoff) > HOUR)) {
    return json({ status: 'invalid_fixture' }, 400);
  }
  const year = espn?.data?.year || Number(query.get('season'));
  const week = espn?.data?.week || Number(query.get('week'));
  const kind = espn?.data?.kind || 'reg';
  if (Number.isInteger(year) && year >= 2020 && year <= new Date().getUTCFullYear() &&
      Number.isInteger(week) && week >= 1 && week <= 22 && (espn?.data || !espn)) {
    sourceUrl = NFL + year + '/' + kind + week;
    try {
      nfl = await availabilityFeed(context, 'nfl-report-v1-' + year + '-' + kind + week, 45, async () => {
        const upstream = await availabilityResponse(sourceUrl, { headers: { 'user-agent': 'ChaseAnalytics/1.0 (+https://chase-analytics.com)' } });
        return officialNflReports(await upstream.text());
      });
    } catch (_) { failure = true; }
  }
  const fixture = nfl?.data?.[teams.join('@')];
  try {
    league = await availabilityFeed(context, 'nfl-league-dated-updates-v1', 45, async () =>
      espnNflLeagueUpdates(await (await availabilityResponse(ESPN_INJURIES)).json()));
  } catch (_) { /* Keep the fixture and official reports when the news feed is unavailable. */ }
  if (Number.isInteger(year) && year >= 2020 && year <= new Date().getUTCFullYear() &&
      Number.isInteger(week) && week >= 1 && week <= 22) {
    for (const team of [teams[1], teams[0]]) {
      try {
        club = await availabilityFeed(context, 'nfl-practice-v1-' + year + '-' + kind + week + '-' + team, 300, async () => {
          const url = nflPracticeUrl(team, week, kind);
          const page = await availabilityResponse(url, { headers: { 'user-agent': 'ChaseAnalytics/1.0 (+https://chase-analytics.com)' } });
          const parsed = parseNflPractice(await page.text(), { season: year, week, kind, kickoff, sourceUrl: url });
          if (!teams.every(code => parsed[code])) throw new Error('Club report does not match fixture');
          return parsed;
        });
        break;
      } catch (_) { /* The league report remains usable when a club site is down. */ }
    }
  }
  const reports = {};
  teams.forEach((code, i) => {
    const official = fixture?.[code];
    const dated = new Map();
    for (const update of [...(espn?.data?.injuries?.[code] || []), ...(league?.data?.[code] || [])]) {
      const stamp = Date.parse(update.updated_at_utc);
      if (!(stamp <= Math.min(Date.now() + 60000, kickoff + 20 * 60000))) continue;
      const key = playerKey(update.name), prior = dated.get(key);
      if (!prior || stamp >= Date.parse(prior.updated_at_utc)) dated.set(key, update);
    }
    const updates = [...dated.values()];
    const players = mergeNflReports(official, updates, club?.data?.[code], kickoff);
    if (!official && !players.length) return;
    reports[i === 0 ? 'away' : 'home'] = {
      players,
      season: year, week, has_dated_updates: Boolean(league?.data),
      has_roster_updates: Array.isArray(espn?.data?.injuries?.[code]) || Array.isArray(league?.data?.[code]),
      coverage: official ? 'official' : 'secondary',
      sources: official ? 'NFL official report' + (club?.data?.[code] ? ' + club practice reports' : '') +
        (players.some(row => row.updated_at_utc) ? ' + ESPN matchup updates' : '') : 'ESPN matchup updates',
      source_url: official ? sourceUrl : 'https://www.espn.com/nfl/game/_/gameId/' + id,
      checked_at_utc: nfl?.checked_at_utc || espn?.checked_at_utc
    };
  });
  return json({ status: reports.away && reports.home ? 'ok' : (failure ? 'unavailable' : 'not_published'), reports });
}
