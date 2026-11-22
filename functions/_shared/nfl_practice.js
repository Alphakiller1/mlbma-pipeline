import clubs from './nfl_clubs.json' with { type: 'json' };

const names = Object.fromEntries(Object.entries(clubs).map(([code, row]) => [row[0], code]));
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const statuses = { FP: 'Full', LP: 'Limited', DNP: 'DNP' };
const text = html => String(html).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
  .replace(/&(?:rsquo|apos|#39);/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
export const nflPlayerKey = name => (String(name || '').normalize('NFKD').toLowerCase().match(/[a-z0-9]+/g) || [])
  .join('').replace(/(?:jr|sr|ii|iii|iv)$/, '');

export function nflPracticeUrl(team, week, kind = 'reg') {
  if (!clubs[team]) throw new Error('Unknown NFL club');
  return clubs[team][1] + '/team/injury-report/week/' + kind.toUpperCase() + '-' + week;
}

export function parseNflPractice(html, { season, week, kind = 'reg', kickoff, sourceUrl, checkedAt }) {
  const options = [...html.matchAll(/<option\b([^>]*)>/gi)];
  const selected = options.find(([, attrs]) => /\bselected(?:\s|=|$)/i.test(attrs));
  const value = selected?.[1].match(/\bvalue=["']([^"']+)["']/i)?.[1];
  if (!value || !value.toLowerCase().endsWith('/' + kind.toLowerCase() + '-' + week)) {
    throw new Error('Official club report is for a different week');
  }
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(kickoff));
  const gameDay = new Date(date + 'T12:00:00Z');
  const reports = {};
  for (const chunk of html.split(/<div\b[^>]*class=["'][^"']*\bnfl-o-injury-report__title\b[^"']*["'][^>]*>/i).slice(1)) {
    const before = chunk.split(/<table\b/i, 1)[0];
    const code = names[text(before)];
    const table = chunk.match(/<table\b[^>]*>([\s\S]*?)<\/table>/i)?.[1];
    if (!code || !table) continue;
    const headings = [...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(([, cell]) => text(cell));
    const practiceDays = headings.slice(3, -1).map(day => day.slice(0, 3));
    if (headings.slice(0, 3).join('|') !== 'Player|Position|Injury' || !practiceDays.length ||
        practiceDays.some(day => !days.includes(day))) continue;
    const players = {};
    for (const [, row] of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(([, cell]) => text(cell));
      if (cells.length !== headings.length || !cells[0]) continue;
      const history = practiceDays.map((day, i) => {
        const gap = (gameDay.getUTCDay() - days.indexOf(day) + 7) % 7 || 7;
        const stamp = new Date(gameDay.getTime() - gap * 86400000).toISOString().slice(0, 10);
        const raw = cells[i + 3];
        return { day, date: stamp, status: statuses[raw.toUpperCase()] || (/^(?:\(-\)|-|—)$/.test(raw) ? 'Not listed' : 'Pending') };
      });
      const known = history.filter(item => ['Full', 'Limited', 'DNP'].includes(item.status));
      const count = status => known.filter(item => item.status === status).length;
      players[nflPlayerKey(cells[0])] = {
        season, week, source_url: sourceUrl, checked_at_utc: checkedAt || new Date().toISOString(), history,
        participated: count('Full') + count('Limited'), full: count('Full'), limited: count('Limited'),
        dnp: count('DNP'), reported: known.length,
        last_practice: known.at(-1)?.status || null, last_practice_date: known.at(-1)?.date || null
      };
    }
    if (Object.keys(players).length) reports[code] = players;
  }
  if (!Object.keys(reports).length) throw new Error('No official club practice tables found');
  return reports;
}

// A Saturday downgrade may follow a Friday game designation. Retrieval time
// alone cannot establish that order; compare ESPN's dated update with the
// final scheduled practice day. Older stale designations remain suppressed.
export function nflPostPracticeUpdate(update, history, kickoff, now = Date.now()) {
  const finalDay = history?.history?.at(-1)?.date;
  if (!finalDay || !update?.updated_at_utc) return false;
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' })
    .format(new Date(finalDay + 'T12:00:00Z')));
  const offset = (12 - hour) * 3600000;
  const end = Date.parse(finalDay + 'T23:59:59Z') + offset;
  if (!Number.isFinite(end) || !(Date.parse(update.updated_at_utc) > end)) return false;
  if (Date.parse(update.updated_at_utc) > Math.min(now + 60000, Date.parse(kickoff) + 1200000)) return false;
  if (update.roster && !update.announced_out) return false;
  return true;
}
