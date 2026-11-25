import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

/* `nflReceiverTracking` renders the NGS/PFR block above the coverage matrix.
   The matrix is charted man/zone data that publishes a season late; this block
   is the current season, which is the whole reason it exists.

   The page cannot be booted here (no local server in this environment), so the
   function is lifted out and run in a sandbox the way tests/cbb_size.test.mjs
   does. That checks the render contract: the pill on every graded figure, the
   sample pill where the pipeline left a figure ungraded, and an em dash where
   a receiver has no row at all. */

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('dashboard/public_game_detail.js', root), 'utf8');

function declaration(name) {
  const start = source.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
}

function constant(name) {
  const start = source.indexOf(`  var ${name} = `);
  assert.ok(start >= 0, `${name} not found`);
  const end = source.indexOf('\n  ];', start);
  return end > start
    ? source.slice(start, end + 5)
    : source.slice(start, source.indexOf('\n', start) + 1);
}

function render(cols, floor = 20) {
  const sandbox = vm.createContext({
    esc: v => String(v == null ? '' : v),
    pctText: v => (Number(v) * 100).toFixed(1) + '%',
    ordinal: () => 'th',
    rankTone: (place, of) => `c-rank-${place}-${of}`,
    nflBadge: (r, cohort) => `<b data-place="${r.place}" data-of="${r.of}">${cohort}</b>`,
    nflSurname: name => String(name || '').split(/\s+/).pop(),
  });
  vm.runInContext(
    [constant('NFL_TRACK_GROUPS'), declaration('nflTrackNum'), declaration('nflTrackText'),
      declaration('nflReceiverTracking')].join('\n'),
    sandbox);
  const leaders = cols.map((_, i) => `k${i}`);
  const byName = {};
  cols.forEach((col, i) => { byName[`k${i}`] = [col]; });
  return vm.runInContext('nflReceiverTracking', sandbox)(leaders, byName, floor);
}

const GRADED = {
  player_name: 'A Receiver Jr.', position: 'WR',
  tracking: {
    season: 2026, targets: 74, avg_cushion: 5.4, avg_separation: 3.1, adot: 11.8,
    share_of_intended_air_yards: 0.284, yards_before_catch_per_rec: 8.2,
    yards_after_catch_per_rec: 3.4, yac_above_expectation: 0.62, broken_tackles: 4,
    drop_rate: 0.031, passer_rating_when_targeted: 108.4,
    league_ranks: {
      avg_cushion: { place: 7, of: 86 }, avg_separation: { place: 3, of: 86 },
      adot: { place: 12, of: 86 }, share_of_intended_air_yards: { place: 5, of: 86 },
      yards_before_catch_per_rec: { place: 9, of: 80 },
      yards_after_catch_per_rec: { place: 22, of: 80 },
      yac_above_expectation: { place: 14, of: 80 },
      drop_rate: { place: 31, of: 80 },
      passer_rating_when_targeted: { place: 6, of: 80 },
    },
  },
};

const THIN = {
  player_name: 'B Fringe', position: 'TE',
  tracking: { season: 2026, targets: 6, avg_separation: 4.9, avg_cushion: 7.2 },
};

const NONE = { player_name: 'C Nothing', position: 'WR', tracking: null };

test('every graded figure carries its rank pill and tone', () => {
  const html = render([GRADED]);
  assert.match(html, /How They Are Covered · 2026/);
  // Separation is 3rd of 86 and must be toned and pilled, not bare.
  assert.match(html, /c-rank-3-86/);
  assert.match(html, /data-place="3" data-of="86"/);
  assert.match(html, /3\.10/);                       // two-decimal yardage
  assert.match(html, /28\.4%/);                      // air-yards share as a rate
  assert.match(html, /\+0\.62/);                     // YAC vs expected keeps its sign
  assert.match(html, /108\.4/);                      // rating, one decimal
  assert.match(html, />4</);                         // broken tackles as an integer
});

