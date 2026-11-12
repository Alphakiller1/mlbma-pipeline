/* Posted market numbers only: the opening and current point spread (home
   side) and total from ESPN's listed book (DraftKings when it is listed, else
   the first provider). Prices, links, moneylines and every model field stay
   upstream. Each sport has its own sane range, so a garbled feed value never
   reaches a card as a line. */
const RANGES = {
  cbb: { spread: 70, total: [60, 260] },
  cfb: { spread: 70, total: [20, 110] },
  nfl: { spread: 35, total: [20, 80] },
  nba: { spread: 35, total: [150, 300] }
};

function num(v, lo, hi) {
  const text = String(v == null ? '' : v).trim().replace(/^[ou]/i, '');
  if (!/^[+-]?\d+(\.\d+)?$/.test(text) && !/^(pk|even)$/i.test(text)) return null;
  const n = /^(pk|even)$/i.test(text) ? 0 : Number(text);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
}

export function marketLines(comp, sport = 'cbb') {
  const range = RANGES[sport] || RANGES.cbb;
  const odds = (comp && comp.odds) || [];
  const o = odds.find(q => /draftkings/i.test(String(((q || {}).provider || {}).name || ''))) || odds[0] || {};
  const ps = ((o.pointSpread || {}).home) || {}, over = ((o.total || {}).over) || {};
  const pv = o.provider || {}, label = pv.displayName || pv.name;
  const lines = {
    provider: typeof label === 'string' ? label.slice(0, 40) : null,
    home_open: num((ps.open || {}).line, -range.spread, range.spread),
    home_current: num((ps.close || {}).line, -range.spread, range.spread),
    total_open: num((over.open || {}).line, range.total[0], range.total[1]),
    total_current: num((over.close || {}).line, range.total[0], range.total[1])
  };
  return lines.home_current == null && lines.total_current == null ? null : lines;
}
