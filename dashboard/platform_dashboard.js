// v20260525a
/**
 * MLBMA Platform Dashboard — landing matchup hub, signal teaser.
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;
  var S = global.MLBMASharedMatchup || global.MatchupShared;
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

  function weatherText(w) {
    if (!w) return '';
    if (typeof w === 'string') return w;
    return w.cond || w.conditions || w.weather || '';
  }

  function weatherHtml(m) {
    var gk = m.away + '@' + m.home;
    var w = (global.LIVE_DATA && LIVE_DATA.weather || {})[gk] || m.weather;
    if (!w) return '';
    if (S && S.formatWeatherMetaHtml) return S.formatWeatherMetaHtml(w, m.home);
    if (typeof w === 'string') {
      var su = w.toUpperCase();
      if (su.indexOf('DOME') >= 0 || su.indexOf('ROOF') >= 0) return '<span class="hmc-weather-chip hmc-weather-chip--dome">Dome</span>';
      return '<span class="hmc-weather-chip">' + esc(w) + '</span>';
    }
    if (w.dome) return '<span class="hmc-weather-chip hmc-weather-chip--dome">Dome</span>';
    var bits = [];
    if (w.temp != null) bits.push(w.temp + '°');
    if (w.wind != null) bits.push(w.wind + ' mph' + (w.windDir ? ' ' + w.windDir : ''));
    var cond = w.cond || w.conditions || w.weather || w.raw || '';
    if (cond && String(cond).toUpperCase().indexOf('DOME') >= 0) return '<span class="hmc-weather-chip hmc-weather-chip--dome">Dome</span>';
    if (cond) bits.push(cond);
    if (!bits.length) return '';
    return '<span class="hmc-weather-chip">' + esc(bits.join(' · ')) + '</span>';
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
    if (m.time) parts.push('<span class="hmc-time">' + esc(m.time) + '</span>');
    if (m.stadium) parts.push('<span class="hmc-stadium">' + esc(m.stadium) + '</span>');
    var wh = weatherHtml(m);
    if (wh) parts.push(wh);
    if (!parts.length) return '<div class="hmc-meta"><span class="hmc-time">TBD</span></div>';
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

  /** League-anchored red→green gradient (mlbma_assets.metricColor), not flat pink tokens. */
  function pitcherStatColor(metric, value) {
    var muted = 'var(--text-3, #9CA3AF)';
    if (value == null || value === '' || isNaN(value)) return muted;
    if (!A || !A.metricColor) return muted;
    var v = Number(value);
    var ctx = 'default';
    if (metric === 'pitchScore') {
      ctx = 'pitching';
    } else if (metric === 'k') {
      if (v > 0 && v <= 1) v *= 100;
      ctx = 'kpct';
    } else if (metric === 'bb') {
      if (v > 0 && v <= 1) v *= 100;
      ctx = 'bbpct';
    } else if (metric === 'era') {
      ctx = 'era';
    } else if (metric === 'fip') {
      ctx = 'fip';
    } else {
      return muted;
    }
    return A.metricColor(v, ctx);
  }

  function pitcherTierStyle(score) {
    if (score == null || isNaN(score) || !A || !A.metricColor) return '';
    var c = A.metricColor(Number(score), 'pitching');
    return ' style="background:color-mix(in srgb, ' + c + ' 22%, transparent);'
      + 'color:' + c + ';'
      + 'border:1px solid color-mix(in srgb, ' + c + ' 42%, transparent);'
      + 'box-shadow:0 0 14px color-mix(in srgb, ' + c + ' 28%, transparent)"';
  }

  function spPitchScoreFromProfile(pitcherName, team) {
    var profiles = (global.LIVE_DATA && LIVE_DATA.spProfiles) || [];
    if (!profiles.length || !S || !S.findSpProfile) return null;
    var p = S.findSpProfile(profiles, pitcherName, team);
    if (!p || !S.spProfileMetrics) return null;
    var m = S.spProfileMetrics(p);
    return m && m.pitchScore != null ? m.pitchScore : null;
  }

  function spEraFromProfile(pitcherName, team) {
    var profiles = (global.LIVE_DATA && LIVE_DATA.spProfiles) || [];
    if (!profiles.length || !S || !S.findSpProfile) return null;
    var p = S.findSpProfile(profiles, pitcherName, team);
    if (!p) return null;
    if (S.spProfileMetrics) {
      var m = S.spProfileMetrics(p);
      if (m && m.era != null && !isNaN(m.era)) return m.era;
    }
    if (S.numOrNull && S.pickCol) {
      return S.numOrNull(S.pickCol(p, 'ERA', 'era'));
    }
    return null;
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
    var psColor = pitcherStatColor('pitchScore', ps);
    var pname = name && String(name).trim() && String(name).toUpperCase() !== 'TBD' ? name : 'TBD';
    var nameHtml = pname === 'TBD'
      ? '<span class="mc-sp-name-text">TBD</span>'
      : '<a href="' + pitcherProfileUrl(pname) + '" class="pitcher-link mc-sp-name-text" onclick="event.stopPropagation()">' + esc(pname) + '</a>';
    stats = stats || {};
    var handLbl = normalizePitchHand(hand) === 'L' ? 'LHP' : normalizePitchHand(hand) === 'R' ? 'RHP' : '?';
    var kVal = fmtRatePct(stats.k);
    var bbVal = fmtRatePct(stats.bb);
    var eraRaw = stats.era != null ? stats.era : spEraFromProfile(name, team);
    if (eraRaw == null) eraRaw = stats.fip;
    var kColor = pitcherStatColor('k', stats.k);
    var bbColor = pitcherStatColor('bb', stats.bb);
    var eraColor = pitcherStatColor('era', eraRaw);
    var eraVal = eraRaw != null ? Number(eraRaw).toFixed(2) : '—';
    return '<div class="mc-sp-block" onclick="event.stopPropagation()">'
      + '<div class="mc-sp-photo">' + hs + '</div>'
      + '<div class="mc-sp-info">'
      + '<div class="mc-sp-top">'
      + '<span class="mc-sp-side">' + esc(label.replace(' SP', '')) + '</span>'
      + '<span class="hand-pill hand-' + normalizePitchHand(hand).toLowerCase() + '">' + esc(handLbl) + '</span>'
      + '<span class="pitch-tier ' + pt.cls + '"' + pitcherTierStyle(ps) + '>' + pt.label + '</span>'
      + '</div>'
      + '<div class="mc-sp-name-row">' + nameHtml + '</div>'
      + (ps != null
        ? '<div class="mc-ps-badge mc-ps-badge--defined">'
          + '<span class="mc-ps-badge__label">Pitch Score</span>'
          + '<strong class="mc-ps-badge__val" style="color:' + psColor + '">' + Number(ps).toFixed(0) + '</strong>'
          + '</div>'
        : '')
      + '<div class="mc-sp-stats mc-sp-stats--grid">'
      + '<span class="mc-sp-stat mc-sp-stat--k" style="--stat-color:' + kColor + '"><em>K%</em><strong style="color:' + kColor + '">' + esc(kVal) + '</strong></span>'
      + '<span class="mc-sp-stat mc-sp-stat--bb" style="--stat-color:' + bbColor + '"><em>BB%</em><strong style="color:' + bbColor + '">' + esc(bbVal) + '</strong></span>'
      + '<span class="mc-sp-stat mc-sp-stat--era" style="--stat-color:' + eraColor + '"><em>ERA</em><strong style="color:' + eraColor + '">' + esc(eraVal) + '</strong></span>'
      + '</div></div></div>';
  }

  function parseGameTimeSortKey(timeStr) {
    var s = String(timeStr || '').trim().toUpperCase();
    if (!s || s === 'TBD') return 9999;
    var m = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/);
    if (!m) return 5000 + s.charCodeAt(0);
    var h = parseInt(m[1], 10);
    var min = parseInt(m[2], 10);
    var ap = m[3];
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return h * 60 + min;
  }

  function sortGames(games) {
    var list = games.slice();
    list.sort(function(a, b) {
      return parseGameTimeSortKey(a.time) - parseGameTimeSortKey(b.time);
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
      + '<div class="hmc-meta">'
      + '<span class="hmc-time">' + esc(m.time || 'TBD') + '</span>'
      + (m.stadium ? '<span class="hmc-stadium">' + esc(m.stadium) + '</span>' : '')
      + '</div>'
      + '</div>'
      + '<div class="hmc-row hmc-pitchers">'
      + spRow('Away SP', m.awaySP, m.awayHand, m.away, { k: null, bb: null, era: null }, { eager: cardIdx < 3, pitchScore: awayPs, mlbId: m.awaySPId })
      + spRow('Home SP', m.homeSP, m.homeHand, m.home, { k: null, bb: null, era: null }, { eager: cardIdx < 3, pitchScore: homePs, mlbId: m.homeSPId })
      + '</div>'
      + '<p class="hmc-lineup-placeholder" style="font-size:12px;color:#9CA3AF;margin:8px 0">Lineups TBD</p>'
      + '<p class="hmc-tomorrow-note">Projected lineups and full analysis available day-of</p>'
      + '</article>';
  }

  function renderHeroMatchupCard(m, cardIdx, opts) {
    opts = opts || {};
    cardIdx = cardIdx == null ? 0 : cardIdx;
    var awayOSI = m.awayOSI != null ? m.awayOSI : 0;
    var homeOSI = m.homeOSI != null ? m.homeOSI : 0;
    var total = awayOSI + homeOSI || 1;
    var awayPct = Math.max(10, (awayOSI / total) * 100);
    var fav = awayOSI >= homeOSI ? m.away : m.home;
    var handLabel = m.homeHand === 'L' ? 'LHP' : m.homeHand === 'R' ? 'RHP' : 'SP';
    var awayHandLabel = m.awayHand === 'L' ? 'LHP' : m.awayHand === 'R' ? 'RHP' : 'SP';
    var awayEdgeCls = fav === m.away ? ' edge-team' : '';
    var homeEdgeCls = fav === m.home ? ' edge-team' : '';
    var logo = A ? A.teamLogoImg.bind(A) : function() { return ''; };
    var lineupHtml = opts.lineupHtml != null ? opts.lineupHtml
      : (typeof global.buildMatchupLineupBlock === 'function'
        ? global.buildMatchupLineupBlock(m, { expanded: true, hideToggle: true }) : '');
    var extraCls = opts.extraClass ? ' ' + opts.extraClass : '';
    return '<article class="hero-matchup-card' + extraCls + '" data-away="' + esc(m.away) + '" data-home="' + esc(m.home) + '" role="link" tabindex="0">'
      + '<div class="hmc-row hmc-teams">'
      + '<div class="hmc-team">' + teamLinkHtml(m.away, logo, '') + '</div>'
      + '<span class="hmc-at">@</span>'
      + '<div class="hmc-team">' + teamLinkHtml(m.home, logo, '') + '</div>'
      + gameMetaHtml(m)
      + '</div>'
      + '<div class="hmc-row hmc-pitchers">'
      + spRow('Away SP', m.awaySP, m.awayHand, m.away, { k: m.awayK, bb: m.awayBB, era: m.awayERA, fip: m.awayFIP }, { eager: cardIdx < 3 || !!opts.eagerAvatars })
      + spRow('Home SP', m.homeSP, m.homeHand, m.home, { k: m.homeK, bb: m.homeBB, era: m.homeERA, fip: m.homeFIP }, { eager: cardIdx < 3 || !!opts.eagerAvatars })
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
      + lineupHtml
      + '<a class="hmc-view-full" href="' + compareUrl(m.away, m.home) + '" onclick="event.stopPropagation()">View Full Analysis →</a>'
      + '</article>';
  }

  function bindHeroMatchupCard(card) {
    if (!card || card.dataset.navBound) return;
    card.dataset.navBound = '1';
    card.addEventListener('click', function(e) {
      if (e.target.closest('a, button, .hmc-lineup-toggle')) return;
      var away = card.getAttribute('data-away');
      var home = card.getAttribute('data-home');
      if (away && home) global.location.href = compareUrl(away, home);
    });
    card.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        var away = card.getAttribute('data-away');
        var home = card.getAttribute('data-home');
        if (away && home) global.location.href = compareUrl(away, home);
      }
    });
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

    var live = global.LIVE_DATA || {};
    var games = live.matchups || [];
    if (!games.length) {
      var stillLoading = !live.loaded && !live.error;
      grid.innerHTML = stillLoading
        ? '<div class="empty-msg">Loading today\u2019s matchups\u2026</div>'
        : '<div class="empty-msg">No matchups loaded for today.</div>';
      return;
    }
    var sorted = sortGames(games);

    grid.innerHTML = sorted.map(function(m, cardIdx) {
      return renderHeroMatchupCard(m, cardIdx);
    }).join('').replace(/<\/?motion>/g, '');

    bindCardNavigation();
    grid.querySelectorAll('.hero-matchup-card').forEach(bindHeroMatchupCard);
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
    var base = 'matchup_compare.html';
    var away = s.away, home = s.home;
    if ((!away || !home) && s.gameKey && s.gameKey.indexOf('@') >= 0) {
      var parts = s.gameKey.split('@');
      away = away || parts[0];
      home = home || parts[1];
    }
    if (away && home) {
      return base + '?away=' + encodeURIComponent(away) + '&home=' + encodeURIComponent(home);
    }
    return base;
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
      var games = (global.LIVE_DATA && global.LIVE_DATA.matchups) || [];
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
            href: modelReportHref({ gameKey: bestLineup.game })
          });
        }
      }
      if (rows.length) {
        var buy = rows.filter(function(d) { return d.ppGap >= 4; }).sort(function(a, b) { return b.ppGap - a.ppGap; })[0];
        if (buy && chips.length < 3) {
          chips.push({ label: 'Buy-Low Offense', val: buy.t, conf: 'Medium', href: 'matchup_compare.html' });
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
    bindDayTabs();
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
      if (document.querySelectorAll('.matchup-day-tab').length) bindDayTabs();
    });
  }

  function bindHeroControls() {
    /* Opening Dashboard only — safe no-op on profile pages that bundle platform_dashboard.js */
  }

  function initRegistry() {
    if (!A) return Promise.resolve();
    if (A.registry && A.registry.loaded) return Promise.resolve();
    if (global.LIVE_DATA && global.LIVE_DATA.playerRegistry && global.LIVE_DATA.playerRegistry.length && A.parseRegistryRows) {
      A.parseRegistryRows(typeof parseRegistrySheet === 'function' ? parseRegistrySheet(global.LIVE_DATA.playerRegistry) : global.LIVE_DATA.playerRegistry);
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
    renderHeroMatchupCard: renderHeroMatchupCard,
    bindHeroMatchupCard: bindHeroMatchupCard,
    compareUrl: compareUrl,
    renderSignalChips: renderSignalChips,
    setOpeningHeroSync: setOpeningHeroSync,
    initRegistry: initRegistry,
    bindHeroControls: bindHeroControls,
    prefetchTomorrow: prefetchTomorrow,
    fetchTomorrowMatchups: fetchTomorrowMatchups
  };
})(typeof window !== 'undefined' ? window : this);
