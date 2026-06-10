/**
 * mobile_cardify.js — turns dense desktop data tables into stacked "stat cards"
 * on phones. This script does NO layout: it only stamps each <td> with its column
 * label (data-label) and marks the team/rank header cell. All the card rendering
 * lives in responsive.css under `@media (max-width:767px)` (.ca-cardified rules),
 * so the DOM stays identical on desktop and this is safe to run at any viewport.
 *
 * Targets: .lv-table (Team Rankings), .thm-table (Trends Heat Map), and any table
 * opted-in with class .ca-cardify. Idempotent + re-stamps on re-render (tables
 * rebuild when filters/sort/metric change), so it self-heals.
 */
(function () {
  'use strict';

  var SEL = '.lv-table, .thm-table, table.ca-cardify';

  function cleanLabel(s) {
    // strip sort-arrow glyphs and collapse whitespace
    return (s || '').replace(/[↓↑▼▲]/g, '').replace(/\s+/g, ' ').trim();
  }

  function cardify(table) {
    if (!table || table.tagName !== 'TABLE') return;
    var heads = table.querySelectorAll('thead th, thead td');
    if (!heads.length) return;

    var labels = [];
    for (var i = 0; i < heads.length; i++) labels.push(cleanLabel(heads[i].textContent));

    var rows = table.querySelectorAll('tbody tr');
    for (var r = 0; r < rows.length; r++) {
      var tr = rows[r];
      var cells = tr.children;
      for (var c = 0; c < cells.length; c++) {
        if (labels[c]) cells[c].setAttribute('data-label', labels[c]);
      }
      // The team cell is the card header. Rankings uses .lv-team-cell, Trends uses
      // .thm-team — both carry .team-cell-bold. Fall back to first cell.
      var teamHost = tr.querySelector('.team-cell-bold');
      var teamTd = teamHost ? teamHost.closest('td') : (cells[0] || null);
      if (teamTd) {
        teamTd.classList.add('ca-card-team');
        var rankTd = tr.querySelector('.lv-rank-num');
        if (rankTd) {
          teamTd.setAttribute('data-cardrank', cleanLabel(rankTd.textContent));
          rankTd.classList.add('ca-card-rank');
        }
      }
    }
    table.classList.add('ca-cardified');
  }

  function run(root) {
    var scope = (root && root.querySelectorAll) ? root : document;
    var tables = scope.querySelectorAll(SEL);
    for (var i = 0; i < tables.length; i++) cardify(tables[i]);
    if (root && root.matches && root.matches(SEL)) cardify(root);
  }

  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    var raf = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
    raf(function () { scheduled = false; run(document); });
  }

  function init() {
    run(document);
    // Tables re-render (innerHTML swap) on filter / sort / metric changes. Watch for
    // newly inserted nodes and re-stamp. We only set attributes/classes (never insert
    // nodes), so this cannot feed back into the observer.
    if (window.MutationObserver && document.body) {
      var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          if (muts[i].addedNodes && muts[i].addedNodes.length) { schedule(); return; }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.MLBMACardify = { run: run, cardify: cardify };
})();
