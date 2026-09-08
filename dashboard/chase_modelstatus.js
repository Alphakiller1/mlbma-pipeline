/**
 * ModelStatus — authority is a persistent text badge, never a colour chip.
 * Presentation cannot upgrade may_bet.
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function render(el, rec) {
    if (!el) return;
    rec = rec || {};
    var authority = rec.authority;
    var gates = rec.unmet_gates || [];
    var evidence = rec.evidence || '';
    if (authority && typeof authority === 'object') {
      gates = gates.length ? gates : (authority.unmet_gates || []);
      evidence = evidence || authority.evidence || '';
      authority = authority.level || authority.authority || 'unknown';
    }
    authority = authority || 'unknown';
    var mayBet = rec.may_bet === true;
    el.className = ((el.className || '').replace(/\bca-modelstatus\b/g, '').trim() + ' ca-modelstatus').trim();
    var gateHtml = gates.length
      ? '<p class="ca-modelstatus-gates">Unmet gates: ' + esc(gates.join('; ')) + '</p>'
      : '';
    var evHtml = '';
    if (evidence) {
      var ev = String(evidence);
      if (/^https?:\/\//i.test(ev)) {
        evHtml = '<p class="ca-modelstatus-evidence"><a href="' + esc(ev) + '">Evidence</a></p>';
      } else {
        evHtml = '<p class="ca-modelstatus-evidence">' + esc(ev) + '</p>';
      }
    }
    el.innerHTML =
      '<p class="ca-modelstatus-badge"><strong>Authority:</strong> ' + esc(authority) +
      ' · <strong>may_bet:</strong> ' + (mayBet ? 'true' : 'false') + '</p>' +
      gateHtml + evHtml;
  }

  global.ChaseModelStatus = { render: render };
})(typeof window !== 'undefined' ? window : this);
