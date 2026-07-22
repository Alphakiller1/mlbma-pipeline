/**
 * content_export.js — locked 1080×1350 social frames that reuse LIVE product chrome.
 *
 * Visual SSOT priority:
 *   1. Matchup Analysis page (matchup_compare.css / .mc-*) — deepest polish
 *   2. Opening Dashboard hero cards (landing_dashboard.css / .hero-matchup-card)
 *   3. Shared tokens + MLBMAAssets helpers
 *
 * Reports: morning_slate | offensive_report | matchup_analysis
 * Bundle: chase-content-engine sample shape (+ optional analysis metrics on games[]).
 */
(function (global) {
  'use strict';

  var A = global.MLBMAAssets || null;
  var S = global.MLBMASharedMatchup || null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function num(v) {
    return v == null || v === '' || isNaN(v) ? null : Number(v);
  }

  function fmt(v, d) {
    if (v == null || isNaN(v)) return '—';
    return Number(v).toFixed(d != null ? d : 1);
  }

  function teamLogo(team, px) {
    if (S && S.teamLogo) return S.teamLogo(team, px || 40);
    if (A && A.teamLogoImg) return A.teamLogoImg(team, px || 40, 'ce-team-logo');
    return '<span class="ce-team-logo ce-team-logo--fallback">' + esc(String(team || '').slice(0, 3)) + '</span>';
  }

  function metricColor(value, ctx, invert) {
    if (A && A.metricColor) return A.metricColor(value, ctx, invert);
    return 'var(--text)';
  }

  function heatColor(value, ctx, invert) {
    if (A && A.heatColor) return A.heatColor(value, ctx, invert);
    return 'rgba(154,107,255,0.35)';
  }

  function valChip(value, ctx, invert, decimals, opts) {
    if (A && A.valChipHtml) return A.valChipHtml(value, ctx, invert, decimals, opts);
    opts = opts || {};
    var d = decimals != null ? decimals : 1;
    var disp = opts.display != null ? opts.display : (value == null || isNaN(value) ? '—' : Number(value).toFixed(d));
    return '<span class="chip ' + (opts.chipClass || 'c-mid') + '">' + esc(disp) + '</span>';
  }

  function pitchTier(score) {
    if (S && S.pitchTiers) return S.pitchTiers(score);
    var v = num(score);
    if (v == null) return { label: '—', cls: 'tier-mid' };
    if (v >= 70) return { label: 'Elite', cls: 'tier-elite' };
    if (v >= 55) return { label: 'Solid', cls: 'tier-solid' };
    if (v >= 40) return { label: 'Mid', cls: 'tier-mid' };
    return { label: 'Vol', cls: 'tier-vol' };
  }

  function osiTierLabel(osi) {
    if (S && S.osiTierLabel) return S.osiTierLabel(osi);
    var v = num(osi);
    if (v == null) return '—';
    if (v >= 65) return 'Elite offense';
    if (v >= 55) return 'Above average';
    if (v >= 45) return 'League average';
    return 'Below average';
  }

  function getParam(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(global.location.search || '');
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  }

  function readEmbeddedBundle() {
    var el = document.getElementById('bundle-data');
    if (!el) return null;
    try {
      return JSON.parse(el.textContent || el.innerText || '{}');
    } catch (e) {
      console.error('[content_export] bad #bundle-data JSON', e);
      return null;
    }
  }

  function loadBundle() {
    var url = getParam('bundle');
    if (url && typeof fetch === 'function') {
      return fetch(url, { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('bundle fetch ' + r.status);
          return r.json();
        })
        .catch(function (e) {
          console.error('[content_export] bundle fetch failed, using embedded', e);
          return readEmbeddedBundle();
        });
    }
    return Promise.resolve(readEmbeddedBundle());
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function fmtSlateDate(iso) {
    if (!iso) return '';
    var parts = String(iso).slice(0, 10).split('-');
    if (parts.length !== 3) return String(iso);
    var mi = parseInt(parts[1], 10) - 1;
    return (MONTHS[mi] || parts[1]) + ' ' + parseInt(parts[2], 10) + ', ' + parts[0];
  }

  function fmtEtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    try {
      return d.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York'
      }) + ' ET';
    } catch (e) {
      return '';
    }
  }

  function headerHtml(meta, title, pageInfo) {
    meta = meta || {};
    var brand = (A && A.brandLogoLightBadgeHtml)
      ? A.brandLogoLightBadgeHtml('horizontal', 40)
      : '<span class="ce-brand-fallback">Chase Analytics</span>';
    var metaBits = [];
    if (meta.slate_date) metaBits.push(fmtSlateDate(meta.slate_date));
    var upd = fmtEtTime(meta.generated_at);
    if (upd) metaBits.push('Updated ' + upd);
    if (pageInfo) metaBits.push(pageInfo);
    return '' +
      '<header class="ce-header">' +
        '<div class="ce-header-row">' +
          '<div class="ce-brand">' + brand + '</div>' +
          '<h1 class="ce-title">' + esc(title) + '</h1>' +
        '</div>' +
        '<div class="ce-meta">' + esc(metaBits.join('  ·  ')) + '</div>' +
      '</header>';
  }

  function footerHtml(meta) {
    meta = meta || {};
    var upd = fmtEtTime(meta.generated_at);
    var left = 'Updated ' + (upd || '—') + ' · Model projections are not guarantees.';
    return '' +
      '<footer class="ce-footer">' +
        '<span class="ce-footer-left">' + esc(left) + '</span>' +
        '<span class="ce-footer-right">chase-analytics.com</span>' +
      '</footer>';
  }

  // ── Morning Slate (Opening card + Matchup Analysis SP chrome) ──────────────
  function separation(homeRuns, awayRuns) {
    var h = num(homeRuns), a = num(awayRuns);
    if (h == null || a == null) return { sep: null, label: 'RUN PROJECTION', cls: 'tossup' };
    var sep = Math.abs(h - a);
    var label, cls;
    if (sep >= 1.5) { label = 'LOPSIDED'; cls = 'lopsided'; }
    else if (sep >= 1.0) { label = 'CLEAR EDGE'; cls = 'edge'; }
    else if (sep >= 0.5) { label = 'LEAN'; cls = 'lean'; }
    else { label = 'TOSS-UP'; cls = 'tossup'; }
    return { sep: sep, label: label, cls: cls };
  }

  function handPill(hand) {
    var h = String(hand || '').toUpperCase().charAt(0);
    var label = h === 'L' ? 'L' : h === 'R' ? 'R' : '?';
    return '<span class="hand-pill">' + label + '</span>';
  }

  function spBlock(side, pitcher) {
    pitcher = pitcher || {};
    var sideCls = side === 'home' ? 'mc-sp-block--home' : 'mc-sp-block--away';
    var sideLabel = side === 'home' ? 'HOME SP' : 'AWAY SP';
    var ps = num(pitcher.pitch_score);
    var tier = pitchTier(ps);
    var hasRates = num(pitcher.k_pct) != null || num(pitcher.bb_pct) != null;

    function stat(cls, label, value, ctx, invert, decimals) {
      var color = value == null ? 'var(--text-4)' : metricColor(value, ctx, invert);
      var disp = value == null ? '—' : Number(value).toFixed(decimals != null ? decimals : 1);
      return '<div class="mc-sp-stat mc-sp-stat--' + cls + '">' +
        '<em>' + label + '</em>' +
        '<strong style="--stat-color:' + color + ';color:' + color + '">' + disp + '</strong>' +
        '</div>';
    }

    var badges = handPill(pitcher.hand);
    if (ps != null) {
      badges += ' <span class="tier-badge ' + tier.cls + '">' + esc(tier.label) + '</span>';
    }

    var statsHtml;
    if (hasRates) {
      statsHtml =
        stat('k', 'K%', num(pitcher.k_pct), 'kpct', false, 1) +
        stat('bb', 'BB%', num(pitcher.bb_pct), 'bbpct', true, 1) +
        stat('hr9', 'HR/9', num(pitcher.hr9), 'hr9', true, 2);
    } else {
      statsHtml =
        stat('k', 'IP', num(pitcher.projected_ip), 'ipstart', false, 1) +
        stat('bb', 'ER', num(pitcher.projected_er), 'era', true, 1) +
        stat('era', 'K', num(pitcher.projected_k), 'k9', false, 1);
    }

    var psLine = ps != null
      ? '<div class="mc-ps-badge mc-ps-badge--defined ce-ps-badge">' +
          '<span class="mc-ps-badge__label">Pitch Score</span>' +
          '<span class="mc-ps-badge__val" style="color:' + metricColor(ps, 'pitching', false) + '">' +
            fmt(ps, 1) +
          '</span></div>'
      : '';

    return '' +
      '<div class="mc-sp-block ' + sideCls + ' ce-sp">' +
        '<div class="mc-sp-info">' +
          '<div class="mc-sp-top">' +
            '<span class="mc-sp-side">' + sideLabel + '</span>' +
            '<span class="mc-sp-badges">' + badges + '</span>' +
          '</div>' +
          '<div class="mc-sp-name-row"><span class="mc-sp-name-text">' + esc(pitcher.name || 'TBD') + '</span></div>' +
          psLine +
          '<div class="mc-sp-stats--grid">' + statsHtml + '</div>' +
        '</div>' +
      '</div>';
  }

  function teamSide(team, side) {
    var cls = side === 'home' ? 'team-link--home' : 'team-link--away';
    return '<div class="hmc-team"><span class="team-link ' + cls + '">' +
      teamLogo(team, 40) +
      '<span class="hmc-abbr">' + esc(team) + '</span>' +
      '</span></div>';
  }

  function runBar(game) {
    var a = num(game.projection && game.projection.away_runs);
    var h = num(game.projection && game.projection.home_runs);
    var total = (a || 0) + (h || 0);
    var awayShare = total > 0 ? Math.max(12, (a / total) * 100) : 50;
    var homeShare = 100 - awayShare;
    function runNum(v) {
      var color = v == null ? 'var(--text-4)' : metricColor(v, 'rpg', false);
      var disp = v == null ? '—' : Number(v).toFixed(1);
      return '<span class="hmc-osi-num" style="color:' + color + '">' + disp + '</span>';
    }
    return '' +
      '<div class="hmc-row hmc-edge-label ce-run-label">RUN PROJECTION</div>' +
      '<div class="hmc-osi-bar ce-run-bar">' +
        '<span class="hmc-osi-val hmc-osi-val--away">' +
          '<span class="hmc-osi-team">' + esc(game.away) + '</span>' + runNum(a) +
        '</span>' +
        '<div class="hmc-bar-track">' +
          '<div class="ce-run-seg" style="width:' + awayShare + '%;background:' + heatColor(a, 'rpg', false) + '"></div>' +
          '<div class="ce-run-seg" style="width:' + homeShare + '%;background:' + heatColor(h, 'rpg', false) + '"></div>' +
        '</div>' +
        '<span class="hmc-osi-val hmc-osi-val--home">' +
          '<span class="hmc-osi-team">' + esc(game.home) + '</span>' + runNum(h) +
        '</span>' +
      '</div>';
  }

  var OPINION_TAGS = {
    'MY BET': 'mybet',
    'LEAN': 'lean',
    'WATCH': 'watch',
    'PASS': 'pass',
    'NO OPINION': 'none'
  };

  function opinionRail(game) {
    var op = game.opinion || {};
    var tag = String(op.tag || 'NO OPINION').toUpperCase();
    var cls = OPINION_TAGS[tag] || 'none';
    var note = op.text ? '<span class="ce-opinion-note">' + esc(op.text) + '</span>' : '';
    var state = game.lineup_status
      ? (String(game.lineup_status).charAt(0).toUpperCase() + String(game.lineup_status).slice(1) + ' lineups')
      : '';
    return '' +
      '<div class="ce-card-foot">' +
        '<span class="ce-lineup-state">' + esc(state) + '</span>' +
        '<span class="ce-opinion ce-opinion--' + cls + '">' +
          '<span class="ce-opinion-tag">' + esc(tag) + '</span>' + note +
        '</span>' +
      '</div>';
  }

  function weatherStrip(game) {
    var w = game.weather;
    if (!w) return '';
    if (S && S.weatherBadge) {
      try {
        var html = S.weatherBadge(w, game.home);
        if (html) return '<div class="hmc-weather-group ce-weather">' + html + '</div>';
      } catch (e) { /* fall through */ }
    }
    var bits = [];
    if (w.temp != null) bits.push('<span class="hmc-weather-chip hmc-weather-chip--temp">' + esc(w.temp) + '°</span>');
    if (w.wind) bits.push('<span class="hmc-weather-chip hmc-weather-chip--wind">' + esc(w.wind) + '</span>');
    if (w.cond) bits.push('<span class="hmc-weather-chip hmc-weather-chip--cond">' + esc(w.cond) + '</span>');
    if (!bits.length) return '';
    return '<div class="hmc-weather-group ce-weather">' + bits.join('') + '</div>';
  }

  function morningCard(game, rank) {
    var sepInfo = separation(
      game.projection && game.projection.home_runs,
      game.projection && game.projection.away_runs
    );
    var time = game.time ? '<span class="hmc-time">' + esc(game.time) + '</span>' : '';
    var stadium = game.stadium ? '<span class="hmc-stadium">' + esc(game.stadium) + '</span>' : '';
    return '' +
      '<article class="hero-matchup-card ce-card">' +
        '<span class="ce-rank">' + rank + '</span>' +
        '<span class="ce-sep ce-sep--' + sepInfo.cls + '">' + sepInfo.label +
          (sepInfo.sep != null ? ' · Δ' + sepInfo.sep.toFixed(1) + ' R' : '') + '</span>' +
        '<div class="hmc-row hmc-teams ce-teams">' +
          teamSide(game.away, 'away') +
          '<span class="hmc-at">@</span>' +
          teamSide(game.home, 'home') +
          '<div class="hmc-meta ce-meta-row">' + time + stadium + weatherStrip(game) + '</div>' +
        '</div>' +
        '<div class="hmc-row hmc-pitchers">' +
          spBlock('away', game.away_pitcher) +
          spBlock('home', game.home_pitcher) +
        '</div>' +
        runBar(game) +
        opinionRail(game) +
      '</article>';
  }

  function renderMorningSlate(bundle, mount) {
    var meta = bundle.meta || {};
    var games = (bundle.games || []).slice();
    games.sort(function (x, y) {
      var xs = Math.abs((num(x.projection && x.projection.home_runs) || 0) - (num(x.projection && x.projection.away_runs) || 0));
      var ys = Math.abs((num(y.projection && y.projection.home_runs) || 0) - (num(y.projection && y.projection.away_runs) || 0));
      return ys - xs;
    });
    var perPage = games.length > 4 ? 5 : 4;
    var page = games.slice(0, perPage);
    var compact = page.length > 4 ? ' ce-slate-grid--compact' : '';
    var pageInfo = 'Page 1 / ' + Math.max(1, Math.ceil(games.length / perPage));
    var body = '' +
      headerHtml(meta, 'Morning Slate', pageInfo) +
      '<div class="ce-body">' +
        '<div class="ce-slate-grid' + compact + '">' +
          page.map(function (g, i) { return morningCard(g, i + 1); }).join('') +
        '</div>' +
      '</div>' +
      footerHtml(meta);
    mount.innerHTML = body;
  }

  // ── Matchup Analysis (single-game deep frame — live .mc-* chrome) ───────────
  function pickFeaturedGame(bundle) {
    var games = bundle.games || [];
    if (!games.length) return null;
    var key = getParam('game');
    if (key) {
      var hit = games.find(function (g) {
        return String(g.key || '').toUpperCase() === String(key).toUpperCase();
      });
      if (hit) return hit;
    }
    return games.slice().sort(function (x, y) {
      var xs = Math.abs((num(x.projection && x.projection.home_runs) || 0) - (num(x.projection && x.projection.away_runs) || 0));
      var ys = Math.abs((num(y.projection && y.projection.home_runs) || 0) - (num(y.projection && y.projection.away_runs) || 0));
      return ys - xs;
    })[0];
  }

  function analysisTeamSide(team, align, record) {
    var role = align === 'home' ? 'Home' : 'Away';
    var rec = record
      ? '<span class="mc-record-row"><span class="team-record-pill">' + esc(record) + '</span></span>'
      : '';
    return '' +
      '<div class="mc-header-side mc-header-side--' + align + '">' +
        '<div class="mc-header-logo">' + teamLogo(team, 52) + '</div>' +
        '<div class="mc-header-side-text">' +
          '<div class="mc-header-role">' + role + '</div>' +
          '<div class="mc-header-name-row">' +
            '<span class="mc-team-abbr">' + esc(team) + '</span>' + rec +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function analysisHeader(game) {
    var wx = weatherStrip(game);
    var stadium = game.stadium || 'Stadium TBD';
    return '' +
      '<header class="mc-header mc-section ce-mc-header">' +
        '<div class="mc-header-kicker">Matchup Analysis</div>' +
        '<div class="mc-header-grid">' +
          analysisTeamSide(game.away, 'away', game.away_record) +
          '<div class="mc-header-center">' +
            '<div class="mc-header-matchup"><span class="mc-at">@</span></div>' +
            '<div class="mc-header-meta">' + esc(game.time || 'TBD') + ' · ' + esc(stadium) + '</div>' +
            (wx ? '<div class="mc-header-weather">' + wx + '</div>' : '') +
          '</div>' +
          analysisTeamSide(game.home, 'home', game.home_record) +
        '</div>' +
      '</header>';
  }

  function analysisSpCard(side, team, pitcher) {
    pitcher = pitcher || {};
    var ps = num(pitcher.pitch_score);
    var tier = pitchTier(ps);
    var name = pitcher.name || 'TBD';
    var k = num(pitcher.k_pct);
    var bb = num(pitcher.bb_pct);
    var hr9 = num(pitcher.hr9);
    var fip = num(pitcher.fip);
    var xfip = num(pitcher.xfip);
    var osiAllow = num(pitcher.osi_allowed);
    var xfipStr = xfip != null ? xfip.toFixed(2) : (fip != null ? fip.toFixed(2) : '—');

    function strong(v, ctx, invert, decimals) {
      if (v == null) return '<strong>—</strong>';
      var color = metricColor(v, ctx, invert);
      return '<strong style="color:' + color + '">' + Number(v).toFixed(decimals != null ? decimals : 1) + '</strong>';
    }

    var stats;
    if (k != null || bb != null || hr9 != null) {
      stats =
        '<span>K% ' + strong(k, 'kpct', false, 1) + '</span>' +
        '<span>BB% ' + strong(bb, 'bbpct', true, 1) + '</span>' +
        '<span>FIP/xFIP <strong>' + xfipStr + '</strong></span>' +
        '<span>HR/9 ' + strong(hr9, 'hr9', true, 2) + '</span>' +
        (osiAllow != null ? '<span>OSI Allowed ' + valChip(osiAllow, 'osi', true, 1) + '</span>' : '');
    } else {
      stats =
        '<span>IP ' + strong(num(pitcher.projected_ip), 'ipstart', false, 1) + '</span>' +
        '<span>ER ' + strong(num(pitcher.projected_er), 'era', true, 1) + '</span>' +
        '<span>K ' + strong(num(pitcher.projected_k), 'k9', false, 1) + '</span>';
    }

    return '' +
      '<div class="mc-sp-card ce-mc-sp-card">' +
        '<div class="mc-sp-top">' +
          '<div>' +
            '<div class="ca-metric-label">' + esc(side) + ' SP · ' + esc(team) + '</div>' +
            '<div class="mc-sp-name">' + esc(name) + ' ' + handPill(pitcher.hand) +
              (ps != null ? ' <span class="tier-badge ' + tier.cls + '">' + esc(tier.label) + '</span>' : '') +
            '</div>' +
            (ps != null
              ? '<div class="ca-helper">Pitching Score ' + valChip(ps, 'pitching', false, 1) + '</div>'
              : '') +
          '</div>' +
        '</div>' +
        '<div class="mc-sp-stats">' + stats + '</div>' +
      '</div>';
  }

  function analysisEdgePanel(label, offense, pitcherAllowed) {
    offense = offense || {};
    var osi = num(offense.osi);
    var pals = num(offense.pals);
    var edgeCls = 'edge-even';
    var edgeLabel = 'Even matchup';
    if (osi != null && pitcherAllowed != null) {
      var gap = osi - pitcherAllowed;
      if (gap >= 5) { edgeCls = 'edge-lineup'; edgeLabel = 'Lineup edge'; }
      else if (gap <= -5) { edgeCls = 'edge-pitcher'; edgeLabel = 'Pitcher edge'; }
    }
    return '' +
      '<div class="mc-card mc-edge-panel ce-mc-edge">' +
        '<div class="mc-edge-label">' + esc(label) + '</div>' +
        '<div class="mc-edge-osi">' + valChip(osi, 'osi', false, 1) + '</div>' +
        '<div class="mc-edge-tier">' + esc(osiTierLabel(osi)) + '</div>' +
        (pals != null
          ? '<div class="pals-line pals-neutral">PALS: ' + fmt(pals, 1) + '</div>'
          : '') +
        '<div class="mc-edge-metrics">' +
          '<span>ABQ <strong>' + fmt(offense.abq, 1) + '</strong></span>' +
          '<span>RCV <strong>' + fmt(offense.rcv, 1) + '</strong></span>' +
          '<span>OBR <strong>' + fmt(offense.obr, 1) + '</strong></span>' +
        '</div>' +
        '<div class="' + edgeCls + '">' + esc(edgeLabel) + '</div>' +
      '</div>';
  }

  function analysisRunProjection(game) {
    var a = num(game.projection && game.projection.away_runs);
    var h = num(game.projection && game.projection.home_runs);
    var sep = separation(h, a);
    var total = (a || 0) + (h || 0);
    var awayPct = total > 0 ? Math.round((a / total) * 100) : 50;
    var homePct = 100 - awayPct;
    return '' +
      '<div class="mc-lineup-bar-wrap ce-mc-runs">' +
        '<div class="mc-lineup-bar-labels">' +
          '<span>' + esc(game.away) + ' <strong style="color:' + metricColor(a, 'rpg', false) + '">' +
            (a == null ? '—' : a.toFixed(1)) + '</strong></span>' +
          '<span class="ce-run-center-label">RUN PROJECTION · ' + esc(sep.label) + '</span>' +
          '<span><strong style="color:' + metricColor(h, 'rpg', false) + '">' +
            (h == null ? '—' : h.toFixed(1)) + '</strong> ' + esc(game.home) + '</span>' +
        '</div>' +
        '<div class="mc-lineup-bar-track">' +
          '<div class="mc-lineup-bar-away" style="width:' + awayPct + '%"></div>' +
          '<div class="mc-lineup-bar-home" style="width:' + homePct + '%"></div>' +
        '</div>' +
        '<div class="mc-lineup-edge-read">' +
          (sep.sep != null ? ('Δ ' + sep.sep.toFixed(1) + ' runs · ranked by model run separation') : 'Projection pending') +
        '</div>' +
      '</div>';
  }

  function renderMatchupAnalysis(bundle, mount) {
    var meta = bundle.meta || {};
    var game = pickFeaturedGame(bundle);
    if (!game) {
      mount.innerHTML = '<div class="ce-error">No game in bundle for Matchup Analysis.</div>';
      return;
    }
    var awayP = game.away_pitcher || {};
    var homeP = game.home_pitcher || {};
    var h2h = game.h2h || {};
    var h2hHtml = (h2h.edge_label || h2h.why)
      ? '<div class="mc-h2h"><strong>Pitching edge: ' + esc(h2h.edge_label || '—') + '</strong>' +
          (h2h.why ? ' — ' + esc(h2h.why) : '') + '</div>'
      : '';

    var body = '' +
      headerHtml(meta, 'Matchup Analysis', game.key || (game.away + '@' + game.home)) +
      '<div class="ce-body ce-body--analysis">' +
        analysisHeader(game) +
        '<section class="mc-section ce-mc-section">' +
          '<h2 class="mc-section-title">Starting Pitcher Comparison</h2>' +
          '<div class="mc-card mc-sp-compare">' +
            analysisSpCard('Away', game.away, awayP) +
            '<div class="mc-sp-vs">VS</div>' +
            analysisSpCard('Home', game.home, homeP) +
          '</div>' +
          h2hHtml +
        '</section>' +
        analysisRunProjection(game) +
        '<div class="mc-grid-2 ce-mc-edges">' +
          analysisEdgePanel(game.away + ' lineup OSI', game.away_offense, num(awayP.osi_allowed)) +
          analysisEdgePanel(game.home + ' lineup OSI', game.home_offense, num(homeP.osi_allowed)) +
        '</div>' +
        opinionRail(game) +
      '</div>' +
      footerHtml(meta);
    mount.innerHTML = body;
  }

  // ── Offensive Report ─────────────────────────────────────────────────────────
  function offenseRow(entry, rank) {
    var osi = num(entry.osi);
    return '' +
      '<div class="ce-off-row">' +
        '<span class="ce-off-rank">' + rank + '</span>' +
        teamLogo(entry.team, 30) +
        '<span class="ce-off-team">' + esc(entry.team) + '</span>' +
        '<span class="ce-off-val">' + valChip(osi, 'osi', false, 1) + '</span>' +
      '</div>';
  }

  function deltaRow(entry) {
    var ytd = num(entry.osi_ytd);
    var l7 = num(entry.osi_l7);
    var delta = num(entry.delta);
    var deltaChip = valChip(delta, 'osi', false, 1, {
      chipClass: delta == null ? 'c-na' : (delta >= 0 ? 'c-good' : 'c-poor'),
      display: delta == null ? '—' : (delta > 0 ? '+' : '') + delta.toFixed(1)
    });
    var window = (ytd != null && l7 != null)
      ? '<span class="ce-off-window">' + ytd.toFixed(1) + ' <span class="ce-off-arrow">→</span> ' + l7.toFixed(1) + '</span>'
      : '';
    return '' +
      '<div class="ce-off-row ce-off-row--delta">' +
        teamLogo(entry.team, 30) +
        '<span class="ce-off-team">' + esc(entry.team) + '</span>' +
        window +
        '<span class="ce-off-val">' + deltaChip + '</span>' +
      '</div>';
  }

  function offensePanel(title, rows) {
    return '' +
      '<section class="ca-board ce-off-panel">' +
        '<h2 class="ce-panel-title">' + esc(title) + '</h2>' +
        '<div class="ce-off-rows">' + rows + '</div>' +
      '</section>';
  }

  function renderOffensiveReport(bundle, mount) {
    var meta = bundle.meta || {};
    var off = bundle.offense || {};
    function list(arr, isDelta) {
      arr = (arr || []).slice(0, 5);
      if (!arr.length) return '<div class="ce-off-empty">No qualifying teams</div>';
      return arr.map(function (e, i) { return isDelta ? deltaRow(e) : offenseRow(e, i + 1); }).join('');
    }
    var grid = '' +
      offensePanel('Top Offenses vs RHP', list(off.vs_rhp, false)) +
      offensePanel('Top Offenses vs LHP', list(off.vs_lhp, false)) +
      offensePanel('Risers · YTD → L7', list(off.risers, true)) +
      offensePanel('Fallers · YTD → L7', list(off.fallers, true));
    var body = '' +
      headerHtml(meta, 'Offensive Report', null) +
      '<div class="ce-body">' +
        '<div class="ce-off-grid">' + grid + '</div>' +
      '</div>' +
      footerHtml(meta);
    mount.innerHTML = body;
  }

  var RENDERERS = {
    'morning_slate': renderMorningSlate,
    'offensive_report': renderOffensiveReport,
    'matchup_analysis': renderMatchupAnalysis
  };

  function boot() {
    var mount = document.getElementById('ce-root');
    if (!mount) {
      console.error('[content_export] #ce-root not found');
      return;
    }
    var report = mount.getAttribute('data-report') || getParam('report') || 'morning_slate';
    var render = RENDERERS[report];
    if (!render) {
      mount.innerHTML = '<div class="ce-error">Unknown report: ' + esc(report) + '</div>';
      return;
    }
    loadBundle().then(function (bundle) {
      if (!bundle || (!bundle.games && !bundle.offense)) {
        mount.innerHTML = '<div class="ce-error">No bundle data (fail-closed). Provide ?bundle=&lt;url&gt; or #bundle-data.</div>';
        return;
      }
      try {
        render(bundle, mount);
      } catch (e) {
        console.error('[content_export] render failed', e);
        mount.innerHTML = '<div class="ce-error">Render error: ' + esc(e.message) + '</div>';
      }
      document.documentElement.setAttribute('data-ce-ready', '1');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.ContentExport = { boot: boot, loadBundle: loadBundle };
})(typeof window !== 'undefined' ? window : this);
