/**
 * mobile_cardify.js — mobile density enhancements for the dashboard. Two concerns,
 * both driven by responsive.css (`@media (max-width:767px)`); this script only sets
 * attributes/classes, never lays anything out, so desktop DOM/behaviour is untouched.
 *
 *  1. Table → stat-cards: stamps each <td> with its column label (data-label) and
 *     marks the team/rank header cell so wide tables become stacked cards on phones.
 *     Targets .lv-table (Team Rankings), .thm-table (Trends Heat Map), or any table
 *     opted-in with .ca-cardify. Idempotent + re-stamps on re-render (self-heals).
 *  2. Matchup lineup collapse: tapping a hero-matchup-card's "Projected lineups"
 *     label toggles .is-mobile-open so the two 9-man lineups collapse/expand.
 */
(function () {
  'use strict';

  // Tables to card-ify on phones. Each must be an "entity rows × metric columns"
  // table with a real <thead>. (Grouped pitch-mix spreadsheets are handled with a
  // sticky-column scroll in responsive.css instead — not listed here.)
  var SEL = [
    '.lv-table',                 // Team Rankings
    '.thm-table',                // Trends Heat Map
    '.tp-trend-table',           // rolling-trends (pitcher / team / bullpen profiles)
    '.pp-tier-split-table',      // tier splits (pitcher / bullpen)
    '.bp-reliever-rank-table',   // bullpen reliever ranks
    'table.ca-cardify'           // explicit opt-in
  ].join(', ');

  function cleanLabel(s) {
    // strip sort-arrow glyphs and collapse whitespace
    return (s || '').replace(/[↓↑▼▲]/g, '').replace(/\s+/g, ' ').trim();
  }

  // If a table has a grouped header (a row above the label row with colspan>1
  // cells), return a per-column array of group labels so repeated column names
  // stay unambiguous in card form. Returns null when there's no group row.
  function computeGroups(table) {
    var headRows = table.querySelectorAll('thead tr');
    if (headRows.length < 2) return null;
    var groupRow = null;
    for (var i = 0; i < headRows.length - 1 && !groupRow; i++) {
      var gc = headRows[i].children;
      for (var j = 0; j < gc.length; j++) {
        if ((gc[j].colSpan || 1) > 1) { groupRow = headRows[i]; break; }
      }
    }
    if (!groupRow) return null;
    var out = [];
    var cells = groupRow.children;
    for (var k = 0; k < cells.length; k++) {
      var span = cells[k].colSpan || 1;
      var lbl = cleanLabel(cells[k].textContent);
      for (var s = 0; s < span; s++) out.push(lbl || null);
    }
    return out;
  }

  function cardify(table) {
    if (!table || table.tagName !== 'TABLE') return;
    // Use the LAST header row for column labels (handles multi-row grouped headers).
    var headRow = table.querySelector('thead tr:last-child');
    if (!headRow || !headRow.children.length) return;
    var heads = headRow.children;
    var labels = [];
    for (var i = 0; i < heads.length; i++) labels.push(cleanLabel(heads[i].textContent));
    var groups = computeGroups(table);

    var rows = table.querySelectorAll('tbody tr');
    for (var r = 0; r < rows.length; r++) {
      var tr = rows[r];
      var cells = tr.children;
      // Header cell = the entity name. Rankings/Trends mark it .team-cell-bold;
      // otherwise the first cell (works for th[scope=row] metric tables too).
      var teamHost = tr.querySelector('.team-cell-bold');
      var headerCell = teamHost ? teamHost.closest('td,th') : cells[0];
      var rankCell = tr.querySelector('.lv-rank-num');
      for (var c = 0; c < cells.length; c++) {
        var cell = cells[c];
        if (cell === headerCell) {
          cell.classList.add('ca-card-team');
          if (rankCell && rankCell !== cell) {
            cell.setAttribute('data-cardrank', cleanLabel(rankCell.textContent));
          }
          continue;
        }
        if (cell === rankCell) { cell.classList.add('ca-card-rank'); continue; }
        cell.classList.add('ca-card-stat');
        var lbl = labels[c] || '';
        if (groups && groups[c]) lbl = groups[c] + ' · ' + lbl;
        if (lbl) cell.setAttribute('data-label', lbl);
      }
    }
    table.classList.add('ca-cardified');
    // If the table has sortable headers, expose them as tappable sort pills on
    // mobile (see responsive.css) rather than hiding the thead — taps reuse the
    // table's own existing sort handlers, so no new sort logic is needed.
    if (table.querySelector('thead th[data-a="sort"], thead th.lv-sortable, thead th.sortable')) {
      table.classList.add('ca-cardify-sortable');
    }
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

/* Matchup-card lineup collapse (mobile). Delegated so it covers cards rendered now
   or later. Capture phase is required: .hmc-lineups has an inline stopPropagation
   bubble handler, so a bubble-phase document listener would never fire. */
(function () {
  'use strict';
  document.addEventListener('click', function (e) {
    var label = e.target.closest && e.target.closest('.hmc-lineups--always .hmc-lineups-label');
    if (!label) return;
    var box = label.closest('.hmc-lineups');
    if (!box) return;
    var open = box.classList.toggle('is-mobile-open');
    label.setAttribute('aria-expanded', open ? 'true' : 'false');
  }, true);
})();
