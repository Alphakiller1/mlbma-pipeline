import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('dashboard/public_game_detail.js', root), 'utf8');
const examples = JSON.parse(readFileSync(new URL('tests/fixtures/cbb_size_20261124.json', root), 'utf8')).teams;
const team = id => examples[id];
// Keep the recorded example and peer samples fixed as daily publications grow.
const heightPools = {
  starters: [76, 78, 79, 80, 80.8, 81, 82, 83, 84, 85],
  whole_team: [76, 77, 78, 79, 80, 80.5, 80.85714285714286, 81, 82, 83]
};
function declaration(name, oneLine = false) {
  const start = source.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, name);
  const end = oneLine ? source.indexOf('\n', start) : source.indexOf('\n  }', start) + 4;
  return source.slice(start, end);
}
function render(context) {
  const window = { ChaseSportCBB: { comparisonRanks(year, family, row) {
    return year === 2027 && family === 'height' && row.kind === 'frontcourt' ? heightPools[row.side] : undefined;
  } } };
  const sandbox = vm.createContext({ window, global: window,
    esc: String, cbbYear: g => g.season, cbbTactics: g => g.tactics,
    cbbSchool: () => 'School', cbbSeason: () => '2026–27',
    cbbPanel: (_title, _caption, body) => body, cbbTable: (head, rows) => ({ head, rows }),
    ordinal: () => 'th', rankTone: () => 'c-good',
    rankBadge: p => `<b data-rank="${p.rank}" data-rank-of="${p.of}">${p.rank}</b>`
  });
  vm.runInContext(readFileSync(new URL('dashboard/cbb_charts.js', root), 'utf8'), sandbox);
  for (const name of ['cbbPlural', 'cbbMissing']) vm.runInContext(declaration(name, true), sandbox);
  for (const name of ['cbbPlace', 'cbbRanked', 'cbbComparison', 'cbbSize']) vm.runInContext(declaration(name), sandbox);
  return sandbox.cbbSize('cbb', { season: 2027, tactics: context }, 'away');
}

test('Tennessee frontcourt populates both ranked heights and measured counts', () => {
  const row = render(team('2633').observed_tactics).rows.find(r => r[0] === 'Frontcourt (F/C)');
  assert.match(row[1], /6′ 8\.8″/);
  assert.match(row[1], /3 players.*10 starts/);
  assert.match(row[2], /6′ 9\.0″/);
  assert.match(row[2], /7 players/);
  assert.match(row[1], /data-rank="6" data-rank-of="10"/);
  assert.match(row[2], /data-rank="3" data-rank-of="10"/);
});

test('Maryland retains the actual absence of center starts and ranks its frontcourt', () => {
  const rows = render(team('120').observed_tactics).rows;
  const center = rows.find(r => r[0] === 'Centers');
  assert.match(center[1], /No center starts/);
  assert.doesNotMatch(center[1], /data-rank/);
  assert.match(center[2], /7′ 0\.0″/);
  const frontcourt = rows.find(r => r[0] === 'Frontcourt (F/C)');
  assert.match(frontcourt[1], /4 players.*10 starts/);
  assert.match(frontcourt[1], /data-rank="6" data-rank-of="10"/);
  assert.match(frontcourt[2], /data-rank="4" data-rank-of="10"/);
});

test('incomplete position coverage cannot declare no center starts', () => {
  const context = structuredClone(team('120').observed_tactics);
  context.starter_position_size.find(r => r.position === 'F').recorded_starts -= 1;
  const row = render(context).rows.find(r => r[0] === 'Centers');
  assert.match(row[1], /Not reported/);
  assert.doesNotMatch(row[1], /No center starts/);
});

test('invalid heights stay missing and foot rounding carries at twelve inches', () => {
  const context = structuredClone(team('120').observed_tactics);
  context.size_summary.whole_team.mean_height_inches = 0;
  assert.match(render(context).rows[0][2], /Not reported/);
  context.size_summary.whole_team.mean_height_inches = 83.96;
  const cell = render(context).rows[0][2];
  assert.match(cell, /7′ 0\.0″/);
  assert.doesNotMatch(cell, /6′ 12/);
});

test('an invalid position height cannot contaminate the frontcourt average', () => {
  const context = structuredClone(team('2633').observed_tactics);
  context.starter_position_size.find(r => r.position === 'F').mean_height_inches = 0;
  const row = render(context).rows.find(r => r[0] === 'Frontcourt (F/C)');
  assert.match(row[1], /6′ 10\.0″/);
  assert.match(row[1], /1 player.*4 starts/);
});
