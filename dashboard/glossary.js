/**
 * Metric glossary cards — definitions aligned with core/config.py weights.
 */
(function(global) {
  'use strict';

  var METRICS = [
    {
      id: 'abq',
      name: 'ABQ',
      full: 'At-Bat Quality',
      sample: 72,
      invert: false,
      terms: ['abq', 'discipline', 'contact', 'chase', 'at-bat quality'],
      def: 'Composite plate-process score: discipline, contact quality, pitch pressure, and strikeout avoidance — pool-normalized 0–100.',
      components: '30% discipline (BB%, inv Chase%) · 35% contact (ZCon%, OCon%) · 20% pitch pressure · 15% K avoidance',
      read: 'High ABQ = patient, quality decisions. Low = chase-heavy, weak process.',
      research: 'Unders when weak ABQ faces elite pitching; platoon splits when ABQ gap is wide.',
      limits: 'No single-game guarantee; small L7 windows are momentum-only.'
    },
    {
      id: 'rcv',
      name: 'RCV',
      full: 'Run Creation Value',
      sample: 68,
      invert: false,
      terms: ['rcv', 'damage', 'barrel', 'power', 'run creation'],
      def: 'Damage and scoring pressure from wRC+, barrels, ISO, and hard contact — park-adjusted where applicable.',
      components: '35% wRC+ · 32% Barrel% (park-adj) · 20% ISO (park-adj) · 13% HardHit% (park-adj)',
      read: 'High RCV = real slug and run paths. Low = limited hard contact.',
      research: 'Overs when RCV leads process gaps; archetype axis with OBR.',
      limits: 'Park factors apply to contact components, not wRC+ directly.'
    },
    {
      id: 'obr',
      name: 'OBR',
      full: 'On-Base Rating',
      sample: 61,
      invert: false,
      terms: ['obr', 'on base', 'xwoba', 'walks', 'traffic'],
      def: 'On-base floor from expected production and walk rate.',
      components: '65% xwOBA · 35% BB%',
      read: 'High OBR = table-setters and traffic. Low = thin on-base paths.',
      research: 'Team totals vs soft K% arms; pairs with Signal 1 and Signal 6.',
      limits: 'Does not capture baserunning or sequencing luck.'
    },
    {
      id: 'osi',
      name: 'OSI',
      full: 'Offensive Strength Index',
      sample: 74,
      invert: false,
      terms: ['osi', 'offensive strength', 'composite offense'],
      def: 'Headline offensive composite blending damage, process, and on-base floor.',
      components: '43% RCV · 37% ABQ · 20% OBR',
      read: '85+ elite · 75–84 high · 65–74 dangerous · 50–64 inconsistent · <50 weak.',
      research: 'Primary team offensive ranking; compare vs opposing Pitching Score.',
      limits: 'Pool-normalized within active leaderboard sample.'
    },
    {
      id: 'projosi',
      name: 'projOSI',
      full: 'Projected OSI',
      sample: 71,
      invert: false,
      terms: ['projosi', 'projected osi', 'regression'],
      def: 'OSI adjusted for xwOBA vs wOBA regression signal.',
      components: 'OSI + clip((xwOBA − wOBA) × 450, −8, +8)',
      read: 'Above OSI → buy-low lean. Below OSI → fade lean.',
      research: 'Pairs with PALS for process vs results alignment (Signal 5).',
      limits: 'Regression clip caps extreme BABIP/luck swings at ±8 pts.'
    },
    {
      id: 'pp-gap',
      name: 'PP-Gap',
      full: 'Process vs Production Gap',
      sample: 4,
      invert: false,
      terms: ['pp gap', 'pp-gap', 'process production'],
      def: 'ABQ minus RCV — positive means process ahead of results.',
      components: 'ABQ − RCV (same pool scale)',
      read: '+4 or more: buy-low. −4 or less: regression risk.',
      research: 'Convergence votes count PP-Gap at double weight.',
      limits: 'Not a standalone play flag; use with signal stack.'
    },
    {
      id: 'pals',
      name: 'PALS',
      full: 'Pitching-Adjusted Lineup Score',
      sample: 66,
      invert: false,
      terms: ['pals', 'pitching adjusted', 'schedule'],
      def: 'Lineup strength adjusted for starting-pitcher quality faced.',
      components: '(BA+ + PTF+) / 2',
      read: 'High = production vs tough SPs. Low = weak schedule context.',
      research: 'Confirm raw OSI with schedule truth; Signal 5 pairing.',
      limits: 'Requires PALS export from pipeline; may be empty on stale runs.'
    },
    {
      id: 'pitching-score',
      name: 'Pitching Score',
      full: 'Pitching Score',
      sample: 78,
      invert: false,
      terms: ['pitching score', 'pitch score', 'k bb hr9'],
      def: 'Staff quality from strikeouts, walk suppression, and homer prevention.',
      components: '40% K% · 35% inv(BB%) · 25% inv(HR/9)',
      read: '85+ ace tier · 70–84 solid · 55–69 average · <55 volatile.',
      research: 'OSI vs Pitching Score gap (Signal 4); SP/bullpen unit splits on profiles.',
      limits: 'Combined staff uses 70% SP / 30% bullpen when both present.'
    },
    {
      id: 'oor',
      name: 'OOR',
      full: 'Opponent Offensive Rating',
      sample: 63,
      invert: false,
      terms: ['oor', 'opponent', 'hvr', 'hvl'],
      def: 'Split offensive strength vs RHP and LHP for matchup context.',
      components: '55% HvR · 45% HvL',
      read: 'High = dangerous opposing lineups for the pitcher hand faced.',
      research: 'Pitcher matchup environment; schedule OOR (Signal 9).',
      limits: 'Platoon sample size varies by team usage.'
    },
    {
      id: 'wrc-plus',
      name: 'wRC+',
      full: 'Weighted Runs Created Plus',
      sample: 112,
      invert: false,
      terms: ['wrc+', 'wrc plus', 'runs created'],
      def: 'Park-adjusted offensive production index; 100 = league average.',
      components: 'FanGraphs wRC+ (input to RCV weighting)',
      read: '110+ strong · 90–109 average band · <90 below average.',
      research: 'Context for RCV; not duplicated as headline composite.',
      limits: 'External stat — refresh depends on FanGraphs/Savant pipeline.'
    },
    {
      id: 'woba',
      name: 'wOBA',
      full: 'Weighted On-Base Average',
      sample: 0.328,
      invert: false,
      decimals: 3,
      terms: ['woba', 'weighted on base'],
      def: 'Observed weighted on-base average — results to date.',
      components: 'Standard wOBA weights on outcomes',
      read: 'Compare to xwOBA for sustainability read on Team Profile.',
      research: 'Regression signal when wOBA diverges from xwOBA.',
      limits: 'BABIP and sequencing can inflate short windows.'
    },
    {
      id: 'xwoba',
      name: 'xwOBA',
      full: 'Expected Weighted On-Base Average',
      sample: 0.321,
      invert: false,
      decimals: 3,
      terms: ['xwoba', 'expected woba'],
      def: 'Expected production from contact quality — process anchor for OBR and projOSI.',
      components: 'Statcast xwOBA (input to OBR and projOSI)',
      read: 'Above wOBA → likely cooling. Below wOBA → likely heating.',
      research: 'projOSI regression clip uses (xwOBA − wOBA) × 450.',
      limits: 'Not available for all small-sample splits on profiles.'
    },
    {
      id: 'power-floor-gap',
      name: 'Power-Floor Gap',
      full: 'RCV minus OBR',
      sample: 6,
      invert: false,
      terms: ['power floor gap', 'df gap', 'rcv obr'],
      def: 'RCV minus OBR — power vs on-base floor split.',
      components: 'RCV − OBR',
      read: '+8: boom-or-bust slug. Negative: OBP-first shape.',
      research: 'Run-line volatility; archetype classification aid.',
      limits: 'Derived from composites, not independent measurement.'
    }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderMetricCard(m) {
    var A = global.MLBMAAssets;
    var chip = A && A.valChipHtml
      ? A.valChipHtml(m.sample, m.invert ? 'bb_pct' : 'osi', m.invert, m.decimals)
      : '<span class="val-chip">' + esc(m.sample) + '</span>';
    return '<article class="gloss-metric-card glossary-term" id="' + esc(m.id) + '" data-term="' + esc(m.terms.join(' ')) + '">'
      + '<div class="gloss-metric-card__head">'
      + '<div class="gloss-metric-card__name">' + esc(m.name) + '</div>'
      + chip
      + '</div>'
      + '<div class="gloss-metric-card__full">' + esc(m.full) + '</div>'
      + '<p class="gloss-metric-card__def">' + esc(m.def) + '</p>'
      + '<div class="gloss-metric-card__grid">'
      + '<div class="gloss-metric-card__cell"><strong>Components</strong><span>' + esc(m.components) + '</span></div>'
      + '<div class="gloss-metric-card__cell"><strong>How to read</strong><span>' + esc(m.read) + '</span></div>'
      + '<div class="gloss-metric-card__cell"><strong>Research use</strong><span>' + esc(m.research) + '</span></div>'
      + '<div class="gloss-metric-card__cell"><strong>Limitations</strong><span>' + esc(m.limits) + '</span></div>'
      + '</div></article>';
  }

  function mountGlossaryMetrics(rootId) {
    var root = document.getElementById(rootId || 'glossaryMetricCards');
    if (!root) return;
    root.innerHTML = METRICS.map(renderMetricCard).join('');
  }

  function initGlossaryPage() {
    mountGlossaryMetrics('glossaryMetricCards');
    var A = global.MLBMAAssets;
    var headMount = document.getElementById('glossarySectionHead');
    if (headMount && A && A.caSectionHeadHtml) {
      headMount.innerHTML = A.caSectionHeadHtml(
        'book-open',
        'Reference',
        'Core Metric Definitions',
        'Formulas verified against core/config.py — single source for ABQ, RCV, OBR, OSI, and related composites.'
      );
    }
  }

  global.MLBMAGlossary = {
    METRICS: METRICS,
    mountGlossaryMetrics: mountGlossaryMetrics,
    renderMetricCard: renderMetricCard
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGlossaryPage);
  } else {
    initGlossaryPage();
  }
})(typeof window !== 'undefined' ? window : this);
