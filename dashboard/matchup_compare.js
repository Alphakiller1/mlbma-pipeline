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
    var map = {};
    (rows || []).forEach(function(row) {
      var away = S.teamKey(S.pickCol(row, 'Away', 'away'));
      var home = S.teamKey(S.pickCol(row, 'Home', 'home'));
      if (!away || !home) return;
      var key = away + '@' + home;
      var w = S.parseWeatherRow(row);
      if (!w.temp && !w.wind && w.raw && w.raw !== '—') {
        var parsed = S.parseWeatherString(w.raw);
        w.temp = w.temp != null ? w.temp : parsed.temp;
        w.wind = w.wind != null ? w.wind : parsed.wind;
        w.windDir = w.windDir || parsed.windDir;
        w.dome = w.dome || parsed.dome;
      }
      map[key] = w;
    });
    return map;
  }

  function findMatchup(rows, away, home) {
    var list = S.parseMatchupRows(rows);
    return list.find(function(m) {
      return S.teamKey(m.away) === S.teamKey(away) && S.teamKey(m.home) === S.teamKey(home);
    }) || null;
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

  function lineupEdgeRead(m) {
    var a = m.awayOSI != null ? m.awayOSI : 0;
    var h = m.homeOSI != null ? m.homeOSI : 0;
    if (a > h + 4) return 'Away lineup advantage';
    if (h > a + 4) return 'Home lineup advantage';
    return 'Even lineup advantage';
  }

  function lineupEdgeBarHtml(m) {
    var awayOSI = m.awayOSI != null ? m.awayOSI : 0;
    var homeOSI = m.homeOSI != null ? m.homeOSI : 0;
    var total = awayOSI + homeOSI || 1;
    var awayPct = Math.max(8, (awayOSI / total) * 100);
    return '<div class="mc-lineup-bar-wrap">'
      + '<div class="mc-lineup-bar-labels"><span>' + esc(m.away) + ' <strong>' + fmt(awayOSI) + '</strong></span>'
      + '<span>' + esc(m.home) + ' <strong>' + fmt(homeOSI) + '</strong></span></div>'
      + '<div class="mc-lineup-bar-track"><div class="mc-lineup-bar-away" style="width:' + awayPct + '%"></div>'
      + '<div class="mc-lineup-bar-home" style="width:' + (100 - awayPct) + '%"></div></div>'
      + '<div class="mc-lineup-edge-read">' + esc(lineupEdgeRead(m)) + '</div></div>';
  }

  function confidenceLevel(m, lineups, pals, profiles) {
    var score = 0;
    if (m.awayOSI != null && m.homeOSI != null) score += 2;
    if (lineups && lineups.length >= 12) score += 2;
    if (profiles && profiles.length) score += 1;
    if (pals && (pals[m.away] || pals[m.home])) score += 1;
    if (score >= 5) return { label: 'High', cls: 'conf-high' };
    if (score >= 3) return { label: 'Medium', cls: 'conf-med' };
    return { label: 'Low', cls: 'conf-low' };
  }

  function primaryRead(m, script, f5, h2h) {
    var parts = [];
    parts.push(script.label + ' environment');
    if (m.lineupEdge) parts.push(m.lineupEdge);
    else if (h2h.edge !== 'Even') parts.push('starter edge leans ' + h2h.edge);
    parts.push('F5 tag: ' + f5.label);
    return parts.join(' · ') + '.';
  }

  function f5Lean(m, awayPs, homePs) {
    var awayEdge = (awayPs || 50) - (m.homeOSI || 50);
    var homeEdge = (homePs || 50) - (m.awayOSI || 50);
    if (awayEdge > homeEdge + 5) return m.away + ' SP vs ' + m.home + ' lineup';
    if (homeEdge > awayEdge + 5) return m.home + ' SP vs ' + m.away + ' lineup';
    return 'No clear F5 lean — monitor live';
  }

  function fullGameLean(m, awayBp, homeBp) {
    var awayScore = S.bullpenPitchScore(awayBp);
    var homeScore = S.bullpenPitchScore(homeBp);
    if (awayScore != null && homeScore != null) {
      if (awayScore > homeScore + 8) return m.away + ' bullpen advantage post-starter';
      if (homeScore > awayScore + 8) return m.home + ' bullpen advantage post-starter';
    }
    if ((m.awayOSI || 0) > (m.homeOSI || 0) + 5) return m.away + ' lineup carries full-game edge';
    if ((m.homeOSI || 0) > (m.awayOSI || 0) + 5) return m.home + ' lineup carries full-game edge';
    return 'Full game likely decided by starter length + leverage spots';
  }

  function render(data) {
    var root = document.getElementById('compareRoot');
    if (!root) return;
    var m = data.matchup;
    if (!m) {
      root.innerHTML = '<div class="compare-page"><p class="ca-helper">Matchup not found. <a href="chase_analytics_mlb_oem_v7.html#section-matchups-hero">Back to matchups</a></p></div>';
      return;
    }

    var gk = S.matchupGameKey(m);
    var weather = data.weather[gk] || S.parseWeatherString('');
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

    var script = S.gamescriptBadge(
      awayRow ? awayRow.abq : null, homeRow ? homeRow.abq : null,
      awayPs, homePs,
      awayRow ? awayRow.rcv : null, homeRow ? homeRow.rcv : null,
      m.awayHR9, m.homeHR9
    );
    var f5 = S.f5Badge(awayPs, homePs, homeBp ? homeBp.osiAllowed : null, awayBp ? awayBp.osiAllowed : null);

    var awayProf = S.findSpProfile(data.spProfiles, m.awaySP, m.away);
    var homeProf = S.findSpProfile(data.spProfiles, m.homeSP, m.home);
    var awayMet = S.spProfileMetrics(awayProf) || {};
    var homeMet = S.spProfileMetrics(homeProf) || {};
    var h2h = spH2hEdge(m, awayMet, homeMet, awayPs, homePs);

    var awayLineup = S.parseLineup(data.lineups, gk, m.away, 'AWAY');
    var homeLineup = S.parseLineup(data.lineups, gk, m.home, 'HOME');
    var lineupOk = awayLineup.length >= 5 && homeLineup.length >= 5;

    var conf = confidenceLevel(m, data.lineups, pals, data.spProfiles);
    var park = S.parkFactor(m.home);
    var parkLbl = S.parkImpactLabel(park, weather);
    var stadium = m.stadium || '—';

    root.innerHTML = ''
      + sectionHeader(m, weather, script, f5, stadium)
      + sectionLineupEdge(m, awayRow, homeRow, awayMet, homeMet, pals)
      + sectionSP(m, awayMet, homeMet, awayProf, homeProf, awayPs, homePs, h2h, data.spL14)
      + sectionProjectedLineups(m, awayLineup, homeLineup, lineupOk)
      + sectionBullpen(m, awayBp, homeBp)
      + sectionGameScript(m, f5, script, awayPs, homePs, awayBp, homeBp, weather, park, parkLbl)
      + sectionModel(m, script, f5, h2h, conf, awayRow, homeRow, awayBp, homeBp, awayPs, homePs);
  }

  function teamBlock(team, side) {
    var logo = S.teamLogo(team, 48);
    var rec = S.recordHtml(team);
    return '<a href="' + teamProfileUrl(team) + '" class="mc-team-block">'
      + logo
      + '<div><div class="mc-team-abbr">' + esc(team) + '</div>'
      + (rec ? '<div class="mc-record">' + rec + '</div>' : '')
      + '</div></a>';
  }

  function sectionHeader(m, weather, script, f5, stadium) {
    return '<div class="compare-page">'
      + '<nav class="compare-breadcrumb" aria-label="Breadcrumb">'
      + '<a href="chase_analytics_mlb_oem_v7.html">Opening</a><span class="bc-sep">›</span>'
      + '<a href="chase_analytics_mlb_oem_v7.html#section-matchups-hero">Today\'s Matchups</a><span class="bc-sep">›</span>'
      + '<span>' + esc(m.away) + ' @ ' + esc(m.home) + '</span></nav>'
      + '<a href="chase_analytics_mlb_oem_v7.html#section-matchups-hero" class="back-link">← Back to Today\'s Matchups</a>'
      + '<header class="mc-header mc-section">'
      + '<div class="mc-header-teams">' + teamBlock(m.away) + '<span class="mc-at">@</span>' + teamBlock(m.home) + '</div>'
      + '<div class="mc-header-meta">' + esc(m.time || 'TBD') + ' · ' + esc(stadium) + ' · ' + S.weatherBadge(weather) + '</div>'
      + '<div class="mc-header-badges">'
      + '<span class="' + esc(script.cls) + '">' + esc(script.label) + '</span>'
      + '<span class="' + esc(f5.cls) + '">' + esc(f5.label) + '</span>'
      + '</div></header>';
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
      + '<div class="mc-sp-top">' + S.headshot(pname, 64, { eager: true })
      + '<div><div class="ca-metric-label">' + esc(side) + ' SP · ' + esc(team) + '</div>'
      + '<div class="mc-sp-name">' + nameHtml + ' <span class="hand-pill">' + esc((hand || '?').charAt(0)) + '</span>'
      + ' <span class="tier-badge ' + tier.cls + '">' + esc(tier.label) + '</span></div>'
      + '<div class="ca-helper">Pitching Score <strong style="color:' + S.metricColor(pitchScore, true) + '">' + fmt(pitchScore) + '</strong></div>'
      + '</div></div>'
      + '<div class="mc-sp-stats">'
      + '<span>K% <strong>' + fmt(stats.k) + '</strong></span>'
      + '<span>BB% <strong>' + fmt(stats.bb) + '</strong></span>'
      + '<span>FIP/xFIP <strong>' + xfipStr + '</strong></span>'
      + '<span>HR/9 <strong>' + (stats.hr9 != null ? stats.hr9.toFixed(2) : '—') + '</strong></span>'
      + '<span>OSI Allowed <strong style="color:' + S.metricColor(osiAllow, true) + '">' + fmt(osiAllow) + '</strong></span>'
      + '</div>'
      + (oorCtx ? '<div class="mc-sp-note">Has faced <strong>' + oorCtx + '</strong> average competition this season (Pitcher OOR ' + fmt(oor, 1) + ')</div>' : '')
      + (stale ? '<div class="mc-sp-note mc-stale">⚠ L14 form drift detected — metrics may be stale</div>' : '')
      + '</div>';
  }

  function sectionSP(m, awayMet, homeMet, awayProf, homeProf, awayPs, homePs, h2h, spL14) {
    return '<section class="mc-section"><h2 class="mc-section-title">Starting Pitcher Comparison</h2>'
      + '<div class="mc-card mc-sp-compare">'
      + spCard('Away', m.awaySP, m.awayHand, m.away, m, awayMet, awayPs, spL14)
      + '<div class="mc-sp-vs">VS</div>'
      + spCard('Home', m.homeSP, m.homeHand, m.home, m, homeMet, homePs, spL14)
      + '</div>'
      + '<div class="mc-h2h"><strong>Pitching edge: ' + esc(h2h.edgeLabel) + '</strong> — ' + esc(h2h.why) + '</div>'
      + '</section>';
  }

  function edgePanel(label, row, spHand, lineupOsi, pitcherAllowed, palsTeam) {
    var osi = lineupOsi != null ? lineupOsi : (row ? row.osi : null);
    var palsRow = palsTeam || {};
    var ps = S.palsStatus(palsRow.osi || osi, palsRow.pals);
    var edge = S.lineupEdgeIndicator(osi, pitcherAllowed);
    var color = S.metricColor(osi, false);
    return '<div class="mc-card mc-edge-panel">'
      + '<div class="mc-edge-label">' + esc(label) + '</div>'
      + '<div class="mc-edge-osi" style="color:' + color + '">' + fmt(osi) + '</div>'
      + '<div class="mc-edge-tier">' + esc(S.osiTierLabel(osi)) + '</div>'
      + '<div class="pals-line ' + ps.cls + '">PALS: ' + (palsRow.pals != null ? fmt(palsRow.pals, 1) : '—') + ' — ' + esc(ps.label) + '</div>'
      + '<div class="mc-edge-metrics">'
      + '<span>ABQ <strong>' + fmt(row ? row.abq : null) + '</strong></span>'
      + '<span>RCV <strong>' + fmt(row ? row.rcv : null) + '</strong></span>'
      + '<span>OBR <strong>' + fmt(row ? row.obr : null) + '</strong></span>'
      + '</div>'
      + '<div class="' + edge.cls + '">' + esc(edge.label) + '</div>'
      + '</div>';
  }

  function sectionLineupEdge(m, awayRow, homeRow, awayMet, homeMet, pals) {
    var homeHandLbl = (m.homeHand || '?').charAt(0) === 'L' ? 'LHP' : 'RHP';
    var awayHandLbl = (m.awayHand || '?').charAt(0) === 'L' ? 'LHP' : 'RHP';
    return '<section class="mc-section"><h2 class="mc-section-title">Tonight\'s Lineup Edge</h2>'
      + lineupEdgeBarHtml(m)
      + '<div class="mc-grid-2" style="margin-top:16px;">'
      + edgePanel('Away lineup vs ' + homeHandLbl, awayRow, m.homeHand, m.awayOSI, homeMet.osiAllowed, pals[m.away])
      + edgePanel('Home lineup vs ' + awayHandLbl, homeRow, m.awayHand, m.homeOSI, awayMet.osiAllowed, pals[m.home])
      + '</div></section>';
  }

  function sectionProjectedLineups(m, awayLineup, homeLineup, lineupOk) {
    var banner = lineupOk ? '' : '<div class="lineup-banner">Lineup not yet confirmed</div>';
    var awayHead = S.teamLogo(m.away, 20) + ' <span>Projected Lineup</span>';
    var homeHead = S.teamLogo(m.home, 20) + ' <span>Projected Lineup</span>';
    return '<section class="mc-section"><h2 class="mc-section-title">Projected Lineups</h2>'
      + banner
      + '<div class="mc-grid-2">'
      + '<div class="mc-card mc-lineup-col"><h3 class="mc-lineup-col-head">' + awayHead + '</h3>' + S.buildLineupTable(awayLineup, m.homeHand) + '</div>'
      + '<div class="mc-card mc-lineup-col"><h3 class="mc-lineup-col-head">' + homeHead + '</h3>' + S.buildLineupTable(homeLineup, m.awayHand) + '</div>'
      + '</div></section>';
  }

  function bullpenPanel(team, unit) {
    var ps = S.bullpenPitchScore(unit);
    var tier = S.pitchTier(ps);
    var risk = S.bullpenRisk(unit);
    var logo = S.teamLogo(team, 28);
    return '<div class="mc-card">'
      + '<div class="mc-bp-team"><a href="' + teamProfileUrl(team) + '">' + logo + '<strong>' + esc(team) + '</strong></a></div>'
      + '<div class="mc-bp-metric">Bullpen Pitching Score <a href="' + bullpenReportUrl(team) + '"><strong style="color:' + S.metricColor(ps, false) + '">' + fmt(ps) + '</strong></a>'
      + ' <span class="tier-badge ' + tier.cls + '">' + esc(tier.label) + '</span></div>'
      + '<div class="mc-bp-metric">OSI Allowed <strong style="color:' + S.metricColor(unit && unit.osiAllowed, true) + '">' + fmt(unit && unit.osiAllowed) + '</strong></div>'
      + '<div class="mc-bp-metric">ABQ Allowed <strong>' + fmt(unit && unit.abqAllowed) + '</strong></div>'
      + (unit && unit.hiLevEra != null ? '<div class="mc-bp-metric">High Leverage ERA <strong>' + unit.hiLevEra.toFixed(2) + '</strong></div>' : '')
      + (unit && unit.oor != null ? '<div class="mc-bp-metric">Avg competition faced (OOR) <strong>' + fmt(unit.oor, 1) + '</strong></div>' : '')
      + '<div class="mc-bp-metric">Risk: <span class="' + risk.cls + '">' + esc(risk.label) + '</span></div>'
      + '<a class="mc-bp-link" href="' + bullpenReportUrl(team) + '">Full Bullpen Report →</a>'
      + '</div>';
  }

  function sectionBullpen(m, awayBp, homeBp) {
    return '<section class="mc-section"><h2 class="mc-section-title">Bullpen Intelligence</h2>'
      + '<div class="mc-grid-2">' + bullpenPanel(m.away, awayBp) + bullpenPanel(m.home, homeBp) + '</div></section>';
  }

  function sectionGameScript(m, f5, script, awayPs, homePs, awayBp, homeBp, weather, park, parkLbl) {
    var awayBpScore = S.bullpenPitchScore(awayBp);
    var homeBpScore = S.bullpenPitchScore(homeBp);
    var bpWinner = (awayBpScore || 0) > (homeBpScore || 0) + 5 ? m.away : ((homeBpScore || 0) > (awayBpScore || 0) + 5 ? m.home : 'Even');
    return '<section class="mc-section"><h2 class="mc-section-title">Game Script Analysis</h2>'
      + '<div class="mc-grid-3">'
      + '<div class="mc-card mc-script-card"><h4>F5 Context</h4>'
      + '<span class="' + esc(f5.cls) + '" style="display:inline-block;margin-bottom:10px;padding:8px 14px;font-size:13px;font-weight:700">' + esc(f5.label) + '</span>'
      + '<div class="mc-script-row">' + esc(m.away) + ' SP (' + fmt(awayPs) + ') vs ' + esc(m.home) + ' lineup OSI ' + fmt(m.homeOSI) + '</div>'
      + '<div class="mc-script-row">' + esc(m.home) + ' SP (' + fmt(homePs) + ') vs ' + esc(m.away) + ' lineup OSI ' + fmt(m.awayOSI) + '</div>'
      + '<div class="mc-script-row"><strong>F5 lean:</strong> ' + esc(f5Lean(m, awayPs, homePs)) + '</div></div>'
      + '<div class="mc-card mc-script-card"><h4>Full Game Context</h4>'
      + '<div class="mc-script-row">' + esc(m.away) + ' bullpen score ' + fmt(awayBpScore) + ' · ' + esc(m.home) + ' ' + fmt(homeBpScore) + '</div>'
      + '<div class="mc-script-row">Post-starter OSI edge: ' + esc((m.awayOSI || 0) > (m.homeOSI || 0) ? m.away : m.home) + ' lineup</div>'
      + '<div class="mc-script-row"><strong>Bullpen advantage:</strong> ' + esc(bpWinner) + '</div></div>'
      + '<div class="mc-card mc-script-card"><h4>Weather / Park Impact</h4>'
      + '<div class="mc-script-row">Temp: ' + (weather.temp != null ? weather.temp + '°F' : '—') + '</div>'
      + '<div class="mc-script-row">Wind: ' + (weather.wind != null ? weather.wind + ' mph' + (weather.windDir ? ' ' + weather.windDir : '') : '—') + '</div>'
      + '<div class="mc-script-row">Conditions: ' + esc(weather.conditions || weather.raw) + '</div>'
      + '<div class="mc-script-row">Park factor (' + esc(m.home) + '): ' + park.toFixed(2) + '</div>'
      + '<div class="mc-impact-label">' + esc(parkLbl.label) + '</div>'
      + '<div class="mc-script-row">' + esc(parkLbl.detail) + '</div></div>'
      + '</div></section>';
  }

  function sectionModel(m, script, f5, h2h, conf, awayRow, homeRow, awayBp, homeBp, awayPs, homePs) {
    var supports = [];
    if (m.awayOSI != null) supports.push(m.away + ' lineup OSI ' + fmt(m.awayOSI) + ' vs ' + (m.homeHand || '?') + 'HP');
    if (m.homeOSI != null) supports.push(m.home + ' lineup OSI ' + fmt(m.homeOSI) + ' vs ' + (m.awayHand || '?') + 'HP');
    if (awayPs != null) supports.push(m.away + ' SP Pitching Score ' + fmt(awayPs));
    if (homePs != null) supports.push(m.home + ' SP Pitching Score ' + fmt(homePs));
    var risk = 'Bullpen volatility or unconfirmed lineups could shift the read.';
    if (awayBp && S.bullpenRisk(awayBp).label === 'Volatile') risk = m.away + ' bullpen volatility is the main invalidation risk.';
    else if (homeBp && S.bullpenRisk(homeBp).label === 'Volatile') risk = m.home + ' bullpen volatility is the main invalidation risk';

    return '<section class="mc-section"><h2 class="mc-section-title">Model Summary</h2>'
      + '<div class="mc-card mc-model-card">'
      + '<div class="mc-model-script ' + esc(script.cls.replace('script-badge ', '')) + '">' + esc(script.label) + '</div>'
      + '<p class="mc-model-read">' + esc(primaryRead(m, script, f5, h2h)) + '</p>'
      + '<div class="mc-confidence ' + conf.cls + '"><span class="conf-dot"></span> Confidence: ' + esc(conf.label) + '</div>'
      + '<ul class="mc-support-list">' + supports.map(function(s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>'
      + '<div class="mc-risk"><strong>Risk:</strong> ' + esc(risk) + '</div>'
      + '<div class="mc-leans">'
      + '<div class="mc-lean"><div class="mc-lean-label">F5 Lean</div><div class="mc-lean-value">' + esc(f5Lean(m, awayPs, homePs)) + '</div></div>'
      + '<div class="mc-lean"><div class="mc-lean-label">Full Game Lean</div><div class="mc-lean-value">' + esc(fullGameLean(m, awayBp, homeBp)) + '</div></div>'
      + '</div>'
      + '<div class="mc-model-links">'
      + '<a href="' + teamProfileUrl(m.away) + '">View Away Team Profile →</a>'
      + '<a href="' + teamProfileUrl(m.home) + '">View Home Team Profile →</a>'
      + '<a href="model_report.html">View Full Model Report →</a>'
      + '</div></div></section></div>';
  }

  function load() {
    var away = qp('away');
    var home = qp('home');
    if (!away || !home) {
      render({ matchup: null });
      if (global.MLBMA_UI) MLBMA_UI.hideLoadingOverlay();
      return;
    }

    var fetches = [
      S.fetchSheetTab(T.today_matchups),
      S.fetchSheetTab(T.today_lineups).catch(function() { return []; }),
      S.fetchSheetTab(T.weather).catch(function() { return []; }),
      S.fetchSheetTab(T.vs_rhp).catch(function() { return []; }),
      S.fetchSheetTab(T.vs_lhp).catch(function() { return []; }),
      S.fetchSheetTab(T.pitching_score).catch(function() { return []; }),
      S.fetchSheetTab(T.sp_profiles).catch(function() { return []; }),
      S.fetchSheetTab(T.bullpen_unit).catch(function() { return []; }),
      S.fetchSheetTab(T.pals).catch(function() { return []; }),
      S.fetchSheetTab(T.player_registry).catch(function() { return []; }),
      S.fetchSheetTab(T.sp_l14).catch(function() { return []; })
    ];

    Promise.all(fetches).then(function(res) {
      if (A && A.parseRegistryRows) A.parseRegistryRows(res[9]);
      var m = findMatchup(res[0], away, home);
      var data = {
        matchup: m,
        lineups: S.parseLineupRows(res[1]),
        weather: parseWeatherMap(res[2]),
        scR: buildScoreMap(res[3]),
        scL: buildScoreMap(res[4]),
        pitching: S.parsePitchingRows(res[5]),
        spProfiles: res[6] || [],
        bullpen: S.parseBullpenUnitRows(res[7]),
        pals: S.parsePalsRows(res[8]),
        spL14: res[10] || []
      };
      render(data);
      if (global.MLBMAStandings) MLBMAStandings.load();
      if (global.MLBMA_UI) MLBMA_UI.hideLoadingOverlay();
    }).catch(function(err) {
      console.error(err);
      render({ matchup: null });
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
