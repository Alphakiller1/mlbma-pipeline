/**
 * ChaseCFBBoard — CFB-specific matchup cards + matchup analysis.
 *
 * Consumes the enriched ChaseSportCFB.normalize() output. It surfaces the
 * college-football model outputs the generic board card drops — team identity,
 * projected scoreline, win probability, projected total, and the model's own
 * reasoning (regime, efficiency provenance, total basis) — while keeping the
 * producer's honesty contract intact: market/edge fields show an em-dash with a
 * reason when unpublished, and `action` is a research label, never a bet call.
 */
(function (global) {
  'use strict';

  var B = global.ChaseBoard;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function fmt(v, dp) {
    if (!isNum(v)) return null;
    return v.toFixed(dp == null ? 1 : dp);
  }

  function signed(v, dp) {
    if (!isNum(v)) return null;
    var s = v.toFixed(dp == null ? 1 : dp);
    return (v > 0 ? '+' : '') + s;
  }

  // Absent value → em-dash carrying the reason (never a blank that reads as data).
  function dash(reason) {
    return '<span class="ca-metric-absent" title="' + esc(reason || 'unavailable') + '">—</span>';
  }

  function metric(value, reason) {
    return value == null ? dash(reason) : '<span class="cfb-metric-value">' + esc(value) + '</span>';
  }

  function entity(team, sport) {
    team = team || {};
    if (global.ChaseEntity && ChaseEntity.html) {
      return ChaseEntity.html({ name: team.school || team.abbr, id: team.abbr, sport: sport, image: team.logo });
    }
    return '<span class="ca-entity"><span class="ca-entity-name">' + esc(team.abbr || team.school || '—') + '</span></span>';
  }

  function confChip(conf) {
    if (!conf) return '';
    return '<span class="cfb-conf">' + esc(conf) + '</span>';
  }

  // Confidence colour tracks the favoured team's win probability (green = high
  // model confidence), reusing the shared metric ramp tokens.
  function probClass(pFav) {
    if (!isNum(pFav)) return 'cfb-prob--na';
    if (pFav >= 0.75) return 'cfb-prob--elite';
    if (pFav >= 0.65) return 'cfb-prob--strong';
    if (pFav >= 0.57) return 'cfb-prob--above';
    return 'cfb-prob--toss';
  }

  function favored(g) {
    var m = isNum(g.published_margin) ? g.published_margin
      : (isNum(g.model_margin) ? g.model_margin : null);
    if (!isNum(m) || m === 0) return { side: null, margin: m };
    return m > 0
      ? { side: 'home', abbr: g.home_team && g.home_team.abbr, margin: Math.abs(m) }
      : { side: 'away', abbr: g.away_team && g.away_team.abbr, margin: Math.abs(m) };
  }

  function winProbMeter(g) {
    var wpHome = g.win_probability;               // P(home)
    if (!isNum(wpHome)) {
      return '<div class="cfb-wp cfb-wp--na"><p class="cfb-wp__na">' + dash('win probability not published') +
        ' win probability</p></div>';
    }
    var wpAway = 1 - wpHome;
    var fav = favored(g);
    var pFav = Math.max(wpHome, wpAway);
    var cls = probClass(pFav);
    var homePct = Math.round(wpHome * 100);
    var awayPct = 100 - homePct;
    var awayAbbr = esc((g.away_team && g.away_team.abbr) || 'AWAY');
    var homeAbbr = esc((g.home_team && g.home_team.abbr) || 'HOME');
    return '' +
      '<div class="cfb-wp ' + cls + '" role="img" aria-label="Model win probability: ' +
        homeAbbr + ' ' + homePct + ' percent, ' + awayAbbr + ' ' + awayPct + ' percent">' +
      '<div class="cfb-wp__head"><span>Model win probability</span>' +
        '<span class="cfb-wp__fav">' + (fav.side ? esc(fav.abbr) + ' favoured' : 'Pick\u2019em') + '</span></div>' +
      '<div class="cfb-wp__bar">' +
        '<span class="cfb-wp__away" style="width:' + awayPct + '%"></span>' +
        '<span class="cfb-wp__home" style="width:' + homePct + '%"></span>' +
      '</div>' +
      '<div class="cfb-wp__legend"><span>' + awayAbbr + ' ' + awayPct + '%</span>' +
        '<span>' + homeAbbr + ' ' + homePct + '%</span></div>' +
      '</div>';
  }

  function scoreline(g) {
    var a = g.projected_away_score, h = g.projected_home_score;
    if (!isNum(a) || !isNum(h)) {
      return '<div class="cfb-score cfb-score--na">' + dash('projected score not published') + '</div>';
    }
    var awayAbbr = esc((g.away_team && g.away_team.abbr) || 'AWAY');
    var homeAbbr = esc((g.home_team && g.home_team.abbr) || 'HOME');
    var hi = h >= a;
    return '' +
      '<div class="cfb-score" title="Model projected scoreline (scoring model)">' +
      '<div class="cfb-score__side' + (hi ? '' : ' cfb-score__side--hi') + '">' +
        '<span class="cfb-score__abbr">' + awayAbbr + '</span>' +
        '<span class="cfb-score__num">' + fmt(a, 1) + '</span></div>' +
      '<span class="cfb-score__at">@</span>' +
      '<div class="cfb-score__side' + (hi ? ' cfb-score__side--hi' : '') + '">' +
        '<span class="cfb-score__num">' + fmt(h, 1) + '</span>' +
        '<span class="cfb-score__abbr">' + homeAbbr + '</span></div>' +
      '</div>';
  }

  function favLine(g) {
    var fav = favored(g);
    if (!fav.side || !isNum(fav.margin)) {
      return '<p class="cfb-fav cfb-fav--na">Model margin ' + dash('margin not published') + '</p>';
    }
    return '<p class="cfb-fav"><strong>' + esc(fav.abbr) + '</strong> by <strong>' + fmt(fav.margin, 1) +
      '</strong> <span class="cfb-fav__unit">model margin</span></p>';
  }

  function statCell(label, value, reason) {
    return '<div class="cfb-stat"><dt>' + esc(label) + '</dt><dd>' + metric(value, reason) + '</dd></div>';
  }

  function analysis(g, authority) {
    var rows = [];
    function row(label, value, reason) {
      rows.push('<div class="cfb-arow"><dt>' + esc(label) + '</dt><dd>' + metric(value, reason) + '</dd></div>');
    }
    row('Model regime', g.model_regime ? g.model_regime.replace(/_/g, ' ') : null, 'regime not published');
    row('Forecast source', g.forecast_source ? g.forecast_source.replace(/_/g, ' ') : null, 'source not published');
    row('Ratings margin (raw)', signed(g.raw_model_margin), 'not published');
    row('Preseason margin', signed(g.preseason_margin), 'not published');
    row('Efficiency margin', signed(g.efficiency_margin), 'efficiency not yet weighted this week');
    row('Efficiency reliability', isNum(g.efficiency_reliability) ? Math.round(g.efficiency_reliability * 100) + '%' : null, 'not published');
    row('In validated regime', g.in_validated_regime === true ? 'yes' : (g.in_validated_regime === false ? 'no' : null), 'unknown');
    row('Projected total', fmt(g.projected_total, 1), 'total not published');
    row('Independent total', fmt(g.independent_total, 1), 'not published');
    row('Total basis', g.total_basis ? g.total_basis.replace(/_/g, ' ') : null, 'basis not published');
    row('Total model weight', isNum(g.total_model_weight) ? Math.round(g.total_model_weight * 100) + '%' : null, 'not published');
    row('Market margin', signed(g.market_margin), g.edge_withheld_reason || 'market not published');
    row('Market total', fmt(g.market_total, 1), 'market total not published');
    row('Edge points', signed(g.edge_points), g.edge_withheld_reason || 'edge withheld');

    var evidence = g.evidence || (authority && authority.evidence) || '';
    var ev = evidence
      ? '<p class="cfb-analysis__evidence">' + esc(evidence) + '</p>'
      : '<p class="cfb-analysis__evidence">Producer evidence is empty.</p>';

    return '' +
      '<details class="cfb-analysis">' +
      '<summary>Matchup analysis</summary>' +
      '<div class="cfb-analysis__grid">' + rows.join('') + '</div>' +
      '<p class="cfb-analysis__note">Projected scoreline comes from the scoring/total model; the headline margin is the ' +
        'opponent-adjusted ratings model. They are separate views and need not agree.</p>' +
      ev +
      '</details>';
  }

  function cardHtml(g, sport, authority) {
    sport = sport || 'cfb';
    var awayColor = (g.away_team && g.away_team.color) || 'var(--border-2)';
    var homeColor = (g.home_team && g.home_team.color) || 'var(--border-2)';
    var kickoff = g.kickoff_display || g.kickoff_utc || null;
    var actionChip = g.action
      ? '<span class="cfb-action" title="Research label from the model — not a bet directive.">' +
          esc(String(g.action).replace(/_/g, ' ')) + '</span>'
      : '';
    var neutralBadge = g.neutral ? '<span class="cfb-badge cfb-badge--neutral">Neutral site</span>' : '';
    var confBadge = g.same_conference ? '<span class="cfb-badge cfb-badge--conf">' + esc(g.same_conference) + '</span>' : '';

    var gapAxis = (B && B.marginAxisHtml) ? B.marginAxisHtml(g, sport) : '';

    return '' +
      '<article class="cfb-card" data-game="' + esc(g.id) + '"' +
        ' data-conf-away="' + esc((g.away_team && g.away_team.conference) || '') + '"' +
        ' data-conf-home="' + esc((g.home_team && g.home_team.conference) || '') + '"' +
        ' style="--cfb-away:' + esc(awayColor) + ';--cfb-home:' + esc(homeColor) + '">' +
      '<header class="cfb-card__head">' +
        '<div class="cfb-teams">' +
          '<div class="cfb-team cfb-team--away">' + entity(g.away_team, sport) + confChip(g.away_team && g.away_team.conference) + '</div>' +
          '<span class="cfb-team__at">at</span>' +
          '<div class="cfb-team cfb-team--home">' + entity(g.home_team, sport) + confChip(g.home_team && g.home_team.conference) + '</div>' +
        '</div>' +
        '<div class="cfb-card__meta">' +
          (kickoff ? '<time class="cfb-kickoff">' + esc(kickoff) + '</time>' : '<span class="cfb-kickoff">' + dash('kickoff unknown') + '</span>') +
          neutralBadge + confBadge +
        '</div>' +
      '</header>' +
      scoreline(g) +
      favLine(g) +
      winProbMeter(g) +
      '<dl class="cfb-stats">' +
        statCell('Proj total', fmt(g.projected_total, 1), 'total not published') +
        statCell('Model margin', signed(g.published_margin != null ? g.published_margin : g.model_margin), 'margin not published') +
        statCell('Market margin', signed(g.market_margin), g.edge_withheld_reason || 'market not published') +
        statCell('Market total', fmt(g.market_total, 1), 'market total not published') +
      '</dl>' +
      (gapAxis || '') +
      (actionChip ? '<div class="cfb-card__foot">' + actionChip + '</div>' : '') +
      analysis(g, authority) +
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

  function contextStrip(nb) {
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
    return '<p class="cfb-context">' + bits.join(' · ') + '</p>';
  }

  function filterBar(confs) {
    if (!confs.length) return '';
    var html = '<div class="cfb-filter" role="group" aria-label="Filter by conference">';
    html += '<button type="button" class="hub-pill active" data-conf="all">All conferences</button>';
    confs.forEach(function (c) {
      html += '<button type="button" class="hub-pill" data-conf="' + esc(c.name) + '">' +
        esc(c.name) + ' <span class="cfb-filter__n">' + c.count + '</span></button>';
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
    html += contextStrip(nb);
    html += '<p class="ca-helper cfb-marketnote">Priced markets: ' + priced + ' of ' + games.length +
      ' — model projections only, not Picks. Market margin/total publish when the odds feed clears the honesty gates.</p>';
    html += filterBar(confs);
    html += '<p class="ca-helper cfb-visible-count">' + games.length + ' games</p>';
    html += '<div class="cfb-grid">';
    games.forEach(function (g) { html += cardHtml(g, nb.sport || 'cfb', authority); });
    html += '</div>';

    container.innerHTML = html;
    if (global.ChaseAsyncState) ChaseAsyncState.ready(container);
    container.className = (container.className || '').replace(/\bca-async(--\w+)?\b/g, '').trim() + ' cfb-slate';
    wireFilter(container);
  }

  global.ChaseCFBBoard = {
    renderSlate: renderSlate,
    cardHtml: cardHtml,
    _favored: favored,
    _probClass: probClass
  };
})(typeof window !== 'undefined' ? window : this);
