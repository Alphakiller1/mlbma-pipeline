// v20260525a
/**
 * MLBMA Platform Dashboard — landing matchup hub, signal teaser.
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;
  var S = global.MLBMASharedMatchup || global.MatchupShared;
  var SORT = 'edge';
  var FILTER = 'all';
  var MATCH_DAY = 'today';

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
    var w = (global.LIVE_DATA && LIVE_DATA.weather || {})[gk] || m.weather;
    if (!w) return '';
    if (typeof w === 'string') {
      var su = w.toUpperCase();
      if (su.indexOf('DOME') >= 0 || su.indexOf('ROOF') >= 0) return '<span class="weather-badge dome">DOME</span>';
      return '<span class="weather-badge">' + esc(w) + '</span>';
    }
    if (w.dome) return '<span class="weather-badge dome">DOME</span>';
    var bits = [];
    if (w.temp != null) bits.push(w.temp + '°');
    if (w.wind != null) bits.push(w.wind + ' mph' + (w.windDir ? ' ' + w.windDir : ''));
    var cond = w.cond || w.conditions || w.weather || w.raw || '';
    if (cond && String(cond).toUpperCase().indexOf('DOME') >= 0) return '<span class="weather-badge dome">DOME</span>';
    if (cond) bits.push(cond);
    if (!bits.length) return '';
    return '<span class="weather-badge">' + esc(bits.join(' · ')) + '</span>';
  }

  function teamOsiSparkline(team, spHand) {
    var row = teamRow(team, spHand);
    if (!row || !global.MLBMACharts) return '';
    var vals = [
      row.ytdOSI != null ? row.ytdOSI : row.osi,
      row.l30OSI,
      row.l14OSI,
      row.l7OSI
    ];
    return MLBMACharts.buildSparkline(vals, 50, 20);
  }

  function gameMetaHtml(m) {
    var parts = [];
    if (m.time) parts.push('<span class="hmc-time chip">' + esc(m.time) + '</span>');
    if (m.stadium) parts.push('<span class="hmc-stadium chip">' + esc(m.stadium) + '</span>');
    var wh = weatherHtml(m);
    if (wh) parts.push(wh);
    if (!parts.length) return '<div class="hmc-meta"><span class="chip">TBD</span></div>';
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

  function spPitchScoreFromProfile(pitcherName, team) {
    var profiles = (global.LIVE_DATA && LIVE_DATA.spProfiles) || [];
    if (!profiles.length || !S || !S.findSpProfile) return null;
    var p = S.findSpProfile(profiles, pitcherName, team);
    if (!p || !S.spProfileMetrics) return null;
    var m = S.spProfileMetrics(p);
    return m && m.pitchScore != null ? m.pitchScore : null;
  }

  function normalizePitchHand(h) {
    if (typeof global.normalizePitcherHand === 'function') return global.normalizePitcherHand(h);
    var s = String(h || '').trim().toUpperCase();
    if (s === 'L' || s === 'LHP' || s.charAt(0) === 'L') return 'L';
    if (s === 'R' || s === 'RHP' || s.charAt(0) === 'R') return 'R';
    return '?';
  }

  function spRow(label, name, hand, team, stats, opts) {
    opts = opts || {};
    var pid = opts.mlbId != null ? String(opts.mlbId)
      : (A && A.resolveMlbId ? A.resolveMlbId(name) : (A ? A.lookupMlbId(name) : null));
    var hs = A ? A.pitcherAvatar(pid || name, { crop: 'matchup', className: 'mc-headshot', eager: !!opts.eager })
      : '<span class="ca-pitcher-avatar ca-pitcher-avatar--matchup"><span class="ca-pitcher-avatar-fallback pitcher-silhouette" style="display:flex"></span></span>';
    var ps = opts.pitchScore != null ? opts.pitchScore : spPitchScoreFromProfile(name, team);
    if (ps == null) ps = spPitchScore(team);
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
      + '<span class="hand-pill hand-' + normalizePitchHand(hand).toLowerCase() + '">'
      + esc(normalizePitchHand(hand) === 'L' ? 'LHP' : normalizePitchHand(hand) === 'R' ? 'RHP' : '?') + '</span>'
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
      + logoFn(team, 48)
      + '<span class="hmc-abbr">' + esc(team)
      + (global.MLBMAStandings ? MLBMAStandings.recordHtml(team) : '')
      + '</span></a>';
  }

  function formatOpeningHeroDate(d) {
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  function slateCountLabel(n) {
    if (n === 1) return '1 game today';
    return n + ' games today';
  }

  function setHeroLiveChip(synced, warn) {
    var live = document.getElementById('openingHeroLive');
    if (!live) return;
    live.classList.remove('is-pending', 'ca-chip-warn', 'ca-chip-live');
    if (synced) {
      live.classList.add('ca-chip-live');
      live.innerHTML = '<span class="ca-dot"></span> Synced';
    } else if (warn) {
      live.classList.add('ca-chip-warn');
      live.innerHTML = '<span class="ca-dot"></span> Timestamp unavailable';
    } else {
      live.classList.add('is-pending', 'ca-chip-live');
      live.innerHTML = '<span class="ca-dot"></span> Syncing…';
    }
  }

  function setOpeningHeroSync(text) {
    var el = document.getElementById('openingHeroSynced');
    if (!el) return;
    var display = (!text || text === '--' || text === '—') ? null : text;
    if (!display) {
      el.textContent = 'Awaiting sync…';
      setHeroLiveChip(false, false);
      return;
    }
    el.textContent = 'Last synced: ' + display;
    setHeroLiveChip(true, false);
  }

  function renderOpeningHero() {
    if (!document.getElementById('opening-dashboard')) return;
    var dateEl = document.getElementById('openingHeroDate');
    var slateEl = document.getElementById('openingHeroSlate');
    if (dateEl) dateEl.textContent = formatOpeningHeroDate(new Date());
    var games = (global.LIVE_DATA && LIVE_DATA.matchups) || [];
    var loaded = global.LIVE_DATA && LIVE_DATA.loaded;
    if (slateEl) {
      if (!loaded && !games.length) {
        slateEl.textContent = 'Loading slate…';
      } else {
        slateEl.textContent = slateCountLabel(games.length);
      }
    }
    var synced = false;
    if (global.LIVE_DATA && LIVE_DATA.lastUpdated) {
      var ts = LIVE_DATA.lastUpdated;
      var d = new Date(String(ts).trim());
      if (!isNaN(d.getTime())) {
        synced = true;
        setOpeningHeroSync(
          d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' +
          d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
        );
      } else if (ts && ts !== '—' && ts !== '--') {
        synced = true;
        setOpeningHeroSync(ts);
      }
    }
    if (!synced) {
      var syncEl = document.getElementById('openingHeroSynced');
      if (syncEl && !loaded) syncEl.textContent = 'Awaiting sync…';
      else if (syncEl && loaded) {
        syncEl.textContent = 'Last synced: just now';
        setHeroLiveChip(true, false);
      } else setHeroLiveChip(false, loaded);
    }
  }

  function fetchTomorrowMatchups(forceRefresh) {
    if (!forceRefresh && global.LIVE_DATA && LIVE_DATA.tomorrowMatchups && LIVE_DATA.tomorrowMatchups.length) {
      return Promise.resolve(LIVE_DATA.tomorrowMatchups);
    }
    var now = new Date();
    var tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    var tomorrowStr = tomorrow.getFullYear() + '-'
      + String(tomorrow.getMonth() + 1).padStart(2, '0') + '-'
      + String(tomorrow.getDate()).padStart(2, '0');
    var url = 'https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=' + tomorrowStr + '&hydrate=probablePitcher,team,venue';
    return fetch(url).then(function(r) { return r.json(); }).then(function(data) {
      var games = [];
      (data.dates || []).forEach(function(d) {
        (d.games || []).forEach(function(g) {
          var away = g.teams && g.teams.away && g.teams.away.team;
          var home = g.teams && g.teams.home && g.teams.home.team;
          if (!away || !home) return;
          var awaySp = g.teams.away.probablePitcher || {};
          var homeSp = g.teams.home.probablePitcher || {};
          games.push({
            time: g.gameDate ? new Date(g.gameDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '',
            away: teamKey(away.abbreviation || away.teamName),
            home: teamKey(home.abbreviation || home.teamName),
            stadium: (g.venue && g.venue.name) || '',
            awaySP: awaySp.fullName || 'TBD',
            awaySPId: awaySp.id || null,
            awayHand: (awaySp.pitchHand && awaySp.pitchHand.code) || 'R',
            homeSP: homeSp.fullName || 'TBD',
            homeSPId: homeSp.id || null,
            homeHand: (homeSp.pitchHand && homeSp.pitchHand.code) || 'R',
            isTomorrow: true
          });
        });
      });
      global.LIVE_DATA = global.LIVE_DATA || {};
      global.LIVE_DATA.tomorrowMatchups = games;
      return games;
    }).catch(function(err) {
      console.warn('[PD] tomorrow schedule fetch failed', err);
      return [];
    });
  }

  function renderTomorrowCard(m, cardIdx) {
    var logo = A ? A.teamLogoImg.bind(A) : function() { return ''; };
    var awayPs = spPitchScoreFromProfile(m.awaySP, m.away);
    var homePs = spPitchScoreFromProfile(m.homeSP, m.home);
    return '<article class="hero-matchup-card hero-matchup-card--tomorrow" data-away="' + esc(m.away) + '" data-home="' + esc(m.home) + '">'
      + '<div class="hmc-row hmc-teams">'
      + '<div class="hmc-team">' + teamLinkHtml(m.away, logo, '') + '</div>'
      + '<span class="hmc-at">@</span>'
      + '<div class="hmc-team">' + teamLinkHtml(m.home, logo, '') + '</div>'
      + '<span class="hmc-meta">' + esc(m.time) + (m.stadium ? ' \u00B7 ' + esc(m.stadium) : '') + '</span>'
      + '</div>'
      + '<div class="hmc-row hmc-pitchers">'
      + spRow('Away SP', m.awaySP, m.awayHand, m.away, { k: null, bb: null, fip: awayPs }, { eager: cardIdx < 3, pitchScore: awayPs, mlbId: m.awaySPId })
      + spRow('Home SP', m.homeSP, m.homeHand, m.home, { k: null, bb: null, fip: homePs }, { eager: cardIdx < 3, pitchScore: homePs, mlbId: m.homeSPId })
      + '</div>'
      + '<p class="hmc-lineup-placeholder" style="font-size:12px;color:#9CA3AF;margin:8px 0">Lineups TBD</p>'
      + '<p class="hmc-tomorrow-note">Projected lineups and full analysis available day-of</p>'
      + '</article>';
  }

  function renderHeroMatchups() {
    bindDayTabs();
    var grid = document.getElementById('matchupsHeroGrid');
    if (!grid) {
      console.warn('[PD] matchupsHeroGrid not found');
      return;
    }
    if (!document.documentElement.classList.contains('view-matchups')) return;
    var matchupsSection = document.getElementById('section-matchups-hero');
    if (!matchupsSection || matchupsSection.closest('#opening-dashboard')) return;
    grid.innerHTML = '';
    renderOpeningHero();

    if (MATCH_DAY === 'tomorrow') {
      var renderTomorrow = function(games) {
        if (!games.length) {
          grid.innerHTML = '<div class="empty-msg">No games scheduled for tomorrow.</div>';
          return;
        }
        grid.innerHTML = games.map(function(m, i) { return renderTomorrowCard(m, i); }).join('');
      };
      var loadTomorrow = function() {
        return fetchTomorrowMatchups(true).then(renderTomorrow);
      };
      if (window.PlatformDashboard && PlatformDashboard.initRegistry) {
        PlatformDashboard.initRegistry().then(loadTomorrow);
      } else {
        loadTomorrow();
      }
      return;
    }

    var games = LIVE_DATA.matchups || [];
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
        + '<div class="hmc-osi-sparklines" aria-hidden="true">'
        + '<span class="hmc-spark">' + teamOsiSparkline(m.away, m.homeHand) + '</span>'
        + '<span class="hmc-spark">' + teamOsiSparkline(m.home, m.awayHand) + '</span>'
        + '</div>'
        + '<div class="hmc-badges">'
        + '<span class="script-badge ' + script.cls + '">' + esc(script.label) + '</span>'
        + '<span class="f5-badge ' + f5.cls + '">' + esc(f5.label) + '</span>'
        + '</div>'
        + lineupHtml
        + '<a class="hmc-view-full" href="' + compareUrl(m.away, m.home) + '" onclick="event.stopPropagation()">View Full Analysis →</a>'
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

  function bindDayTabs() {
    if (!document.querySelectorAll('.matchup-day-tab').length) return;
    document.querySelectorAll('.matchup-day-tab').forEach(function(btn) {
      if (btn.dataset.dayBound) return;
      btn.dataset.dayBound = '1';
      btn.addEventListener('click', function() {
        MATCH_DAY = btn.getAttribute('data-day') || 'today';
        document.querySelectorAll('.matchup-day-tab').forEach(function(b) {
          b.classList.toggle('active', b.getAttribute('data-day') === MATCH_DAY);
        });
        var controls = document.querySelector('.matchups-slate-controls');
        if (controls) controls.style.display = MATCH_DAY === 'today' ? '' : 'none';
        renderHeroMatchups();
      });
    });
  }

  function bindHeroControls() {
    bindDayTabs();
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
    if (!document.getElementById('matchupsHeroGrid')) return;
    if (global.MLBMACharts && MLBMACharts.renderOnLiveDataReady) {
      MLBMACharts.renderOnLiveDataReady(renderSignalChips, 'signal chips');
    } else {
      renderSignalChips();
    }
    bindHeroControls();
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
      if (document.querySelectorAll('.matchup-day-tab').length) bindDayTabs();
    });
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

  function prefetchTomorrow() {
    if (global.LIVE_DATA && global.LIVE_DATA.loaded) fetchTomorrowMatchups();
  }

  global.PlatformDashboard = {
    renderDashboard: renderDashboard,
    renderOpeningHero: renderOpeningHero,
    renderHeroMatchups: renderHeroMatchups,
    renderSignalChips: renderSignalChips,
    setOpeningHeroSync: setOpeningHeroSync,
    initRegistry: initRegistry,
    bindHeroControls: bindHeroControls,
    prefetchTomorrow: prefetchTomorrow,
    fetchTomorrowMatchups: fetchTomorrowMatchups
  };
})(typeof window !== 'undefined' ? window : this);