test('an ungraded figure is printed with its sample, never bare', () => {
  const html = render([THIN]);
  assert.match(html, /is-low-cell/);
  assert.match(html, /ca-rank is-sample">6 tgt/);
  assert.match(html, /under 20 targets, not graded/);
  assert.doesNotMatch(html, /data-place=/);
});

test('an unavailable figure never renders a bare dash cell', () => {
  // The desk forbids empty cells: `public_site_runtime_diag.py` fails on any
  // visible cell whose text is exactly an em dash, and the first version of
  // this render shipped four of them and broke the deploy. A test asserting
  // the dash is a test of the wrong contract.
  const html = render([GRADED, NONE]);
  assert.match(html, /is not published for this receiver/);
  assert.match(html, /ca-rank is-sample">not charted</);
  assert.doesNotMatch(html, />—</);
  assert.doesNotMatch(html, />0\.00</);
});

test('a charted receiver missing one metric shows his sample, not "not charted"', () => {
  // Two columns: a row only renders when SOME column publishes the metric, so
  // the unavailable cell needs a neighbour that has it.
  const partial = {
    player_name: 'G Partial', position: 'WR',
    tracking: { season: 2026, targets: 31, avg_separation: 2.9,
      league_ranks: { avg_separation: { place: 44, of: 86 } } },
  };
  const html = render([GRADED, partial]);
  // GRADED publishes drop_rate, partial does not, so partial's cell carries
  // his target count rather than claiming he is uncharted.
  assert.match(html, /ca-rank is-sample">31 tgt</);
  assert.doesNotMatch(html, />—</);
});

test('the block disappears entirely when nobody has tracking', () => {
  assert.equal(render([NONE, { ...NONE, player_name: 'D None' }]), '');
});

test('a group with no published metric is omitted rather than left empty', () => {
  const coverageOnly = {
    player_name: 'E Partial', position: 'WR',
    tracking: { season: 2026, targets: 40, avg_separation: 2.8,
      league_ranks: { avg_separation: { place: 40, of: 86 } } },
  };
  const html = render([coverageOnly]);
  assert.match(html, /Coverage Faced/);
  assert.doesNotMatch(html, /Reliability/);
  assert.doesNotMatch(html, /With The Ball/);
});

test('tracking is read from whichever season window published it', () => {
  // The coverage matrix lists a prior-season profile first; the tracking lives
  // on the current-season one. Taking rows[0] blindly would show nothing.
  const prior = { player_name: 'F Split', position: 'WR', source_season: 2025, tracking: null };
  const current = { ...GRADED, source_season: 2026 };
  const sandbox = { k0: [prior, current] };
  const html = (() => {
    const ctx = vm.createContext({
      esc: v => String(v == null ? '' : v),
      pctText: v => (Number(v) * 100).toFixed(1) + '%',
      ordinal: () => 'th', rankTone: () => 'c-tone',
      nflBadge: r => `<b data-place="${r.place}"></b>`,
      nflSurname: n => String(n || '').split(/\s+/).pop(),
    });
    vm.runInContext([constant('NFL_TRACK_GROUPS'), declaration('nflTrackNum'), declaration('nflTrackText'),
      declaration('nflReceiverTracking')].join('\n'), ctx);
    return vm.runInContext('nflReceiverTracking', ctx)(['k0'], sandbox, 20);
  })();
  assert.match(html, /data-place="3"/);
});

test('a non-numeric tracking value is unavailable, not a dash', () => {
  // `nflTrackText` falls back to an em dash for anything non-numeric, and a
  // dash cell fails the desk contract. The guard checks finiteness, so a
  // malformed value can never reach that fallback from the table.
  const broken = {
    player_name: 'H Broken', position: 'WR',
    tracking: { season: 2026, targets: 44, avg_separation: 'n/a', avg_cushion: NaN },
  };
  const html = render([GRADED, broken]);
  assert.doesNotMatch(html, />—</);
  assert.match(html, /ca-rank is-sample">44 tgt</);
});

test('a group whose only values are malformed is omitted, not rendered empty', () => {
  const broken = {
    player_name: 'I Broken', position: 'WR',
    tracking: { season: 2026, targets: 44, drop_rate: 'oops' },
  };
  assert.equal(render([broken]), '');
});
