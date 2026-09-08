(function (global) {
  'use strict';
  function render(el, kind, detail) {
    if (!el) return;
    var copy = {
      loading: 'Loading…',
      empty: 'Nothing to show.',
      stale: 'This view is stale.',
      error: 'Could not load this view.',
      unsupported: 'This sport does not publish that surface.',
      partial: 'Partial coverage — some fields are unavailable.'
    };
    el.className = 'ca-async ca-async--' + kind;
    el.innerHTML = '<p>' + (copy[kind] || kind) + (detail ? ' ' + detail : '') + '</p>';
  }
  global.ChaseAsyncState = { render: render };
})(window);
