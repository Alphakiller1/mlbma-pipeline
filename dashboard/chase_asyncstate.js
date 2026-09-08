/**
 * AsyncState — loading / empty / stale / error / unsupported / partial.
 * Copy is labelled; never a blank that looks like a complete slate.
 */
(function (global) {
  'use strict';

  var COPY = {
    loading: 'Loading…',
    empty: 'Nothing to show.',
    stale: 'This view is stale.',
    error: 'Could not load this view.',
    unsupported: 'This sport does not publish that surface.',
    partial: 'Partial coverage — some fields are unavailable.'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function render(el, kind, detail) {
    if (!el) return;
    kind = COPY[kind] ? kind : 'error';
    el.className = 'ca-async ca-async--' + kind;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', kind === 'loading' ? 'polite' : 'assertive');
    el.setAttribute('data-state', kind);
    var extra = detail ? ' ' + esc(detail) : '';
    el.innerHTML = '<p>' + COPY[kind] + extra + '</p>';
  }

  /**
   * Hand the region back to real content.
   *
   * render() owns innerHTML, so a route that writes its own markup into the
   * same element leaves data-state pinned at whatever was set last - in
   * practice 'loading', over a fully rendered board. Two costs: the container
   * keeps role="status" aria-live, so assistive tech treats an entire slate as
   * a status announcement; and a genuine hang becomes indistinguishable from
   * success for CSS, tests and monitoring. Call this immediately after writing
   * content.
   */
  function ready(el) {
    if (!el) return;
    el.className = 'ca-async ca-async--ready';
    el.removeAttribute('role');
    el.removeAttribute('aria-live');
    el.setAttribute('data-state', 'ready');
  }

  global.ChaseAsyncState = { render: render, ready: ready, kinds: Object.keys(COPY) };
})(typeof window !== 'undefined' ? window : this);
