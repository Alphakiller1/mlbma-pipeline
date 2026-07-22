/**
 * content_export.js — renders locked 1080×1350 social export frames from a content
 * bundle, reusing the LIVE product's CSS/components (design tokens, .hero-matchup-card /
 * .hmc-* / .mc-sp-* classes, .ca-board, and MLBMAAssets helpers).
 *
 * This is the visual bridge described in docs/CHASE_CONTENT_PLAN.md: instead of
 * reinventing the Chase look in Pillow, daily graphics screenshot these frames so the
 * finals inherit the exact website chrome. The content-engine design contract still
 * governs the layout rules (1080×1350, compact header, NO win-prob on Morning Slate,
 * opinion tags, fail-closed data) — this file just fulfills them with website CSS.
 *
 * Bundle shape matches chase-content-engine/examples/sample_bundle.json (games[],
 * offense{}, meta{}). Data comes from ?bundle=<url> (fetched) or an embedded
 * <script type="application/json" id="bundle-data"> tag.
 */
(function (global) {
  'use strict';

  var A = global.MLBMAAssets || null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function num(v) {
    return v == null || v === '' || isNaN(v) ? null : Number(v);
  }

  function teamLogo(team, px) {
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

  // ── bundle loading ────────────────────────────────────────────────────────
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

  // ── formatting ──────────────────────────────────────────────────────────────
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

  // ── shared compact Chase header (content contract §3.4) ──────────────────────
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

  // ── Morning Slate ────────────────────────────────────────────────────────────
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
    var h = String(hand || '').toUpperCase();
    var label = h === 'L' ? 'LHP' : h === 'R' ? 'RHP' : 'SP';
    return '<span class="hand-pill">' + label + '</span>';
  }

  // Compact, portrait-off SP line reusing .mc-sp-block chrome (contract §5.4 / §7:
  // portraits OFF by default on Morning Slate — text pitcher line only).
  function spBlock(side, pitcher) {
    pitcher = pitcher || {};
    var sideCls = side === 'home' ? 'mc-sp-block--home' : 'mc-sp-block--away';
    var sideLabel = side === 'home' ? 'HOME SP' : 'AWAY SP';
    var ip = num(pitcher.projected_ip);
    var er = num(pitcher.projected_er);
    var k = num(pitcher.projected_k);
    function stat(cls, label, value, ctx, invert) {
      var color = value == null ? 'var(--text-4)' : metricColor(value, ctx, invert);
      var disp = value == null ? '—' : Number(value).toFixed(1);
      return '<div class="mc-sp-stat mc-sp-stat--' + cls + '">' +
        '<em>' + label + '</em>' +
        '<strong style="--stat-color:' + color + ';color:' + color + '">' + disp + '</strong>' +
        '</div>';
    }
    return '' +
      '<div class="mc-sp-block ' + sideCls + ' ce-sp">' +
        '<div class="mc-sp-info">' +
          '<div class="mc-sp-top">' +
            '<span class="mc-sp-side">' + sideLabel + '</span>' +
            '<span class="mc-sp-badges">' + handPill(pitcher.hand) + '</span>' +
          '</div>' +
          '<div class="mc-sp-name-row"><span class="mc-sp-name-text">' + esc(pitcher.name || 'TBD') + '</span></div>' +
          '<div class="mc-sp-stats--grid">' +
            stat('k', 'IP', ip, 'ipstart', false) +
            stat('bb', 'ER', er, 'era', true) +
            stat('era', 'K', k, 'k9', false) +
          '</div>' +
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

  // RUN PROJECTION comparison — reuses .hmc-osi-bar chrome, but is run-based, NOT
  // win probability (contract §2.6 / §5.5: no win-prob, no probability split).
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
    var state = game.lineup_status ? (String(game.lineup_status).charAt(0).toUpperCase() + String(game.lineup_status).slice(1) + ' lineups') : '';
    return '' +
      '<div class="ce-card-foot">' +
        '<span class="ce-lineup-state">' + esc(state) + '</span>' +
        '<span class="ce-opinion ce-opinion--' + cls + '">' +
          '<span class="ce-opinion-tag">' + esc(tag) + '</span>' + note +
        '</span>' +
      '</div>';
  }

  function morningCard(game, rank) {
    var sepInfo = separation(
      game.projection && game.projection.home_runs,
      game.projection && game.projection.away_runs
    );
    var time = game.time ? '<span class="hmc-time">' + esc(game.time) + '</span>' : '';
    return '' +
      '<article class="hero-matchup-card ce-card">' +
        '<span class="ce-rank">' + rank + '</span>' +
        '<span class="ce-sep ce-sep--' + sepInfo.cls + '">' + sepInfo.label +
          (sepInfo.sep != null ? ' · Δ' + sepInfo.sep.toFixed(1) + ' R' : '') + '</span>' +
        '<div class="hmc-row hmc-teams ce-teams">' +
          teamSide(game.away, 'away') +
          '<span class="hmc-at">@</span>' +
          teamSide(game.home, 'home') +
          '<div class="hmc-meta ce-meta-row">' + time + '</div>' +
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
    // §5.2 sort: model run separation desc (never win probability).
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

  function offensePanel(title, rows, kind) {
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

  // ── boot ──────────────────────────────────────────────────────────────────────
  var RENDERERS = {
    'morning_slate': renderMorningSlate,
    'offensive_report': renderOffensiveReport
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
