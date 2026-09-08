(function (global) {
  'use strict';
  function render(el, opts) {
    opts = opts || {};
    var controls = opts.controls || [];
    var summary = opts.summary || '';
    el.className = 'ca-scopebar';
    el.innerHTML =
      '<details class="ca-scopebar-mobile"><summary>Filters' +
      (opts.count ? ' (' + opts.count + ')' : '') + '</summary></details>' +
      '<form class="ca-scopebar-form" method="get">' +
      controls.join('') +
      '<p class="ca-scopebar-summary">' + summary + '</p></form>';
  }
  global.ChaseScopeBar = { render: render };
})(window);
