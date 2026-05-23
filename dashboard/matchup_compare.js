/**
 * Matchup comparison page — deep dive for away @ home.
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;
  var STATE = { matchup: null };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function qp(name) {
    return new URLSearchParams(global.location.search).get(name) || '';
  }

  function fetchSheetTab(tab) {
    var sid = MLBMA_CONFIG.SHEET_ID;
    var url = 'https://docs.google.com/spreadsheets/d/' + sid + '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(tab);
    return fetch(url, { cache: 'no-store' }).then(function(r) {
      if (!r.ok) throw new Error('fetch');
      return r.text();
    }).then(function(text) {
      var lines = text.trim().split('\n');
      if (lines.length < 2) return [];
      var headers = lines[0].split(',').map(function(h) { return h.replace(/^"|"$/g, '').trim(); });
      return lines.slice(1).map(function(line) {
        var cols = line.match(/("([^"]|"")*"|[^,]*)/g) || [];
        var row = {};
        headers.forEach(function(h, i) {
          row[h] = (cols[i] || '').replace(/^"|"$/g, '').replace(/""/g, '"').trim();
        });
        return row;
      });
    });
  }

  function col(row) {
    var keys = Object.keys(row);
    return function() {
      for (var i = 0; i < arguments.length; i++) {
        var w = arguments[i].toLowerCase();
        var hit = keys.find(function(k) { return k.toLowerCase().replace(/\s/g, '_') === w; });
        if (hit && row[hit] !== '') return row[hit];
      }
      return '';
    };
  }

  function parseMatchup(rows, away, home) {
    away = away.toUpperCase();
    home = home.toUpperCase();
    var m = (rows || []).find(function(r) {
      var c = col(r);
      return c('away').toUpperCase() === away && c('home').toUpperCase() === home;
    });
    if (!m) return null;
    var c = col(m);
    return {
      away: away,
      home: home,
      time: c('time'),
      awaySP: c('away_sp', 'awaysp'),
      homeSP: c('home_sp', 'homesp'),
      awayHand: c('away_hand', 'awayhand'),
      homeHand: c('home_hand', 'homehand'),
      awayK: parseFloat(c('away_k%', 'awayk%')) || null,
      awayBB: parseFloat(c('away_bb%', 'awaybb%')) || null,
      awayFIP: parseFloat(c('away_fip', 'awayfip')) || null,
      homeK: parseFloat(c('home_k%', 'homek%')) || null,
      homeBB: parseFloat(c('home_bb%', 'homebb%')) || null,
      homeFIP: parseFloat(c('home_fip', 'homefip')) || null,
      awayOSI: parseFloat(c('away_osi')) || null,
      homeOSI: parseFloat(c('home_osi')) || null,
      lineupEdge: c('lineup_edge')
    };
  }

  function render(m, lineups, weather) {
    var root = document.getElementById('compareRoot');
    if (!root) return;
    if (!m) {
      root.innerHTML = '<p class="ca-helper">Matchup not found. <a href="chase_analytics_mlb_oem_v7.html">Back to slate</a></p>';
      return;
    }
    var gk = m.away + '@' + m.home;
    var w = weather && weather[gk] ? weather[gk] : '—';
    var logo = A ? A.teamLogoImg.bind(A) : function() { return ''; };

    root.innerHTML = ''
      + '<header class="compare-header">'
      + '<a href="chase_analytics_mlb_oem_v7.html" class="back-link">← Opening Dashboard</a>'
      + '<div class="compare-teams">'
      + logo(m.away, 48) + '<span class="compare-team">' + esc(m.away) + '</span>'
      + '<span class="compare-at">@</span>'
      + logo(m.home, 48) + '<span class="compare-team">' + esc(m.home) + '</span>'
      + '</div>'
      + '<div class="compare-meta">' + esc(m.time || 'TBD') + ' · ' + esc(w) + '</div>'
      + '</header>'
      + '<section class="compare-section"><h2 class="ca-section-title">Starting Pitchers</h2>'
      + '<div class="compare-pitchers">' + pitcherCard('Away', m.awaySP, m.awayHand, m.away, m) + pitcherCard('Home', m.homeSP, m.homeHand, m.home, m) + '</div></section>'
      + '<section class="compare-section"><h2 class="ca-section-title">Lineup vs Pitcher</h2>'
      + '<p class="ca-helper">Away OSI ' + fmt(m.awayOSI) + ' vs ' + esc(m.homeHand || '?') + 'HP · Home OSI ' + fmt(m.homeOSI) + ' vs ' + esc(m.awayHand || '?') + 'HP</p>'
      + '<div id="compareLineups" class="compare-lineups-placeholder">Lineup blocks load from Today_Lineups when pipeline data is available.</div></section>'
      + '<section class="compare-section"><h2 class="ca-section-title">Model Summary</h2>'
      + '<p class="ca-helper">Lineup edge: ' + esc(m.lineupEdge || '—') + '</p></section>';

    if (global.buildMatchupLineupBlock) {
      var el = document.getElementById('compareLineups');
      if (el) {
        global.LIVE_DATA = global.LIVE_DATA || {};
        global.LIVE_DATA.lineups = lineups || [];
        el.innerHTML = buildMatchupLineupBlock(m, { expanded: true });
      }
    }
  }

  function fmt(v) { return v != null && !isNaN(v) ? v.toFixed(1) : '—'; }

  function pitcherCard(side, name, hand, team, m) {
    var pid = A ? A.lookupMlbId(name) : null;
    var hs = A ? A.headshotImg(pid, 64, 'compare-headshot') : '';
    var stats = team === m.away
      ? { k: m.awayK, bb: m.awayBB, fip: m.awayFIP }
      : { k: m.homeK, bb: m.homeBB, fip: m.homeFIP };
    var pname = name && name !== 'TBD' ? name : 'TBD';
    var link = pname === 'TBD' ? 'TBD' : '<a href="pitcher_profile.html?pitcher=' + encodeURIComponent(pname) + '">' + esc(pname) + '</a>';
    return '<div class="compare-pitcher-card">'
      + '<div class="compare-pitcher-photo">' + hs + '</div>'
      + '<div><div class="ca-metric-label">' + side + ' SP</div>'
      + '<div class="ca-card-title">' + link + ' <span class="hand-pill">' + esc(hand || '?') + '</span></div>'
      + '<div class="ca-helper">K% ' + fmt(stats.k) + ' · BB% ' + fmt(stats.bb) + ' · FIP ' + (stats.fip != null ? stats.fip.toFixed(2) : '—') + '</div></div></div>';
  }

  function init() {
    var away = qp('away').toUpperCase();
    var home = qp('home').toUpperCase();
    if (!away || !home) {
      render(null);
      if (global.MLBMA_UI) MLBMA_UI.hideLoadingOverlay();
      return;
    }
    Promise.all([
      fetchSheetTab(MLBMA_CONFIG.SHEET_TABS.today_matchups),
      fetchSheetTab(MLBMA_CONFIG.SHEET_TABS.today_lineups).catch(function() { return []; }),
      fetchSheetTab(MLBMA_CONFIG.SHEET_TABS.weather).catch(function() { return []; }),
      fetchSheetTab(MLBMA_CONFIG.SHEET_TABS.player_registry).catch(function() { return []; })
    ]).then(function(res) {
      if (A && A.parseRegistryRows) A.parseRegistryRows(res[3]);
      var weather = {};
      (res[2] || []).forEach(function(r) {
        var c = col(r);
        var a = c('away').toUpperCase();
        var h = c('home').toUpperCase();
        if (a && h) weather[a + '@' + h] = c('conditions', 'weather') || c('summary');
      });
      var m = parseMatchup(res[0], away, home);
      STATE.matchup = m;
      render(m, res[1], weather);
      if (global.MLBMAStandings) MLBMAStandings.load();
      if (global.MLBMA_UI) MLBMA_UI.hideLoadingOverlay();
    }).catch(function() {
      render(null);
      if (global.MLBMA_UI) MLBMA_UI.hideLoadingOverlay();
    });
  }

  global.MatchupCompare = { init: init };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
