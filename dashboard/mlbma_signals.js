/**
 * Signal Explorer — Signals_Today + Signals_Convergence tables.
 */
(function(global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function pickCol(row, names) {
    if (!row) return '';
    for (var i = 0; i < names.length; i++) {
      if (row[names[i]] !== undefined && row[names[i]] !== '') return row[names[i]];
    }
    var keys = Object.keys(row);
    for (var j = 0; j < names.length; j++) {
      var target = String(names[j]).toLowerCase();
      for (var k = 0; k < keys.length; k++) {
        if (keys[k].toLowerCase() === target && row[keys[k]] !== '') return row[keys[k]];
      }
    }
    return '';
  }

  function truthy(v) {
    return v === true || v === 'True' || v === 'true' || v === 1 || v === '1';
  }

  function renderSignalsToday(rows) {
    var el = document.getElementById('signalsTodayPanel');
    if (!el) return;
    rows = rows || [];
    if (!rows.length) {
      el.innerHTML = '<div class="empty-msg">No rows in Signals_Today — run pipeline signal compute (compute_signals).</div>';
      return;
    }
    var fired = rows.filter(function(r) { return truthy(pickCol(r, ['fired', 'Fired'])); });
    el.innerHTML = '<div class="section-title" style="font-size:13px;margin-bottom:10px;">Today\'s Signals (' +
      fired.length + ' fired / ' + rows.length + ' evaluated)</div>' +
      '<div class="table-wrap"><table><thead><tr>' +
      '<th>Game</th><th>Side</th><th>Signal</th><th>Fired</th><th>Dir</th><th>Mag</th><th>Bet angle</th><th>Verdict</th>' +
      '</tr></thead><tbody>' +
      rows.map(function(r) {
        var away = pickCol(r, ['away', 'Away']);
        var home = pickCol(r, ['home', 'Home']);
        var game = pickCol(r, ['game_id', 'game']) || (away && home ? away + ' @ ' + home : '—');
        var firedRow = truthy(pickCol(r, ['fired', 'Fired']));
        return '<tr' + (firedRow ? ' class="flag-row"' : '') + '>' +
          '<td>' + esc(game) + '</td>' +
          '<td>' + esc(pickCol(r, ['side', 'Side'])) + '</td>' +
          '<td>' + esc(pickCol(r, ['signal_name', 'signal'])) + '</td>' +
          '<td>' + (firedRow ? '<span class="val-badge val-confirmed">Yes</span>' : '—') + '</td>' +
          '<td>' + esc(pickCol(r, ['direction', 'Direction'])) + '</td>' +
          '<td class="num">' + esc(pickCol(r, ['magnitude', 'Magnitude'])) + '</td>' +
          '<td>' + esc(pickCol(r, ['bet_angle', 'bet angle'])) + '</td>' +
          '<td style="max-width:280px;white-space:normal;">' + esc(pickCol(r, ['verdict_text', 'verdict'])) + '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function renderConvergenceGrid(rows) {
    var el = document.getElementById('convergenceGrid');
    if (!el) return;
    rows = rows || [];
    if (!rows.length) {
      el.innerHTML = '<div class="empty-msg">No rows in Signals_Convergence — run pipeline signal compute.</div>';
      return;
    }
    el.innerHTML = '<div class="section-title" style="font-size:13px;margin-bottom:10px;">Convergence by game side</div>' +
      '<div class="table-wrap"><table><thead><tr>' +
      '<th>Game</th><th>Side</th><th>Weighted</th><th>Direction</th><th>Fired</th><th>Play?</th>' +
      '</tr></thead><tbody>' +
      rows.map(function(r) {
        var away = pickCol(r, ['away', 'Away']);
        var home = pickCol(r, ['home', 'Home']);
        var game = away && home ? away + ' @ ' + home : pickCol(r, ['game_id']);
        var play = truthy(pickCol(r, ['is_convergence_play', 'is_convergence_play'])) ||
          (parseFloat(pickCol(r, ['convergence_count', 'convergence_count'])) >= 4);
        var w = pickCol(r, ['convergence_count', 'convergence_count', 'weighted', 'Weighted']);
        return '<tr>' +
          '<td>' + esc(game) + '</td>' +
          '<td>' + esc(pickCol(r, ['side', 'Side'])) + '</td>' +
          '<td class="num">' + esc(w) + '</td>' +
          '<td>' + esc(pickCol(r, ['convergence_direction', 'convergence_direction'])) + '</td>' +
          '<td class="num">' + esc(pickCol(r, ['signals_fired', 'signals_fired'])) + '</td>' +
          '<td><span class="val-badge ' + (play ? 'val-confirmed' : 'val-neutral') + '">' +
          (play ? 'PLAY' : 'Pass') + '</span></td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function renderExplorer() {
    var LD = global.LIVE_DATA || {};
    renderSignalsToday(LD.signalsToday);
    renderConvergenceGrid(LD.signalsConvergence);
    if (typeof renderStrats === 'function') renderStrats();
  }

  global.MLBMASignals = {
    renderExplorer: renderExplorer,
    renderSignalsToday: renderSignalsToday,
    renderConvergenceGrid: renderConvergenceGrid
  };
})(typeof window !== 'undefined' ? window : this);
