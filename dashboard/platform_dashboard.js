/**
 * MLBMA Platform Dashboard — matchup hero, signal chips, rankings.
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;
  var SORT = 'edge';
  var FILTER = 'all';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function gameCardId(m) {
    return 'game-card-' + String(m.away || '') + '-' + String(m.home || '');
  }

  function teamRow(team, hand) {
    var arr = hand === 'L' ? (typeof SCO_YTD_L !== 'undefined' ? SCO_YTD_L : [])
      : (typeof SCO_YTD_R !== 'undefined' ? SCO_YTD_R : []);
    return arr.find(function(d) { return d.t === team; })
      || (typeof SCO_YTD_B !== 'undefined' ? SCO_YTD_B.find(function(d) { return d.t === team; }) : null);
  }

  function bullpenOsiAllowed(team) {
    var u = (LIVE_DATA.bullpen || []).find(function(b) {
      return (b.t || b.team || b.Team) === team;
    });
    if (!u) return null;
    return u.osiAllowed != null ? u.osiAllowed : (u.osi_allowed != null ? u.osi_allowed : u.OSI_allowed);
  }

  function spPitchScore(team) {
    return typeof getSpPitchScore === 'function' ? getSpPitchScore(team) : null;
  }

  function gameScriptBadge(m) {
    var awayRow = teamRow(m.away, m.homeHand);
    var homeRow = teamRow(m.home, m.awayHand);
    var abqAvg = ((awayRow ? awayRow.abq : 50) + (homeRow ? homeRow.abq : 50)) / 2;
    var psAvg = ((spPitchScore(m.home) || 50) + (spPitchScore(m.away) || 50)) / 2;
    var maxRcv = Math.max(awayRow ? awayRow.rcv : 0, homeRow ? homeRow.rcv : 0);
    var maxHr9 = Math.max(m.homeHR9 || 0, m.awayHR9 || 0);
    if (maxRcv >= 65 && maxHr9 >= 1.2) return { label: 'Power Showdown', cls: 'script-orange' };
    if (abqAvg > 60 && psAvg > 65) return { label: 'Pitching Duel', cls: 'script-gray' };
    if (abqAvg > 60 && psAvg < 50) return { label: 'Lineup Grinds SP', cls: 'script-amber' };
    if (abqAvg < 50 && psAvg > 65) return { label: 'Quick Game', cls: 'script-blue' };
    return { label: 'Balanced', cls: 'script-muted' };
  }

  function f5Badge(m) {
    var awayPs = spPitchScore(m.home) || 50;
    var homePs = spPitchScore(m.away) || 50;
    var maxPs = Math.max(awayPs, homePs);
    var awayBp = bullpenOsiAllowed(m.home);
    var homeBp = bullpenOsiAllowed(m.away);
    var minBp = Math.min(awayBp != null ? awayBp : 55, homeBp != null ? homeBp : 55);
    var maxBp = Math.max(awayBp != null ? awayBp : 55, homeBp != null ? homeBp : 55);
    if (maxPs >= 70 && minBp < 50) return { label: 'F5 + Full', cls: 'f5-green' };
    if (maxPs >= 70 && maxBp > 60) return { label: 'F5 Only', cls: 'f5-amber' };
    if (maxPs < 55 && minBp < 50) return { label: 'Full Only', cls: 'f5-blue' };
    return { label: 'Lineup Edge', cls: 'f5-muted' };
  }

  function weatherHtml(m) {
    var gk = m.away + '@' + m.home;
    var w = (LIVE_DATA.weather || {})[gk];
    if (!w) return '';
    var s = String(w).toUpperCase();
    if (s.indexOf('DOME') >= 0 || s.indexOf('ROOF') >= 0) return '<span class="weather-badge dome">DOME</span>';
    return '<span class="weather-badge">' + esc(w) + '</span>';
  }

  function pitchTier(score) {
    if (score == null || isNaN(score)) return { label: '—', cls: 'tier-mid' };
    if (score >= 70) return { label: 'Elite', cls: 'tier-elite' };
    if (score >= 55) return { label: 'Solid', cls: 'tier-solid' };
    if (score >= 40) return { label: 'Avg', cls: 'tier-mid' };
    return { label: 'Volatile', cls: 'tier-vol' };
  }

  function spRow(label, name, hand, team, stats) {
    var pid = A ? A.lookupMlbId(name) : null;
    var hs = A ? A.headshotImg(pid, 36, 'mc-headshot') : '';
    var pt = pitchTier(spPitchScore(team));
    stats = stats || {};
    return '<div class="mc-sp-block">'
      + '<div class="mc-sp-photo">' + hs + '</div>'
      + '<div class="mc-sp-info">'
      + '<span class="mc-sp-side">' + label + '</span> '
      + '<strong>' + esc(name || 'TBD') + '</strong> '
      + '<span class="hand-pill hand-' + (hand || '?').toLowerCase() + '">' + esc(hand || '?') + '</span> '
      + '<span class="pitch-tier ' + pt.cls + '">' + pt.label + '</span>'
      + '<div class="mc-sp-stats">'
      + 'K% ' + esc(stats.k != null ? Number(stats.k).toFixed(1) : '—') + ' · '
      + 'BB% ' + esc(stats.bb != null ? Number(stats.bb).toFixed(1) : '—') + ' · '
      + 'FIP ' + esc(stats.fip != null ? Number(stats.fip).toFixed(2) : '—')
      + '</div></div></div>';
  }

  function passesFilter(m, script, f5) {
    if (FILTER === 'all') return true;
    if (FILTER === 'edge') {
      var edge = Math.abs((m.awayOSI || 0) - (m.homeOSI || 0));
      return edge >= 5;
    }
    if (FILTER === 'duel') return script.label === 'Pitching Duel';
    if (FILTER === 'power') return script.label === 'Power Showdown';
    if (FILTER === 'f5') return f5.label === 'F5 Only' || f5.label === 'F5 + Full';
    return true;
  }

  function sortGames(games) {
    var list = games.slice();
    list.sort(function(a, b) {
      if (SORT === 'time') return String(a.time || '').localeCompare(String(b.time || ''));
      if (SORT === 'pitch') {
        var aPs = Math.max(spPitchScore(a.home) || 0, spPitchScore(a.away) || 0);
        var bPs = Math.max(spPitchScore(b.home) || 0, spPitchScore(b.away) || 0);
        return bPs - aPs;
      }
      var aEdge = Math.abs((a.awayOSI || 0) - (a.homeOSI || 0));
      var bEdge = Math.abs((b.awayOSI || 0) - (b.homeOSI || 0));
      return bEdge - aEdge;
    });
    return list;
  }

  function renderHeroMatchups() {
    var grid = document.getElementById('matchupsHeroGrid');
    var meta = document.getElementById('matchupsHeroMeta');
    if (!grid) return;
    var games = LIVE_DATA.matchups || [];
    if (meta) {
      var d = new Date();
      meta.textContent = games.length + ' games today · ' + d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    }
    if (!games.length) {
      grid.innerHTML = '<div class="empty-msg">No matchups loaded for today.</div>';
      return;
    }
    var sorted = sortGames(games).filter(function(m) {
      return passesFilter(m, gameScriptBadge(m), f5Badge(m));
    });
    var logo = A ? A.teamLogoImg.bind(A) : function() { return ''; };

    grid.innerHTML = sorted.map(function(m) {
      var cardId = gameCardId(m);
      var panelId = 'hero_' + cardId;
      var awayOSI = m.awayOSI != null ? m.awayOSI : 0;
      var homeOSI = m.homeOSI != null ? m.homeOSI : 0;
      var total = awayOSI + homeOSI || 1;
      var awayPct = Math.max(10, (awayOSI / total) * 100);
      var fav = awayOSI >= homeOSI ? m.away : m.home;
      var script = gameScriptBadge(m);
      var f5 = f5Badge(m);
      var handLabel = m.homeHand === 'L' ? 'LHP' : m.homeHand === 'R' ? 'RHP' : 'SP';
      var awayHandLabel = m.awayHand === 'L' ? 'LHP' : m.awayHand === 'R' ? 'RHP' : 'SP';
      var awayEdgeCls = fav === m.away ? ' edge-team' : '';
      var homeEdgeCls = fav === m.home ? ' edge-team' : '';

      return '<article class="hero-matchup-card" id="' + cardId + '" data-away="' + esc(m.away) + '" data-home="' + esc(m.home) + '">'
        + '<div class="hmc-row hmc-teams">'
        + '<div class="hmc-team' + awayEdgeCls + '">' + logo(m.away, 40) + '<span class="hmc-abbr">' + esc(m.away) + '</span></div>'
        + '<span class="hmc-at">@</span>'
        + '<div class="hmc-team' + homeEdgeCls + '">' + logo(m.home, 40) + '<span class="hmc-abbr">' + esc(m.home) + '</span></div>'
        + '<div class="hmc-time">' + esc(m.time || 'TBD') + '</div>'
        + weatherHtml(m)
        + '</div>'
        + '<div class="hmc-row hmc-pitchers">'
        + spRow('Away SP', m.awaySP, m.awayHand, m.away, { k: m.awayK, bb: m.awayBB, fip: m.awayFIP })
        + spRow('Home SP', m.homeSP, m.homeHand, m.home, { k: m.homeK, bb: m.homeBB, fip: m.homeFIP })
        + '</div>'
        + '<div class="hmc-row hmc-edge-label">Tonight&apos;s Lineup Edge (vs ' + handLabel + ' / ' + awayHandLabel + ')</div>'
        + '<div class="hmc-osi-bar">'
        + '<span class="hmc-osi-val' + awayEdgeCls + '">' + esc(m.away) + ' <strong>' + (m.awayOSI != null ? m.awayOSI.toFixed(1) : '—') + '</strong></span>'
        + '<div class="hmc-bar-track"><div class="hmc-bar-away" style="width:' + awayPct + '%"></div><div class="hmc-bar-home" style="width:' + (100 - awayPct) + '%"></div></div>'
        + '<span class="hmc-osi-val tr' + homeEdgeCls + '">' + esc(m.home) + ' <strong>' + (m.homeOSI != null ? m.homeOSI.toFixed(1) : '—') + '</strong></span>'
        + '</div>'
        + '<div class="hmc-badges">'
        + '<span class="script-badge ' + script.cls + '">' + esc(script.label) + '</span>'
        + '<span class="f5-badge ' + f5.cls + '">' + esc(f5.label) + '</span>'
        + '</div>'
        + '<button type="button" class="metrics-toggle" onclick="toggleMetricsPanel(\'' + panelId + '\', this)">Show Lineup ▾</button>'
        + '<div class="metrics-panel" id="' + panelId + '">'
        + (typeof buildMatchupLineupBlock === 'function' ? buildMatchupLineupBlock(m) : '')
        + '</div></article>';
    }).join('').replace(/<\/?motion>/g, '');
  }

  function renderSignalChips() {
    var el = document.getElementById('signalChips');
    if (!el) return;
    var games = LIVE_DATA.matchups || [];
    var rows = typeof SCO_YTD_B !== 'undefined' ? SCO_YTD_B : [];
    var chips = [];

    if (games.length) {
      var bestLineup = null, bestOsi = -1;
      games.forEach(function(m) {
        [['away', m.awayOSI, m.homeHand], ['home', m.homeOSI, m.awayHand]].forEach(function(x) {
          if (x[1] != null && x[1] > bestOsi) { bestOsi = x[1]; bestLineup = { team: m[x[0]], osi: x[1], cardId: gameCardId(m) }; }
        });
      });
      if (bestLineup) chips.push({ cls: 'chip-green', label: 'Best Lineup Edge', val: bestLineup.team + ' ' + bestLineup.osi.toFixed(1), scroll: bestLineup.cardId });

      var bestF5 = null, bestF5Score = -1;
      games.forEach(function(m) {
        var awayRow = teamRow(m.away, m.homeHand);
        var abq = awayRow ? awayRow.abq : 50;
        var ps = spPitchScore(m.home) || 50;
        var s = abq + (100 - ps);
        if (s > bestF5Score) { bestF5Score = s; bestF5 = { game: m.away + '@' + m.home, cardId: gameCardId(m) }; }
      });
      if (bestF5) chips.push({ cls: 'chip-amber', label: 'Strongest F5 Angle', val: bestF5.game, scroll: bestF5.cardId });

      var bestPs = null, psSum = -1;
      games.forEach(function(m) {
        var s = (spPitchScore(m.home) || 0) + (spPitchScore(m.away) || 0);
        if (s > psSum) { psSum = s; bestPs = { game: m.away + '@' + m.home, cardId: gameCardId(m) }; }
      });
      if (bestPs) chips.push({ cls: 'chip-gray', label: 'Pitching Duel', val: bestPs.game, scroll: bestPs.cardId });

      var bestPower = null, powerScore = -1;
      games.forEach(function(m) {
        var awayRow = teamRow(m.away, m.homeHand);
        var homeRow = teamRow(m.home, m.awayHand);
        var rcv = Math.max(awayRow ? awayRow.rcv : 0, homeRow ? homeRow.rcv : 0);
        var hr9 = Math.max(m.homeHR9 || 0, m.awayHR9 || 0);
        var s = rcv + hr9 * 20;
        if (s > powerScore) { powerScore = s; bestPower = { game: m.away + '@' + m.home, cardId: gameCardId(m) }; }
      });
      if (bestPower) chips.push({ cls: 'chip-orange', label: 'Power Matchup', val: bestPower.game, scroll: bestPower.cardId });
    }

    if (rows.length) {
      var buy = rows.filter(function(d) { return d.ppGap >= 4; }).sort(function(a, b) { return b.ppGap - a.ppGap; })[0];
      if (buy) chips.push({ cls: 'chip-teal', label: 'Buy-Low Offense', val: buy.t + ' +' + buy.ppGap.toFixed(1), href: 'team_profile.html?team=' + buy.t });
      var fade = rows.filter(function(d) { return d.ppGap <= -4; }).sort(function(a, b) { return a.ppGap - b.ppGap; })[0];
      if (fade) chips.push({ cls: 'chip-red', label: 'Fade Risk', val: fade.t + ' ' + fade.ppGap.toFixed(1), href: 'team_profile.html?team=' + fade.t });
    }

    chips = chips.slice(0, 6);
    el.innerHTML = chips.map(function(c) {
      var click = c.href ? 'onclick="location.href=\'' + c.href + '\'"'
        : 'onclick="var el=document.getElementById(\'' + c.scroll + '\');if(el)el.scrollIntoView({behavior:\'smooth\',block:\'start\'});"';
      return '<button type="button" class="signal-chip ' + c.cls + '" ' + click + '>'
        + '<span class="chip-label">' + esc(c.label) + '</span>'
        + '<span class="chip-val">' + esc(c.val) + '</span></button>';
    }).join('');
  }

  function renderMetricBarChart(metric) {
    var el = document.getElementById('metricBarChart');
    if (!el || !metric) { if (el) el.innerHTML = ''; return; }
    var rows = (typeof currentRows === 'function' ? currentRows() : (SCO_YTD_B || [])).slice()
      .sort(function(a, b) { return (b[metric] || 0) - (a[metric] || 0); });
    var max = rows[0] ? rows[0][metric] : 100;
    if (!max) max = 100;
    var logo = A ? A.teamLogoImg.bind(A) : function() { return ''; };
    var colorFn = A ? A.metricColor.bind(A) : function(v) { return 'var(--purple)'; };
    el.innerHTML = '<div class="metric-bar-chart-title">' + metric.toUpperCase() + ' league ranking</div>'
      + rows.map(function(d) {
        var w = Math.max(4, ((d[metric] || 0) / max) * 100);
        return '<div class="mbc-row">'
          + logo(d.t, 20, 'mbc-logo')
          + '<span class="mbc-team">' + esc(d.t) + '</span>'
          + '<div class="mbc-track"><div class="mbc-fill" style="width:' + w + '%;background:' + colorFn(d[metric]) + '"></div></div>'
          + '<span class="mbc-val" style="color:' + colorFn(d[metric]) + '">' + (d[metric] != null ? d[metric].toFixed(1) : '—') + '</span></div>';
      }).join('').replace(/<\/?motion>/g, '');
  }

  function bindHeroControls() {
    document.querySelectorAll('[data-match-sort]').forEach(function(btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function() {
        SORT = btn.getAttribute('data-match-sort');
        document.querySelectorAll('[data-match-sort]').forEach(function(b) {
          b.classList.toggle('active', b === btn);
        });
        renderHeroMatchups();
      });
    });
    document.querySelectorAll('[data-match-filter]').forEach(function(btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function() {
        FILTER = btn.getAttribute('data-match-filter');
        document.querySelectorAll('[data-match-filter]').forEach(function(b) {
          b.classList.toggle('active', b === btn);
        });
        renderHeroMatchups();
      });
    });
    var toggle = document.getElementById('signalSummaryToggle');
    var body = document.getElementById('signalSummaryBody');
    if (toggle && body && !toggle.dataset.bound) {
      toggle.dataset.bound = '1';
      toggle.addEventListener('click', function() {
        body.classList.toggle('collapsed');
        toggle.textContent = body.classList.contains('collapsed') ? 'Show ▾' : 'Hide ▴';
      });
    }
  }

  function renderDashboard() {
    renderHeroMatchups();
    renderSignalChips();
    if (typeof renderMasterTable === 'function') renderMasterTable();
    if (STATE && STATE.activeMetric) renderMetricBarChart(STATE.activeMetric);
    bindHeroControls();
  }

  function initRegistry() {
    if (!A) return Promise.resolve();
    if (A.registry && A.registry.loaded) return Promise.resolve();
    if (LIVE_DATA && LIVE_DATA.playerRegistry && LIVE_DATA.playerRegistry.length && A.parseRegistryRows) {
      A.parseRegistryRows(typeof parseRegistrySheet === 'function' ? parseRegistrySheet(LIVE_DATA.playerRegistry) : LIVE_DATA.playerRegistry);
      return Promise.resolve();
    }
    if (!global.fetchSheetTab || !global.TABS) return Promise.resolve();
    return A.loadRegistry(function() {
      return fetchSheetTab(TABS.player_registry).then(function(rows) {
        return typeof parseRegistrySheet === 'function' ? parseRegistrySheet(rows || []) : (rows || []);
      });
    });
  }

  global.PlatformDashboard = {
    renderDashboard: renderDashboard,
    renderHeroMatchups: renderHeroMatchups,
    renderSignalChips: renderSignalChips,
    renderMetricBarChart: renderMetricBarChart,
    initRegistry: initRegistry,
    bindHeroControls: bindHeroControls
  };
})(typeof window !== 'undefined' ? window : this);
