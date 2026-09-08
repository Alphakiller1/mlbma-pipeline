/**
 * MetricValue — delegates to MLBMAAssets. Never a second grading path.
 * Absent → em-dash with a reason. Unit label always travels with the number.
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function html(value, ctx, unit) {
    var A = global.MLBMAAssets;
    var reason = arguments.length > 3 && arguments[3] ? String(arguments[3]) : 'unavailable';
    var unitHtml = unit ? ' <span class="ca-metric-unit">' + esc(unit) + '</span>' : '';
    if (value == null || value === '' || (typeof value === 'number' && !isFinite(value))) {
      return '<span class="ca-metric-absent" title="' + esc(reason) + '">—</span>' + unitHtml;
    }
    var chip = A && A.valChipHtml ? A.valChipHtml(value, ctx) : esc(value);
    return '<span class="ca-metric-value">' + chip + unitHtml + '</span>';
  }

  global.ChaseMetric = { html: html };
})(typeof window !== 'undefined' ? window : this);
