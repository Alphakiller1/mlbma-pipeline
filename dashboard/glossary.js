/**
 * Metric glossary — definitions aligned with core/config.py + compute_results.py.
 */
(function(global) {
  'use strict';

  var CORE_METRICS = [
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
      components: '35% RCV · 25% ABQ · 40% OBR',
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
      terms: ['pitching score', 'pitch score', 'k bb hr9 whip'],
      def: 'IP-weighted staff quality from strikeouts, traffic suppression, command, and homer prevention.',
      components: '30% K% · 20% inv(BB%) · 20% inv(HR/9) · 30% inv(WHIP)',
      read: '85+ ace tier · 70–84 solid · 55–69 average · <55 volatile.',
      research: 'OSI vs Pitching Score gap (Signal 4); SP/bullpen unit splits on profiles.',
      limits: 'Uses season staff rates; combined dashboard context uses 70% SP / 30% bullpen when both are present.'
    },
    {
      id: 'oor',
      name: 'OOR',
      full: 'Opponent Offensive Rating',
      sample: 63,
      invert: false,
      terms: ['oor', 'opponent', 'hvr', 'hvl', 'pitcher oor', 'bullpen oor'],
      def: 'Split offensive strength vs RHP and LHP — used as Pitcher OOR or Bullpen Unit OOR only (no team-level OOR).',
      components: '55% HvR · 45% HvL',
      read: 'High = dangerous opposing lineups for the pitcher hand faced.',
      research: 'Pitcher matchup environment; schedule OOR (Signal 9).',
      limits: 'Platoon sample size varies by team usage; not shown as a team headline metric.'
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

  var SURFACE_WIN_METRICS = [
    {
      id: 'win-pct',
      name: 'Win%',
      full: 'Team Win Percentage',
      sample: 0.580,
      invert: false,
      decimals: 3,
      terms: ['win pct', 'win%', 'win percent', 'surface wins', 'team results'],
      def: 'Share of team games won — YTD or windowed (L30/L14/L7) from game-results pipeline.',
      components: 'Wins ÷ games played (Team_Results / game_results.csv)',
      read: 'High = winning record. Low = losing record.',
      research: 'Surface-outcome context for lineup strength; compare to OSI/process for buy-low or fade.',
      limits: 'Results stat — does not isolate luck or run differential; window columns need game_results coverage.'
    },
    {
      id: 'f5-win-pct',
      name: 'F5 Win%',
      full: 'First-Five Win Percentage',
      sample: 0.545,
      invert: false,
      decimals: 3,
      terms: ['f5 win', 'f5 win pct', 'first five', 'f5'],
      def: 'Share of games where the team held the lead after five innings (W/L on lead_after_5; ties excluded from denominator).',
      components: 'F5 wins ÷ (F5 wins + F5 losses) from Team_Results',
      read: 'High = often ahead through five. Low = slow starters or early deficits.',
      research: 'F5 totals and SP prop context; pairs with Pitcher Intelligence F5 ER columns.',
      limits: 'Tied-after-5 games count in f5_push_pct, not in F5 Win%.'
    },
    {
      id: 'sp-win-pct',
      name: 'SP Win%',
      full: 'Starting Pitcher Win Percentage',
      sample: 0.420,
      invert: false,
      decimals: 3,
      terms: ['sp win', 'pitcher win', 'starter win', 'sp win pct'],
      def: 'Share of team wins credited to the starting pitcher (winning_pitcher_is_starter = true).',
      components: 'SP wins ÷ games from Team_Results',
      read: 'High = rotation frequently picking up the W. Low = bullpen or offense carrying wins.',
      research: 'SP prop and moneyline context; not the same as pitcher game score or QS%.',
      limits: 'Team stat, not individual SP W-L record.'
    },
    {
      id: 'rp-win-pct',
      name: 'RP Win%',
      full: 'Reliever Win Percentage',
      sample: 0.160,
      invert: false,
      decimals: 3,
      terms: ['rp win', 'reliever win', 'bullpen win', 'rp win pct'],
      def: 'Share of team wins credited to a reliever (not the starter).',
      components: 'RP wins ÷ games from Team_Results',
      read: 'High = bullpen frequently vulturing or holding leads late.',
      research: 'Bullpen usage and team win-style context.',
      limits: 'Team aggregate; see Bullpen Profile for unit-level detail.'
    },
    {
      id: 'qs-pct',
      name: 'QS%',
      full: 'Quality Start Percentage',
      sample: 0.380,
      invert: false,
      decimals: 3,
      terms: ['qs', 'qs pct', 'quality start', 'quality starts'],
      def: 'Share of team games where the starter threw a quality start: 6+ IP and ≤3 ER.',
      components: 'team_quality_start count ÷ games (game_results scrape)',
      read: 'High = rotation length and run suppression. Low = short outings or blow-ups.',
      research: 'SP length props and team under/over environment.',
      limits: 'Requires game_results.csv scrape; early-season samples are small. Dashboard may show proxy on some views until full coverage — prefer Team_Results when present.'
    },
    {
      id: 'qs-against-pct',
      name: 'QS% Allowed',
      full: 'Quality Starts Allowed',
      sample: 0.320,
      invert: true,
      decimals: 3,
      terms: ['qs against', 'qs allowed', 'qs% allowed', 'quality start allowed'],
      def: 'Share of team games where the opposing starter recorded a quality start (6+ IP, ≤3 ER).',
      components: 'opp_quality_start count ÷ games',
      read: 'Low (green when inverted) = staff rarely lets opposing SPs go deep. High = opponent starters working deep often.',
      research: 'Lineup difficulty and opposing SP prop unders when QS% Allowed is low.',
      limits: 'Same game_results dependency as QS%; inverted coloring on dashboard.'
    }
  ];

  var SP_RATE_METRICS = [
    {
      id: 'k-pct',
      name: 'K%',
      full: 'Strikeout Percentage',
      sample: 24.5,
      invert: false,
      terms: ['k pct', 'k%', 'strikeout rate', 'strikeouts'],
      def: 'Strikeouts per plate appearance faced — primary SP stuff indicator.',
      components: 'FanGraphs / SP_Profiles season rate',
      read: 'High = swing-and-miss arsenal. Low = contact-heavy profile.',
      research: 'K props; core input to Pitching Score (30% weight).',
      limits: 'Platoon splits limited until SP scraper adds vs-RHH/vs-LHH columns.'
    },
    {
      id: 'bb-pct',
      name: 'BB%',
      full: 'Walk Percentage',
      sample: 7.2,
      invert: true,
      terms: ['bb pct', 'bb%', 'walk rate', 'walks'],
      def: 'Walks per plate appearance faced — command and traffic risk.',
      components: 'FanGraphs / SP_Profiles; inverted in Pitching Score (20% weight).',
      read: 'Low (green) = sharp command. High (red) = free baserunners.',
      research: 'OBR/ABQ matchups; totals when BB% is elevated vs patient lineups.',
      limits: 'Inverted coloring on pitcher tables.'
    },
    {
      id: 'hr9',
      name: 'HR/9',
      full: 'Home Runs per Nine Innings',
      sample: 1.05,
      invert: true,
      terms: ['hr9', 'hr/9', 'homer rate', 'home runs'],
      def: 'Home runs allowed per nine innings — fly-ball damage risk.',
      components: 'SP_Profiles; inverted in Pitching Score (20% weight).',
      read: 'Low (green) = suppresses long ball. High (red) = HR prop and total risk.',
      research: 'HR props and RCV-heavy lineups.',
      limits: 'Park and weather context not embedded in the rate itself.'
    },
    {
      id: 'whip',
      name: 'WHIP',
      full: 'Walks Plus Hits per Inning Pitched',
      sample: 1.18,
      invert: true,
      decimals: 2,
      terms: ['whip', 'walks hits innings', 'traffic suppression'],
      def: 'Baserunners allowed per inning from hits and walks.',
      components: '(Hits + Walks) / Innings Pitched; inverted in Pitching Score (30% weight).',
      read: 'Low (green) = suppresses traffic. High (red) = repeated run-scoring pressure.',
      research: 'Run prevention, earned-runs props, and lineup traffic context.',
      limits: 'Includes hit outcomes and therefore carries more defense and batted-ball variance than K% or BB%.'
    },
    {
      id: 'era',
      name: 'ERA',
      full: 'Earned Run Average',
      sample: 3.45,
      invert: true,
      decimals: 2,
      terms: ['era', 'earned run average'],
      def: 'Earned runs per nine innings — headline results stat for starters.',
      components: 'Standard ERA from FanGraphs / SP_Profiles',
      read: 'Low (green) = run suppression. High (red) = runs allowed.',
      research: 'Validate vs OOR and OSI Allowed; compare to FIP for regression (Pitcher Intelligence flags).',
      limits: 'Defense and sequencing noise; use FIP/xFIP and game log for prop work.'
    },
    {
      id: 'fip',
      name: 'FIP',
      full: 'Fielding Independent Pitching',
      sample: 3.62,
      invert: true,
      decimals: 2,
      terms: ['fip', 'fielding independent'],
      def: 'ERA estimator from K, BB, and HR only — strips defensive luck.',
      components: 'Standard FIP constant formula',
      read: 'Low (green) = strong underlying skill. High (red) = contact or HR issues.',
      research: 'Regression risk flag when FIP − ERA ≥ 0.50 (Pitcher Intelligence).',
      limits: 'xFIP may be unavailable on some profile rows.'
    }
  ];

  var BULLPEN_METRICS = [
    {
      id: 'hi-leverage-era',
      name: 'Hi-Leverage ERA',
      full: 'High-Leverage Innings ERA',
      sample: 2.85,
      invert: true,
      decimals: 2,
      terms: ['hi leverage', 'high leverage era', 'leverage era', 'bullpen leverage'],
      def: 'ERA in high-leverage relief appearances for the bullpen unit.',
      components: 'Bullpen_Unit high_leverage_ERA from pipeline',
      read: 'Low (green) = closes tight spots. High (red) = late-inning damage.',
      research: 'Save/blown-save context; compare to medium-leverage ERA.',
      limits: 'Sample size smaller than full bullpen line.'
    },
    {
      id: 'med-leverage-era',
      name: 'Med-Leverage ERA',
      full: 'Medium-Leverage ERA',
      sample: 3.40,
      invert: true,
      decimals: 2,
      terms: ['med leverage', 'medium leverage era'],
      def: 'ERA in medium-leverage relief innings.',
      components: 'Bullpen_Unit medium_leverage_ERA',
      read: 'Bridge between mop-up and high-leverage performance.',
      research: 'Unit depth read on Bullpen Profile.',
      limits: 'Leverage buckets depend on pipeline tagging.'
    },
    {
      id: 'save-pct',
      name: 'Save%',
      full: 'Save Conversion Rate',
      sample: 0.720,
      invert: false,
      decimals: 3,
      terms: ['save pct', 'save rate', 'saves'],
      def: 'Saves ÷ save opportunities (saves + blown saves) — team-level from game results.',
      components: 'Team_Results: saves / (saves + blown_saves)',
      read: 'High = bullpen converting leads. Low = late-inning leaks.',
      research: 'Team win style; not a single-closer stat on team rows.',
      limits: 'Requires save/blown_save flags in game_results scrape.'
    },
    {
      id: 'blown-save-pct',
      name: 'Blown Save%',
      full: 'Blown Save Rate',
      sample: 0.280,
      invert: true,
      decimals: 3,
      terms: ['blown save', 'blown save pct', 'bsv'],
      def: 'Blown saves ÷ save opportunities.',
      components: 'Team_Results blown_save_pct',
      read: 'Low (green) = reliable late leads. High (red) = bullpen volatility.',
      research: 'Live betting and total context in close games.',
      limits: 'Team aggregate; reliever profile for individual arms.'
    }
  ];

  var TREND_METRICS = [
    {
      id: 'velocity',
      name: 'Velocity',
      full: 'Trend Velocity (Heat Map)',
      sample: 0.8,
      invert: false,
      decimals: 1,
      terms: ['velocity', 'trend velocity', 'momentum', 'heat map'],
      def: 'Linear slope of a metric across YTD → L30 → L14 → L7 windows on the Trends heat map. Positive = improving left-to-right.',
      components: 'Least-squares slope on available window points (trends_heatmap.js)',
      read: '≥ +0.6 Rising · ≤ −0.6 Cooling · else Stable.',
      research: 'Pair with Δ L7−YTD; L7 alone is a momentum flag, not a standalone predictor.',
      limits: 'Missing windows reduce slope accuracy; small L7 samples are noisy.'
    },
    {
      id: 'delta-l7-ytd',
      name: 'Δ L7−YTD',
      full: 'Seven-Day vs Year-to-Date Delta',
      sample: 3.2,
      invert: false,
      decimals: 1,
      terms: ['delta', 'l7 ytd', 'form delta', 'recent form'],
      def: 'L7 metric value minus YTD baseline — short-window deviation from season norm.',
      components: 'L7 column − YTD column on Trends heat map',
      read: '+4 with positive velocity → Momentum Up. −4 with negative velocity → Momentum Down.',
      research: 'Team Profile window strips and Research Lab trends tab.',
      limits: 'L7 is high-variance; confirm with L14/L30.'
    },
    {
      id: 'form-windows',
      name: 'Form Windows',
      full: 'L30 / L14 / L7',
      sample: null,
      invert: false,
      terms: ['l30', 'l14', 'l7', 'windows', 'ytd', 'form trend'],
      def: 'Rolling calendar windows from Team_Profiles / game results — YTD is full season; L30/L14/L7 are trailing day cuts.',
      components: 'compute_team_profile window_trend + Team_Results window suffixes',
      read: 'L30 = form · L14 = recent · L7 = momentum (small sample).',
      research: 'Compare window OSI to YTD for heating/cooling offenses.',
      limits: 'Early season: L7/L14 may not fill until enough games played.'
    }
  ];

  var ANALYST_FLAGS = [
    {
      id: 'flag-regression',
      name: 'Regression Risk',
      full: 'Pitcher Intelligence Flag',
      sample: null,
      invert: false,
      terms: ['regression', 'regression risk', 'fip era gap'],
      def: 'SP flag when FIP − ERA ≥ 0.50 — results likely ahead of underlying skill.',
      components: 'pitcher_lab.js SP_FLAG_RULES.regressionFipGap',
      read: 'Fade overs on ERA-driven narrative; skill may regress.',
      research: 'Prop and total lean toward correction.',
      limits: 'Requires both ERA and FIP on SP_Profiles.'
    },
    {
      id: 'flag-vulnerable',
      name: 'Vulnerable',
      full: 'Pitcher Intelligence Flag',
      sample: null,
      invert: false,
      terms: ['vulnerable', 'vulnerable starter'],
      def: 'ERA ≤ 4.50 but (K%−BB% ≤ 10 or HR/9 ≥ 1.3) — pretty ERA with underlying risk.',
      components: 'SP_FLAG_RULES vulnerableKbbMax / vulnerableHr9Min',
      read: 'Over lean vs weak offenses; fragile vs patient/damage lineups.',
      research: 'Team totals and SP ER props.',
      limits: 'Heuristic flag, not a model signal.'
    },
    {
      id: 'flag-elite-stuff',
      name: 'Elite Stuff',
      full: 'Pitcher Intelligence Flag',
      sample: null,
      invert: false,
      terms: ['elite stuff', 'elite pitcher flag'],
      def: 'Pitch Score ≥ 70, K% ≥ 22, OSI Allowed ≤ 55 — process and results aligned.',
      components: 'SP_FLAG_RULES elitePitchScoreMin / eliteKpctMin / eliteOsiAllowedMax',
      read: 'K prop and under lean in tough matchups.',
      research: 'Quick Angles cards on Pitcher Intelligence.',
      limits: 'OSI Allowed from pipeline; stale L14 sample may affect allowed metrics.'
    },
    {
      id: 'sustainability',
      name: 'Sustainability',
      full: 'Team Profile Verdict',
      sample: null,
      invert: false,
      terms: ['sustainability', 'stable', 'lower support', 'trend verdict'],
      def: 'Team Profile read on whether recent window OSI is supported by process metrics (ABQ/RCV/OBR alignment).',
      components: 'team_profile_intel.js sustainability classification',
      read: 'Stable = window form matches process. Lower-support = hot/cold streak may fade.',
      research: 'Fade or buy window spikes against sustainability grade.',
      limits: 'Qualitative verdict, not a numeric composite.'
    }
  ];

  var ALL_METRICS = CORE_METRICS
    .concat(SURFACE_WIN_METRICS)
    .concat(SP_RATE_METRICS)
    .concat(BULLPEN_METRICS)
    .concat(TREND_METRICS)
    .concat(ANALYST_FLAGS);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderMetricCard(m) {
    var A = global.MLBMAAssets;
    var chip = '';
    if (m.sample != null && A && A.valChipHtml) {
      chip = A.valChipHtml(m.sample, m.invert ? 'bb_pct' : 'osi', m.invert, m.decimals);
    } else if (m.sample != null) {
      chip = '<span class="val-chip">' + esc(m.sample) + '</span>';
    } else {
      chip = '<span class="val-chip c-na">—</span>';
    }
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

  function mountSectionHead(mountId, icon, kicker, title, purpose) {
    var el = document.getElementById(mountId);
    var A = global.MLBMAAssets;
    if (!el || !A || !A.caSectionHeadHtml) return;
    el.innerHTML = A.caSectionHeadHtml(icon, kicker, title, purpose);
  }

  function mountMetricGrid(rootId, metrics) {
    var root = document.getElementById(rootId);
    if (!root) return;
    root.innerHTML = metrics.map(renderMetricCard).join('');
  }

  function renderColorScaleSection() {
    var A = global.MLBMAAssets;
    var legend = A && A.metricLegendHtml
      ? A.metricLegendHtml({ title: 'Graded vs the current-season league average — same color everywhere for the same value' })
      : '<div class="gloss-color-ramp">'
        + '<span class="gloss-swatch gloss-swatch--elite">Elite</span>'
        + '<span class="gloss-swatch gloss-swatch--strong">Strong</span>'
        + '<span class="gloss-swatch gloss-swatch--mid">Average</span>'
        + '<span class="gloss-swatch gloss-swatch--weak">Weak</span>'
        + '<span class="gloss-swatch gloss-swatch--poor">Poor</span></div>';
    return '<div class="gloss-convention ca-board">'
      + '<div id="glossaryColorHead"></div>'
      + '<p class="gloss-convention__lead">Every metric chip and heat-map cell uses the same <strong>green = elite → red = poor</strong> grading. Each stat is graded against its <strong>current-season league average</strong> (the neutral midpoint of the scale) — so the same value always gets the same color, never rescaled to whatever rows are visible in a filtered table.</p>'
      + legend
      + '<ul class="gloss-convention__list">'
      + '<li><strong>Uniform:</strong> A green OSI chip on Team Rankings means the same thing on Team Profile or Compare.</li>'
      + '<li><strong>Purple (#7C4DFF):</strong> brand chrome, section headers, and nav — never a data value color.</li>'
      + '<li><strong>Teal / orange split accents:</strong> framing for home/away or handedness — not metric grades.</li>'
      + '<li><strong>Inverted metrics:</strong> ERA, BB%, HR/9, and Allowed composites flip the scale (lower = greener). See Allowed note below.</li>'
      + '</ul></div>';
  }

  function renderAllowedSection() {
    return '<div class="gloss-convention ca-board">'
      + '<div id="glossaryAllowedHead"></div>'
      + '<p class="gloss-convention__lead"><strong>Allowed metrics</strong> (OSI Allowed, ABQ Allowed, RCV Allowed, OBR Allowed) and pitcher rate stats (ERA, FIP, BB%, HR/9) use <strong>inverted</strong> coloring: <strong>lower = better = greener</strong>.</p>'
      + '<p class="gloss-convention__note">Example: a green <em>OSI Allowed</em> chip means the pitcher suppresses opposing offense well — do not read green as “high allowed.”</p>'
      + '</div>';
  }

  function renderUnitSection() {
    return '<div class="gloss-convention ca-board">'
      + '<div id="glossaryUnitHead"></div>'
      + '<p class="gloss-convention__lead">Team Profile is organized by three units: <strong>Lineup</strong>, <strong>Starting Pitchers</strong>, and <strong>Bullpen</strong>. Each unit has its own split controls and snapshot strip.</p>'
      + '<ul class="gloss-convention__list">'
      + '<li><strong>OOR</strong> appears only as <em>Pitcher OOR</em> or <em>Bullpen Unit OOR</em> — there is no team-level OOR headline.</li>'
      + '<li><strong>Surface wins</strong> (Win%, F5 Win%, SP Win%, QS%) live on Team Rankings and Team Profile lineup/rotation strips from <code>Team_Results</code>.</li>'
      + '<li><strong>Pitcher Intelligence</strong> = SP prop research (recent starts). <strong>Bullpen View</strong> + Bullpen Profile = relievers.</li>'
      + '</ul></div>';
  }

  function mountConventions() {
    var root = document.getElementById('glossaryConventions');
    if (!root) return;
    root.innerHTML = renderColorScaleSection() + renderAllowedSection() + renderUnitSection();
    mountSectionHead('glossaryColorHead', 'bar-chart-3', 'Platform', 'Color Scale', 'Green = elite through red = poor, graded vs each stat\'s league average — uniform across every dashboard surface.');
    mountSectionHead('glossaryAllowedHead', 'arrow-left-right', 'Pitching', 'Allowed & Inverted Metrics', 'Lower is better for Allowed stats and ERA-type rates.');
    mountSectionHead('glossaryUnitHead', 'layout-grid', 'Architecture', 'Unit Structure', 'How Lineup, Rotation, and Bullpen sections fit together.');
  }

  function mountPageHeader() {
    var el = document.getElementById('glossaryPageHeader');
    var A = global.MLBMAAssets;
    if (!el || !A || !A.mountPlatformHeader) return;
    A.mountPlatformHeader(el, {
      eyebrow: 'Reference',
      title: 'Metric Glossary & Methodology',
      subtitle: 'All Definitions, Formulas, And Methodology In One Place.',
      showPlatformNav: false
    });
  }

  function filterGlossary(value) {
    var input = document.getElementById('glossarySearch');
    var q = String(value != null ? value : (input ? input.value : '')).toLowerCase().trim();
    var terms = document.querySelectorAll('.glossary-term');
    var visibleTerms = 0;
    terms.forEach(function(el) {
      var hay = ((el.getAttribute('data-term') || '') + ' ' + (el.textContent || '')).toLowerCase();
      var hiddenSearchSection = !!q && !!el.closest('#glossaryStaticReference');
      var visible = !q || (!hiddenSearchSection && hay.indexOf(q) >= 0);
      el.classList.toggle('hidden', !visible);
      if (visible) visibleTerms += 1;
    });

    var alphaVisible = 0;
    document.querySelectorAll('#alphaGlossary li').forEach(function(li) {
      var visible = !q || String(li.textContent || '').toLowerCase().indexOf(q) >= 0;
      li.hidden = !visible;
      if (visible) alphaVisible += 1;
    });

    document.querySelectorAll('.gloss-section-block').forEach(function(block) {
      var hasVisible = !!block.querySelector('.glossary-term:not(.hidden)');
      block.hidden = !!q && !hasVisible;
    });

    ['glossaryConventions', 'glossaryReadingLabel', 'glossaryStaticReference'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.hidden = !!q;
    });

    var status = document.getElementById('glossarySearchStatus');
    if (status) {
      if (!q) status.textContent = 'Search Across Metrics, Formulas, And Research Uses.';
      else if (visibleTerms || alphaVisible) status.textContent = (visibleTerms + alphaVisible) + ' Matching Reference Items';
      else status.textContent = 'No Glossary Terms Match "' + q + '"';
    }
  }

  function initGlossaryPage() {
    mountPageHeader();
    mountConventions();
    mountSectionHead('glossaryCoreHead', 'clipboard-list', 'Reference', 'Core Metric Definitions', 'Created composites — formulas verified against core/config.py.');
    mountMetricGrid('glossaryMetricCards', CORE_METRICS);
    mountSectionHead('glossarySurfaceHead', 'trophy', 'Team Results', 'Surface Wins', 'Win-facing outcomes from Team_Results / game_results.csv — live on Team Rankings.');
    mountMetricGrid('glossarySurfaceCards', SURFACE_WIN_METRICS);
    mountSectionHead('glossarySpHead', 'target', 'Starting Pitchers', 'SP Rate Metrics', 'FanGraphs rates feeding Pitching Score and Pitcher Intelligence.');
    mountMetricGrid('glossarySpCards', SP_RATE_METRICS);
    mountSectionHead('glossaryBpHead', 'shield-check', 'Bullpen', 'Leverage & Saves', 'Unit leverage ERAs and team save conversion from game results.');
    mountMetricGrid('glossaryBpCards', BULLPEN_METRICS);
    mountSectionHead('glossaryTrendHead', 'trending-up', 'Form', 'Velocity & Windows', 'Trends heat map columns — YTD through L7 and slope-based velocity.');
    mountMetricGrid('glossaryTrendCards', TREND_METRICS);
    mountSectionHead('glossaryFlagsHead', 'clipboard-list', 'Analyst', 'Flags & Sustainability', 'Pitcher Intelligence heuristics and Team Profile trend verdicts.');
    mountMetricGrid('glossaryFlagsCards', ANALYST_FLAGS);
    var search = document.getElementById('glossarySearch');
    if (search) {
      search.addEventListener('input', function() { filterGlossary(search.value); });
      filterGlossary(search.value);
    }
  }

  global.MLBMAGlossary = {
    METRICS: ALL_METRICS,
    CORE_METRICS: CORE_METRICS,
    mountGlossaryMetrics: function(id) { mountMetricGrid(id || 'glossaryMetricCards', CORE_METRICS); },
    renderMetricCard: renderMetricCard,
    filterGlossary: filterGlossary
  };
  global.filterGlossary = filterGlossary;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGlossaryPage);
  } else {
    initGlossaryPage();
  }
})(typeof window !== 'undefined' ? window : this);
