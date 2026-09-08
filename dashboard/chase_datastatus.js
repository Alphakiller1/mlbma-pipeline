/**
 * DataStatus — four distinct timestamps, aged at view time.
 * Replaces competing Last_Updated clocks. A failed fetch must NEVER look fresh.
 */
(function (global) {
  'use strict';

  function parseTs(raw) {
    if (raw == null || raw === '') return null;
    var t = Date.parse(String(raw));
    if (!isFinite(t)) return null;
    return t;
  }

  function fmtAge(ms, now) {
    if (ms == null) return 'unknown';
    if (ms > now + 120000) return 'unknown (future timestamp)';
    var sec = Math.max(0, Math.round((now - ms) / 1000));
    if (sec < 90) return sec + 's ago';
    if (sec < 5400) return Math.round(sec / 60) + 'm ago';
    if (sec < 172800) return (sec / 3600).toFixed(1) + 'h ago';
    return Math.round(sec / 86400) + 'd ago';
  }

  function render(el, fields) {
    if (!el) return;
    fields = fields || {};
    var now = Date.now();
    var cutoff = parseTs(fields.dataCutoff);
    var quote = parseTs(fields.quoteTimestamp);
    var published = parseTs(fields.publishedAt);
    var displaySrc = published != null ? published : cutoff;
    var state = fields.state || (displaySrc == null ? 'unknown' : 'unknown');
    var issues = fields.issues || [];
    el.className = (el.className || '').replace(/\bca-datastatus\b/, '') + ' ca-datastatus';
    el.setAttribute('data-state', state);
    var age = fmtAge(displaySrc, now);
    var issueHtml = issues.length
      ? '<ul class="ca-datastatus-issues">' + issues.map(function (i) {
          return '<li>' + String(i).replace(/[<>]/g, '') + '</li>';
        }).join('') + '</ul>'
      : '';
    el.innerHTML =
      '<span class="ca-datastatus-dot" aria-hidden="true"></span>' +
      '<span class="ca-datastatus-age">Display age: ' + age + '</span>' +
      '<span class="ca-datastatus-meta">Cutoff: ' + fmtAge(cutoff, now) +
      ' · Quote: ' + fmtAge(quote, now) +
      ' · Published: ' + fmtAge(published, now) + '</span>' +
      issueHtml;
  }

  function bindResume(el, fieldsFn) {
    function tick() { render(el, fieldsFn()); }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') tick();
    });
    window.addEventListener('focus', tick);
    tick();
    return tick;
  }

  global.ChaseDataStatus = { parseTs: parseTs, fmtAge: fmtAge, render: render, bindResume: bindResume };
})(window);
