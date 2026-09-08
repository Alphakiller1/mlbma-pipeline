/**
 * MetricValue — delegates to MLBMAAssets. Never a second grading path.
 */
(function (global) {
  'use strict';
  function html(value, ctx, unit) {
    var A = global.MLBMAAssets;
    var dash = '<span class="ca-metric-absent" title="unavailable">—</span>';
    if (value == null || value === '' || (typeof value === 'number' && !isFinite(value))) {
      return dash + (unit ? '<span class="ca-metric-unit">' + unit + '</span>' : '');
    }
    var chip = A && A.valChipHtml ? A.valChipHtml(value, ctx) : String(value);
    return '<span class="ca-metric-value">' + chip +
      (unit ? ' <span class="ca-metric-unit">' + unit + '</span>' : '') + '</span>';
  }
  global.ChaseMetric = { html: html };
})(window);
