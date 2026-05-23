/**
 * MLBMA Platform Dashboard — landing matchup hub, signal teaser.
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;
  var SORT = 'edge';
  var FILTER = 'all';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function compareUrl(away, home) {
    return 'matchup_compare.html?away=' + encodeURIComponent(away || '') + '&home=' + encodeURIComponent(home || '');
  }

  function teamProfileUrl(team) {
    return 'team_profile.html?team=' + encodeURIComponent(team || '');
  }

  function pitcherProfileUrl(name) {
    return 'pitcher_profile.html?pitcher=' + encodeURIComponent(name || '');
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

  function teamKey(t) {
    return String(t || '').trim().toUpperCase();
  }

  function bullpenOsiAllowed(team) {
    var units = (global.LIVE_DATA && LIVE_DATA.bullpenUnits) || {};
    var u = units[teamKey(team)];
    if (!u) return null;
    return u.osiAllowed != null ? u.osiAllowed : (u.osi_allowed != null ? u.osi_allowed : u.OSI_allowed);
  }

  function spPitchScore(team) {
    return typeof getSpPitchScore === 'function' ? getSpPitchScore(team) : null;
  }

  function f5EdgeScore(m) {
    var awayPs = spPitchScore(m.home) || 50;
    var homePs = spPitchScore(m.away) || 50;
    var awayBp = bullpenOsiAllowed(m.home);
    var homeBp = bullpenOsiAllowed(m.away);
    var minBp = Math.min(awayBp != null ? awayBp : 55, homeBp != null ? homeBp : 55);
    var maxPs = Math.max(awayPs, homePs);
    var awayRow = teamRow(m.away, m.homeHand);
    var homeRow = teamRow(m.home, m.awayHand);
    var lineupEdge = Math.abs((m.awayOSI || 0) - (m.homeOSI || 0));
    return maxPs + (100 - minBp) * 0.3 + lineupEdge;
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

  function weatherText(w) {
    if (!w) return '';
    if (typeof w === 'string') return w;
    return w.cond || w.conditions || w.weather || '';
  }

  function weatherHtml(m) {
    var gk = m.away + '@' + m.home;
    var w = (LIVE_DATA.weather || {})[gk];
    var text = weatherText(w);
    if (!text) return '';
    var s = String(text).toUpperCase();
    if (s.indexOf('DOME') >= 0 || s.indexOf('ROOF') >= 0) return '<span class="weather-badge dome">DOME</span>';
    return '<span class="weather-badge">' + esc(text) + '</span>';
  }

  function gameMetaHtml(m) {
    var parts = [];
    if (m.time) parts.push('<span class="hmc-time">' + esc(m.time) + '</span>');
    if (m.stadium) parts.push('<span class="hmc-venue">' + esc(m.stadium) + '</span>');
    var wh = weatherHtml(m);
    if (wh) parts.push(wh);
    if (!parts.length) return '<div class="hmc-meta">TBD</div>';
    return '<div class="hmc-meta">' + parts.join('') + '</div>';
  }

  function fmtRatePct(v) {
    if (v == null || v === '' || isNaN(v)) return '—';
    var n = Number(v);
    if (n > 0 && n <= 1) return Math.round(n * 100) + '%';
    return Math.round(n) + '%';
  }

  function pitchTier(score) {
    if (score == null || isNaN(score)) return { label: '—', cls: 'tier-mid' };
    if (score >= 70) return { label: 'Elite', cls: 'tier-elite' };
    if (score >= 55) return { label: 'Solid', cls: 'tier-solid' };
    if (score >= 40) return { label: 'Avg', cls: 'tier-mid' };
    return { label: 'Volatile', cls: 'tier-vol' };
  }

  function spRow(label, name, hand, team, stats, opts) {
    opts = opts || {};
    var pid = A ? A.lookupMlbId(name) : null;
    var hs = A ? A.pitcherAvatar(pid, { crop: 'matchup', className: 'mc-headshot', eager: !!opts.eager })
      : '<span class="ca-pitcher-avatar ca-pitcher-avatar--matchup"><span class="ca-pitcher-avatar-fallback pitcher-silhouette" style="display:flex"></span></span>';
    var ps = spPitchScore(team);
    var pt = pitchTier(ps);
    var psColor = A && ps != null ? A.metricColor(ps, true) : 'var(--text-2)';
    var pname = name && String(name).trim() && String(name).toUpperCase() !== 'TBD' ? name : 'TBD';
    var nameHtml = pname === 'TBD'
      ? '<strong>TBD</strong>'
      : '<a href="' + pitcherProfileUrl(pname) + '" class="pitcher-link" onclick="event.stopPropagation()"><strong>' + esc(pname) + '</strong></a>';
    stats = stats || {};
    var psBadge = ps != null
      ? '<span class="mc-ps-badge">Pitching Score <strong style="color:' + psColor + '">' + Number(ps).toFixed(0) + '</strong></span>'
      : '';
    return '<div class="mc-sp-block" onclick="event.stopPropagation()">'
      + '<div class="mc-sp-photo">' + hs + '</div>'
      + '<div class="mc-sp-info">'
      + '<div class="mc-sp-name-row">'
      + '<span class="mc-sp-side">' + label + '</span> '
      + '<span class="mc-sp-name">' + nameHtml + '</span>'
      + '<span class="hand-pill hand-' + (hand || '?').toLowerCase() + '">' + esc(hand || '?') + '</span>'
      + '<span class="pitch-tier ' + pt.cls + '">' + pt.label + '</span>'
      + '</div>'
      + psBadge
      + '<div class="mc-sp-stats">'
      + 'K ' + esc(fmtRatePct(stats.k)) + ' · '
      + 'BB ' + esc(fmtRatePct(stats.bb)) + ' · '
      + 'FIP ' + esc(stats.fip != null ? Number(stats.fip).toFixed(2) : '—')
      + '</div></div></div>';
  }

  function passesFilter(m, script, f5) {
    if (FILTER === 'all') return true;
    if (FILTER === 'edge') {
      return Math.abs((m.awayOSI || 0) - (m.homeOSI || 0)) >= 5;
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
      if (SORT === 'f5') return f5EdgeScore(b) - f5EdgeScore(a);
      var aEdge = Math.abs((a.awayOSI || 0) - (a.homeOSI || 0));
      var bEdge = Math.abs((b.awayOSI || 0) - (b.homeOSI || 0));
      return bEdge - aEdge;
    });
    return list;
  }

  function bindCardNavigation() {
    var grid = document.getElementById('matchupsHeroGrid');
    if (!grid || grid.dataset.navBound) return;
    grid.dataset.navBound = '1';
    grid.addEventListener('click', function(e) {
      if (e.target.closest('a, button, .hmc-lineup-toggle')) return;
      var card = e.target.closest('.hero-matchup-card');
      if (!card) return;
      var away = card.getAttribute('data-away');
      var home = card.getAttribute('data-home');
      if (away && home) global.location.href = compareUrl(away, home);
    });
    grid.addEventListener('click', function(e) {
      var btn = e.target.closest('.hmc-lineup-toggle');
      if (!btn) return;
      e.stopPropagation();
      var wrap = btn.closest('.hmc-lineups');
      if (!wrap) return;
      var open = wrap.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.textContent = open ? 'Hide Lineups ▴' : 'Show Lineups ▾';
    });
  }

  function teamLinkHtml(team, logoFn, extraCls) {
    return '<a href="' + teamProfileUrl(team) + '" class="team-link' + (extraCls || '') + '" onclick="event.stopPropagation()">'
      + logoFn(team, 40)
      + '<span class="hmc-abbr">' + esc(team)
      + (global.MLBMAStandings ? MLBMAStandings.recordHtml(team) : '')
      + '</span></a>';
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

    grid.innerHTML = sorted.map(function(m, cardIdx) {
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
      var lineupHtml = typeof buildMatchupLineupBlock === 'function'
        ? buildMatchupLineupBlock(m, { expanded: true, hideToggle: true }) : '';

      return '<article class="hero-matchup-card" data-away="' + esc(m.away) + '" data-home="' + esc(m.home) + '" role="link" tabindex="0">'
        + '<div class="hmc-row hmc-teams">'
        + '<div class="hmc-team' + awayEdgeCls + '">' + teamLinkHtml(m.away, logo, '') + '</div>'
        + '<span class="hmc-at">@</span>'
        + '<div class="hmc-team' + homeEdgeCls + '">' + teamLinkHtml(m.home, logo, '') + '</div>'
        + gameMetaHtml(m)
        + '</div>'
        + '<div class="hmc-row hmc-pitchers">'
        + spRow('Away SP', m.awaySP, m.awayHand, m.away, { k: m.awayK, bb: m.awayBB, fip: m.awayFIP }, { eager: cardIdx < 3 })
        + spRow('Home SP', m.homeSP, m.homeHand, m.home, { k: m.homeK, bb: m.homeBB, fip: m.homeFIP }, { eager: cardIdx < 3 })
        + '</div>'
        + '<div class="hmc-row hmc-edge-label">Lineup edge vs ' + handLabel + ' / ' + awayHandLabel + '</div>'
        + '<div class="hmc-osi-bar">'
        + '<span class="hmc-osi-val' + awayEdgeCls + '">' + esc(m.away) + ' <strong>' + (m.awayOSI != null ? m.awayOSI.toFixed(1) : '—') + '</strong></span>'
        + '<div class="hmc-bar-track"><div class="hmc-bar-away" style="width:' + awayPct + '%"></div><div class="hmc-bar-home" style="width:' + (100 - awayPct) + '%"></div></div>'
        + '<span class="hmc-osi-val tr' + homeEdgeCls + '">' + esc(m.home) + ' <strong>' + (m.homeOSI != null ? m.homeOSI.toFixed(1) : '—') + '</strong></span>'
        + '</div>'
        + '<div class="hmc-badges">'
        + '<span class="script-badge ' + script.cls + '">' + esc(script.label) + '</span>'
        + '<span class="f5-badge ' + f5.cls + '">' + esc(f5.label) + '</span>'
        + '</div>'
        + lineupHtml
        + '<span class="hmc-view-full">View Full Matchup →</span>'
        + '</article>';
    }).join('').replace(/<\/?motion>/g, '');

    bindCardNavigation();
    grid.querySelectorAll('.hero-matchup-card').forEach(function(card) {
      card.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          var away = card.getAttribute('data-away');
          var home = card.getAttribute('data-home');
          if (away && home) global.location.href = compareUrl(away, home);
        }
      });
    });
  }

  function signalConfClass(conf) {
    var s = String(conf || '').toLowerCase();
    if (s.indexOf('high') >= 0 || s.indexOf('elite') >= 0) return 'high';
    if (s.indexOf('med') >= 0) return 'mid';
    return 'low';
  }

  function parseSignalsToday() {
    var rows = (global.LIVE_DATA && LIVE_DATA.signalsToday) || [];
    if (!rows.length) return [];
    if (global.MLBMASignals && MLBMASignals.normalizeSignalRow) {
      return rows.map(function(row, i) {
        var r = MLBMASignals.normalizeSignalRow(row, i);
        if (!r.fired) return null;
        return {
          type: r.signalName || 'Model Signal',
          game: r.gameLabel,
          gameKey: r.gameKey,
          away: r.away,
          home: r.home,
          confidence: r.fired ? 'High' : 'Medium',
          idx: i
        };
      }).filter(Boolean);
    }
    return rows.map(function(row, i) {
      var keys = Object.keys(row);
      function col() {
        for (var k = 0; k < arguments.length; k++) {
          var want = arguments[k];
          var hit = keys.find(function(key) {
            return String(key).toLowerCase().replace(/\s+/g, '_') === want.toLowerCase();
          });
          if (hit && row[hit] != null && row[hit] !== '') return String(row[hit]).trim();
        }
        return '';
      }
      return {
        type: col('signal_type', 'signal', 'type') || 'Model Signal',
        game: col('game', 'matchup', 'teams') || col('team') || '—',
        confidence: col('confidence', 'conf') || 'Medium',
        idx: i
      };
    }).filter(function(s) { return s.game !== '—' || s.type; });
  }

  function modelReportHref(s) {
    var base = 'model_report.html';
    if (s.gameKey) return base + '?game=' + encodeURIComponent(s.gameKey) + '#signal-' + s.idx;
    if (s.away && s.home) {
      return base + '?game=' + encodeURIComponent(s.away + '@' + s.home) + '#signal-' + s.idx;
    }
    return base + '#signal-' + s.idx;
  }

  function renderSignalChips() {
    var el = document.getElementById('signalChips');
    if (!el) return;
    var chips = [];
    var sheetSignals = parseSignalsToday();

    if (sheetSignals.length) {
      sheetSignals.slice(0, 3).forEach(function(s) {
        chips.push({
          label: s.type,
          val: s.game,
          conf: s.confidence,
          href: modelReportHref(s)
        });
      });
    }

    if (!chips.length) {
      var games = LIVE_DATA.matchups || [];
      var rows = typeof SCO_YTD_B !== 'undefined' ? SCO_YTD_B : [];
      if (games.length) {
        var bestLineup = null, bestOsi = -1;
        games.forEach(function(m) {
          [['away', m.awayOSI, m.away], ['home', m.homeOSI, m.home]].forEach(function(x) {
            if (x[1] != null && x[1] > bestOsi) {
              bestOsi = x[1];
              bestLineup = { team: x[2], game: m.away + '@' + m.home, osi: x[1] };
            }
          });
        });
        if (bestLineup) {
          chips.push({
            label: 'Top Lineup Edge',
            val: bestLineup.game + ' · ' + bestLineup.team,
            conf: 'High',
            href: 'model_report.html?game=' + encodeURIComponent(bestLineup.game)
          });
        }
      }
      if (rows.length) {
        var buy = rows.filter(function(d) { return d.ppGap >= 4; }).sort(function(a, b) { return b.ppGap - a.ppGap; })[0];
        if (buy && chips.length < 3) {
          chips.push({ label: 'Buy-Low Offense', val: buy.t, conf: 'Medium', href: 'model_report.html?fired=1' });
        }
      }
    }

    chips = chips.slice(0, 3);
    if (!chips.length) {
      el.innerHTML = '<p class="ca-helper" style="margin:0;">No model signals yet — run the daily pipeline or open the full report.</p>';
      return;
    }

    el.innerHTML = chips.map(function(c) {
      return '<button type="button" class="signal-chip" onclick="location.href=\'' + esc(c.href) + '\'">'
        + '<span class="chip-label">' + esc(c.label) + '</span>'
        + '<span class="chip-val">' + esc(c.val) + '</span>'
        + '<span class="chip-conf"><span class="conf-dot ' + signalConfClass(c.conf) + '"></span>' + esc(c.conf) + '</span>'
        + '</button>';
    }).join('');
  }

  function bindHeroControls() {
    document.querySelectorAll('[data-match-sort]').forEach(function(btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function(e) {
        e.preventDefault();
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
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        FILTER = btn.getAttribute('data-match-filter');
        document.querySelectorAll('[data-match-filter]').forEach(function(b) {
          b.classList.toggle('active', b === btn);
        });
        renderHeroMatchups();
      });
    });
  }

  function renderDashboard() {
    renderHeroMatchups();
    renderSignalChips();
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
    initRegistry: initRegistry,
    bindHeroControls: bindHeroControls
  };
})(typeof window !== 'undefined' ? window : this);
