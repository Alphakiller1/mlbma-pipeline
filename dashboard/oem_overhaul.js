/**
 * MLBMA question-driven dashboard — render logic for structural overhaul.
 * Loaded after inline script in chase_analytics_mlb_oem_v7.html
 */
(function(global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function teamRow(team, hand) {
    var arr = (hand === 'L') ? (typeof SCO_YTD_L !== 'undefined' ? SCO_YTD_L : []) : (typeof SCO_YTD_R !== 'undefined' ? SCO_YTD_R : []);
    return arr.find(function(d) { return d.t === team; }) || (typeof SCO_YTD_B !== 'undefined' ? SCO_YTD_B.find(function(d) { return d.t === team; }) : null);
  }

  function palsForTeam(t) {
    var row = (LIVE_DATA.pals || []).find(function(p) { return p.t === t; });
    if (!row) return null;
    return row.PALS != null ? row.PALS : row.pals;
  }

  function palsGapBadge(team, osi) {
    var pals = palsForTeam(team);
    if (pals == null || osi == null) return { label: 'Unconfirmed', cls: 'val-neutral' };
    var gap = osi - pals;
    if (Math.abs(gap) < 5) return { label: 'Confirmed', cls: 'val-confirmed' };
    if (gap >= 8) return { label: 'Inflated', cls: 'val-inflated' };
    if (gap <= -8) return { label: 'Deflated', cls: 'val-deflated' };
    return { label: 'Monitor', cls: 'val-neutral' };
  }

  function pitchTierBadge(score) {
    if (score == null || isNaN(score)) return { label: '—', cls: 'pitch-tier-mid' };
    if (score >= 70) return { label: 'Elite', cls: 'pitch-tier-elite' };
    if (score >= 55) return { label: 'Solid', cls: 'pitch-tier-solid' };
    if (score >= 40) return { label: 'Avg', cls: 'pitch-tier-mid' };
    return { label: 'Volatile', cls: 'pitch-tier-vol' };
  }

  function oorForTeam(t) {
    return (LIVE_DATA.oor || []).find(function(r) { return r.t === t; });
  }

  function oorPitcherBadge(pitchingTeam, hand) {
    var o = oorForTeam(pitchingTeam);
    if (!o) return { label: 'No OOR', cls: 'val-neutral' };
    var v = hand === 'L' ? o.hvL : hand === 'R' ? o.hvR : o.hvP;
    if (v == null) return { label: 'No OOR', cls: 'val-neutral' };
    if (v >= 105) return { label: 'ERA Earned', cls: 'val-confirmed' };
    if (v <= 92) return { label: 'ERA Inflated', cls: 'val-inflated' };
    return { label: 'Neutral', cls: 'val-neutral' };
  }

  function computeGameScript(abq, pitchScore, rcv, hr9) {
    abq = abq != null ? abq : 50;
    pitchScore = pitchScore != null ? pitchScore : 50;
    rcv = rcv != null ? rcv : 50;
    hr9 = hr9 != null ? hr9 : 1.0;
    var abqH = abq >= 58, abqL = abq < 48;
    var psH = pitchScore >= 65, psL = pitchScore < 50;
    if (rcv >= 62 && hr9 >= 1.15) return { label: 'Power Showdown', f5: 'Full Only', cls: 'script-power' };
    if (abqH && psH) return { label: 'Pitching Duel', f5: 'F5 Only', cls: 'script-duel' };
    if (abqH && psL) return { label: 'Lineup Grinds SP', f5: 'F5 + Full', cls: 'script-grind' };
    if (abqL && psH) return { label: 'Quick At-Bats', f5: 'F5 Only', cls: 'script-quick' };
    if (abqL && psL) return { label: 'Sloppy Game', f5: 'Skip', cls: 'script-sloppy' };
    return { label: 'Avoid', f5: 'Skip', cls: 'script-sloppy' };
  }

  function mergeGameScripts(a, b) {
    if (a.label === b.label) return a;
    if (a.label === 'Power Showdown' || b.label === 'Power Showdown') return a.label === 'Power Showdown' ? a : b;
    if (a.f5 === 'Skip' || b.f5 === 'Skip') return { label: 'Avoid', f5: 'Skip', cls: 'script-sloppy' };
    return { label: a.label + ' / ' + b.label, f5: a.f5 === b.f5 ? a.f5 : 'F5 + Full', cls: 'script-neutral' };
  }

  function gameScriptForMatchup(m) {
    var awayRow = teamRow(m.away, m.homeHand);
    var homeRow = teamRow(m.home, m.awayHand);
    var awayPs = typeof getSpPitchScore === 'function' ? getSpPitchScore(m.home) : 50;
    var homePs = typeof getSpPitchScore === 'function' ? getSpPitchScore(m.away) : 50;
    var sa = computeGameScript(awayRow ? awayRow.abq : 50, awayPs, awayRow ? awayRow.rcv : 50, m.homeHR9);
    var sh = computeGameScript(homeRow ? homeRow.abq : 50, homePs, homeRow ? homeRow.rcv : 50, m.awayHR9);
    return mergeGameScripts(sa, sh);
  }

  function gameWeatherBadge(m) {
    var gk = m.away + '@' + m.home;
    var w = (LIVE_DATA.weather || {})[gk];
    if (!w) return '';
    var text = typeof w === 'string' ? w : (w.cond || w.conditions || '');
    if (!text) return '';
    return '<span class="weather-badge">' + esc(text) + '</span>';
  }

  function projArrow(d) {
    if (!d || d.projOSI == null || d.osi == null) return '';
    var delta = d.projOSI - d.osi;
    if (delta >= 2) return '<span class="proj-arrow up" title="ProjOSI rising">↑</span>';
    if (delta <= -2) return '<span class="proj-arrow down" title="ProjOSI cooling">↓</span>';
    return '<span class="proj-arrow flat">→</span>';
  }

  function mListHand(h) {
    if (typeof normalizePitcherHand === 'function') return normalizePitcherHand(h);
    return (h === 'L' || h === 'R') ? h : '?';
  }

  function renderDailySummaryQuestions() {
    var el = document.getElementById('dailySummaryGrid');
    if (!el) return;
    var games = LIVE_DATA.matchups || [];
    var rows = (typeof SCO_YTD_B !== 'undefined' && SCO_YTD_B.length) ? SCO_YTD_B : [];

    function bestLineupTonight() {
      if (!games.length) return null;
      var best = null, bestOsi = -1;
      games.forEach(function(m) {
        [['away', m.homeHand], ['home', m.awayHand]].forEach(function(pair) {
          var osi = pair[0] === 'away' ? m.awayOSI : m.homeOSI;
          if (osi != null && osi > bestOsi) {
            bestOsi = osi;
            best = { team: m[pair[0]], osi: osi, game: m.away + '@' + m.home };
          }
        });
      });
      return best;
    }

    function bestBuyLow() {
      return rows.filter(function(d) {
        var pals = palsForTeam(d.t);
        return d.ppGap >= 4 && pals != null && Math.abs(d.osi - pals) < 5;
      }).sort(function(a, b) { return b.ppGap - a.ppGap; })[0] || null;
    }

    function biggestFade() {
      return rows.filter(function(d) { return d.ppGap < -4; }).sort(function(a, b) { return a.ppGap - b.ppGap; })[0] || null;
    }

    function bestScriptPlay() {
      var best = null, score = -1;
      games.forEach(function(m) {
        var awayRow = teamRow(m.away, m.homeHand);
        var homeRow = teamRow(m.home, m.awayHand);
        var awayPs = typeof getSpPitchScore === 'function' ? getSpPitchScore(m.home) : null;
        var homePs = typeof getSpPitchScore === 'function' ? getSpPitchScore(m.away) : null;
        if (awayRow && awayPs != null) {
          var s = (awayRow.abq || 0) + (100 - awayPs);
          if (s > score) { score = s; best = { game: m.away + '@' + m.home, label: 'Away grinds vs ' + m.home }; }
        }
        if (homeRow && homePs != null) {
          var s2 = (homeRow.abq || 0) + (100 - homePs);
          if (s2 > score) { score = s2; best = { game: m.away + '@' + m.home, label: 'Home grinds vs ' + m.away }; }
        }
      });
      return best;
    }

    function trustEra() {
      var best = null, ext = -999;
      games.forEach(function(m) {
        [['away', m.home, m.homeHand], ['home', m.away, m.awayHand]].forEach(function(x) {
          var spTeam = x[1], hand = x[2];
          var o = oorForTeam(spTeam);
          if (!o) return;
          var v = hand === 'L' ? o.hvL : o.hvR;
          if (v == null) return;
          if (Math.abs(v - 100) > Math.abs(ext - 100)) {
            ext = v;
            best = { sp: x[0] === 'away' ? m.awaySP : m.homeSP, team: spTeam, oor: v };
          }
        });
      });
      return best;
    }

    var cards = [
      { q: 'Best lineup tonight?', a: function() {
        var b = bestLineupTonight();
        return b ? b.team + ' · OSI ' + b.osi.toFixed(1) + ' (' + b.game + ')' : 'No slate loaded';
      }},
      { q: 'Best buy-low?', a: function() {
        var b = bestBuyLow();
        return b ? b.t + ' · PP-Gap +' + b.ppGap.toFixed(1) + ' · PALS confirmed' : 'No confirmed buy-low';
      }},
      { q: 'Biggest fade?', a: function() {
        var b = biggestFade();
        return b ? b.t + ' · PP-Gap ' + b.ppGap.toFixed(1) : 'No fade flags';
      }},
      { q: 'Best game script play?', a: function() {
        var b = bestScriptPlay();
        return b ? b.game + ' — ' + b.label : 'Load matchups for script plays';
      }},
      { q: 'Trust this ERA?', a: function() {
        var b = trustEra();
        if (!b) return 'OOR data pending';
        return b.sp + ' (' + b.team + ') · OOR ' + b.oor.toFixed(0) + (b.oor >= 105 ? ' — earned' : b.oor <= 92 ? ' — inflated' : '');
      }}
    ];

    el.innerHTML = cards.map(function(c) {
      return '<div class="daily-summary-card question-card"><div class="ds-eyebrow">' + esc(c.q) + '</div><div class="ds-body">' + esc(c.a()) + '</div></div>';
    }).join('').replace(/<\/?motion>/g, '');
  }

  function renderSection1Matchups() {
    var grid = document.getElementById('matchupsGrid');
    if (!grid) return;
    var games = LIVE_DATA.matchups || [];
    if (!games.length) {
      grid.innerHTML = '<div class="matchups-empty">No matchups loaded for today.</div>';
      return;
    }

    grid.innerHTML = games.map(function(m, gi) {
      var uid = 'mc_' + gi;
      var awayHand = mListHand(m.awayHand);
      var homeHand = mListHand(m.homeHand);
      var awayOSI = m.awayOSI != null ? m.awayOSI : 0;
      var homeOSI = m.homeOSI != null ? m.homeOSI : 0;
      var total = awayOSI + homeOSI || 1;
      var awayPct = Math.max(8, (awayOSI / total) * 100);
      var fav = awayOSI >= homeOSI ? m.away : m.home;
      var awayPs = typeof getSpPitchScore === 'function' ? getSpPitchScore(m.home) : null;
      var homePs = typeof getSpPitchScore === 'function' ? getSpPitchScore(m.away) : null;
      var awayPt = pitchTierBadge(awayPs);
      var homePt = pitchTierBadge(homePs);
      var gk = matchupGameKey(m);
      var lu = LIVE_DATA.lineups || [];
      var awayPlat = computePlatoonPct(lineupRowsForTeam(lu, gk, m.away, 'AWAY'), homeHand);
      var homePlat = computePlatoonPct(lineupRowsForTeam(lu, gk, m.home, 'HOME'), awayHand);
      var script = gameScriptForMatchup(m);

      return '<article class="matchup-card-v2" data-game="' + gi + '">'
        + '<div class="mc-header">'
        + '<div class="mc-time">' + esc(m.time || 'TBD') + '</div>'
        + gameWeatherBadge(m)
        + '</div>'
        + '<div class="mc-matchup">' + esc(m.away) + ' <span class="at">@</span> ' + esc(m.home) + '</div>'
        + '<div class="mc-sp-row">'
        + '<div><span class="mc-sp-label">Away SP</span> ' + esc(m.awaySP || 'TBD') + ' <span class="hand-pill hand-' + awayHand.toLowerCase() + '">' + awayHand + '</span> <span class="pitch-tier ' + awayPt.cls + '">' + awayPt.label + '</span></div>'
        + '<div><span class="mc-sp-label">Home SP</span> ' + esc(m.homeSP || 'TBD') + ' <span class="hand-pill hand-' + homeHand.toLowerCase() + '">' + homeHand + '</span> <span class="pitch-tier ' + homePt.cls + '">' + homePt.label + '</span></div>'
        + '</div>'
        + '<div class="mc-osi-label">Lineup edge · split OSI vs tonight&apos;s SP hand</div>'
        + '<div class="mc-osi-bar">'
        + '<span class="mc-team">' + esc(m.away) + ' <strong style="color:var(--text)">' + fmtMatchupStat(m.awayOSI) + '</strong></span>'
        + '<div class="mc-bar-track"><div class="mc-bar-away" style="width:' + awayPct + '%"></div><div class="mc-bar-home" style="width:' + (100 - awayPct) + '%"></div></div>'
        + '<span class="mc-team tr">' + esc(m.home) + ' <strong style="color:var(--text)">' + fmtMatchupStat(m.homeOSI) + '</strong></span>'
        + '</div>'
        + '<div class="mc-meta">Edge: <strong>' + esc(fav) + '</strong>'
        + ' · Away platoon ' + (awayPlat != null ? Math.round(awayPlat) + '%' : '—')
        + ' · Home platoon ' + (homePlat != null ? Math.round(homePlat) + '%' : '—') + '</div>'
        + '<div class="mc-script-row">'
        + '<span class="script-label ' + script.cls + '">' + esc(script.label) + '</span>'
        + '<span class="f5-badge">' + esc(script.f5) + '</span>'
        + '</div>'
        + '<button type="button" class="metrics-toggle" onclick="toggleMetricsPanel(\'' + uid + '\', this)">Expand matchup ▾</button>'
        + '<div class="metrics-panel" id="' + uid + '">'
        + (typeof buildMatchupLineupBlock === 'function' ? buildMatchupLineupBlock(m) : '')
        + '<div class="bullpen-indicator-bar">' + buildBullpenIndicatorBar(m.away, m.home, homeOSI) + buildBullpenIndicatorBar(m.home, m.away, awayOSI) + '</div>'
        + '</div></article>';
    }).join('').replace(/<\/?motion>/g, '');
  }

  function renderMarketEdge() {
    var el = document.getElementById('marketEdgeBoard');
    if (!el) return;
    var rows = (typeof SCO_YTD_B !== 'undefined' ? SCO_YTD_B : []).slice();
    var buy = rows.filter(function(d) { return d.ppGap >= 4; }).sort(function(a, b) { return b.ppGap - a.ppGap; }).slice(0, 5);
    var fade = rows.filter(function(d) { return d.ppGap <= -4; }).sort(function(a, b) { return a.ppGap - b.ppGap; }).slice(0, 5);

    function rowHtml(d, type) {
      var pals = palsForTeam(d.t);
      var palsOk = pals != null && Math.abs(d.osi - pals) < 5;
      var uid = 'me_' + type + '_' + d.t;
      return '<div class="edge-row" onclick="location.href=\'team_profile.html?team=' + d.t + '\'">'
        + '<span class="edge-team">' + esc(d.t) + '</span>'
        + '<span class="edge-pp ' + (type === 'buy' ? 'pos' : 'neg') + '">' + (d.ppGap > 0 ? '+' : '') + d.ppGap.toFixed(1) + '</span>'
        + projArrow(d)
        + (palsOk ? '<span class="pals-badge ok">PALS ✓</span>' : '<span class="pals-badge warn">PALS ?</span>')
        + '<button type="button" class="metrics-toggle sm" onclick="event.stopPropagation();toggleMetricsPanel(\'' + uid + '\', this)">▾</button>'
        + '<div class="metrics-panel" id="' + uid + '">' + (typeof metricsPanelRows === 'function' ? metricsPanelRows(d) : '') + '</div>'
        + '</div>';
    }

    el.innerHTML = '<div class="edge-columns">'
      + '<div class="edge-col"><h3 class="edge-col-title buy">Top Buy-Low (process &gt; production)</h3>'
      + (buy.length ? buy.map(function(d) { return rowHtml(d, 'buy'); }).join('') : '<div class="empty-msg">No buy-low candidates</div>')
      + '</div>'
      + '<div class="edge-col"><h3 class="edge-col-title fade">Top Fade (production &gt; process)</h3>'
      + (fade.length ? fade.map(function(d) { return rowHtml(d, 'fade'); }).join('') : '<div class="empty-msg">No fade candidates</div>')
      + '</div></div>';
    el.innerHTML = el.innerHTML.replace(/<\/?motion>/g, '');
  }

  function renderGameScript() {
    var el = document.getElementById('gameScriptGrid');
    if (!el) return;
    var games = LIVE_DATA.matchups || [];
    if (!games.length) {
      el.innerHTML = '<div class="empty-msg">Load today&apos;s matchups for game script reads.</div>';
      return;
    }
    el.innerHTML = games.map(function(m) {
      var awayRow = teamRow(m.away, m.homeHand);
      var homeRow = teamRow(m.home, m.awayHand);
      var awayPs = typeof getSpPitchScore === 'function' ? getSpPitchScore(m.home) : 50;
      var homePs = typeof getSpPitchScore === 'function' ? getSpPitchScore(m.away) : 50;
      var script = gameScriptForMatchup(m);
      return '<div class="script-card">'
        + '<div class="script-game">' + esc(m.away) + ' @ ' + esc(m.home) + '</div>'
        + '<div class="script-label ' + script.cls + '">' + esc(script.label) + '</div>'
        + '<span class="f5-badge">' + esc(script.f5) + '</span>'
        + '<div class="script-detail">ABQ ' + (awayRow ? awayRow.abq.toFixed(0) : '—') + '/' + (homeRow ? homeRow.abq.toFixed(0) : '—')
        + ' · Pitch ' + fmtMatchupStat(awayPs) + '/' + fmtMatchupStat(homePs) + '</div>'
        + '</div>';
    }).join('');
  }

  function renderValidation() {
    var el = document.getElementById('validationGrid');
    if (!el) return;
    var games = LIVE_DATA.matchups || [];
    var teams = {};
    games.forEach(function(m) {
      teams[m.away] = true;
      teams[m.home] = true;
    });
    var teamRows = Object.keys(teams).map(function(t) {
      var master = (typeof SCO_YTD_B !== 'undefined' ? SCO_YTD_B : []).find(function(d) { return d.t === t; });
      var osi = master ? master.osi : null;
      var badge = palsGapBadge(t, osi);
      return '<div class="val-row"><span class="val-name">' + esc(t) + ' offense</span><span class="val-badge ' + badge.cls + '">' + badge.label + '</span></div>';
    });
    var pitcherRows = [];
    games.forEach(function(m) {
      if (m.homeSP) pitcherRows.push({ name: m.homeSP, team: m.home, hand: m.homeHand });
      if (m.awaySP) pitcherRows.push({ name: m.awaySP, team: m.away, hand: m.awayHand });
    });
    var spHtml = pitcherRows.map(function(p) {
      var badge = oorPitcherBadge(p.team, p.hand);
      return '<div class="val-row"><span class="val-name">' + esc(p.name) + ' (' + esc(p.team) + ')</span><span class="val-badge ' + badge.cls + '">' + badge.label + '</span></div>';
    });
    el.innerHTML = '<div class="val-columns"><div class="val-col"><h3>Team OSI · PALS check</h3>' + (teamRows.join('') || '<div class="empty-msg">No teams</div>') + '</div>'
      + '<div class="val-col"><h3>Tonight&apos;s SP · OOR check</h3>' + (spHtml.join('') || '<div class="empty-msg">No SP listed</div>') + '</div></div>';
    el.innerHTML = el.innerHTML.replace(/<\/?motion>/g, '');
  }

  function renderConvergence() {
    var el = document.getElementById('convergenceGrid');
    if (!el) return;
    var rows = LIVE_DATA.signalsConvergence || [];
    if (!rows.length) {
      el.innerHTML = '<div class="empty-msg">Convergence signals load from Signals_Convergence sheet tab.</div>';
      return;
    }
    el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Game</th><th>Side</th><th>Signals</th><th>Weighted</th><th>Play?</th></tr></thead><tbody>'
      + rows.map(function(r) {
        var play = r.play || r.Play || (r.convergence != null && r.convergence >= 4);
        return '<tr><td>' + esc(r.game || r.Game || '—') + '</td><td>' + esc(r.side || r.Side || '—') + '</td>'
          + '<td>' + esc(r.signals || r.Signals || r.signal_count || '—') + '</td>'
          + '<td class="num">' + esc(String(r.weighted || r.Weighted || r.convergence || '—')) + '</td>'
          + '<td><span class="val-badge ' + (play ? 'val-confirmed' : 'val-neutral') + '">' + (play ? 'PLAY' : 'Pass') + '</span></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function trendReliabilityLabel(d) {
    if (!d) return 'Noisy';
    var l7only = d.l7OSI != null && d.ytdOSI != null && Math.abs(d.l7OSI - d.ytdOSI) > 8
      && (d.l30OSI == null || Math.abs(d.l30OSI - d.ytdOSI) < 4);
    if (l7only) return 'Short Spike';
    if (d.trend === 'Rising' && d.l30OSI > d.ytdOSI) return 'Sustained Rise';
    if (d.trend === 'Cooling') return 'Declining';
    if (d.trend === 'Stable Elite' || d.trend === 'Stable') return 'Stable';
    return 'Noisy';
  }

  function scrollToSection(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (typeof setOemMode === 'function') setOemMode('daily');
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function bindDashboardNav() {
    document.querySelectorAll('[data-dash-section]').forEach(function(a) {
      if (a.dataset.bound) return;
      a.dataset.bound = '1';
      a.addEventListener('click', function(e) {
        var id = a.getAttribute('data-dash-section');
        if (id) { e.preventDefault(); scrollToSection(id); }
      });
    });
    document.querySelectorAll('[data-oem-research]').forEach(function(a) {
      if (a.dataset.bound) return;
      a.dataset.bound = '1';
      a.addEventListener('click', function(e) {
        e.preventDefault();
        if (typeof setOemMode === 'function') setOemMode('research');
      });
    });
  }

  function renderQuestionDashboard() {
    renderDailySummaryQuestions();
    renderSection1Matchups();
    if (typeof renderQuadrant === 'function') renderQuadrant();
    renderMarketEdge();
    renderGameScript();
    renderValidation();
  }

  global.OEMOverhaul = {
    renderQuestionDashboard: renderQuestionDashboard,
    renderDailySummaryQuestions: renderDailySummaryQuestions,
    renderSection1Matchups: renderSection1Matchups,
    renderMarketEdge: renderMarketEdge,
    renderGameScript: renderGameScript,
    renderValidation: renderValidation,
    renderConvergence: renderConvergence,
    trendReliabilityLabel: trendReliabilityLabel,
    scrollToSection: scrollToSection,
    bindDashboardNav: bindDashboardNav
  };

})(typeof window !== 'undefined' ? window : this);
