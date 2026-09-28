/**
 * GET /api/model-center/board?sport=mlb|nfl|wnba|cfb
 *
 * Public read-only proxy for the four producer boards. Keeping the sources
 * server-side gives the client one stable same-origin contract while allowing
 * each sport model to publish on its own cadence.
 *
 * Lines: a board game that carries no sportsbook line (the MLB board never
 * exports one; any model can fail to price when its Odds API quota runs dry)
 * takes DraftKings' quote for that game from ESPN's public scoreboard, which
 * names its provider. Only a DraftKings quote is used, only where the board has
 * none, and it is marked with its source; a board's own line is never replaced.
 */
import { json, errorResponse, HttpError } from '../../_shared/http.js';

const SPORTS = {
  mlb: ['MLB_MODEL_BOARD_URL', 'https://alphakiller1.github.io/mlb-model/board.json'],
  nfl: ['NFL_MODEL_BOARD_URL', 'https://alphakiller1.github.io/nfl-model/board.json'],
  wnba: ['WNBA_MODEL_BOARD_URL', 'https://alphakiller1.github.io/wnba-edge-model/board.json'],
  cfb: ['CFB_MODEL_BOARD_URL', 'https://alphakiller1.github.io/cfb-model/board.json']
};

const ESPN = {
  mlb: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard',
  nfl: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
  cfb: 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=400'
};

// Board codes -> ESPN codes where the two differ.
const ALIAS = {
  mlb: { KCR: 'KC', SDP: 'SD', SFG: 'SF', TBR: 'TB', WSN: 'WSH', CWS: 'CHW', OAK: 'ATH', AZ: 'ARI' },
  nfl: { WAS: 'WSH', LA: 'LAR', JAC: 'JAX', OAK: 'LV', SD: 'LAC' },
  cfb: {}
};

function num(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).trim().replace(/^[ouOU]/, '').replace('+', ''));
  return Number.isFinite(n) ? n : null;
}

function close(block, side, key) {
  const s = (block || {})[side] || {};
  return (s.close || {})[key] != null ? s.close[key] : (s.open || {})[key];
}

function norm(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function espnQuotes(sport, board) {
  const base = ESPN[sport];
  if (!base) return [];
  const urls = [base];
  const slate = String(board.slate_date || '').replace(/-/g, '');
  if (sport === 'mlb' && /^\d{8}$/.test(slate)) urls[0] = base + '?dates=' + slate;
  const out = [];
  const seen = new Set();
  for (const url of urls) {
    let data;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cf: { cacheTtl: 60 } });
      if (!res.ok) continue;
      data = await res.json();
    } catch (err) {
      continue;
    }
    const events = (data && data.events) || [];
    // Football boards run a week ahead of the scoreboard late in a week.
    const week = data && data.week && data.week.number;
    if (sport !== 'mlb' && week && urls.length === 1) {
      urls.push(base + (base.includes('?') ? '&' : '?') + 'week=' + (Number(week) + 1) +
        '&seasontype=' + ((data.season && data.season.type) || 2));
    }
    for (const event of events) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      const comp = (event.competitions || [])[0] || {};
      const quote = (comp.odds || []).find(o => String((o.provider || {}).name || '').toLowerCase() === 'draftkings');
      if (!quote) continue;
      const teams = {};
      (comp.competitors || []).forEach(c => { teams[c.homeAway] = c.team || {}; });
      if (!teams.home || !teams.away) continue;
      const homeSpread = num(close(quote.pointSpread, 'home', 'line'));
      out.push({
        home: [teams.home.abbreviation, teams.home.displayName, teams.home.location, teams.home.shortDisplayName],
        away: [teams.away.abbreviation, teams.away.displayName, teams.away.location, teams.away.shortDisplayName],
        commence_time: event.date || null,
        // Book spreads quote the handicap; the board's margin is the expected
        // home margin, the opposite sign. A run line (+/-1.5) is not a margin.
        margin: sport === 'mlb' || homeSpread == null ? null : -homeSpread,
        total: num(close((quote.total || {}), 'over', 'line')) != null
          ? num(close((quote.total || {}), 'over', 'line')) : num(quote.overUnder),
        home_moneyline: num(close(quote.moneyline, 'home', 'odds')),
        away_moneyline: num(close(quote.moneyline, 'away', 'odds'))
      });
    }
  }
  return out;
}

function sideKeys(sport, raw) {
  if (raw == null) return [];
  const values = typeof raw === 'string' ? [raw]
    : [raw.abbreviation, raw.abbr, raw.school, raw.name, raw.team];
  return values.filter(Boolean).map(v => {
    const code = String(v).toUpperCase();
    return norm((ALIAS[sport] || {})[code] || v);
  });
}

function matches(keys, names) {
  const pool = names.filter(Boolean).map(norm);
  return keys.some(k => k && pool.some(n => n === k || (k.length > 4 && n.startsWith(k))));
}

function hasLine(g) {
  const book = g.book || {};
  return g.market_margin != null || g.market_total != null || book.margin != null ||
    book.total != null || g.home_moneyline != null;
}

async function withLines(sport, board) {
  const games = board && Array.isArray(board.games) ? board.games : null;
  if (!games || !ESPN[sport] || games.every(hasLine)) return board;
  const quotes = await espnQuotes(sport, board);
  if (!quotes.length) return board;
  let filled = 0;
  games.forEach(g => {
    if (hasLine(g)) return;
    let away = g.away, home = g.home;
    if ((away == null || home == null) && typeof g.key === 'string' && g.key.includes('@')) {
      [away, home] = g.key.split('@').map(s => s.trim());
    }
    const awayKeys = sideKeys(sport, away), homeKeys = sideKeys(sport, home);
    const quote = quotes.find(q => matches(homeKeys, q.home) && matches(awayKeys, q.away));
    if (!quote) return;
    g.book = {
      name: 'DraftKings',
      margin: quote.margin,
      total: quote.total,
      home_moneyline: quote.home_moneyline,
      away_moneyline: quote.away_moneyline,
      commence_time: quote.commence_time,
      source: 'ESPN'
    };
    filled += 1;
  });
  if (filled) board.line_fill = { book: 'DraftKings', source: 'ESPN scoreboard', games: filled };
  return board;
}

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const sport = String(url.searchParams.get('sport') || 'mlb').toLowerCase();
    const source = SPORTS[sport];
    if (!source) throw new HttpError(400, 'bad_sport', 'sport must be mlb, nfl, wnba, or cfb');
    const boardUrl = (env && env[source[0]]) || source[1];
    // No `cache` option here: production runs on a Pages compat date older than
    // 2024-11-11, where the Workers runtime throws on that field and every sport
    // returned a 500. cacheTtl 0 keeps the edge from serving a stale board.
    const res = await fetch(boardUrl, { cf: { cacheTtl: 0 } });
    if (!res.ok) throw new HttpError(502, 'board_fetch_failed', 'Model board was not reachable');
    let board;
    try {
      board = await res.json();
    } catch (parseErr) {
      throw new HttpError(502, 'board_fetch_failed', 'Model board was not reachable');
    }
    try {
      board = await withLines(sport, board);
    } catch (fillErr) {
      // Lines are an enrichment; the board is served either way.
    }
    return json({ sport, schema: (board && board.schema) || 'chase-board/1', board });
  } catch (err) {
    return errorResponse(err);
  }
}
