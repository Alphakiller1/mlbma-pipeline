/**
 * Matchup comparison page — full 7-section game breakdown.
 */
(function(global) {
  'use strict';

  var S = global.MLBMASharedMatchup;
  var A = global.MLBMAAssets;
  var T = MLBMA_CONFIG.SHEET_TABS;

  function esc(s) { return S ? S.esc(s) : String(s || ''); }
  function fmt(v, d) {
    if (v == null || isNaN(v)) return '—';
    return (d != null ? v.toFixed(d) : v.toFixed(1));
  }
  function metricChip(v, ctx, invert, decimals) {
    if (A && A.valChipHtml) return A.valChipHtml(v, ctx || 'osi', !!invert, decimals);
    return '<strong>' + fmt(v, decimals) + '</strong>';
  }

  function qp(name) {
    return new URLSearchParams(global.location.search).get(name) || '';
  }

  function teamProfileUrl(team) {
    return 'team_profile.html?team=' + encodeURIComponent(team || '');
  }

  function pitcherProfileUrl(name) {
    return 'pitcher_profile.html?pitcher=' + encodeURIComponent(name || '');
  }

  function bullpenReportUrl(team) {
    return 'bullpen_report.html?team=' + encodeURIComponent(team || '');
  }

  function compareUrl(away, home) {
    return 'matchup_compare.html?away=' + encodeURIComponent(away) + '&home=' + encodeURIComponent(home);
  }

  var COMPARE_MODES = [
    { id: 'lvL', label: 'Lineup vs Lineup' },
    { id: 'lvP', label: 'Lineup vs Pitcher' },
    { id: 'lvB', label: 'Lineup vs Bullpen' },
    { id: 'bpBp', label: 'Bullpen vs Bullpen' },
    { id: 'spSp', label: 'Pitcher vs Pitcher' }
  ];
  var COMPARE_IDS = COMPARE_MODES.map(function(x) { return x.id; });
  var _compareCtx = null;
  var _compareState = null;
  var _lastRadarSize = null;
  var _resizeBound = false;

  function getCompareState() {
    var mode = qp('compare') || 'lvL';
    if (COMPARE_IDS.indexOf(mode) < 0) mode = 'lvL';
    var lvpLineup = qp('lvpLineup') === 'home' ? 'home' : 'away';
    var lvpPitcher = qp('lvpPitcher') === 'away' ? 'away' : 'home';
    if (lvpLineup === lvpPitcher) lvpPitcher = lvpLineup === 'away' ? 'home' : 'away';
    var lvbLineup = qp('lvbLineup') === 'home' ? 'home' : 'away';
    var lvbBp = qp('lvbBp') === 'home' ? 'home' : 'away';
    if (lvbLineup === lvbBp) lvbBp = lvbLineup === 'away' ? 'home' : 'away';
    var lvWin = (qp('lvWin') || 'ytd').toLowerCase();
    if (['l7', 'l14', 'l30', 'ytd'].indexOf(lvWin) < 0) lvWin = 'ytd';
    return {
      mode: mode,
      lvpLineup: lvpLineup,
      lvpPitcher: lvpPitcher,
      lvbLineup: lvbLineup,
      lvbBp: lvbBp,
      lvWin: lvWin
    };
  }

  function syncCompareUrl(state) {
    var params = new URLSearchParams(global.location.search);
    params.set('compare', state.mode);
    if (state.mode === 'lvP') {
      params.set('lvpLineup', state.lvpLineup);
      params.set('lvpPitcher', state.lvpPitcher);
    } else {
      params.delete('lvpLineup');
      params.delete('lvpPitcher');
    }
    if (state.mode === 'lvB') {
      params.set('lvbLineup', state.lvbLineup);
      params.set('lvbBp', state.lvbBp);
    } else {
      params.delete('lvbLineup');
      params.delete('lvbBp');
    }
    if (state.mode === 'lvL') {
      params.set('lvWin', state.lvWin || 'ytd');
    } else {
      params.delete('lvWin');
    }
    params.delete('lvSplit');
    var qs = params.toString();
    var next = global.location.pathname + (qs ? '?' + qs : '');
    if (global.history && global.history.replaceState) {
      global.history.replaceState(null, '', next);
    }
  }

  function compareNavHtml(activeMode) {
    return '<nav class="mc-compare-nav hub-control-bar" role="tablist" aria-label="Comparison mode">'
      + '<div class="hub-pill-row mc-compare-nav-row">'
      + COMPARE_MODES.map(function(mode) {
        var on = activeMode === mode.id;
        return '<button type="button" class="hub-pill mc-compare-tab' + (on ? ' active' : '') + '" role="tab"'
          + ' data-compare="' + mode.id + '" aria-selected="' + (on ? 'true' : 'false') + '"'
          + ' id="mcTab-' + mode.id + '" aria-controls="mcPane-' + mode.id + '">'
          + esc(mode.label) + '</button>';
      }).join('')
      + '</div></nav>';
  }

  function paneWrap(id, active, inner) {
    return '<section class="mc-compare-pane' + (active ? ' is-active is-entering' : '') + '" id="mcPane-' + id + '"'
      + ' data-compare="' + id + '" role="tabpanel" aria-labelledby="mcTab-' + id + '"'
      + (active ? '' : ' hidden') + '>' + inner + '</section>';
  }

  function subPill(kind, side, label, sublabel, active, dataAttr) {
    return '<button type="button" class="hub-pill mc-subsel-pill' + (active ? ' active' : '') + '"'
      + ' data-subsel-kind="' + esc(kind) + '" data-subsel-side="' + esc(side) + '"'
      + ' ' + dataAttr + '="' + esc(side) + '" aria-pressed="' + (active ? 'true' : 'false') + '">'
      + '<span class="mc-subsel-pill-main">' + esc(label) + '</span>'
      + (sublabel ? '<span class="mc-subsel-pill-sub">' + esc(sublabel) + '</span>' : '')
      + '</button>';
  }

  function pairingBanner(valid, tonightLabel) {
    if (valid) {
      return '<div class="mc-pair-banner mc-pair-banner--match">' + esc(tonightLabel) + ' — tonight\'s pairing</div>';
    }
    return '<div class="mc-pair-banner mc-pair-banner--alt">Cross-check — not the starter this lineup faces tonight</div>';
  }

  function pitcherLabel(m, side) {
    var name = side === 'away' ? (m.awaySP || 'TBD') : (m.homeSP || 'TBD');
    var team = side === 'away' ? m.away : m.home;
    var hand = side === 'away' ? m.awayHand : m.homeHand;
    return { name: name, team: team, hand: hand, side: side === 'away' ? 'Away' : 'Home' };
  }

  function buildScoreMap(rows) {
    var map = {};
    (rows || []).forEach(function(row) {
      var s = S.scoreRowFromSheet(row);
      if (s) map[s.t] = s;
    });
    return map;
  }

  function teamSplits(team, scR, scL) {
    return { vsR: scR[team] || null, vsL: scL[team] || null, both: scR[team] || scL[team] || null };
  }

  function getPitchScore(team, pitchingMap) {
    var p = pitchingMap[S.teamKey(team)];
    return p ? p.pitchScore : null;
  }

  function parseWeatherMap(rows) {
    return S && S.parseWeatherMap ? S.parseWeatherMap(rows) : {};
  }

  function findMatchup(rows, away, home) {
    var norm = S && S.normalizeTeamAbbr ? S.normalizeTeamAbbr.bind(S) : function(t) { return String(t || '').trim().toUpperCase(); };
    var list = S.parseMatchupRows(rows);
    var a = norm(away);
    var h = norm(home);
    return list.find(function(m) {
      return norm(m.away) === a && norm(m.home) === h;
    }) || null;
  }

  function filterSlateMatchupRows(rows) {
    if (!S || !S.filterLineupSheetRows) return rows || [];
    return S.filterLineupSheetRows(rows || [], []);
  }

  function renderMatchupMissing(root, away, home, rows) {
    var list = filterSlateMatchupRows(rows || []);
    var games = S ? S.parseMatchupRows(list) : [];
    var picks = games.map(function(m) {
      return '<a class="hub-pill mc-slate-pick" href="' + compareUrl(m.away, m.home) + '">'
        + esc(m.away) + ' @ ' + esc(m.home) + '</a>';
    }).join('');
    var hint = away && home
      ? '<p class="ca-helper">No slate row for <strong>' + esc(away) + ' @ ' + esc(home) + '</strong>.</p>'
      : '<p class="ca-helper">Choose a game from today\'s slate:</p>';
    root.innerHTML = '<div class="compare-page">'
      + '<nav class="compare-breadcrumb" aria-label="Breadcrumb">'
      + '<a href="chase_analytics_mlb_oem_v7.html">Opening</a><span class="bc-sep">›</span>'
      + '<a href="chase_analytics_mlb_oem_v7.html#section-matchups-hero">Today\'s Matchups</a></nav>'
      + hint
      + (picks ? '<div class="hub-pill-row mc-slate-picks">' + picks + '</div>' : '')
      + '<p class="ca-helper" style="margin-top:14px"><a href="chase_analytics_mlb_oem_v7.html#section-matchups-hero">Back to matchups</a></p>'
      + '</div>';
  }

  function renderLoadError(root, err) {
    root.innerHTML = '<div class="compare-page"><p class="ca-helper">Could not load matchup data'
      + (err && err.message ? ' (' + esc(err.message) + ')' : '')
      + '. <a href="javascript:location.reload()">Retry</a> or '
      + '<a href="chase_analytics_mlb_oem_v7.html#section-matchups-hero">back to matchups</a>.</p></div>';
  }

  function spL14Stale(rows, pitcherName, team) {
    var key = S.normName(pitcherName);
    if (!key || key === 'tbd') return false;
    var hit = (rows || []).find(function(row) {
      var n = S.normName(S.pickCol(row, 'pitcher_name', 'Pitcher', 'Name'));
      var tm = S.teamKey(S.pickCol(row, 'pitcher_team', 'Team', 'Tm'));
      if (n !== key) return false;
      if (team && tm && tm !== S.teamKey(team)) return false;
      return true;
    });
    if (!hit) return false;
    var drift = S.numOrNull(S.pickCol(hit, 'L14_drift', 'osi_drift', 'drift'));
    var flag = String(S.pickCol(hit, 'staleness_flag', 'staleness', 'stale')).toLowerCase();
    return flag === 'true' || flag === '1' || flag === 'yes' || flag === 'stale' || (drift != null && Math.abs(drift) >= 5);
  }

  function spH2hEdge(m, awayProf, homeProf, awayPs, homePs) {
    var awayOsi = m.awayOSI;
    var homeOsi = m.homeOSI;
    var awayAllow = awayProf && awayProf.osiAllowed != null ? awayProf.osiAllowed : null;
    var homeAllow = homeProf && homeProf.osiAllowed != null ? homeProf.osiAllowed : null;
    var awayScore = 0;
    var homeScore = 0;
    if (awayOsi != null && homeAllow != null) awayScore += (awayOsi - (100 - homeAllow));
    if (homeOsi != null && awayAllow != null) homeScore += (homeOsi - (100 - awayAllow));
    if (awayPs != null && homePs != null) awayScore += (awayPs - homePs) * 0.15;
    var edge = 'Even';
    var edgeLabel = 'Even';
    var why = 'Starter and lineup metrics are closely matched.';
    if (awayScore > homeScore + 4) {
      edge = m.away;
      edgeLabel = 'Away SP';
      why = (m.awaySP || 'Away SP') + ' profiles better against ' + m.home + '\'s lineup split than the reverse.';
    } else if (homeScore > awayScore + 4) {
      edge = m.home;
      edgeLabel = 'Home SP';
      why = (m.homeSP || 'Home SP') + ' has the cleaner matchup profile vs ' + m.away + '\'s order.';
    }
    return { edge: edge, edgeLabel: edgeLabel, why: why };
  }

  function oorContextLabel(oor) {
    if (oor == null || isNaN(oor)) return '';
    if (oor >= 55) return 'above';
    if (oor <= 45) return 'below';
    return 'near';
  }

  function norm100(v, invert, maxVal) {
    if (v == null || isNaN(v)) return 50;
    var n = Number(v);
    if (n > 0 && n <= 1 && maxVal == null) n *= 100;
    if (maxVal != null) n = Math.min(100, (n / maxVal) * 100);
    n = Math.max(0, Math.min(100, n));
    return invert ? 100 - n : n;
  }

  function pitcherRadarValues(met, pitchScore, m, side) {
    var stats = side === 'away'
      ? { k: m.awayK, bb: m.awayBB, hr9: m.awayHR9 }
      : { k: m.homeK, bb: m.homeBB, hr9: m.homeHR9 };
    if (met.kPct != null) stats.k = met.kPct;
    if (met.bbPct != null) stats.bb = met.bbPct;
    if (met.hr9 != null) stats.hr9 = met.hr9;
    var k = stats.k != null ? (stats.k > 1 ? stats.k : stats.k * 100) : 50;
    var bb = stats.bb != null ? (stats.bb > 1 ? stats.bb : stats.bb * 100) : 50;
    var hr9 = stats.hr9 != null ? Number(stats.hr9) : 1.2;
    var osiAllow = met.osiAllowed != null ? met.osiAllowed : 50;
    var oor = met.oor != null ? met.oor : 50;
    return [
      norm100(pitchScore, false),
      norm100(k, false),
      norm100(bb, true),
      norm100(hr9, true, 2.5),
      norm100(osiAllow, true),
      norm100(oor, false)
    ];
  }

  function renderPitcherRadar(m, awayMet, homeMet, awayPs, homePs) {
    if (!global.MLBMACharts) return '';
    return '<div id="mcPitcherRadar" class="mc-radar-mount" data-radar="pitcher"></div>';
  }


  function renderTeamCompareRadar(m) {
    if (!global.MLBMACharts) return '';
    return '<div class="mc-section-block mc-radar-section">'
      + '<h2 class="mc-section-title">Team Profile Radar: Lineup vs Lineup</h2>'
      + '<p class="mc-radar-hint ca-helper">Hover any axis label or point for what each metric means and what it tells you about each lineup.</p>'
      + '<div class="mc-radar-duo">'
      + '<div class="mc-radar-panel">'
      + '<div class="mc-radar-panel-label">Process Composite</div>'
      + '<div id="mcTeamRadarProcess" class="mc-radar-mount" data-radar="process"></div>'
      + '</div>'
      + '<div class="mc-radar-panel">'
      + '<div class="mc-radar-panel-label">Offense &amp; Schedule</div>'
      + '<div id="mcTeamRadarContext" class="mc-radar-mount" data-radar="context"></div>'
      + '</div>'
      + '</div></div>';
  }

  function radarChartSize() {
    var w = typeof window !== 'undefined' ? window.innerWidth : 1024;
    if (w < 400) return 240;
    if (w < 520) return 260;
    if (w < 720) return 280;
    return 300;
  }

  function clearRadarMounts() {
    ['mcTeamRadarProcess', 'mcTeamRadarContext', 'mcPitcherRadar'].forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      delete el.dataset.mounted;
      el.innerHTML = '';
    });
  }

  function bindRadarResize() {
    if (_resizeBound || typeof window === 'undefined') return;
    _resizeBound = true;
    var timer;
    window.addEventListener('resize', function() {
      clearTimeout(timer);
      timer = setTimeout(function() {
        if (!_compareCtx || !_compareState) return;
        var sz = radarChartSize();
        if (sz === _lastRadarSize) return;
        _lastRadarSize = sz;
        clearRadarMounts();
        mountChartsForMode(_compareState.mode, _compareCtx);
      }, 180);
    });
  }

  function mountTeamRadar(m, awayRow, homeRow, scR, scL, pals) {
    if (!global.MLBMACharts || !MLBMACharts.renderTeamCompareRadars) return;
    var proc = document.getElementById('mcTeamRadarProcess');
    var ctxEl = document.getElementById('mcTeamRadarContext');
    if (!proc || !ctxEl || proc.dataset.mounted === '1') return;
    pals = pals || {};
    MLBMACharts.renderTeamCompareRadars(
      'mcTeamRadarProcess',
      'mcTeamRadarContext',
      awayRow,
      homeRow,
      pals[m.away] || {},
      pals[m.home] || {},
      m.away,
      m.home,
      { size: radarChartSize(), palsMap: pals }
    );
    proc.dataset.mounted = '1';
    ctxEl.dataset.mounted = '1';
  }

  function mountPitcherRadar(m, awayMet, homeMet, awayPs, homePs) {
    if (!global.MLBMACharts) return;
    var el = document.getElementById('mcPitcherRadar');
    if (!el || el.dataset.mounted === '1') return;
    var metrics = ['Pitch Score', 'K%', 'BB%', 'HR/9', 'OSI Alw', 'OOR'];
    var teams = [
      { abbr: m.away, values: pitcherRadarValues(awayMet, awayPs, m, 'away') },
      { abbr: m.home, values: pitcherRadarValues(homeMet, homePs, m, 'home') }
    ];
    var radarColors = MLBMACharts.radarColorForTeam
      ? [MLBMACharts.radarColorForTeam(m.away), MLBMACharts.radarColorForTeam(m.home)]
      : [MLBMACharts.COMPARE_RADAR_AWAY || '#7C4DFF', MLBMACharts.COMPARE_RADAR_HOME || '#60A5FA'];
    MLBMACharts.buildRadarChart('mcPitcherRadar', teams, metrics, radarColors, { size: radarChartSize() });
    el.dataset.mounted = '1';
  }

  function lvPSelectorHtml(m, state) {
    var awayP = pitcherLabel(m, 'away');
    var homeP = pitcherLabel(m, 'home');
    var lineupTeam = state.lvpLineup === 'home' ? m.home : m.away;
    var pitcher = state.lvpPitcher === 'away' ? awayP : homeP;
    var valid = (state.lvpLineup === 'away' && state.lvpPitcher === 'home')
      || (state.lvpLineup === 'home' && state.lvpPitcher === 'away');
    var readout = lineupTeam + ' lineup vs ' + pitcher.name + ' (' + pitcher.team + ')';
    return '<div class="mc-subsel mc-subsel--lvp">'
      + '<p class="mc-subsel-intro">Choose which lineup and which pitcher to analyze for this matchup.</p>'
      + '<div class="mc-subsel-grid">'
      + '<div class="mc-subsel-group"><span class="mc-subsel-label">Lineup</span>'
      + '<div class="hub-pill-row mc-subsel-row">'
      + subPill('lvp-lineup', 'away', m.away, 'Away', state.lvpLineup === 'away', 'data-lvp-lineup')
      + subPill('lvp-lineup', 'home', m.home, 'Home', state.lvpLineup === 'home', 'data-lvp-lineup')
      + '</div></div>'
      + '<div class="mc-subsel-group"><span class="mc-subsel-label">Pitcher</span>'
      + '<div class="hub-pill-row mc-subsel-row">'
      + subPill('lvp-pitcher', 'away', awayP.name, awayP.team + ' · ' + (awayP.hand || '?'), state.lvpPitcher === 'away', 'data-lvp-pitcher')
      + subPill('lvp-pitcher', 'home', homeP.name, homeP.team + ' · ' + (homeP.hand || '?'), state.lvpPitcher === 'home', 'data-lvp-pitcher')
      + '</div></div>'
      + '</div>'
      + '<div class="mc-subsel-readout"><span class="mc-subsel-readout-label">Analyzing</span> '
      + '<strong>' + esc(readout) + '</strong></div>'
      + pairingBanner(valid, readout)
      + '</div>';
  }

  function lvBSelectorHtml(m, state) {
    var lineupTeam = state.lvbLineup === 'home' ? m.home : m.away;
    var bpTeam = state.lvbBp === 'home' ? m.home : m.away;
    var valid = (state.lvbLineup === 'away' && state.lvbBp === 'home')
      || (state.lvbLineup === 'home' && state.lvbBp === 'away');
    var readout = lineupTeam + ' lineup vs ' + bpTeam + ' bullpen';
    return '<div class="mc-subsel mc-subsel--lvb">'
      + '<p class="mc-subsel-intro">Choose which lineup and which bullpen unit to analyze post-starter.</p>'
      + '<div class="mc-subsel-grid">'
      + '<div class="mc-subsel-group"><span class="mc-subsel-label">Lineup</span>'
      + '<div class="hub-pill-row mc-subsel-row">'
      + subPill('lvb-lineup', 'away', m.away, 'Away', state.lvbLineup === 'away', 'data-lvb-lineup')
      + subPill('lvb-lineup', 'home', m.home, 'Home', state.lvbLineup === 'home', 'data-lvb-lineup')
      + '</div></div>'
      + '<div class="mc-subsel-group"><span class="mc-subsel-label">Bullpen</span>'
      + '<div class="hub-pill-row mc-subsel-row">'
      + subPill('lvb-bp', 'away', m.away + ' Bullpen', 'Away relief', state.lvbBp === 'away', 'data-lvb-bp')
      + subPill('lvb-bp', 'home', m.home + ' Bullpen', 'Home relief', state.lvbBp === 'home', 'data-lvb-bp')
      + '</div></div>'
      + '</div>'
      + '<div class="mc-subsel-readout"><span class="mc-subsel-readout-label">Analyzing</span> '
      + '<strong>' + esc(readout) + '</strong></div>'
      + pairingBanner(valid, readout)
      + '</div>';
  }

  function lineupVsPitcherContent(ctx, lineupSide, pitcherSide, state) {
    var m = ctx.m;
    var lineupTeam = lineupSide === 'home' ? m.home : m.away;
    var pitcherTeam = pitcherSide === 'home' ? m.home : m.away;
    var spName = pitcherSide === 'home' ? m.homeSP : m.awaySP;
    var spHand = pitcherSide === 'home' ? m.homeHand : m.awayHand;
    state = state || _compareState || { lvWin: 'ytd' };
    var lineupCard = global.MatchupLineupCompare && MatchupLineupCompare.lineupCardForPitcher
      ? MatchupLineupCompare.lineupCardForPitcher(ctx, state, lineupSide, spHand)
      : ('<div class="mc-card mc-lineup-col"><h3 class="mc-lineup-col-head">'
        + S.teamLogo(lineupTeam, 20) + ' <span>' + esc(lineupTeam) + ' Projected Lineup</span></h3>'
        + S.buildLineupTable(lineupSide === 'home' ? ctx.homeLineup : ctx.awayLineup, spHand) + '</div>');
    var winControls = global.MatchupLineupCompare && MatchupLineupCompare.controlsHtml
      ? MatchupLineupCompare.controlsHtml(state)
      : '';
    var splits = (ctx.data && ctx.data.spMetricSplits) || [];
    var spProfiles = (ctx.data && ctx.data.spProfiles) || [];
    var lineup = lineupSide === 'home' ? ctx.homeLineup : ctx.awayLineup;
    var pitcherPanel = global.MatchupOffenseSplits && MatchupOffenseSplits.renderPitcherAllowedPanel
      ? MatchupOffenseSplits.renderPitcherAllowedPanel(spName, pitcherTeam, splits, spHand)
      : '';
    var teamRanks = global.MatchupOffenseSplits && MatchupOffenseSplits.renderLvpTeamRanks
      ? MatchupOffenseSplits.renderLvpTeamRanks(ctx, lineupSide, spHand, spName, pitcherTeam, splits, spProfiles, lineup)
      : '';
    var splitHead = global.MatchupLvP && MatchupLvP.lvpSectionHead
      ? MatchupLvP.lvpSectionHead(
        'Lineup & Pitcher Splits',
        'Lineup split stats vs opposing starter hand · pitcher allowed offense vs LHH/RHH.'
      )
      : '<header class="mc-lvp-section-head"><h3 class="mc-lvp-section-head__title">Lineup &amp; Pitcher Splits</h3>'
        + '<p class="mc-lvp-section-head__desc">Lineup split stats vs opposing starter hand · pitcher allowed offense vs LHH/RHH.</p></header>';
    return '<div class="mc-lvp-body">'
      + '<section class="mc-lvp-section mc-lvp-section--matchup">'
      + splitHead
      + '<div class="mc-lvp-lineup-block">'
      + winControls
      + '<div class="mc-grid-2 mc-lvp-grid mc-lvp-visual-duo">'
      + '<div id="mcLvPLineupCard">' + lineupCard + '</div>'
      + '<div id="mcLvPSpSplits">' + pitcherPanel + '</div>'
      + '</div></div>'
      + '</section>'
      + teamRanks
      + '<div id="mcLvPAsync" class="mc-lvp-async"><p class="ca-helper">Loading performance comparison…</p></div>'
      + '</div>';
  }

  function hydrateLvP(root, ctx, state) {
    if (!root) return;
    if (global.MatchupOffenseSplits && MatchupOffenseSplits.hydrateHitterVsPitcher) {
      MatchupOffenseSplits.hydrateHitterVsPitcher(root, ctx, state.lvpLineup, state.lvpPitcher);
    }
    if (!global.MatchupLvP || !MatchupLvP.hydrate) return;
    var box = root.querySelector('#mcLvPAsync');
    if (!box) return;
    MatchupLvP.hydrate(box, ctx, state.lvpLineup, state.lvpPitcher);
  }

  function lineupVsBullpenContent(ctx, lineupSide, bpSide) {
    var m = ctx.m;
    var lineupTeam = lineupSide === 'home' ? m.home : m.away;
    var bpTeam = bpSide === 'home' ? m.home : m.away;
    var lineup = lineupSide === 'home' ? ctx.homeLineup : ctx.awayLineup;
    var bp = bpSide === 'home' ? ctx.homeBp : ctx.awayBp;
    var oppHand = lineupSide === 'home' ? m.awayHand : m.homeHand;
    var lineupOsi = lineupSide === 'home' ? m.homeOSI : m.awayOSI;
    var bpScore = S.bullpenPitchScore(bp);
    var risk = S.bullpenRisk(bp);
    var edge = S.lineupEdgeIndicator(lineupOsi, bp && bp.osiAllowed);
    return '<div class="mc-lvb-body">'
      + '<div class="mc-grid-2 mc-lvb-grid">'
      + '<div class="mc-card mc-lineup-col"><h3 class="mc-lineup-col-head">'
      + S.teamLogo(lineupTeam, 20) + ' <span>' + esc(lineupTeam) + ' Projected Lineup</span></h3>'
      + S.buildLineupTable(lineup, oppHand) + '</div>'
      + '<div>' + bullpenPanel(bpTeam, bp) + '</div>'
      + '</div>'
      + '<div class="mc-card mc-lvb-read" style="margin-top:16px;">'
      + '<div class="mc-edge-label">' + esc(lineupTeam) + ' lineup OSI vs ' + esc(bpTeam) + ' bullpen</div>'
      + '<div class="mc-edge-osi" style="font-size:28px;margin:8px 0;">' + metricChip(lineupOsi, 'osi', false, 1) + '</div>'
      + '<div class="mc-bp-metric">Bullpen Pitching Score ' + metricChip(bpScore, 'pitching', false, 1) + '</div>'
      + '<div class="mc-bp-metric">Bullpen OSI Allowed ' + metricChip(bp && bp.osiAllowed, 'osi', true, 1) + '</div>'
      + '<div class="' + edge.cls + '" style="margin-top:10px;">' + esc(edge.label) + '</div>'
      + '<div class="mc-bp-metric" style="margin-top:8px;">Risk: <span class="' + risk.cls + '">' + esc(risk.label) + '</span></div>'
      + '</div></div>';
  }

  function renderPaneLvL(ctx, state) {
    return '<p class="mc-pane-desc mc-pane-desc--lead">Compare both projected lineups and split-adjusted offensive edges.</p>'
      + renderTeamCompareRadar(ctx.m)
      + (global.MatchupOffenseSplits ? MatchupOffenseSplits.renderSection(ctx) : '')
      + (global.MatchupLineupCompare
        ? MatchupLineupCompare.renderSection(ctx, state)
        : sectionProjectedLineups(ctx.m, ctx.awayLineup, ctx.homeLineup, ctx.lineupOk, { bare: true }));
  }

  function renderPaneLvP(ctx, state) {
    return '<h2 class="mc-pane-title">Lineup vs Pitcher</h2>'
      + '<p class="mc-pane-desc mc-pane-desc--lead">Lineup offense vs tonight\'s starter — recent form, last 10 starts, and head-to-head pitching metrics.</p>'
      + lvPSelectorHtml(ctx.m, state)
      + '<div id="mcLvPContent">' + lineupVsPitcherContent(ctx, state.lvpLineup, state.lvpPitcher, state) + '</div>';
  }

  function renderPaneLvB(ctx, state) {
    var m = ctx.m;
    return '<h2 class="mc-pane-title">Lineup vs Bullpen</h2>'
      + lvBSelectorHtml(m, state)
      + '<div id="mcLvBContent">' + lineupVsBullpenContent(ctx, state.lvbLineup, state.lvbBp) + '</div>';
  }

  function renderPaneBpBp(ctx) {
    var m = ctx.m;
    return '<h2 class="mc-pane-title">Bullpen vs Bullpen</h2>'
      + '<p class="mc-pane-desc">Relief corps comparison for late-game leverage.</p>'
      + sectionBullpen(m, ctx.awayBp, ctx.homeBp, { bare: true });
  }

  function renderPaneSpSp(ctx) {
    return '<h2 class="mc-pane-title">Pitcher vs Pitcher</h2>'
      + '<p class="mc-pane-desc">Starting pitcher duel — stats, radar, and head-to-head edge.</p>'
      + sectionSP(ctx.m, ctx.awayMet, ctx.homeMet, ctx.awayProf, ctx.homeProf, ctx.awayPs, ctx.homePs, ctx.h2h, ctx.data.spL14, { bare: true });
  }

  function mountChartsForMode(mode, ctx) {
    _lastRadarSize = radarChartSize();
    requestAnimationFrame(function() {
      if (mode === 'lvL') mountTeamRadar(ctx.m, ctx.awayRow, ctx.homeRow, ctx.scR, ctx.scL, ctx.pals);
      if (mode === 'spSp') mountPitcherRadar(ctx.m, ctx.awayMet, ctx.homeMet, ctx.awayPs, ctx.homePs);
    });
  }

  function refreshLvPContent(root, ctx, state) {
    var box = root.querySelector('#mcLvPContent');
    var sel = root.querySelector('.mc-subsel--lvp');
    if (!box || !sel) return;
    box.classList.add('is-swapping');
    box.innerHTML = lineupVsPitcherContent(ctx, state.lvpLineup, state.lvpPitcher, state);
    var tmp = document.createElement('div');
    tmp.innerHTML = lvPSelectorHtml(ctx.m, state);
    var newSel = tmp.querySelector('.mc-subsel--lvp');
    if (newSel) sel.replaceWith(newSel);
    requestAnimationFrame(function() {
      box.classList.remove('is-swapping');
      bindSubSelectors(root, ctx, state);
      if (global.MatchupLineupCompare && MatchupLineupCompare.bindControls) {
        MatchupLineupCompare.bindControls(root, ctx, state, function(next) {
          syncCompareUrl(next);
        });
      }
      hydrateLvP(root, ctx, state);
    });
  }

  function refreshLvBContent(root, ctx, state) {
    var box = root.querySelector('#mcLvBContent');
    var sel = root.querySelector('.mc-subsel--lvb');
    if (!box || !sel) return;
    box.classList.add('is-swapping');
    box.innerHTML = lineupVsBullpenContent(ctx, state.lvbLineup, state.lvbBp);
    var tmp = document.createElement('div');
    tmp.innerHTML = lvBSelectorHtml(ctx.m, state);
    var newSel = tmp.querySelector('.mc-subsel--lvb');
    if (newSel) sel.replaceWith(newSel);
    requestAnimationFrame(function() {
      box.classList.remove('is-swapping');
      bindSubSelectors(root, ctx, state);
    });
  }

  function activateComparePane(root, mode) {
    root.querySelectorAll('.mc-compare-pane').forEach(function(pane) {
      var on = pane.dataset.compare === mode;
      pane.classList.toggle('is-active', on);
      if (on) {
        pane.removeAttribute('hidden');
        pane.classList.remove('is-entering');
        requestAnimationFrame(function() {
          pane.classList.add('is-entering');
          setTimeout(function() { pane.classList.remove('is-entering'); }, 340);
        });
      } else {
        pane.setAttribute('hidden', '');
        pane.classList.remove('is-entering');
      }
    });
    root.querySelectorAll('.mc-compare-tab').forEach(function(tab) {
      var on = tab.dataset.compare === mode;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function bindSubSelectors(root, ctx, state) {
    root.querySelectorAll('[data-lvp-lineup]').forEach(function(btn) {
      btn.onclick = function() {
        state.lvpLineup = btn.getAttribute('data-lvp-lineup');
        if (state.lvpLineup === state.lvpPitcher) {
          state.lvpPitcher = state.lvpLineup === 'away' ? 'home' : 'away';
        }
        syncCompareUrl(state);
        refreshLvPContent(root, ctx, state);
      };
    });
    root.querySelectorAll('[data-lvp-pitcher]').forEach(function(btn) {
      btn.onclick = function() {
        state.lvpPitcher = btn.getAttribute('data-lvp-pitcher');
        syncCompareUrl(state);
        refreshLvPContent(root, ctx, state);
      };
    });
    root.querySelectorAll('[data-lvb-lineup]').forEach(function(btn) {
      btn.onclick = function() {
        state.lvbLineup = btn.getAttribute('data-lvb-lineup');
        if (state.lvbLineup === state.lvbBp) {
          state.lvbBp = state.lvbLineup === 'away' ? 'home' : 'away';
        }
        syncCompareUrl(state);
        refreshLvBContent(root, ctx, state);
      };
    });
    root.querySelectorAll('[data-lvb-bp]').forEach(function(btn) {
      btn.onclick = function() {
        state.lvbBp = btn.getAttribute('data-lvb-bp');
        syncCompareUrl(state);
        refreshLvBContent(root, ctx, state);
      };
    });
  }

  function bindCompareUI(root, ctx, state) {
    root.querySelectorAll('.mc-compare-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        var mode = tab.getAttribute('data-compare');
        if (!mode || mode === state.mode) return;
        state.mode = mode;
        syncCompareUrl(state);
        activateComparePane(root, mode);
        mountChartsForMode(mode, ctx);
        if (mode === 'lvP') hydrateLvP(root, ctx, state);
      });
    });
    bindSubSelectors(root, ctx, state);
    if (global.MatchupLineupCompare && MatchupLineupCompare.bindControls) {
      MatchupLineupCompare.bindControls(root, ctx, state, function(next) {
        syncCompareUrl(next);
      });
    }
  }

  function lineupSparkStrip(row, team) {
    if (!global.MLBMACharts || !global.MLBMAProfileControls || !row) return '';
    var t = team;
    function rowHtml(label, metric) {
      return MLBMACharts.buildSparklineRow(label, MLBMAProfileControls.teamMetricTrend(t, metric), 120, 28, { labels: ['YTD', 'L30', 'L14', 'L7'] });
    }
    return '<div class="mc-spark-strip">' + rowHtml('ABQ', 'abq') + rowHtml('RCV', 'rcv') + rowHtml('OBR', 'obr') + rowHtml('OSI', 'osi') + '</div>';
  }

  function render(data) {
    var root = document.getElementById('compareRoot');
    if (!root) return;
    if (!S) {
      renderLoadError(root, new Error('shared matchup module not loaded'));
      return;
    }
    var m = data.matchup;
    if (!m) {
      renderMatchupMissing(root, qp('away'), qp('home'), data.matchupRows || []);
      return;
    }

    try {
    var gk = S.matchupGameKey(m);
    var weather = (S.weatherLookup
      ? S.weatherLookup(data.weather, m.away, m.home, m.stadium)
      : null) || data.weather[gk] || S.parseWeatherString('');
    var scR = data.scR;
    var scL = data.scL;
    var pals = data.pals;
    var pitching = data.pitching;
    var bullpen = data.bullpen;

    var awaySplits = teamSplits(m.away, scR, scL);
    var homeSplits = teamSplits(m.home, scR, scL);
    var awayRow = S.splitOSI(awaySplits, m.homeHand) || awaySplits.both;
    var homeRow = S.splitOSI(homeSplits, m.awayHand) || homeSplits.both;

    var awayPs = getPitchScore(m.away, pitching);
    var homePs = getPitchScore(m.home, pitching);
    var awayBp = bullpen[m.away];
    var homeBp = bullpen[m.home];

    var awayProf = S.findSpProfile(data.spProfiles, m.awaySP, m.away);
    var homeProf = S.findSpProfile(data.spProfiles, m.homeSP, m.home);
    var awayMet = S.spProfileMetrics(awayProf) || {};
    var homeMet = S.spProfileMetrics(homeProf) || {};
    var h2h = spH2hEdge(m, awayMet, homeMet, awayPs, homePs);

    var awayLineup = S.parseLineup(data.lineups, gk, m.away, 'AWAY');
    var homeLineup = S.parseLineup(data.lineups, gk, m.home, 'HOME');
    var lineupOk = awayLineup.length >= 5 && homeLineup.length >= 5;

    var stadium = m.stadium || '—';
    var state = getCompareState();

    var ctx = {
      m: m,
      data: data,
      weather: weather,
      scR: scR,
      scL: scL,
      pals: pals,
      awayRow: awayRow,
      homeRow: homeRow,
      awayPs: awayPs,
      homePs: homePs,
      awayMet: awayMet,
      homeMet: homeMet,
      awayProf: awayProf,
      homeProf: homeProf,
      awayBp: awayBp,
      homeBp: homeBp,
      awayLineup: awayLineup,
      homeLineup: homeLineup,
      lineupOk: lineupOk,
      teamProfiles: data.teamProfiles || {},
      offenseRankIndex: data.offenseRankIndex || null,
      batterIndex: data.batterIndex || null,
      h2h: h2h
    };
    _compareCtx = ctx;

    root.innerHTML = ''
      + sectionHeader(m, weather, stadium)
      + compareNavHtml(state.mode)
      + '<div class="mc-compare-panes">'
      + paneWrap('lvL', state.mode === 'lvL', renderPaneLvL(ctx, state))
      + paneWrap('lvP', state.mode === 'lvP', renderPaneLvP(ctx, state))
      + paneWrap('lvB', state.mode === 'lvB', renderPaneLvB(ctx, state))
      + paneWrap('bpBp', state.mode === 'bpBp', renderPaneBpBp(ctx))
      + paneWrap('spSp', state.mode === 'spSp', renderPaneSpSp(ctx))
      + '</div></div>';

    _compareState = state;
    bindCompareUI(root, ctx, state);
    bindRadarResize();
    mountChartsForMode(state.mode, ctx);
    if (state.mode === 'lvP') hydrateLvP(root, ctx, state);
    } catch (renderErr) {
      console.error('[matchup_compare] render failed', renderErr);
      renderLoadError(root, renderErr);
    }
  }

  function teamSideBlock(team, align) {
    var isHome = align === 'home';
    var logo = S.teamLogo(team, 52);
    var rec = S.recordHtml(team);
    if (!rec && global.MLBMAStandings) {
      var wl = MLBMAStandings.formatRecord(team);
      if (wl) rec = '<span class="team-record-pill">' + esc(wl) + '</span>';
    }
    var form = global.MLBMAStandings && MLBMAStandings.formStripHtml
      ? MLBMAStandings.formStripHtml(team, { mirror: isHome }) : '';
    var role = isHome ? 'Home' : 'Away';
    return '<a href="' + teamProfileUrl(team) + '" class="mc-header-side mc-header-side--' + align + '">'
      + '<div class="mc-header-logo">' + logo + '</div>'
      + '<div class="mc-header-side-text">'
      + '<div class="mc-header-role">' + esc(role) + '</div>'
      + '<div class="mc-header-name-row">'
      + '<span class="mc-team-abbr">' + esc(team) + '</span>'
      + (rec ? '<span class="mc-record-row">' + rec + '</span>' : '')
      + '</div>'
      + (form ? '<div class="mc-form-row">' + form + '</div>' : '')
      + '</div></a>';
  }

  function sectionHeader(m, weather, stadium) {
    var wx = S.weatherBadge(weather, m.home);
    return '<div class="compare-page">'
      + '<nav class="compare-breadcrumb" aria-label="Breadcrumb">'
      + '<a href="chase_analytics_mlb_oem_v7.html">Opening</a><span class="bc-sep">›</span>'
      + '<a href="chase_analytics_mlb_oem_v7.html#section-matchups-hero">Today\'s Matchups</a><span class="bc-sep">›</span>'
      + '<span>' + esc(m.away) + ' @ ' + esc(m.home) + '</span></nav>'
      + '<a href="chase_analytics_mlb_oem_v7.html#section-matchups-hero" class="back-link">← Back to Today\'s Matchups</a>'
      + '<header class="mc-header mc-section">'
      + '<div class="mc-header-kicker">Matchup Analysis</div>'
      + '<div class="mc-header-grid">'
      + teamSideBlock(m.away, 'away')
      + '<div class="mc-header-center">'
      + '<div class="mc-header-matchup">' + esc(m.away) + ' <span class="mc-at">@</span> ' + esc(m.home) + '</div>'
      + '<div class="mc-header-meta">' + esc(m.time || 'TBD') + ' · ' + esc(stadium) + '</div>'
      + (wx ? '<div class="mc-header-weather">' + wx + '</div>' : '')
      + '</div>'
      + teamSideBlock(m.home, 'home')
      + '</div>'
      + '</header>';
  }

  function num(v) {
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function normSpName(name) {
    return S && S.normName ? S.normName(name) : String(name || '').toLowerCase().trim();
  }

  function teamAccentColor(team) {
    var C = global.MLBMACharts;
    if (C && typeof C.radarColorForTeam === 'function') return C.radarColorForTeam(team);
    return '#7C4DFF';
  }

  function findSpBatHandSplit(rows, name, team, batHand) {
    var key = normSpName(name);
    var tk = S && S.teamKey ? S.teamKey(team) : String(team || '').toUpperCase();
    var want = String(batHand || '').toUpperCase();
    function tryFind(dim, val) {
      var valU = String(val || '').toUpperCase();
      return (rows || []).find(function(r) {
        var n = normSpName(S.pickCol(r, ['pitcher_name', 'Name', 'Pitcher']));
        if (n !== key) return false;
        var tm = S.teamKey(S.pickCol(r, ['pitcher_team', 'Tm', 'Team']));
        if (tm && tm !== tk) return false;
        var d = String(S.pickCol(r, ['split_dimension', 'splitDimension']) || '').toLowerCase();
        var v = String(S.pickCol(r, ['split_value', 'splitValue']) || '').toUpperCase();
        return d === dim && v === valU;
      }) || null;
    }
    var hit = tryFind('batter_hand', want);
    if (hit) return hit;
    if (want === 'LHH') return tryFind('batter_hand', 'L') || tryFind('vs_lhh', 'LHH');
    if (want === 'RHH') return tryFind('batter_hand', 'R') || tryFind('vs_rhh', 'RHH');
    return null;
  }

  function allowedOffenseFromSplit(row) {
    if (!row) return null;
    var wrc = num(S.pickCol(row, ['wRC_faced', 'wrc_faced', 'wRC+_faced', 'wRC+']));
    var ops = num(S.pickCol(row, ['OPS', 'ops']));
    var woba = num(S.pickCol(row, ['wOBA', 'woba']));
    var slg = num(S.pickCol(row, ['SLG', 'slg']));
    var obp = num(S.pickCol(row, ['OBP', 'obp']));
    if (wrc == null && ops == null && woba == null) return null;
    if (woba == null && wrc != null) woba = Math.round(0.320 * (wrc / 100) * 1000) / 1000;
    if (ops == null && obp != null && slg != null) ops = Math.round((obp + slg) * 1000) / 1000;
    if (slg == null && ops != null && woba != null) {
      var obpEst = obp != null ? obp : Math.min(woba * 1.08, ops * 0.95);
      slg = Math.round((ops - obpEst) * 1000) / 1000;
      if (slg < 0 || slg > 1.2) slg = Math.round(ops * 0.55 * 1000) / 1000;
    }
    return { wrc: wrc, ops: ops, woba: woba, slg: slg };
  }

  var SP_ALLOWED_COLS = [
    { key: 'wrc', label: 'wRC+', ctx: 'wrc', dec: 0 },
    { key: 'ops', label: 'OPS', ctx: 'ops', dec: 3 },
    { key: 'woba', label: 'wOBA', ctx: 'woba', dec: 3 },
    { key: 'slg', label: 'SLG', ctx: 'slg', dec: 3 }
  ];

  function spAllowedSplitTableHtml(splits, name, team) {
    var lhh = allowedOffenseFromSplit(findSpBatHandSplit(splits, name, team, 'LHH'));
    var rhh = allowedOffenseFromSplit(findSpBatHandSplit(splits, name, team, 'RHH'));
    if (!lhh && !rhh) {
      return '<div class="mc-lcc-empty">Hand splits unavailable — run SP metric splits pipeline.</div>';
    }
    var head = SP_ALLOWED_COLS.map(function(c) {
      return '<th scope="col">' + esc(c.label) + '</th>';
    }).join('');
    function rowHtml(label, data, rowCls, pillHand) {
      data = data || {};
      var cells = SP_ALLOWED_COLS.map(function(c) {
        return '<td class="mc-lcc-stat">' + metricChip(data[c.key], c.ctx, true, c.dec) + '</td>';
      }).join('');
      return '<tr class="mc-lcc-row' + (rowCls ? ' ' + rowCls : '') + '">'
        + '<td class="mc-lcc-split-label"><span class="bats-pill hand-' + pillHand + '">' + esc(label) + '</span></td>'
        + cells + '</tr>';
    }
    return '<div class="mc-lcc-split-read">Allowed vs LHH / RHH · YTD</div>'
      + '<div class="mc-lcc-table-wrap"><table class="mc-lcc-table mc-sp-split-table">'
      + '<thead><tr><th scope="col">Split</th>' + head + '</tr></thead>'
      + '<tbody>'
      + rowHtml('vs LHH', lhh, 'lineup-row--platoon-l', 'l')
      + rowHtml('vs RHH', rhh, 'lineup-row--platoon-r', 'r')
      + '</tbody></table></div>';
  }

  function spCardLvp(side, name, hand, team, m, met, pitchScore, spL14, splits) {
    var tier = S.pitchTier(pitchScore);
    var pname = name && name !== 'TBD' ? name : 'TBD';
    var nameHtml = pname === 'TBD'
      ? esc(pname)
      : '<a href="' + pitcherProfileUrl(pname) + '">' + esc(pname) + '</a>';
    var stats = team === m.away
      ? { k: m.awayK, bb: m.awayBB, fip: m.awayFIP, xfip: m.awayXFIP, hr9: m.awayHR9 }
      : { k: m.homeK, bb: m.homeBB, fip: m.homeFIP, xfip: m.homeXFIP, hr9: m.homeHR9 };
    if (met.kPct != null) stats.k = met.kPct;
    if (met.bbPct != null) stats.bb = met.bbPct;
    if (met.fip != null) stats.fip = met.fip;
    if (met.xfip != null) stats.xfip = met.xfip;
    if (met.hr9 != null) stats.hr9 = met.hr9;
    var stale = spL14Stale(spL14, pname, team) || (met.staleness && /stale|true|1/i.test(String(met.staleness)));
    var xfipStr = stats.xfip != null ? stats.xfip.toFixed(2) : (stats.fip != null ? stats.fip.toFixed(2) : '—');
    var accent = teamAccentColor(team);
    var sideLbl = side === 'Home' ? 'Home' : 'Away';
    return '<div class="mc-card mc-lineup-col mc-lcc-card mc-sp-lvp-card" style="--mc-os-team:' + esc(accent) + '">'
      + '<div class="mc-lcc-head mc-sp-lvp-head">'
      + S.headshot(pname, null, { crop: 'compare', eager: true })
      + '<div class="mc-lcc-head-text">'
      + '<span class="mc-lcc-team mc-sp-lvp-name">' + nameHtml
      + ' <span class="hand-pill">' + esc((hand || '?').charAt(0)) + '</span>'
      + ' <span class="tier-badge ' + tier.cls + '">' + esc(tier.label) + '</span></span>'
      + '<span class="mc-lcc-role">' + esc(sideLbl) + ' SP · ' + esc(team) + '</span>'
      + '<span class="mc-sp-lvp-score">Pitching Score ' + metricChip(pitchScore, 'pitching', false, 1) + '</span>'
      + '</div></div>'
      + '<div class="mc-sp-split-ref ca-helper">Platoon allowed ranks vs lineup offense — see Split Matchup below.</div>'
      + '<div class="mc-sp-stats mc-sp-stats--compact">'
      + '<span>K% <strong>' + fmt(stats.k) + '</strong></span>'
      + '<span>BB% <strong>' + fmt(stats.bb) + '</strong></span>'
      + '<span>FIP/xFIP <strong>' + xfipStr + '</strong></span>'
      + '<span>HR/9 <strong>' + (stats.hr9 != null ? stats.hr9.toFixed(2) : '—') + '</strong></span>'
      + '</div>'
      + (stale ? '<div class="mc-sp-note mc-stale">⚠ L14 form drift detected — metrics may be stale</div>' : '')
      + '</div>';
  }

  function spCard(side, name, hand, team, m, met, pitchScore, spL14) {
    var tier = S.pitchTier(pitchScore);
    var pname = name && name !== 'TBD' ? name : 'TBD';
    var nameHtml = pname === 'TBD'
      ? esc(pname)
      : '<a href="' + pitcherProfileUrl(pname) + '">' + esc(pname) + '</a>';
    var stats = team === m.away
      ? { k: m.awayK, bb: m.awayBB, fip: m.awayFIP, xfip: m.awayXFIP, hr9: m.awayHR9 }
      : { k: m.homeK, bb: m.homeBB, fip: m.homeFIP, xfip: m.homeXFIP, hr9: m.homeHR9 };
    if (met.kPct != null) stats.k = met.kPct;
    if (met.bbPct != null) stats.bb = met.bbPct;
    if (met.fip != null) stats.fip = met.fip;
    if (met.xfip != null) stats.xfip = met.xfip;
    if (met.hr9 != null) stats.hr9 = met.hr9;
    var osiAllow = met.osiAllowed;
    var stale = spL14Stale(spL14, pname, team) || (met.staleness && /stale|true|1/i.test(String(met.staleness)));
    var oor = met.oor;
    var oorCtx = oorContextLabel(oor);
    var xfipStr = stats.xfip != null ? stats.xfip.toFixed(2) : (stats.fip != null ? stats.fip.toFixed(2) : '—');
    return '<div class="mc-sp-card">'
      + '<div class="mc-sp-top">' + S.headshot(pname, null, { crop: 'compare', eager: true })
      + '<div><div class="ca-metric-label">' + esc(side) + ' SP · ' + esc(team) + '</div>'
      + '<div class="mc-sp-name">' + nameHtml + ' <span class="hand-pill">' + esc((hand || '?').charAt(0)) + '</span>'
      + ' <span class="tier-badge ' + tier.cls + '">' + esc(tier.label) + '</span></div>'
      + '<div class="ca-helper">Pitching Score ' + metricChip(pitchScore, 'pitching', false, 1) + '</div>'
      + '</div></div>'
      + '<div class="mc-sp-stats">'
      + '<span>K% <strong>' + fmt(stats.k) + '</strong></span>'
      + '<span>BB% <strong>' + fmt(stats.bb) + '</strong></span>'
      + '<span>FIP/xFIP <strong>' + xfipStr + '</strong></span>'
      + '<span>HR/9 <strong>' + (stats.hr9 != null ? stats.hr9.toFixed(2) : '—') + '</strong></span>'
      + '<span>OSI Allowed ' + metricChip(osiAllow, 'osi', true, 1) + '</span>'
      + '</div>'
      + (oorCtx ? '<div class="mc-sp-note">Has faced <strong>' + oorCtx + '</strong> average competition this season (Pitcher OOR ' + fmt(oor, 1) + ')</div>' : '')
      + (stale ? '<div class="mc-sp-note mc-stale">⚠ L14 form drift detected — metrics may be stale</div>' : '')
      + '</div>';
  }

  function sectionSP(m, awayMet, homeMet, awayProf, homeProf, awayPs, homePs, h2h, spL14, opts) {
    opts = opts || {};
    var wrapOpen = opts.bare ? '<div class="mc-sp-block">' : '<section class="mc-section">';
    var title = opts.bare ? '' : '<h2 class="mc-section-title">Starting Pitcher Comparison</h2>';
    var wrapClose = opts.bare ? '</div>' : '</section>';
    return wrapOpen + title
      + '<div class="mc-card mc-sp-compare">'
      + spCard('Away', m.awaySP, m.awayHand, m.away, m, awayMet, awayPs, spL14)
      + '<div class="mc-sp-vs">VS</div>'
      + spCard('Home', m.homeSP, m.homeHand, m.home, m, homeMet, homePs, spL14)
      + '</div>'
      + renderPitcherRadar(m, awayMet, homeMet, awayPs, homePs)
      + '<div class="mc-h2h"><strong>Pitching edge: ' + esc(h2h.edgeLabel) + '</strong> — ' + esc(h2h.why) + '</div>'
      + wrapClose;
  }

  function edgePanel(label, row, spHand, lineupOsi, pitcherAllowed, palsTeam, teamKey) {
    var osi = lineupOsi != null ? lineupOsi : (row ? row.osi : null);
    var palsRow = palsTeam || {};
    var ps = S.palsStatus(palsRow.osi || osi, palsRow.pals);
    var edge = S.lineupEdgeIndicator(osi, pitcherAllowed);
    return '<div class="mc-card mc-edge-panel">'
      + '<div class="mc-edge-label">' + esc(label) + '</div>'
      + '<div class="mc-edge-osi">' + metricChip(osi, 'osi', false, 1) + '</div>'
      + '<div class="mc-edge-tier">' + esc(S.osiTierLabel(osi)) + '</div>'
      + '<div class="pals-line ' + ps.cls + '">PALS: ' + (palsRow.pals != null ? fmt(palsRow.pals, 1) : '—') + ' — ' + esc(ps.label) + '</div>'
      + '<div class="mc-edge-metrics">'
      + '<span>ABQ <strong>' + fmt(row ? row.abq : null) + '</strong></span>'
      + '<span>RCV <strong>' + fmt(row ? row.rcv : null) + '</strong></span>'
      + '<span>OBR <strong>' + fmt(row ? row.obr : null) + '</strong></span>'
      + '</div>'
      + '<div class="' + edge.cls + '">' + esc(edge.label) + '</div>'
      + lineupSparkStrip(row, teamKey || (row && row.t) || '')
      + '</div>';
  }

  function sectionProjectedLineups(m, awayLineup, homeLineup, lineupOk, opts) {
    opts = opts || {};
    var banner = lineupOk ? '' : '<div class="lineup-banner">Lineup not yet confirmed</div>';
    var awayHead = S.teamLogo(m.away, 20) + ' <span>Projected Lineup</span>';
    var homeHead = S.teamLogo(m.home, 20) + ' <span>Projected Lineup</span>';
    var wrapOpen = opts.bare ? '<div class="mc-lineups-block">' : '<section class="mc-section">';
    var title = opts.bare ? '' : '<h2 class="mc-section-title">Projected Lineups</h2>';
    var wrapClose = opts.bare ? '</div>' : '</section>';
    return wrapOpen + title + banner
      + '<div class="mc-grid-2">'
      + '<div class="mc-card mc-lineup-col"><h3 class="mc-lineup-col-head">' + awayHead + '</h3>' + S.buildLineupTable(awayLineup, m.homeHand) + '</div>'
      + '<div class="mc-card mc-lineup-col"><h3 class="mc-lineup-col-head">' + homeHead + '</h3>' + S.buildLineupTable(homeLineup, m.awayHand) + '</div>'
      + '</div>' + wrapClose;
  }

  function bullpenPanel(team, unit) {
    var ps = S.bullpenPitchScore(unit);
    var tier = S.pitchTier(ps);
    var risk = S.bullpenRisk(unit);
    var logo = S.teamLogo(team, 28);
    return '<div class="mc-card">'
      + '<div class="mc-bp-team"><a href="' + teamProfileUrl(team) + '">' + logo + '<strong>' + esc(team) + '</strong></a></div>'
      + '<div class="mc-bp-metric">Bullpen Pitching Score <a href="' + bullpenReportUrl(team) + '">' + metricChip(ps, 'pitching', false, 1) + '</a>'
      + ' <span class="tier-badge ' + tier.cls + '">' + esc(tier.label) + '</span></div>'
      + '<div class="mc-bp-metric">OSI Allowed ' + metricChip(unit && unit.osiAllowed, 'osi', true, 1) + '</div>'
      + '<div class="mc-bp-metric">ABQ Allowed <strong>' + fmt(unit && unit.abqAllowed) + '</strong></div>'
      + (unit && unit.hiLevEra != null ? '<div class="mc-bp-metric">High Leverage ERA <strong>' + unit.hiLevEra.toFixed(2) + '</strong></div>' : '')
      + (unit && unit.oor != null ? '<div class="mc-bp-metric">Avg competition faced (OOR) <strong>' + fmt(unit.oor, 1) + '</strong></div>' : '')
      + '<div class="mc-bp-metric">Risk: <span class="' + risk.cls + '">' + esc(risk.label) + '</span></div>'
      + '<a class="mc-bp-link" href="' + bullpenReportUrl(team) + '">Full Bullpen Profile →</a>'
      + '</div>';
  }

  function sectionBullpen(m, awayBp, homeBp, opts) {
    opts = opts || {};
    var wrapOpen = opts.bare ? '<div class="mc-bp-block">' : '<section class="mc-section">';
    var title = opts.bare ? '' : '<h2 class="mc-section-title">Bullpen Intelligence</h2>';
    var wrapClose = opts.bare ? '</div>' : '</section>';
    return wrapOpen + title
      + '<div class="mc-grid-2">' + bullpenPanel(m.away, awayBp) + bullpenPanel(m.home, homeBp) + '</div>'
      + wrapClose;
  }

  function load() {
    var root = document.getElementById('compareRoot');
    if (!S || !T) {
      if (root) renderLoadError(root, new Error('dashboard config not loaded'));
      if (global.MLBMA_UI) MLBMA_UI.hideLoadingOverlay();
      return;
    }

    var away = qp('away');
    var home = qp('home');

    function finish(data) {
      try {
        render(data);
      } catch (err) {
        console.error('[matchup_compare] render failed', err);
        if (root) renderLoadError(root, err);
      }
      if (global.MLBMA_UI) MLBMA_UI.hideLoadingOverlay();
    }

    function fetchMatchups(force) {
      return S.fetchSheetTab(T.today_matchups, force ? { forceRefresh: true } : {})
        .catch(function(err) {
          console.warn('[matchup_compare] Today_Matchups fetch failed', err);
          return [];
        });
    }

    if (!away || !home) {
      fetchMatchups(true).then(function(rows) {
        finish({ matchup: null, matchupRows: rows });
      }).catch(function(err) {
        console.error('[matchup_compare] slate load failed', err);
        if (root) renderLoadError(root, err);
        if (global.MLBMA_UI) MLBMA_UI.hideLoadingOverlay();
      });
      return;
    }

    var fetches = [
      fetchMatchups(false),
      S.fetchSheetTab(T.today_lineups).catch(function() { return []; }),
      S.fetchSheetTab(T.weather).catch(function() { return []; }),
      S.fetchSheetTab(T.vs_rhp).catch(function() { return []; }),
      S.fetchSheetTab(T.vs_lhp).catch(function() { return []; }),
      S.fetchSheetTab(T.pitching_score).catch(function() { return []; }),
      S.fetchSheetTab(T.sp_profiles).catch(function() { return []; }),
      S.fetchSheetTab(T.bullpen_unit).catch(function() { return []; }),
      S.fetchSheetTab(T.pals).catch(function() { return []; }),
      S.fetchSheetTab(T.player_registry).catch(function() { return []; }),
      S.fetchSheetTab(T.sp_l14).catch(function() { return []; }),
      S.fetchSheetTab(T.team_profiles).catch(function() { return []; }),
      S.fetchSheetTab(T.batter_splits_home).catch(function() { return []; }),
      S.fetchSheetTab(T.batter_splits_away).catch(function() { return []; }),
      S.fetchSheetTab(T.batter_splits_recent).catch(function() { return []; }),
      S.fetchSheetTab(T.batter_splits_rhp).catch(function() { return []; }),
      S.fetchSheetTab(T.batter_splits_lhp).catch(function() { return []; }),
      S.fetchSheetTab(T.batter_splits_overall).catch(function() { return []; }),
      S.fetchSheetTab(T.sp_game_log).catch(function() { return []; }),
      S.fetchSheetTab(T.team_results).catch(function() { return []; }),
      S.fetchSheetTab(T.sp_metric_splits).catch(function() { return []; }),
      S.fetchSheetTab(T.batter_splits_vs_sp).catch(function() { return []; }),
      S.fetchSheetTab(T.pitch_mix_pitcher_l14).catch(function() { return []; }),
      S.fetchSheetTab(T.pitch_mix_pitcher).catch(function() { return []; }),
      S.fetchSheetTab(T.pitch_mix_team_batting_l14).catch(function() { return []; }),
      S.fetchSheetTab(T.pitch_mix_team_batting).catch(function() { return []; }),
      S.fetchSheetTab(T.pitch_mix_batter_l14).catch(function() { return []; }),
      S.fetchSheetTab(T.team_l10_sp_hand, { revalidate: true }).catch(function() { return []; }),
      S.fetchSheetTab(T.team_l10_sp_hand_games, { revalidate: true }).catch(function() { return []; })
    ];

    Promise.all(fetches).then(function(res) {
      if (A && A.parseRegistryRows) A.parseRegistryRows(res[9]);
      var slateRows = filterSlateMatchupRows(res[0]);
      var m = findMatchup(slateRows, away, home) || findMatchup(res[0], away, home);
      var weatherMap = parseWeatherMap(res[2]);
      var data = {
        matchup: m,
        matchupRows: res[0],
        lineups: S.parseLineupRows(res[1]),
        weather: weatherMap,
        scR: buildScoreMap(res[3]),
        scL: buildScoreMap(res[4]),
        pitching: S.parsePitchingRows(res[5]),
        spProfiles: res[6] || [],
        bullpen: S.parseBullpenUnitRows(res[7]),
        pals: S.enrichPalsMap ? S.enrichPalsMap(S.parsePalsRows(res[8])) : S.parsePalsRows(res[8]),
        spL14: res[10] || []
      };
      if (global.MatchupOffenseSplits && MatchupOffenseSplits.prepareData) {
        try {
          var splitPack = MatchupOffenseSplits.prepareData({
            scR: data.scR,
            scL: data.scL,
            teamProfiles: S.parseTeamProfilesMap ? S.parseTeamProfilesMap(res[11]) : {},
            splitHomeRows: res[12] || [],
            splitAwayRows: res[13] || [],
            splitRecentRows: res[14] || []
          });
          data.teamProfiles = splitPack.teamProfiles;
          data.offenseRankIndex = splitPack.offenseRankIndex;
        } catch (splitErr) {
          console.warn('[matchup_compare] offense splits unavailable', splitErr);
        }
      }
      if (global.MatchupLineupCompare && MatchupLineupCompare.prepareData) {
        try {
          var lineupPack = MatchupLineupCompare.prepareData({
            batterRhp: res[15] || [],
            batterLhp: res[16] || [],
            batterHome: res[12] || [],
            batterAway: res[13] || [],
            batterRecent: res[14] || [],
            batterOverall: res[17] || []
          });
          data.batterIndex = lineupPack.batterIndex;
        } catch (lineupErr) {
          console.warn('[matchup_compare] lineup compare unavailable', lineupErr);
        }
      }
      if (global.MatchupLvP && MatchupLvP.prepareData) {
        try {
          MatchupLvP.prepareData({
            spGameLog: res[18] || [],
            spMetricSplits: res[20] || [],
            teamL10SpHand: res[27] || [],
            teamL10SpHandGames: res[28] || [],
            playerRegistry: res[9] || [],
            spProfiles: data.spProfiles || res[6] || [],
            pitchMixPitcherL14: res[22] || [],
            pitchMixPitcher: res[23] || [],
            pitchMixTeamBattingL14: res[24] || [],
            pitchMixTeamBatting: res[25] || [],
            pitchMixBatterL14: res[26] || []
          });
        } catch (lvpErr) {
          console.warn('[matchup_compare] LvP module unavailable', lvpErr);
        }
      }
      data.spGameLog = res[18] || [];
      data.teamResults = res[19] || [];
      data.spMetricSplits = res[20] || [];
      data.pitchMixPitcherL14 = res[22] || [];
      data.pitchMixPitcher = res[23] || [];
      data.pitchMixTeamBattingL14 = res[24] || [];
      data.pitchMixTeamBatting = res[25] || [];
      data.pitchMixBatterL14 = res[26] || [];
      data.teamL10SpHand = res[27] || [];
      data.teamL10SpHandGames = res[28] || [];
      if (!m) {
        finish(data);
        return;
      }
      var extras = [
        global.MLBMAStandings ? MLBMAStandings.load() : Promise.resolve(),
        global.MLBMAStandings ? MLBMAStandings.loadRecentForm([m.away, m.home]) : Promise.resolve(),
        S.enrichMissingWeatherFromApi ? S.enrichMissingWeatherFromApi([m], weatherMap) : Promise.resolve()
      ];
      return Promise.all(extras).then(function() {
        finish(data);
      });
    }).catch(function(err) {
      console.error('[matchup_compare] load failed', err);
      if (root && away && home) {
        renderLoadError(root, err);
      } else {
        finish({ matchup: null, matchupRows: [] });
      }
      if (global.MLBMA_UI) MLBMA_UI.hideLoadingOverlay();
    });
  }

  global.MatchupCompare = { load: load, render: render };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})(window);
