import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { loadCollegePropLines, loadNflPropLines, parsePropLines, rosterPlayers } from '../functions/_shared/model-prop-lines.js';

const roster = (id = '17', name = 'Test Player') => ({ athletes: [{ items: [{ id, displayName: name, fullName: name }] }] });
const prop = (id = '17', value = 57.5, updated = '2026-11-19T21:00:00Z') => ({
  athlete: { $ref: `http://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/athletes/${id}?lang=en` },
  type: { name: 'Total Rushing Yards (incl. overtime)' },
  current: { target: { value } }, open: { target: { value: 41.5 } }, lastUpdated: updated
});
const event = state => ({ id: '123', status: { type: { state } }, competitions: [{ competitors: [
  { homeAway: 'home', team: { abbreviation: 'HOU' } },
  { homeAway: 'away', team: { abbreviation: 'IND' } }
] }] });

test('use the current threshold, deduplicate sides and retain missing prices', () => {
  const players = rosterPlayers(roster(), 'HOU');
  const lines = parsePropLines([prop(), prop(), prop('unknown'), { ...prop(), current: {} }], players, '123', 'checked');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].line, 57.5);
  assert.equal(lines[0].team, 'HOU');
  assert.equal(lines[0].priced, false);
  assert.equal(lines[0].over_price, null);
  assert.equal(lines[0].under_price, null);
});

test('newer quotes replace earlier quotes; same-time conflicting lines are withheld', () => {
  const players = rosterPlayers(roster(), 'HOU');
  assert.equal(parsePropLines([prop(), prop('17', 59.5, '2026-11-19T22:00:00Z')], players, '123', 'checked')[0].line, 59.5);
  assert.equal(parsePropLines([prop(), prop('17', 59.5)], players, '123', 'checked').length, 0);
});

test('read every prop page and join athlete IDs to the correct club roster', async () => {
  const calls = [];
  const fetcher = async url => {
    calls.push(url);
    let data;
    if (url.includes('/scoreboard')) data = { events: [event('pre')] };
    else if (url.includes('/teams/HOU/')) data = roster('17', 'Home Back');
    else if (url.includes('/teams/IND/')) data = roster('18', 'Away Back');
    else if (url.includes('&page=2')) data = { items: [prop('18', 51.5)] };
    else data = { pageCount: 2, items: [prop('17', 57.5)] };
    return { ok: true, json: async () => data };
  };
  const result = await loadNflPropLines({ home: 'HOU', away: 'IND', season: 2026, week: 11 }, fetcher);
  assert.equal(result.lines.length, 2);
  assert.deepEqual(result.lines.map(x => [x.player, x.team]), [['Home Back', 'HOU'], ['Away Back', 'IND']]);
  assert.ok(calls.some(url => url.includes('&page=2')));
  assert.equal(result.state, 'ok');
});

test('closed markets do not fetch or present pregame lines as current', async () => {
  let calls = 0;
  const result = await loadNflPropLines({ home: 'HOU', away: 'IND', season: 2026, week: 11 }, async () => {
    calls++;
    return { ok: true, json: async () => ({ events: [event('post')] }) };
  });
  assert.equal(result.state, 'closed');
  assert.equal(result.lines.length, 0);
  assert.equal(calls, 1);
});

test('invalid matchups cannot trigger arbitrary provider requests', async () => {
  await assert.rejects(loadNflPropLines({ home: 'https://bad.test', away: 'IND', season: 2026, week: 11 }), RangeError);
});

test('retry an ESPN edge rejection with a supported agent and uncached request', async () => {
  let calls = 0;
  const result = await loadNflPropLines({ home: 'HOU', away: 'IND', season: 2026, week: 11 }, async (url, options) => {
    calls++;
    if (calls === 1) return { ok: false, status: 403 };
    assert.equal(options.headers['User-Agent'], 'curl/8.5.0');
    assert.equal(options.cf.cacheTtl, 0);
    return { ok: true, json: async () => ({ events: [event('post')] }) };
  });
  assert.equal(result.state, 'closed');
  assert.equal(calls, 2);
});

test('college quotes retain ESPN athlete and club identities', async () => {
  const result = await loadCollegePropLines({ event_id: '401856869', season: 2026 }, async url => {
    let data;
    if (url.includes('/summary?')) data = { header: { id: '401856869', season: { year: 2026 }, competitions: [{
      status: { type: { state: 'pre' } }, competitors: [
        { homeAway: 'home', team: { id: '2116' } }, { homeAway: 'away', team: { id: '66' } }
      ]
    }] } };
    else if (url.includes('/teams/2116/')) data = roster();
    else if (url.includes('/teams/66/')) data = roster('18', 'Away Player');
    else data = { pageCount: 1, items: [prop()] };
    return { ok: true, json: async () => data };
  });
  assert.equal(result.state, 'ok');
  assert.equal(result.lines[0].espn_id, '17');
  assert.equal(result.lines[0].team_id, '2116');
  assert.equal(result.lines[0].line, 57.5);
});

