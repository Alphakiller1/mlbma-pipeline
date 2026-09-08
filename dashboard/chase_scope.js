(function (global) {
  'use strict';

  function ensureStyles() {
    if (document.getElementById('chaseScopeBarStyles')) return;
    var style = document.createElement('style');
    style.id = 'chaseScopeBarStyles';
    style.textContent = ''
      + '.ca-scopebar{background:var(--bg-3);border:1.5px solid var(--border);border-radius:16px;padding:14px 16px 12px;margin:0}'
      + '.ca-scopebar-mobile{display:none}'
      + '.ca-scopebar-form{margin:0}'
      + '.ca-scopebar-row{display:flex;flex-wrap:wrap;gap:12px 16px;align-items:flex-end;margin-bottom:10px}'
      + '.ca-scopebar-row:last-of-type{margin-bottom:0}'
      + '.ca-scopebar-group{display:flex;flex-direction:column;gap:6px;min-width:0}'
      + '.ca-scopebar-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text-3)}'
      + '.ca-scopebar-pills{display:flex;flex-wrap:wrap;gap:8px}'
      + '.ca-scopebar-summary,.ca-scopebar-context{font-size:12px;color:var(--text-2);margin:10px 0 0;line-height:1.5}'
      + '.ca-scopebar-context strong{color:var(--text);font-variant-numeric:tabular-nums}'
      + '.ca-scopebar-confidence{font-size:11px;color:var(--text-3);margin:6px 0 0;line-height:1.45}'
      + '.ca-scopebar-status{margin:8px 0 0}'
      + '@media(max-width:767px){'
      + '.ca-scopebar-mobile{display:block;margin:0 0 8px}'
      + '.ca-scopebar-mobile summary{cursor:pointer;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text);list-style:none;min-height:44px;display:flex;align-items:center}'
      + '.ca-scopebar-mobile:not([open]) + .ca-scopebar-form{display:none}'
      + '}';
    document.head.appendChild(style);
  }

  function render(el, opts) {
    opts = opts || {};
    ensureStyles();
    var controls = opts.controls || [];
    var summary = opts.summary || '';
    var context = opts.context || '';
    var confidence = opts.confidence || '';
    var count = opts.count || 0;
    var dataStatus = opts.dataStatusHtml || '<div id="lvDataStatus" class="ca-datastatus" data-state="unknown"></div>';
    el.className = 'ca-scopebar';
    el.innerHTML =
      '<details class="ca-scopebar-mobile"' + (count ? ' open' : '') + '>' +
      '<summary>Filters' + (count ? ' (' + count + ')' : '') + '</summary></details>' +
      '<div class="ca-scopebar-form">' +
      controls.join('') +
      '<div class="ca-scopebar-status">' + dataStatus + '</div>' +
      (context ? '<p class="ca-scopebar-context">' + context + '</p>' : '') +
      (summary ? '<p class="ca-scopebar-summary">' + summary + '</p>' : '') +
      (confidence ? '<p class="ca-scopebar-confidence">' + confidence + '</p>' : '') +
      '</div>';
  }

  global.ChaseScopeBar = { render: render };
})(typeof window !== 'undefined' ? window : this);
