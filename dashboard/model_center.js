/**
 * Model Center client. All published producer boards load through the public,
 * read-only /api/model-center/board proxy.
 */
(function (global) {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function qs() {
    try { return new URLSearchParams(location.search || ''); }
    catch (e) { return new URLSearchParams(); }
  }

  function setContext(text) {
    var el = $('mcContext');
    if (el) el.textContent = text;
  }

  function paintGate(title, body) {
    var host = $('mcBoard');
    if (!host) return;
    host.innerHTML = '<div class="ca-card ca-card-pad"><h2>' + esc(title) + '</h2><p>' + esc(body) + '</p></div>';
  }

  /* ---------------------------------------------------------------------
   * Board rendering (2026-09-09). Implements the Model Center reference
   * renderings: a model-versus-market slate board, and a game detail view
   * when ?game= names one.
   *
   * Every value here comes from the public /api/model-center/board payload.
   * A field the board did not publish renders as "Not published", never as 0
   * or a guess. The one arithmetic presentation is projected total = away +
   * home when both scores exist. Edge is read from the payload and is never
   * recomputed client-side (chase-board/1).
   * ------------------------------------------------------------------ */

  function num(v) {
    if (v == null || v === '') return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function signed(v, digits) {
    var n = num(v);
    if (n == null) return null;
    return (n > 0 ? '+' : '') + n.toFixed(digits == null ? 1 : digits);
  }

  function fixed(v, digits) {
    var n = num(v);
    return n == null ? null : n.toFixed(digits == null ? 1 : digits);
  }

  /* Official crest plus abbreviation, matching the public matchup cards.
     mlbma_assets.js selects the legible logo variant for the dark ground and
     provides an initials fallback if both CDN requests fail. The abbreviation
     remains visible beside the crest, so team identity never depends on the
     image alone. */
  function chip(sport, abbr, fullName, suppliedLogo, suppliedColor) {
    var code = String(abbr || '').toUpperCase();
    var tint = '';
    var crest = '';
    if (suppliedColor && /^#[0-9a-f]{6}$/i.test(String(suppliedColor))) {
      tint = ' style="--club:' + esc(suppliedColor) + '"';
    } else if (code && global.MLBMAAssets && MLBMAAssets.teamBarColor) {
      var hex = MLBMAAssets.teamBarColor(code, sport);
      if (hex) tint = ' style="--club:' + esc(hex) + '"';
    }
    if (suppliedLogo && /^https:\/\//i.test(String(suppliedLogo))) {
      crest = '<img class="mc-chip__crest" src="' + esc(suppliedLogo) +
        '" width="28" height="28" alt="' + esc(code) + '" loading="lazy" decoding="async">';
    } else if (code && global.MLBMAAssets && MLBMAAssets.teamLogoImg) {
      crest = MLBMAAssets.teamLogoImg(code, 28, 'mc-chip__crest', sport);
    }
    return '<span class="mc-chip"' + tint +
      (fullName ? ' title="' + esc(fullName) + '"' : '') + '>' +
      crest + '<span class="mc-chip__code">' + esc(code || '--') + '</span></span>';
  }

  /* One axis places both marks and both tick labels, and the domain is fixed
     per sport so every card on the board shares a scale and can be compared.
     MLB is run margin, NFL is point margin. */
  function domainFor(sport) {
    sport = String(sport).toLowerCase();
    if (sport === 'cfb') return 20;
    if (sport === 'nfl' || sport === 'wnba') return 10;
    return 3;
  }

  /* The scale under the track, drawn as a scale.
     Three numbers at the ends and the middle tell a reader the domain but not
     where a mark sits inside it - a pin two thirds along is read as "somewhere
     past zero". Ticks at quarter intervals turn the track into something a
     value can be read off, which is the entire point of plotting it rather
     than printing it. */
  function axis(half) {
    // Ticks on round numbers of the unit being measured - runs for MLB, points
    // for NFL - rather than on fractions of the track. A baseball axis reading
    // "-0.8" describes nothing anybody scores; one reading "-1" does.
    // Five or seven labels, not thirteen. A crowded axis stops being a scale
    // and becomes a grey band of digits under the track - the reader counts
    // ticks instead of reading the mark that sits on them.
    var step = half >= 10 ? 5 : (half >= 5 ? 2 : 1);
    var steps = [];
    for (var v = -half; v <= half + 0.001; v += step) steps.push(Math.round(v * 100) / 100);
    var marks = steps.map(function (value) {
      var left = ((value / half + 1) / 2) * 100;
      var zero = Math.abs(value) < 0.001;
      var text = zero ? '0' : (value > 0 ? '+' : '') +
        (Math.abs(value % 1) > 0.001 ? value.toFixed(1) : String(value));
      return '<span class="mc-gauge__tick' + (zero ? ' is-zero' : '') +
        '" style="left:' + left.toFixed(2) + '%"><i></i><b>' + esc(text) + '</b></span>';
    }).join('');
    return '<div class="mc-gauge__axis">' + marks + '</div>';
  }

  function gauge(sport, modelVal, marketVal) {
    var m = num(modelVal), k = num(marketVal);
    if (m == null && k == null) {
      return '<p class="mc-withheld">Model and market lines are not published for this game.</p>';
    }
    var half = domainFor(sport);
    var clamp = function (v) { return Math.max(-half, Math.min(half, v)); };
    var pct = function (v) { return ((clamp(v) + half) / (2 * half)) * 100; };
    // Labels sit directly above their own mark, so the number and the position
    // on the axis read as one object. A label is roughly a fifth of the track
    // wide, so when the two marks are closer than that the labels would print
    // over each other ("MODMARKET"); below the threshold they fall back to
    // opposite ends of the track, which still reads correctly.
    // A legend is about 52px wide against a ~300px track, so two of them need
    // roughly 18% of the track between their centres to clear each other. The
    // threshold was 30, which on a three-run axis sent almost every card's
    // labels to opposite ends - furthest from the marks they name.
    var LABEL_CLEARANCE = 20;
    var apart = (m != null && k != null) ? Math.abs(pct(m) - pct(k)) : 100;
    var label = function (cls, name, v, side) {
      var align;
      if (side) {
        align = side === 'left' ? 'left:0;transform:none' : 'right:0;transform:none';
      } else {
        var x = pct(v);
        align = x < 15 ? 'left:0;transform:none'
          : (x > 85 ? 'right:0;transform:none'
            : 'left:' + x.toFixed(2) + '%;transform:translateX(-50%)');
      }
      return '<div class="mc-gauge__leg ' + cls + '" style="' + align + '">' +
        '<span>' + name + '</span><strong>' + esc(signed(v)) + '</strong></div>';
    };
    var crowded = apart < LABEL_CLEARANCE;
    var parts = '<div class="mc-gauge">';
    parts += '<div class="mc-gauge__legend">' +
      (m != null ? label('is-model', 'Model', m, crowded ? 'left' : null) : '') +
      (k != null ? label('is-market', 'Market', k, crowded ? 'right' : null) : '') + '</div>';
    parts += '<div class="mc-gauge__track">' +
      '<div class="mc-gauge__zero" style="left:' + pct(0).toFixed(2) + '%"></div>';
    if (m != null && k != null) {
      var lo = Math.min(pct(m), pct(k)), hi = Math.max(pct(m), pct(k));
      parts += '<div class="mc-gauge__span" style="left:' + lo.toFixed(2) +
        '%;width:' + (hi - lo).toFixed(2) + '%"></div>';
    }
    if (k != null) parts += '<div class="mc-gauge__pin mc-gauge__pin--market" style="left:' + pct(k).toFixed(2) + '%"></div>';
    if (m != null) parts += '<div class="mc-gauge__pin" style="left:' + pct(m).toFixed(2) + '%"></div>';
    parts += '</div>';
    parts += axis(half);
    return parts + '</div>';
  }

  function readRow(g) {
    var lean = g.lean || g.model_lean || '';
    var withheld = g.edge_withheld_reason;
    // ChaseBoard.mapGame fills edge_withheld_reason with the literal string
    // "not published" whenever a board carries no edge_points. That is the
    // normal case, not a notice worth its own line, so only a real reason
    // is surfaced.
    if (withheld && String(withheld).toLowerCase() === 'not published') withheld = '';
    var vals = '';
    var mm = signed(g.model_margin), km = signed(g.market_margin);
    if (mm) vals += '<span>Model ' + esc(mm) + '</span>';
    if (km) vals += '<span>Market ' + esc(km) + '</span>';
    return '<div class="mc-game__read">' +
      '<div><span class="mc-game__lean">' + esc(lean || 'No lean published') + '</span>' +
      (withheld ? '<span class="mc-withheld mc-game__note">' + esc(withheld) + '</span>' : '') +
      '</div>' +
      (vals ? '<div class="mc-game__values">' + vals + '</div>' : '') + '</div>';
  }

  function projectedScore(g) {
    var away = fixed(g.away_projected, 1);
    var home = fixed(g.home_projected, 1);
    var published = away != null && home != null;
    var label = published
      ? ('Projected score: ' + (g.away || 'Away') + ' ' + away + ', ' +
        (g.home || 'Home') + ' ' + home)
      : 'Projected score not published';
    return '<section class="mc-score' + (published ? '' : ' is-withheld') +
      '" aria-label="' + esc(label) + '">' +
      '<span class="mc-score__label">Projected score</span>' +
      (published
        ? '<div class="mc-score__match"><span><b>' + esc(g.away || 'Away') +
          '</b><strong>' + esc(away) + '</strong></span><i aria-hidden="true">–</i>' +
          '<span><b>' + esc(g.home || 'Home') + '</b><strong>' + esc(home) + '</strong></span></div>'
        : '<strong class="mc-score__pending">Not published</strong>') +
      '</section>';
  }

  function projectedTotal(g) {
    var total = num(g.total_projected);
    var away = num(g.away_projected), home = num(g.home_projected);
    if (total == null && away != null && home != null) total = away + home;
    return total;
  }

  function totalRead(g) {
    var model = projectedTotal(g), market = num(g.market_total);
    if (model == null) {
      return '<section class="mc-total is-withheld"><span class="mc-total__label">Total lean</span>' +
        '<strong>Not published</strong></section>';
    }
    if (market == null) {
      return '<section class="mc-total is-withheld"><span class="mc-total__label">Projected total</span>' +
        '<strong>' + esc(model.toFixed(1)) + '</strong>' +
        '<span class="mc-total__detail">Market total not published · no lean available</span></section>';
    }
    var delta = model - market;
    var direction = Math.abs(delta) < 0.05 ? 'At market' : (delta > 0 ? 'Over' : 'Under');
    var cls = delta > 0.05 ? ' is-over' : (delta < -0.05 ? ' is-under' : ' is-even');
    return '<section class="mc-total' + cls + '" aria-label="Total lean: ' + esc(direction) +
      '. Model ' + esc(model.toFixed(1)) + ', market ' + esc(market.toFixed(1)) + '">' +
      '<span class="mc-total__label">Total lean</span><strong>' + esc(direction) + '</strong>' +
      '<span class="mc-total__detail">Model ' + esc(model.toFixed(1)) + ' · Market ' +
      esc(market.toFixed(1)) + ' · ' + esc(signed(delta)) + '</span></section>';
  }

  function kickoffLabel(g) {
    var raw = g.kickoff_display || g.time || '';
    if (!/^\d{4}-\d{2}-\d{2}T/.test(String(raw))) return raw;
    var date = new Date(raw);
    if (isNaN(date.getTime())) return raw;
    return date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    }) + ' ET';
  }

  function gameCard(sport, g) {
    var kick = kickoffLabel(g);
    return '<article class="mc-game">' +
      '<header class="mc-game__head"><div class="mc-teams">' +
      chip(sport, g.away, g.away_name, g.away_logo, g.away_color) +
      chip(sport, g.home, g.home_name, g.home_logo, g.home_color) + '</div>' +
      (kick ? '<span class="mc-game__time">' + esc(kick) + '</span>' : '') +
      '</header>' +
      '<div class="mc-game__visuals">' + projectedScore(g) +
      '<section class="mc-line"><span class="mc-line__label">Model vs market</span>' +
      gauge(sport, g.model_margin, g.market_margin) + '</section></div>' +
      totalRead(g) +
      readRow(g) +
      '</article>';
  }

  function tile(label, value) {
    return '<div class="mc-tile"><span>' + esc(label) + '</span><strong>' +
      esc(value == null ? 'Not published' : value) + '</strong></div>';
  }

  function detailView(sport, rawBoard, g) {
    var html = '<section class="mc-panel"><p class="mc-eyebrow">' +
      esc(sport.toUpperCase()) + ' · Game detail</p><div class="mc-hero">' +
      '<div class="mc-hero__side">' + chip(sport, g.away, g.away_name, g.away_logo, g.away_color) +
      '<span class="mc-hero__name">' + esc(g.away_name || g.away || '') + '</span>' +
      (g.away_record ? '<span class="mc-hero__sub">' + esc(g.away_record) + '</span>' : '') + '</div>';

    var aScore = fixed(g.away_projected, 1), hScore = fixed(g.home_projected, 1);
    html += '<div class="mc-hero__center"><div class="mc-hero__score">' +
      (aScore != null && hScore != null ? esc(aScore) + ' - ' + esc(hScore) : 'Not published') +
      '</div><div class="mc-hero__label">Projected score</div></div>';

    html += '<div class="mc-hero__side">' + chip(sport, g.home, g.home_name, g.home_logo, g.home_color) +
      '<span class="mc-hero__name">' + esc(g.home_name || g.home || '') + '</span>' +
      (g.home_record ? '<span class="mc-hero__sub">' + esc(g.home_record) + '</span>' : '') +
      '</div></div></section>';

    html += '<section class="mc-panel"><h2 class="mc-panel__title">Model versus market</h2>' +
      gauge(sport, g.model_margin, g.market_margin) + totalRead(g) + readRow(g) + '</section>';

    var totalLabel = sport === 'mlb' ? 'Total runs' : 'Total points';
    html += '<section class="mc-panel"><h2 class="mc-panel__title">Key projections</h2>' +
      '<div class="mc-tiles">' +
      tile((g.away || 'Away') + ' projected', aScore) +
      tile((g.home || 'Home') + ' projected', hScore) +
      tile(totalLabel, fixed(projectedTotal(g), 1)) +
      tile('Market total', fixed(g.market_total, 1)) +
      tile('Win probability', g.win_probability == null ? null :
        Math.round(Number(g.win_probability) * (Number(g.win_probability) <= 1 ? 100 : 1)) + '%') +
      '</div></section>';

    return html;
  }

  /* An NFL week is not a flat list. It is Thursday, then four or five Sunday
     windows, then Sunday night and Monday night - and a reader looks for a
     window before they look for a game. A single grid of sixteen cards throws
     that structure away and makes them read every kickoff time to rebuild it.

     The slot label comes from the kickoff itself, so a flexed game moves
     between windows on its own and nothing here has to be told. */
  function slotOf(g) {
    var raw = g.kickoff_utc || g.kickoff || g.start_time || g.kickoff_display;
    var d = raw ? new Date(raw) : null;
    if (!d || isNaN(d.getTime())) return g.kickoff_display || 'Kickoff not published';
    var opts = { timeZone: 'America/New_York' };
    var day = d.toLocaleDateString('en-US', Object.assign({ weekday: 'long' }, opts));
    var hour = Number(d.toLocaleString('en-US', Object.assign({ hour: 'numeric', hour12: false }, opts)));
    if (day === 'Sunday' && hour >= 19) return 'Sunday Night';
    if (day === 'Monday' && hour >= 17) return 'Monday Night';
    if (day === 'Thursday') return 'Thursday Night';
    if (day !== 'Sunday') return day;
    var time = d.toLocaleTimeString('en-US',
      Object.assign({ hour: 'numeric', minute: '2-digit' }, opts));
    return 'Sunday ' + time;
  }

  function kickoffMs(g) {
    var raw = g.kickoff_utc || g.kickoff || g.start_time;
    var t = raw ? Date.parse(raw) : NaN;
    return isNaN(t) ? Infinity : t;
  }

  function groupedGrid(sport, games) {
    var order = [];
    var bySlot = {};
    var earliest = {};
    games.forEach(function (g) {
      var slot = slotOf(g);
      if (!bySlot[slot]) { bySlot[slot] = []; order.push(slot); }
      bySlot[slot].push(g);
      var t = kickoffMs(g);
      if (!(slot in earliest) || t < earliest[slot]) earliest[slot] = t;
    });
    // Windows read in the order they are played. Grouping alone left a 4:25
    // window above a 4:05 one whenever the board happened to list them that
    // way, which is exactly the structure the grouping exists to show.
    order.sort(function (a, b) { return earliest[a] - earliest[b]; });
    if (order.length < 2) {
      return '<div class="mc-grid">' +
        games.map(function (g) { return gameCard(sport, g); }).join('') + '</div>';
    }
    return order.map(function (slot) {
      var rows = bySlot[slot];
      // A standalone window holds one game, so its card takes the full width
      // rather than sitting in a third of a row with two empty thirds beside it.
      var cls = rows.length === 1 ? 'mc-grid mc-grid--single' : 'mc-grid';
      return '<section class="mc-slot"><h3 class="mc-slot__title">' + esc(slot) + '</h3>' +
        '<div class="' + cls + '">' +
        rows.map(function (g) { return gameCard(sport, g); }).join('') + '</div></section>';
    }).join('');
  }

  function renderBoard(sport, payload, options) {
    var host = $('mcBoard');
    if (!host) return;
    var board = payload && payload.board;
    // normalize(sport, board, extra) takes the sport FIRST. This used to call
    // normalize(board), which put the payload in the sport slot and left the
    // board undefined, so games came back [] and every entitled session saw
    // "No priced games" no matter what the API returned.
    var mapped = global.ChaseBoard && ChaseBoard.normalize
      ? ChaseBoard.normalize(sport, board)
      : board;
    var games = (mapped && mapped.games) || (board && board.games) || [];
    var sports = '<nav class="mc-sports" aria-label="Model Center sports">' +
      [['mlb', 'MLB'], ['nfl', 'NFL'], ['wnba', 'WNBA'], ['cfb', 'CFB']].map(function (pair) {
        return '<a href="?sport=' + pair[0] + '"' +
          (pair[0] === sport ? ' aria-current="page"' : '') + '>' + pair[1] + '</a>';
      }).join('') + '</nav>';
    var want = qs().get('game');
    if (want) {
      var one = games.filter(function (g) {
        return String(g.id || g.game_id || '') === want;
      })[0];
      if (!one) {
        paintGate('Game not on this board',
          'The requested game is not in the currently published Model Center rows.');
        return;
      }
      host.innerHTML = '<div class="mc-board">' + detailView(sport, board, one) + '</div>';
      return;
    }
    if (!games.length) {
      host.innerHTML = sports + '<div class="mc-board"><header class="mc-board__head">' +
        '<div><p class="mc-board__eyebrow">' + esc(sport.toUpperCase()) + ' projections</p>' +
        '<h2 class="mc-board__title">Today\'s Slate</h2></div>' +
        '<div class="mc-board__status"><strong>0/0</strong><span>scores published</span></div>' +
        '</header><div class="ca-card ca-card-pad"><h2>No games today</h2>' +
        '<p>The producer is current, but this sport has no games on its published board today.</p>' +
        '</div></div>';
      return;
    }
    var weekly = sport === 'nfl' || sport === 'cfb';
    var title = weekly ? 'The Week' : "Today's Slate";
    var body = weekly ? groupedGrid(sport, games)
      : '<div class="mc-grid">' + games.map(function (g) {
          return gameCard(sport, g);
        }).join('') + '</div>';
    var projected = games.filter(function (g) {
      return num(g.away_projected) != null && num(g.home_projected) != null;
    }).length;
    var html = sports + '<div class="mc-board"><header class="mc-board__head">' +
      '<div><p class="mc-board__eyebrow">' + esc(sport.toUpperCase()) + ' projections</p>' +
      '<h2 class="mc-board__title">' + esc(title) + '</h2></div>' +
      '<div class="mc-board__status"><strong>' + projected + '/' + games.length + '</strong>' +
      '<span>scores published</span></div></header>' +
      body + '</div>';
    host.innerHTML = html;
  }

  function loadBoard(sport) {
    return fetch('/api/model-center/board?sport=' + encodeURIComponent(sport), {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    }).then(function (r) {
      if (r.status === 503 || r.status === 404) {
        paintGate('Board unavailable', 'This sport’s model feed is not attached to the current environment.');
        return;
      }
      if (!r.ok) {
        paintGate('Unavailable', 'Model Center could not load this sport’s published board.');
        return;
      }
      return r.json().then(function (payload) { renderBoard(sport, payload); });
    }).catch(function () {
      paintGate('Unavailable', 'Model Center could not reach the board service.');
    });
  }

  function boot() {
    var sport = (qs().get('sport') || 'mlb').toLowerCase();
    if (['mlb', 'nfl', 'wnba', 'cfb'].indexOf(sport) < 0) sport = 'mlb';
    var game = qs().get('game');
    setContext(game
      ? ('Requested ' + sport.toUpperCase() + ' game ' + game + '.')
      : ('Loading the latest published ' + sport.toUpperCase() + ' board.'));
    paintGate('Loading board', 'Fetching the latest published projections.');
    loadBoard(sport);
  }

  global.ChaseModelCenter = { renderBoard: renderBoard };

  // The fixture harness under dashboard/mockups/ sets this so it can drive
  // renderBoard directly without starting a network request.
  if (global.CHASE_MC_NO_BOOT) return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