function renderFixture({ comparisons = [], payload, fail = false, metric = 'rushing_yards', mean = 68.1, pmf } = {}) {
  const panel = { innerHTML: '', isConnected: true, parentElement: { insertBefore() {} } };
  const host = { innerHTML: '', querySelector: () => panel };
  const note = {};
  const context = { console, URLSearchParams, AbortSignal, setInterval: () => 1, clearInterval() {},
    location: { search: '?sport=nfl&game=IND%40HOU', hash: '' },
    document: { hidden: false, readyState: 'complete', getElementById: id => id === 'mcBoard' ? host : {},
      querySelector: () => null, createElement: () => Object.assign(note, { setAttribute() {} }), addEventListener() {} },
    fetch: () => fail ? Promise.reject(new Error('source down')) : payload
      ? Promise.resolve({ ok: true, json: async () => payload }) : new Promise(() => {}),
    addEventListener() {}, CHASE_MODEL_CENTER_NO_BOOT: true
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../dashboard/sports/chase_board.js', import.meta.url), 'utf8'), context);
  vm.runInContext(readFileSync(new URL('../dashboard/player_availability_shared.js', import.meta.url), 'utf8'), context);
  vm.runInContext(readFileSync(new URL('../dashboard/model_center.js', import.meta.url), 'utf8'), context);
  const dist = { mean, p10: 11.2, p50: 48.7, p90: 109.9, q: [11.2, 48.7, 109.9], q_levels: [0.1, 0.5, 0.9], pmf };
  context.ChaseModelCenter.renderBoard('nfl', { board: { season: 2026, week: 11, games: [
    { id: 'IND@HOU', away: 'IND', home: 'HOU', away_projected: 19, home_projected: 26 }
  ], player_projections: [{ player_id: 'gsis-17', player_name: 'Test Player', position: 'RB',
    team: 'HOU', opponent: 'IND', home: true, stats: { [metric]: dist } }], player_prop_comparisons: comparisons } });
  return { host, panel, note };
}

test('published comparisons attach by identity and show the actual line and signed gap', () => {
  const { host } = renderFixture({ comparisons: [{ player_id: 'gsis-17', team: 'HOU', opponent: 'IND',
    metric: 'rushing_yards', line: 57.5, book: 'DraftKings', quote_updated_at: '2026-11-19T21:00:00Z' }] });
  assert.match(host.innerHTML, /<th>Line<\/th><th>vs Line<\/th>/);
  assert.match(host.innerHTML, /<strong>57\.5<\/strong>/);
  assert.match(host.innerHTML, /<strong>\+10\.6<\/strong>/);
  assert.match(host.innerHTML, /Above line/);
  assert.doesNotMatch(host.innerHTML, /Model O 68\.5/);
});

test('a missing line has no invented threshold, marker or over/under estimate', () => {
  const { host } = renderFixture();
  assert.match(host.innerHTML, /Not posted/);
  assert.doesNotMatch(host.innerHTML, /Model O |mc-prop__line"|68\.5/);
});

test('fresh selected-game quotes replace snapshots without inventing odds', async () => {
  const fixture = renderFixture({ payload: { state: 'ok', checked_at: '2026-11-19T22:00:00Z', lines: [{
    player: 'Test Player', team: 'HOU', metric: 'rushing_yards', line: 52.5, book: 'draftkings', checked_at: '2026-11-19T22:00:00Z'
  }] } });
  await new Promise(setImmediate);
  assert.match(fixture.panel.innerHTML, /<strong>52\.5<\/strong>/);
  assert.match(fixture.panel.innerHTML, /<strong>\+15\.6<\/strong>/);
  assert.match(fixture.note.textContent, /Checked/);
  assert.doesNotMatch(fixture.panel.innerHTML, /-110/);
});

test('integer thresholds preserve push probability instead of labeling it under', async () => {
  const fixture = renderFixture({ metric: 'carries', mean: 4, pmf: { 3: 0.2, 4: 0.3, 5: 0.5 },
    payload: { state: 'ok', checked_at: '2026-11-19T22:00:00Z', lines: [{
      player: 'Test Player', team: 'HOU', metric: 'carries', line: 4, book: 'draftkings'
    }] } });
  await new Promise(setImmediate);
  assert.match(fixture.panel.innerHTML, /Model O 50% \/ U 20%/);
  assert.match(fixture.panel.innerHTML, /Push 30%/);
});

test('a quote-source failure preserves projections and labels fallback snapshots', async () => {
  const fixture = renderFixture({ fail: true, comparisons: [{ player_id: 'gsis-17', metric: 'rushing_yards', line: 57.5, book: 'DraftKings' }] });
  await new Promise(setImmediate);
  assert.match(fixture.panel.innerHTML, /68\.1/);
  assert.match(fixture.panel.innerHTML, /Snapshot/);
  assert.match(fixture.note.textContent, /unavailable/);
});
