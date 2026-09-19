/**
 * ChaseCFBBoard — CFB matchup cards + matchup analysis, built entirely from the
 * shared Chase design-system components (.ca-card, .ca-nfl-channels channel
 * tiles, .chip metric values, .ca-entity, .ca-gap-axis, .ca-evidence). It only
 * re-distributes the college-football model information the generic board card
 * drops; it introduces no new visual styling. The producer honesty contract is
 * preserved: unpublished market/edge render as neutral em-dash chips with a
 * reason, and `action` is shown as a research label, never a bet call.
 */
(function (global) {
  'use strict';

  var B = global.ChaseBoard;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function fmt(v, dp) { return isNum(v) ? v.toFixed(dp == null ? 1 : dp) : null; }
  function signedAbs(v, dp) { return isNum(v) ? Math.abs(v).toFixed(dp == null ? 1 : dp) : null; }

  // Existing .chip vocabulary (theme.css): c-elite/c-good/c-mid/c-weak/c-poor/c-na.
  function chip(display, cls) {
    return '<span class="chip' + (cls ? ' ' + cls : '') + '">' + esc(display) + '</span>';
  }
  function naChip(reason) {
    return '<span class="chip c-na" title="' + esc(reason || 'unavailable') + '">—</span>';
  }

  // Confidence → chip grade (green = high model confidence). A favoured team is
  // never "poor", so the ramp stops at c-mid rather than reaching red.
  function confClass(pFav) {
    if (!isNum(pFav)) return 'c-na';
    if (pFav >= 0.72) return 'c-elite';
    if (pFav >= 0.62) return 'c-good';
    return 'c-mid';
  }

  function favored(g) {
    var m = isNum(g.published_margin) ? g.published_margin
      : (isNum(g.model_margin) ? g.model_margin : null);
    if (!isNum(m) || m === 0) return { side: null, margin: m };
    return m > 0
      ? { side: 'home', abbr: (g.home_team && g.home_team.abbr) || 'HOME', margin: Math.abs(m) }
      : { side: 'away', abbr: (g.away_team && g.away_team.abbr) || 'AWAY', margin: Math.abs(m) };
  }

  function entity(team, sport) {
    team = team || {};
    if (global.ChaseEntity && ChaseEntity.html) {
      return ChaseEntity.html({ name: team.school || team.abbr, id: team.abbr, sport: sport, image: team.logo });
    }
    return '<span class="ca-entity"><span class="ca-entity-name">' + esc(team.abbr || team.school || '—') + '</span></span>';
  }

  function channel(label, valueHtml) {
    return '<div class="ca-nfl-channel"><h3>' + esc(label) + '</h3><p>' + valueHtml + '</p></div>';
  }

  function headlineChannels(g) {
    var fav = favored(g);
    var wpHome = g.win_probability;
    var pFav = isNum(wpHome) ? Math.max(wpHome, 1 - wpHome) : null;
    var grade = confClass(pFav);
    var awayAbbr = esc((g.away_team && g.away_team.abbr) || 'AWY');
    var homeAbbr = esc((g.home_team && g.home_team.abbr) || 'HOM');

    // Projected score
    var scoreVal;
    if (isNum(g.projected_away_score) && isNum(g.projected_home_score)) {
      scoreVal = awayAbbr + ' ' + chip(fmt(g.projected_away_score, 1)) +
        ' <span class="cfb-vs">–</span> ' + chip(fmt(g.projected_home_score, 1)) + ' ' + homeAbbr;
    } else {
      scoreVal = naChip('projected score not published');
    }

    // Model margin (favoured-relative)
    var marginVal = fav.side
      ? esc(fav.abbr) + ' by ' + chip(signedAbs(fav.margin, 1), grade)
      : naChip('margin not published');

    // Win probability (favoured team)
    var wpVal = (fav.side && isNum(pFav))
      ? esc(fav.abbr) + ' ' + chip(Math.round(pFav * 100) + '%', grade)
      : naChip('win probability not published');

    var out = '<div class="ca-nfl-channels">';
    out += channel('Proj. score', scoreVal);
    out += channel('Model margin', marginVal);
    out += channel('Win prob', wpVal);
    out += channel('Proj. total', isNum(g.projected_total) ? chip(fmt(g.projected_total, 1)) : naChip('total not published'));
    out += channel('Market margin', isNum(g.market_margin) ? chip((g.market_margin > 0 ? '+' : '') + fmt(g.market_margin, 1)) : naChip(g.edge_withheld_reason || 'market not published'));
    out += channel('Market total', isNum(g.market_total) ? chip(fmt(g.market_total, 1)) : naChip('market total not published'));
    out += '</div>';
    return out;
  }

  function analysisChannels(g) {
    function textOrNa(v, reason) { return v ? esc(String(v).replace(/_/g, ' ')) : naChip(reason); }
    function signedChip(v, reason) { return isNum(v) ? chip((v > 0 ? '+' : '') + fmt(v, 1)) : naChip(reason); }
    function pctChip(v, reason) { return isNum(v) ? chip(Math.round(v * 100) + '%') : naChip(reason); }

    var out = '<div class="ca-nfl-channels">';
    out += channel('Model regime', textOrNa(g.model_regime, 'regime not published'));
    out += channel('Forecast source', textOrNa(g.forecast_source, 'source not published'));
    out += channel('Ratings margin', signedChip(g.raw_model_margin, 'not published'));
    out += channel('Preseason margin', signedChip(g.preseason_margin, 'not published'));
    out += channel('Efficiency margin', signedChip(g.efficiency_margin, 'efficiency not weighted this week'));
    out += channel('Efficiency reliability', pctChip(g.efficiency_reliability, 'not published'));
    out += channel('Independent total', isNum(g.independent_total) ? chip(fmt(g.independent_total, 1)) : naChip('not published'));
    out += channel('Total basis', textOrNa(g.total_basis, 'basis not published'));
    out += channel('Total model weight', pctChip(g.total_model_weight, 'not published'));
    out += channel('Validated regime', g.in_validated_regime === true ? chip('yes') : (g.in_validated_regime === false ? chip('no') : naChip('unknown')));
    out += channel('Edge points', signedChip(g.edge_points, g.edge_withheld_reason || 'edge withheld'));
    out += '</div>';
    return out;
  }

  function metaLine(g) {
    var bits = [];
    bits.push(esc(g.kickoff_display || g.kickoff_utc || 'kickoff unknown'));
    if (g.neutral) bits.push('Neutral site');
    if (g.same_conference) bits.push(esc(g.same_conference));
    if (g.action) bits.push(esc(String(g.action).replace(/_/g, ' ')));
    return '<p class="ca-helper">' + bits.join(' · ') + '</p>';
  }

  function cardHtml(g, sport, authority) {
    sport = sport || 'cfb';
    var gapAxis = (B && B.marginAxisHtml) ? B.marginAxisHtml(g, sport) : '';
    var evidence = g.evidence || (authority && authority.evidence) || '';
    var evHtml = '<p class="ca-helper">' + (evidence ? esc(evidence) : 'Producer evidence is empty.') + '</p>';

    return '' +
      '<article class="ca-card cfb-card" data-game="' + esc(g.id) + '"' +
        ' data-conf-away="' + esc((g.away_team && g.away_team.conference) || '') + '"' +
        ' data-conf-home="' + esc((g.home_team && g.home_team.conference) || '') + '">' +
      '<h2>' + entity(g.away_team, sport) + ' <span class="cfb-at">@</span> ' + entity(g.home_team, sport) + '</h2>' +
      metaLine(g) +
      headlineChannels(g) +
      (gapAxis || '') +
      '<details class="ca-evidence">' +
        '<summary>Matchup analysis</summary>' +
        analysisChannels(g) +
        '<p class="ca-helper">Projected scoreline comes from the scoring/total model; the headline margin is the ' +
          'opponent-adjusted ratings model. They are separate views and need not agree.</p>' +
        evHtml +
      '</details>' +
      '</article>';
  }

  function conferences(games) {
    var set = {};
    games.forEach(function (g) {
      var away = g.away_team && g.away_team.conference;
      var home = g.home_team && g.home_team.conference;
      if (away) set[away] = (set[away] || 0) + 1;
      if (home && home !== away) set[home] = (set[home] || 0) + 1;
    });
    return Object.keys(set).sort().map(function (c) { return { name: c, count: set[c] }; });
  }

  function contextLine(nb) {
    var m = nb.meta || {};
    var bits = [];
    if (m.season != null && m.week != null) bits.push('Season ' + esc(m.season) + ' · Week ' + esc(m.week));
    bits.push(nb.games.length + ' games');
    var wk = m.total_model_weights && m.total_model_weights.by_week && m.week != null
      ? m.total_model_weights.by_week[String(m.week)] : null;
    if (isNum(wk)) bits.push('Total model weight this week ' + Math.round(wk * 100) + '%');
    if (m.regime && m.regime.in_validated_regime === false && m.regime.first_validated_week != null) {
      bits.push('Pre-validation (validated regime starts week ' + esc(m.regime.first_validated_week) + ')');
    }
    return '<p class="ca-helper">' + bits.join(' · ') + '</p>';
  }

  function filterBar(confs) {
    if (!confs.length) return '';
    var html = '<div class="ca-pill-bar cfb-filter" role="group" aria-label="Filter by conference">';
    html += '<span class="ca-pill-label">Conference</span>';
    html += '<button type="button" class="hub-pill active" data-conf="all">All</button>';
    confs.forEach(function (c) {
      html += '<button type="button" class="hub-pill" data-conf="' + esc(c.name) + '">' +
        esc(c.name) + ' (' + c.count + ')</button>';
    });
    html += '</div>';
    return html;
  }

  function wireFilter(root) {
    var bar = root.querySelector('.cfb-filter');
    if (!bar) return;
    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('.hub-pill');
      if (!btn) return;
      var conf = btn.getAttribute('data-conf');
      bar.querySelectorAll('.hub-pill').forEach(function (b) { b.classList.toggle('active', b === btn); });
      root.querySelectorAll('.cfb-card').forEach(function (card) {
        var show = conf === 'all' ||
          card.getAttribute('data-conf-away') === conf ||
          card.getAttribute('data-conf-home') === conf;
        card.hidden = !show;
      });
      var visible = root.querySelectorAll('.cfb-card:not([hidden])').length;
      var count = root.querySelector('.cfb-visible-count');
      if (count) count.textContent = visible + (visible === 1 ? ' game' : ' games');
    });
  }

  function renderSlate(container, nb, build) {
    if (!container) return;
    nb = nb || {};
    var games = nb.games || [];
    if (!games.length) {
      if (global.ChaseAsyncState) ChaseAsyncState.render(container, 'empty');
      else container.innerHTML = '<p class="ca-async">No games in board.json.</p>';
      return;
    }
    var authority = nb.authority || {};
    var confs = conferences(games);
    var priced = games.filter(function (g) { return g.priced; }).length;

    var html = '';
    html += contextLine(nb);
    html += '<p class="ca-helper">Priced markets: ' + priced + ' of ' + games.length +
      ' — model projections only, not Picks. Market margin/total publish when the odds feed clears the honesty gates.</p>';
    html += filterBar(confs);
    html += '<p class="ca-helper cfb-visible-count">' + games.length + ' games</p>';
    html += '<div class="cfb-grid">';
    games.forEach(function (g) { html += cardHtml(g, nb.sport || 'cfb', authority); });
    html += '</div>';

    container.innerHTML = html;
    if (global.ChaseAsyncState && ChaseAsyncState.ready) ChaseAsyncState.ready(container);
    container.className = (container.className || '').replace(/\bca-async(--\w+)?\b/g, '').trim();
    wireFilter(container);
  }

  global.ChaseCFBBoard = {
    renderSlate: renderSlate,
    cardHtml: cardHtml,
    _favored: favored,
    _confClass: confClass
  };
})(typeof window !== 'undefined' ? window : this);
