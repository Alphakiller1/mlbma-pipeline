import { json } from '../_shared/http.js';
import { availabilityFeed, availabilityResponse } from '../_shared/availability_cache.js';
import { availabilityStatus, collegeConferences, collegeTeam, conferenceReportDue, liveConferenceReport, wallClock } from '../_shared/college_availability.js';

const ROTO_REPORT = 'https://www.rotowire.com/cfootball/injury-report.php';
const ROTO_FEED = 'https://www.rotowire.com/cfootball/tables/injury-report.php?team=ALL&pos=ALL';
const DAY = 86400000;

export function rotowireFixture(rows, kickoff, schools) {
  if (!Array.isArray(rows)) throw new Error('Unexpected RotoWire feed');
  const date = wallClock(kickoff).slice(0, 16);
  const reports = {};
  schools.forEach((school, index) => {
    const players = [];
    for (const row of rows) {
      if (collegeTeam(row?.RotoSchoolName || row?.team) !== school ||
          String(row.game_datetime || '').slice(0, 16) !== date) continue;
      const status = availabilityStatus(row.IR);
      if (!status || status === 'Exempt' || typeof row.player !== 'string' || !row.player.trim()) continue;
      players.push({ player: row.player.trim().slice(0, 75), status,
        position: String(row.position || '').slice(0, 8), injury: String(row.injury_type || '').slice(0, 80) || null });
    }
    if (players.length) reports[index === 0 ? 'away' : 'home'] = players;
  });
  return reports;
}

export async function onRequestGet(context) {
  const query = new URL(context.request.url).searchParams;
  const schools = ['away', 'home'].map(side => collegeTeam(query.get(side)));
  const kickoff = new Date(query.get('kickoff') || '');
  const delta = kickoff.valueOf() - Date.now();
  if (!Number.isFinite(delta) || !schools.every(Boolean) || schools[0] === schools[1]) {
    return json({ status: 'invalid_fixture' }, 400);
  }
  if (delta > 7 * DAY || delta < -14 * DAY) return json({ status: 'not_published' });
  const conferences = collegeConferences(query.get('conferences'));
  const official = await Promise.allSettled(conferences.map(id => liveConferenceReport(context, id, kickoff, schools)));
  const reports = {};
  // Which source could not be read, and why: the reader sees "refresh
  // unavailable"; this names the conference feed that failed.
  const issues = {};
  official.forEach((result, index) => {
    if (result.status === 'rejected') issues[conferences[index]] = String(result.reason?.message || result.reason).slice(0, 120);
  });
  const extra = Object.keys(issues).length ? { issues } : {};
  for (const result of official) {
    if (result.status !== 'fulfilled' || !result.value) continue;
    for (const [side, report] of Object.entries(result.value)) {
      if (!reports[side] || reports[side].published_at_utc < report.published_at_utc) reports[side] = report;
    }
  }
  if (reports.away && reports.home) return json({ status: 'ok', reports, ...extra });
  // A report the conference has scheduled: when it is due.
  const due = (await Promise.allSettled(conferences.map(id => conferenceReportDue(context, id, kickoff, schools))))
    .map(result => result.status === 'fulfilled' ? result.value : null).filter(Boolean).sort()[0];
  if (due) extra.due_at_utc = due;

  // The secondary table describes an upcoming matchup window. Its date is
  // kickoff, so never present it as the time the injury status was published.
  if (delta >= -8 * 3600000) {
    try {
      const feed = await availabilityFeed(context, 'cfb-rotowire-v1', 45, async () => {
        const response = await availabilityResponse(ROTO_FEED);
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error('Unexpected RotoWire feed');
        return rows;
      });
      const entries = rotowireFixture(feed.data, kickoff, schools);
      for (const [side, players] of Object.entries(entries)) {
        reports[side] ||= {
          players, sources: 'RotoWire', source_url: ROTO_REPORT, coverage: 'secondary',
          checked_at_utc: feed.checked_at_utc
        };
      }
    } catch (_) { return json({ status: 'unavailable', reports, ...extra }); }
  }
  const status = official.some(result => result.status === 'rejected') ? 'unavailable' : 'not_published';
  return json({ status, reports, ...extra });
}
