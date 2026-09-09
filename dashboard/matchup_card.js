/**
 * Public MatchupCard — MLB/NFL desk cards (L5).
 * Live MLB comes from Stats API. NFL uses the public slate. No model fields.
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function params() {
    try { return new URLSearchParams(window.location.search || ''); }
    catch (e) { return new URLSearchParams(); }
  }

  function easternDateIso(d) {
    var src = d || new Date();
    return src.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  }

  function shiftIso(iso, days) {
    var p = String(iso || '').split('-').map(Number);
    var dt = new Date(Date.UTC(p[0], (p[1] || 1) - 1, p[2] || 1));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  }

  function formatLongDate(iso) {
    var p = String(iso || '').split('-').map(Number);
    if (p.length < 3) return iso || '';
    var dt = new Date(Date.UTC(p[0], p[1] - 1, p[2], 16));
    return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  function formatEtClock(iso) {
    var d = new Date(iso || '');
    if (!iso || isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York'
    }) + ' ET';
  }

  function kickoffLabel(g) {
    if (g.kickoff_display) return g.kickoff_display;
    return formatEtClock(g.kickoff_utc) || 'Time TBD';
  }

  function fullMatchupUrl(sport, g) {
    if (sport === 'mlb') {
      return '/dashboard/matchup_compare.html?away=' + encodeURIComponent(g.away || '') +
        '&home=' + encodeURIComponent(g.home || '') + '&game=' + encodeURIComponent(g.id || '');
    }
    return '/' + sport + '/matchups.html?game=' + encodeURIComponent(g.id || '');
  }

  function modelCenterUrl(sport, g) {
    return '/model-center/?sport=' + encodeURIComponent(sport) + '&game=' + encodeURIComponent(g.id || '');
  }

  function logoHtml(sport, abbr) {
    if (global.MLBMAAssets && MLBMAAssets.teamLogoImg) {
      return MLBMAAssets.teamLogoImg(abbr, 56, 'ca-matchup-logo', sport);
    }
    return '<span class="ca-entity-fallback">' + esc(String(abbr || '').slice(0, 3)) + '</span>';
  }

  function headshot(id) {
    if (global.MLBMAAssets && MLBMAAssets.headshotUrl) {
      var src = MLBMAAssets.headshotUrl(id, 40, 'matchup');
      return '<img class="ca-matchup-card__shot" src="' + src + '" width="40" height="40" alt="" loading="lazy">';
    }
    return '<span class="ca-matchup-card__shot ca-matchup-card__shot--empty" aria-hidden="true"></span>';
  }

  function lineupTone(g) {
    var raw = String(g.away_lineup_state || g.home_lineup_state || '').toLowerCase();
    if (raw.indexOf('confirm') >= 0) return { cls: 'is-ok', label: 'Lineups confirmed' };
    if (raw.indexOf('project') >= 0) return { cls: 'is-muted', label: 'Lineups projected' };
    return { cls: 'is-muted', label: 'Lineups unpublished' };
  }

  function bullpenTone(g) {
    var raw = String(g.availability_summary || '').trim();
    if (!raw) return { cls: 'is-muted', label: 'Bullpen unpublished' };
    var low = raw.toLowerCase();
    if (low.indexOf('rest') >= 0 || low.indexOf('available') >= 0) return { cls: 'is-ok', label: raw };
    if (low.indexOf('limit') >= 0 || low.indexOf('mix') >= 0) return { cls: 'is-watch', label: raw };
    return { cls: 'is-muted', label: raw };
  }

  function handLabel(hand) {
    var h = String(hand || '').toUpperCase();
    if (h === 'R' || h === 'RHP') return 'RHP';
    if (h === 'L' || h === 'LHP') return 'LHP';
    if (h === 'S' || h === 'SHP') return 'SHP';
    return '';
  }

  function starterMeta(g, side) {
    var hand = handLabel(side === 'away' ? g.away_hand : g.home_hand);
    var era = side === 'away' ? g.away_era : g.home_era;
    var bits = [];
    if (hand) bits.push(hand);
    if (era != null && era !== '') bits.push(Number(era).toFixed(2) + ' ERA');
    return bits.join(' · ');
  }

  function weatherLine(g) {
    if (g.conditions) return g.conditions;
    var bits = [];
    if (g.weather_temp) bits.push(g.weather_temp + '°');
    if (g.weather_cond) bits.push(g.weather_cond);
    if (g.weather_wind) bits.push(g.weather_wind);
    return bits.join(', ');
  }

  function venueLine(g) {
    if (g.venue && g.venue_city) return g.venue + ', ' + g.venue_city;
    return g.venue || 'Venue unpublished';
  }

  function teamBlock(sport, g, side) {
    var abbr = side === 'away' ? g.away : g.home;
    var name = side === 'away' ? (g.away_name || g.away) : (g.home_name || g.home);
    var rec = side === 'away' ? g.away_record : g.home_record;
    var home = side === 'home';
    return '<div class="ca-matchup-card__club' + (home ? ' ca-matchup-card__club--home' : '') + '">' +
      logoHtml(sport, abbr) +
      '<div class="ca-matchup-card__club-copy">' +
      '<span class="ca-matchup-card__abbr">' + esc(abbr) + '</span>' +
      '<span class="ca-matchup-card__name">' + esc(name) + '</span>' +
      (rec ? '<span class="ca-matchup-card__record">' + esc(rec) + '</span>' : '') +
      '</div></div>';
  }

  function starterBlock(g, side) {
    var name = side === 'away' ? (g.away_starter || 'Starter TBD') : (g.home_starter || 'Starter TBD');
    var id = side === 'away' ? g.away_starter_id : g.home_starter_id;
    var meta = starterMeta(g, side);
    return '<div class="ca-matchup-card__sp">' +
      headshot(id) +
      '<div><span class="ca-matchup-card__sp-name">' + esc(name) + '</span>' +
      (meta ? '<span class="ca-matchup-card__sp-meta">' + esc(meta) + '</span>' : '') +
      '</div></div>';
  }

  function fact(kind, text, tone) {
    return '<div class="ca-matchup-card__fact">' +
      '<span class="ca-matchup-card__fact-k">' + esc(kind) + '</span>' +
      '<span class="ca-matchup-card__fact-v ' + (tone || '') + '">' + esc(text || 'Unpublished') + '</span>' +
      '</div>';
  }

  function cardHtml(sport, g) {
    var href = fullMatchupUrl(sport, g);
    var line = lineupTone(g);
    var bull = bullpenTone(g);
    var wx = weatherLine(g);
    var kick = kickoffLabel(g);
    var live = g.game_state === 'live' || g.game_state === 'final';
    var timeBit = live && g.away_score != null && g.home_score != null
      ? (esc(g.away_score) + '–' + esc(g.home_score) + ' · ' + esc(g.game_state === 'final' ? 'Final' : 'Live'))
      : esc(kick);
    var updated = g.updated_display || formatEtClock(g.kickoff_utc) || '';
    var spLab = sport === 'nfl' ? 'QB' : 'SP';
    return '<article class="ca-matchup-card" data-game="' + esc(g.id) + '" data-sport="' + esc(sport) + '" data-href="' + esc(href) + '">' +
      '<div class="ca-matchup-card__head">' +
      '<span class="ca-matchup-card__kick">' + timeBit +
      (g.broadcast ? ' <span class="ca-matchup-card__pipe">|</span> ' + esc(g.broadcast) : '') + '</span>' +
      '<span class="ca-status-chip ' + line.cls + '">' + esc(line.label) + '</span></div>' +
      '<div class="ca-matchup-card__teams">' +
      teamBlock(sport, g, 'away') +
      '<div class="ca-matchup-card__center" aria-hidden="true">at</div>' +
      teamBlock(sport, g, 'home') +
      '</div>' +
      '<div class="ca-matchup-card__starters" aria-label="' + spLab + 's">' +
      starterBlock(g, 'away') + starterBlock(g, 'home') +
      '</div>' +
      '<div class="ca-matchup-card__facts">' +
      fact('Venue', venueLine(g)) +
      fact('Weather', wx || 'Conditions unpublished', wx && /watch|delay|rain/i.test(wx) ? 'is-watch' : '') +
      fact('Bullpen', bull.label, bull.cls) +
      fact('Lineups', line.label, line.cls) +
      '</div>' +
      '<div class="ca-matchup-card__foot">' +
      '<span class="ca-matchup-card__updated">' + (updated ? 'Updated ' + esc(updated) : '') + '</span>' +
      '<a class="ca-text-link ca-text-link--accent" href="' + esc(href) + '">View matchup →</a>' +
      '</div></article>';
  }

  function asyncPaint(host, kind, detail) {
    if (global.ChaseAsyncState) ChaseAsyncState.render(host, kind, detail);
  }

  function applyFilters(host, games) {
    var filter = (host.__desk && host.__desk.filter) || 'all';
    return games.filter(function (g) {
      if (filter === 'lineups') {
        return String(g.away_lineup_state || g.home_lineup_state || '').toLowerCase().indexOf('confirm') >= 0;
      }
      if (filter === 'night') {
        var d = new Date(g.kickoff_utc || '');
        if (isNaN(d.getTime())) return true;
        var h = Number(d.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }));
        return h >= 17;
      }
      return true;
    });
  }

  function deskChrome(host, sport, games) {
    var desk = host.__desk || {};
    var dateIso = desk.dateIso || easternDateIso();
    var view = desk.view || 'grid';
    var filter = desk.filter || 'all';
    var live = sport === 'mlb' && desk.live;
    var html = '<div class="ca-desk-toolbar">';
    if (live) {
      html += '<div class="ca-desk-dates">' +
        '<button type="button" class="ca-desk-dates__btn" data-date-shift="-1">Previous day</button>' +
        '<span class="ca-desk-dates__now">' + esc(formatLongDate(dateIso)) + '</span>' +
        '<button type="button" class="ca-desk-dates__btn" data-date-shift="1">Next day</button></div>';
    }
    html += '<div class="ca-desk-filters">' +
      '<button type="button" class="ca-desk-chip' + (filter === 'all' ? ' is-on' : '') + '" data-filter="all">All games</button>' +
      '<button type="button" class="ca-desk-chip' + (filter === 'lineups' ? ' is-on' : '') + '" data-filter="lineups">Lineups confirmed</button>' +
      '<button type="button" class="ca-desk-chip' + (filter === 'night' ? ' is-on' : '') + '" data-filter="night">Night games</button>' +
      '</div>' +
      '<div class="ca-desk-view" role="group" aria-label="Layout">' +
      '<button type="button" class="ca-desk-chip' + (view === 'grid' ? ' is-on' : '') + '" data-view="grid">Grid</button>' +
      '<button type="button" class="ca-desk-chip' + (view === 'list' ? ' is-on' : '') + '" data-view="list">List</button>' +
      '</div></div>';
    html += '<p class="ca-desk-count">' + games.length + ' games available</p>';
    return html;
  }

  function render(host, sport, games) {
    if (!host) return;
    host.__desk = host.__desk || {};
    host.__desk.sport = sport;
    host.__desk.games = games;
    var shown = applyFilters(host, games);
    var view = host.__desk.view || 'grid';
    var html = deskChrome(host, sport, shown);
    html += '<div class="ca-slate-grid' + (view === 'list' ? ' ca-slate-grid--list' : '') + '">';
    shown.forEach(function (g) { html += cardHtml(sport, g); });
    html += '</div>';
    if (!shown.length) {
      html += '<p class="ca-helper">No games match this filter.</p>';
    }
    host.innerHTML = html;
    bind(host);
  }

  function bind(host) {
    if (host.getAttribute('data-card-bound') === '1') return;
    host.setAttribute('data-card-bound', '1');
    host.addEventListener('click', function (e) {
      var shift = e.target.closest('[data-date-shift]');
      if (shift) {
        var n = Number(shift.getAttribute('data-date-shift') || 0);
        var iso = host.__desk.dateIso || easternDateIso();
        mountLiveMlb({ host: host, dateIso: shiftIso(iso, n) });
        return;
      }
      var filt = e.target.closest('[data-filter]');
      if (filt) {
        host.__desk.filter = filt.getAttribute('data-filter');
        render(host, host.__desk.sport, host.__desk.games);
        return;
      }
      var view = e.target.closest('[data-view]');
      if (view) {
        host.__desk.view = view.getAttribute('data-view');
        render(host, host.__desk.sport, host.__desk.games);
        return;
      }
      if (e.target.closest('a')) return;
      var card = e.target.closest('.ca-matchup-card[data-href]');
      if (card && card.getAttribute('data-href')) {
        window.location.href = card.getAttribute('data-href');
      }
    });
  }

  function mlbState(game) {
    var abs = String((game.status && game.status.abstractGameState) || '').toLowerCase();
    if (abs === 'final') return 'final';
    if (abs === 'live') return 'live';
    var det = String((game.status && game.status.detailedState) || '').toLowerCase();
    if (det.indexOf('postpon') >= 0) return 'postponed';
    if (det.indexOf('delay') >= 0) return 'delayed';
    return 'scheduled';
  }

  function broadcasts(game) {
    var names = [];
    (game.broadcasts || []).forEach(function (b) {
      var n = b && (b.name || b.callSign);
      var t = String((b && b.type) || '').toUpperCase();
      if (!n) return;
      if (t && t !== 'TV') return;
      if (names.indexOf(n) < 0) names.push(n);
    });
    return names.slice(0, 3).join(', ');
  }

  function mapLiveMlbGame(game) {
    var awayNode = game.teams && game.teams.away;
    var homeNode = game.teams && game.teams.home;
    var awayTeam = awayNode && awayNode.team;
    var homeTeam = homeNode && homeNode.team;
    if (!awayTeam || !homeTeam) return null;
    var away = String(awayTeam.abbreviation || awayTeam.teamName || awayTeam.name || '').trim();
    var home = String(homeTeam.abbreviation || homeTeam.teamName || homeTeam.name || '').trim();
    if (!away || !home) return null;
    var awayProb = (awayNode && awayNode.probablePitcher) || {};
    var homeProb = (homeNode && homeNode.probablePitcher) || {};
    var gn = game.gameNumber || 1;
    var id = String(game.gamePk || (away + '@' + home + (gn > 1 ? '#' + gn : '')));
    var rec = function (node) {
      if (!node || node.leagueRecord == null) return '';
      var lr = node.leagueRecord;
      if (lr.wins == null || lr.losses == null) return '';
      return lr.wins + '-' + lr.losses;
    };
    var loc = (game.venue && game.venue.location) || {};
    var city = [loc.city, loc.stateAbbrev].filter(Boolean).join(', ');
    var wx = game.weather || {};
    var wxBits = [];
    if (wx.temp) wxBits.push(wx.temp + '°');
    if (wx.condition) wxBits.push(wx.condition);
    if (wx.wind) wxBits.push('Wind ' + wx.wind);
    var hasLineups = !!(game.lineups && ((game.lineups.awayPlayers && game.lineups.awayPlayers.length) ||
      (game.lineups.homePlayers && game.lineups.homePlayers.length)));
    var awayHand = awayProb.pitchHand && awayProb.pitchHand.code;
    var homeHand = homeProb.pitchHand && homeProb.pitchHand.code;
    return {
      id: id,
      sport: 'mlb',
      game_state: mlbState(game),
      kickoff_utc: game.gameDate || null,
      away: away,
      home: home,
      away_name: awayTeam.name || awayTeam.teamName || away,
      home_name: homeTeam.name || homeTeam.teamName || home,
      away_record: rec(awayNode),
      home_record: rec(homeNode),
      away_score: awayNode && awayNode.score != null ? awayNode.score : null,
      home_score: homeNode && homeNode.score != null ? homeNode.score : null,
      venue: (game.venue && game.venue.name) || '',
      venue_city: city,
      broadcast: broadcasts(game),
      conditions: wxBits.join(', '),
      weather_temp: wx.temp || '',
      weather_cond: wx.condition || '',
      weather_wind: wx.wind || '',
      away_starter: awayProb.fullName || 'Starter TBD',
      home_starter: homeProb.fullName || 'Starter TBD',
      away_starter_id: awayProb.id || null,
      home_starter_id: homeProb.id || null,
      away_hand: awayHand || '',
      home_hand: homeHand || '',
      away_era: awayProb.era || '',
      home_era: homeProb.era || '',
      away_lineup_state: hasLineups ? 'Confirmed' : 'Projected',
      home_lineup_state: hasLineups ? 'Confirmed' : 'Projected',
      availability_summary: '',
      updated_display: formatEtClock(new Date().toISOString())
    };
  }

  function mountLiveMlb(opts) {
    opts = opts || {};
    var host = opts.host;
    if (!host) return;
    var dateStr = opts.dateIso || easternDateIso();
    host.__desk = host.__desk || {};
    host.__desk.live = true;
    host.__desk.dateIso = dateStr;
    var url = 'https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=' + encodeURIComponent(dateStr)
      + '&hydrate=probablePitcher,team,venue,weather,broadcasts,lineups';
    asyncPaint(host, 'loading');
    fetch(url, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
      if (!data) {
        asyncPaint(host, 'error', 'MLB schedule was not reachable.');
        return;
      }
      var games = [];
      (data.dates || []).forEach(function (block) {
        (block.games || []).forEach(function (game) {
          var row = mapLiveMlbGame(game);
          if (row) games.push(row);
        });
      });
      if (global.ChaseDataStatus) {
        ChaseDataStatus.bindResume(document.getElementById('dataStatus'), function () {
          return {
            sport: 'mlb',
            state: games.length ? 'ok' : 'empty',
            publishedAt: dateStr,
            dataCutoff: dateStr,
            source: 'mlb-stats-api',
            issues: []
          };
        });
      }
      if (!games.length) {
        asyncPaint(host, 'empty', 'No MLB games on this date.');
        return;
      }
      render(host, 'mlb', games);
      if (global.ChaseAsyncState) ChaseAsyncState.ready(host);
    }).catch(function (err) {
      asyncPaint(host, 'error', err.message);
    });
  }

  function mountSlate(opts) {
    opts = opts || {};
    var sport = opts.sport;
    var host = opts.host;
    var adapter = opts.adapter;
    var url = adapter && adapter.SLATE_URL;
    if (!url) {
      asyncPaint(host, 'error', 'Public slate URL missing.');
      return;
    }
    asyncPaint(host, 'loading');
    fetch(url, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (slate) {
      if (!slate) {
        asyncPaint(host, 'error', 'Public slate was not reachable.');
        return;
      }
      if (!global.ChasePublicSlate) {
        asyncPaint(host, 'error', 'Public slate adapter missing.');
        return;
      }
      var nb = ChasePublicSlate.normalize(sport, slate);
      if (global.ChaseDataStatus) {
        ChaseDataStatus.bindResume(document.getElementById('dataStatus'), function () {
          return {
            sport: sport,
            state: 'ok',
            publishedAt: nb.generated_at,
            dataCutoff: nb.data_through,
            source: 'public-slate',
            issues: []
          };
        });
      }
      if (!nb.games.length) {
        asyncPaint(host, 'empty', 'No public games on this slate.');
        return;
      }
      host.__desk = host.__desk || {};
      host.__desk.live = false;
      render(host, sport, nb.games);
      if (global.ChaseAsyncState) ChaseAsyncState.ready(host);
    }).catch(function (err) {
      asyncPaint(host, 'error', err.message);
    });
  }

  global.ChaseMatchupCard = {
    mountSlate: mountSlate,
    mountLiveMlb: mountLiveMlb,
    fullMatchupUrl: fullMatchupUrl,
    modelCenterUrl: modelCenterUrl
  };
})(typeof window !== 'undefined' ? window : this);
