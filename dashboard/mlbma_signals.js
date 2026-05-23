/**
 * Signal Explorer — Signals_Today + Signals_Convergence (shared + Model Report).
 */
(function(global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function pickCol(row, names) {
    if (!row) return '';
    var list = Array.isArray(names) ? names : [names];
    for (var i = 0; i < list.length; i++) {
      if (row[list[i]] !== undefined && row[list[i]] !== '') return row[list[i]];
    }
    var keys = Object.keys(row);
    for (var j = 0; j < list.length; j++) {
      var target = String(list[j]).toLowerCase().replace(/[^a-z0-9]/g, '');
      for (var k = 0; k < keys.length; k++) {
        if (keys[k].toLowerCase().replace(/[^a-z0-9]/g, '') === target && row[keys[k]] !== '') {
          return row[keys[k]];
        }
      }
    }
    return '';
  }

  function truthy(v) {
    return v === true || v === 'True' || v === 'true' || v === 1 || v === '1';
  }

  function numVal(v) {
    if (v === '' || v == null) return null;
    var n = parseFloat(String(v));
    return isNaN(n) ? null : n;
  }

  function normalizeSignalRow(row, idx) {
    var away = String(pickCol(row, ['away', 'Away'])).trim().toUpperCase();
    var home = String(pickCol(row, ['home', 'Home'])).trim().toUpperCase();
    var gameKey = away && home ? away + '@' + home : '';
    var gameLabel = pickCol(row, ['game_id', 'game']) || (away && home ? away + ' @ ' + home : '—');
    var betAngle = String(pickCol(row, ['bet_angle', 'bet angle', 'Bet_Angle'])).toLowerCase();
    return {
      raw: row,
      idx: idx,
      away: away,
      home: home,
      gameKey: gameKey,
      gameLabel: gameLabel,
      side: pickCol(row, ['side', 'Side']),
      signalName: pickCol(row, ['signal_name', 'signal', 'Signal']),
      fired: truthy(pickCol(row, ['fired', 'Fired'])),
      direction: pickCol(row, ['direction', 'Direction']),
      magnitude: numVal(pickCol(row, ['magnitude', 'Magnitude'])),
      betAngle: betAngle,
      verdict: pickCol(row, ['verdict_text', 'verdict', 'Verdict'])
    };
  }

  function isConvergencePlay(row) {
    if (truthy(pickCol(row, ['is_convergence_play', 'Is_Convergence_Play']))) return true;
    var w = numVal(pickCol(row, ['convergence_count', 'convergence_count', 'weighted', 'Weighted']));
    return w != null && w >= 4;
  }

  function normalizeConvergenceRow(row) {
    var away = String(pickCol(row, ['away', 'Away'])).trim().toUpperCase();
    var home = String(pickCol(row, ['home', 'Home'])).trim().toUpperCase();
    return {
      raw: row,
      away: away,
      home: home,
      gameKey: away && home ? away + '@' + home : '',
      gameLabel: away && home ? away + ' @ ' + home : pickCol(row, ['game_id', 'Game']),
      side: pickCol(row, ['side', 'Side']),
      weighted: pickCol(row, ['convergence_count', 'convergence_count', 'weighted', 'Weighted']),
      direction: pickCol(row, ['convergence_direction', 'convergence_direction', 'Direction']),
      firedCount: pickCol(row, ['signals_fired', 'signals_fired', 'Signals_Fired']),
      play: isConvergencePlay(row)
    };
  }

  function directionClass(dir) {
    var d = String(dir || '').toLowerCase();
    if (d.indexOf('over') >= 0) return 'dir-over';
    if (d.indexOf('under') >= 0) return 'dir-under';
    if (d === 'away') return 'dir-away';
    if (d === 'home') return 'dir-home';
    return 'dir-neutral';
  }

  function applySignalFilters(rows, filters) {
    filters = filters || {};
    return rows.filter(function(r) {
      if (filters.firedOnly && !r.fired) return false;
      if (filters.gameKey && r.gameKey !== filters.gameKey) return false;
      if (filters.side && String(r.side).toLowerCase() !== filters.side) return false;
      if (filters.f5Only && r.betAngle.indexOf('f5') < 0 && r.betAngle.indexOf('first') < 0) return false;
      if (filters.minMag && (r.magnitude == null || r.magnitude < filters.minMag)) return false;
      return true;
    });
  }

  function renderSignalsToday(rows, opts) {
    var el = document.getElementById('signalsTodayPanel');
    if (!el) return;
    opts = opts || {};
    rows = (rows || []).map(normalizeSignalRow);
    if (opts.filters) rows = applySignalFilters(rows, opts.filters);

    if (!rows.length) {
      var LD0 = global.LIVE_DATA || {};
      var hasSheet = (LD0.signalsToday || []).length > 0;
      if (hasSheet && opts.filters) {
        el.innerHTML = '<div class="mr-empty">No signals match the current filters. '
          + '<button type="button" class="mr-pill" id="mrClearFiltersBtn">Clear filters</button></div>';
        var clr = document.getElementById('mrClearFiltersBtn');
        if (clr && global.ModelReport) {
          clr.addEventListener('click', function() {
            var st = ModelReport.getState();
            if (st) {
              st.filters.firedOnly = false;
              st.filters.f5Only = false;
              st.filters.side = '';
              st.filters.gameKey = '';
            }
            document.querySelectorAll('.mr-pill.active').forEach(function(p) { p.classList.remove('active'); });
            ModelReport.setGameFilter('');
          });
        }
      } else {
        el.innerHTML = '<div class="mr-empty">No rows in Signals_Today — run pipeline signal compute (<code>compute_signals</code>).</div>';
      }
      return;
    }

    var total = (global.LIVE_DATA && LIVE_DATA.signalsToday) ? LIVE_DATA.signalsToday.length : rows.length;
    var firedN = rows.filter(function(r) { return r.fired; }).length;
    var ctxFn = opts.matchupContextHtml;

    el.innerHTML = '<div class="mr-board-meta">Showing ' + rows.length + ' of ' + total + ' evaluated · ' + firedN + ' fired in view</div>'
      + '<div class="mr-table-wrap"><table class="mr-table"><thead><tr>'
      + '<th>Game</th><th>Side</th><th>Signal</th><th>Fired</th><th>Dir</th><th class="num">Mag</th>'
      + '<th class="mr-hide-sm">Bet angle</th><th>Verdict</th>'
      + '</tr></thead><tbody>'
      + rows.map(function(r) {
        var compareHref = opts.compareUrl && r.away && r.home
          ? opts.compareUrl(r.away, r.home)
          : 'matchup_compare.html?away=' + encodeURIComponent(r.away) + '&home=' + encodeURIComponent(r.home);
        var gameCell = r.away && r.home
          ? '<a href="' + esc(compareHref) + '" class="mr-game-link">' + esc(r.gameLabel) + '</a>'
          + (ctxFn && r.gameKey ? ctxFn(r.gameKey) : '')
          : esc(r.gameLabel);
        var hl = opts.highlightSignalIdx === r.idx ? ' mr-row-highlight' : '';
        var fr = r.fired ? ' mr-row-fired' : '';
        return '<tr id="signal-row-' + r.idx + '" class="' + fr + hl + '">'
          + '<td>' + gameCell + '</td>'
          + '<td>' + esc(r.side) + '</td>'
          + '<td>' + esc(r.signalName) + '</td>'
          + '<td>' + (r.fired ? '<span class="val-badge val-confirmed">Yes</span>' : '—') + '</td>'
          + '<td class="' + directionClass(r.direction) + '">' + esc(r.direction) + '</td>'
          + '<td class="num">' + (r.magnitude != null ? r.magnitude.toFixed(2) : '—') + '</td>'
          + '<td class="mr-hide-sm">' + esc(r.betAngle || '—') + '</td>'
          + '<td style="max-width:300px;white-space:normal;line-height:1.4;">' + esc(r.verdict) + '</td>'
          + '</tr>';
      }).join('')
      + '</tbody></table></div>';
  }

  function renderConvergenceCards(rows, opts) {
    var mount = document.getElementById('convergenceCards');
    if (!mount) return;
    opts = opts || {};
    rows = (rows || []).map(normalizeConvergenceRow);
    if (opts.filters && opts.filters.gameKey) {
      rows = rows.filter(function(r) { return r.gameKey === opts.filters.gameKey; });
    }
    if (!rows.length) {
      mount.innerHTML = '';
      return;
    }
    mount.innerHTML = '<div class="mr-conv-grid">'
      + rows.map(function(r) {
        var active = opts.filters && opts.filters.gameKey === r.gameKey ? ' active' : '';
        return '<div class="mr-conv-card' + (r.play ? ' play' : '') + active + '" data-game-key="' + esc(r.gameKey) + '" role="button" tabindex="0">'
          + '<div class="mr-conv-game">' + esc(r.gameLabel) + '</div>'
          + '<div class="mr-conv-side">Side: <strong>' + esc(r.side) + '</strong> · '
          + '<span class="mr-play-badge ' + (r.play ? 'yes' : 'no') + '">' + (r.play ? 'PLAY' : 'Pass') + '</span></div>'
          + '<div class="mr-conv-metrics">'
          + '<span>Weighted <strong>' + esc(String(r.weighted)) + '</strong></span>'
          + '<span>Fired <strong>' + esc(String(r.firedCount)) + '</strong></span>'
          + '<span class="' + directionClass(r.direction) + '">' + esc(r.direction) + '</span>'
          + '</div></div>';
      }).join('')
      + '</div>';

    mount.querySelectorAll('.mr-conv-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var gk = card.getAttribute('data-game-key');
        if (global.ModelReport && ModelReport.setGameFilter) ModelReport.setGameFilter(gk);
      });
    });
  }

  function renderConvergenceGrid(rows, opts) {
    var el = document.getElementById('convergenceGrid');
    if (!el) return;
    opts = opts || {};
    rows = (rows || []).map(normalizeConvergenceRow);
    if (opts.filters && opts.filters.gameKey) {
      rows = rows.filter(function(r) { return r.gameKey === opts.filters.gameKey; });
    }
    if (!rows.length) {
      el.innerHTML = '<div class="mr-empty">No rows in Signals_Convergence — run pipeline signal compute.</div>';
      return;
    }
    el.innerHTML = '<div class="mr-table-wrap"><table class="mr-table"><thead><tr>'
      + '<th>Game</th><th>Side</th><th class="num">Weighted</th><th>Direction</th><th class="num">Fired</th><th>Play?</th>'
      + '</tr></thead><tbody>'
      + rows.map(function(r) {
        var compareHref = 'matchup_compare.html?away=' + encodeURIComponent(r.away) + '&home=' + encodeURIComponent(r.home);
        return '<tr>'
          + '<td><a href="' + esc(compareHref) + '" class="mr-game-link">' + esc(r.gameLabel) + '</a></td>'
          + '<td>' + esc(r.side) + '</td>'
          + '<td class="num">' + esc(String(r.weighted)) + '</td>'
          + '<td class="' + directionClass(r.direction) + '">' + esc(r.direction) + '</td>'
          + '<td class="num">' + esc(String(r.firedCount)) + '</td>'
          + '<td><span class="mr-play-badge ' + (r.play ? 'yes' : 'no') + '">' + (r.play ? 'PLAY' : 'Pass') + '</span></td>'
          + '</tr>';
      }).join('')
      + '</tbody></table></div>';
  }

  function renderExplorer(opts) {
    opts = opts || {};
    var LD = global.LIVE_DATA || {};
    var today = (LD.signalsToday || []).map(normalizeSignalRow);
    var filtered = opts.filters ? applySignalFilters(today, opts.filters) : today;

    renderSignalsToday(filtered, opts);
    renderConvergenceCards(LD.signalsConvergence, opts);
    renderConvergenceGrid(LD.signalsConvergence, opts);

    if (typeof renderStrats === 'function' && document.getElementById('stratsSignals')) {
      renderStrats();
    }
  }

  global.MLBMASignals = {
    esc: esc,
    pickCol: pickCol,
    truthy: truthy,
    normalizeSignalRow: normalizeSignalRow,
    normalizeConvergenceRow: normalizeConvergenceRow,
    isConvergencePlay: isConvergencePlay,
    applySignalFilters: applySignalFilters,
    directionClass: directionClass,
    renderExplorer: renderExplorer,
    renderSignalsToday: renderSignalsToday,
    renderConvergenceGrid: renderConvergenceGrid,
    renderConvergenceCards: renderConvergenceCards
  };
})(typeof window !== 'undefined' ? window : this);
