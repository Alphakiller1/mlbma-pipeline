const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SCORE_BOARD = 'https://raw.githubusercontent.com/Alphakiller1/cbb-model-board/main/board.json';
const NOTE = 'Experimental score estimates based on completed team scores.';

function label(s) { return typeof s === 'string' && s.length > 0 && s.length <= 100; }

export function validateScoreBoard(board, fallback, now = Date.now()) {
  if (!board || board.schema !== 'chase-board/1' || board.sport !== 'cbb' || board.may_bet !== false ||
      !DAY.test(board.as_of_date || '') || !Array.isArray(board.games) || board.games.length > 1000) return null;
  const generated = Date.parse(board.generated_at_utc), cutoff = Date.parse(board.data_through_utc);
  const asOf = Date.parse(board.as_of_date);
  if (!Number.isFinite(asOf) || !Number.isFinite(generated) || !Number.isFinite(cutoff) ||
      generated > now + 300000 || generated < Date.parse(fallback.generated_at_utc) ||
      board.as_of_date < fallback.as_of_date || cutoff >= generated ||
      !/^chase-cbb-score-[a-z0-9-]+$/.test(board.method || '')) return null;
  const ids = new Set(), games = [];
  for (const row of board.games) {
    const { id, slate_date, kickoff_utc, projected_away, projected_home } = row;
    if (typeof id !== 'string' || !/^\d+$/.test(id) || ids.has(id) || !DAY.test(slate_date || '') ||
        slate_date < board.as_of_date || Date.parse(slate_date) - asOf >= 7 * 86400000 ||
        !Number.isFinite(Date.parse(kickoff_utc)) ||
        ![projected_away, projected_home].every(n => Number.isFinite(n) && n > 0 && n < 250) ||
        ![row.projected_total, row.model_margin].every(Number.isFinite) ||
        Math.abs(row.projected_total - projected_away - projected_home) > 1e-7 ||
        Math.abs(row.model_margin - projected_home + projected_away) > 1e-7 ||
        ![row.away, row.home, row.away_name, row.home_name].every(label)) return null;
    ids.add(id);
    const game = { id, slate_date, kickoff_utc, projected_away, projected_home,
      projected_total: row.projected_total, model_margin: row.model_margin, priced: false, evidence: NOTE };
    for (const side of ['away', 'home']) {
      game[side] = row[side];
      game[side + '_name'] = row[side + '_name'];
      const logo = row[side + '_logo'], color = row[side + '_color'], record = row[side + '_record'];
      game[side + '_logo'] = /^https:\/\/a\.espncdn\.com\/i\/teamlogos\/ncaa\/500\/\d+\.png$/.test(logo || '') ? logo : null;
      game[side + '_color'] = /^#[\da-f]{6}$/i.test(color || '') ? color : null;
      game[side + '_record'] = /^\d{1,2}[–-]\d{1,2}$/.test(record || '') ? record : null;
    }
    games.push(game);
  }
  return { schema: 'chase-board/1', sport: 'cbb', generated_at_utc: board.generated_at_utc,
    data_through_utc: board.data_through_utc, as_of_date: board.as_of_date,
    method: board.method, method_note: NOTE, may_bet: false, games };
}

export async function loadCbbScoreBoard(fallback) {
  try {
    const response = await fetch(SCORE_BOARD, {
      signal: AbortSignal.timeout(2500), cf: { cacheTtl: 60, cacheEverything: true }
    });
    const board = response.ok && validateScoreBoard((await response.json()).board, fallback);
    if (board) return { board, delivery: 'scheduled' };
  } catch (_) { /* The validated bundled board is the outage fallback. */ }
  return { board: fallback, delivery: 'bundled' };
}
