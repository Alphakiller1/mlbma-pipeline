/**
 * ModelStatus — authority is a text badge, never a colour chip.
 * Presentation cannot upgrade may_bet.
 */
(function (global) {
  'use strict';

  function render(el, rec) {
    if (!el) return;
    rec = rec || {};
    var authority = rec.authority;
    if (authority && typeof authority === 'object') {
      authority = authority.level || JSON.stringify(authority);
    }
    authority = authority || 'unknown';
    var mayBet = rec.may_bet === true;
    var gates = rec.unmet_gates || (rec.authority && rec.authority.unmet_gates) || [];
    var evidence = rec.evidence || (rec.authority && rec.authority.evidence) || '';
    el.className = (el.className || '') + ' ca-modelstatus';
    el.innerHTML =
      '<p class="ca-modelstatus-badge"><strong>Authority:</strong> ' + String(authority) +
      ' · <strong>may_bet:</strong> ' + (mayBet ? 'true' : 'false') + '</p>' +
      (gates.length ? '<p class="ca-modelstatus-gates">Unmet gates: ' + gates.join('; ') + '</p>' : '') +
      (evidence ? '<p class="ca-modelstatus-evidence">' + String(evidence) + '</p>' : '');
  }

  global.ChaseModelStatus = { render: render };
})(window);
