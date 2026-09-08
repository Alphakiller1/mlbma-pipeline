/**
 * EntityIdentity — stable id, sport, readable name, approved image, honest fallback.
 * Never paints a blank as if it were a logo.
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

  function initials(name) {
    var raw = String(name || '').replace(/[^A-Za-z0-9]/g, '');
    return (raw.slice(0, 3) || '—').toUpperCase();
  }

  function html(ent) {
    ent = ent || {};
    var name = ent.name || '—';
    var id = ent.id || '';
    var sport = ent.sport || '';
    var src = ent.image ? String(ent.image) : '';
    var mark = initials(name);
    var img = src
      ? '<img src="' + esc(src) + '" alt="" width="32" height="32" onerror="this.hidden=true;if(this.nextElementSibling)this.nextElementSibling.hidden=false">'
      : '';
    var fallbackHidden = src ? ' hidden' : '';
    return '<span class="ca-entity" data-sport="' + esc(sport) + '" data-id="' + esc(id) + '">' +
      img +
      '<span class="ca-entity-fallback"' + fallbackHidden + ' aria-hidden="true">' + esc(mark) + '</span>' +
      '<span class="ca-entity-name">' + esc(name) + '</span></span>';
  }

  global.ChaseEntity = { html: html };
})(typeof window !== 'undefined' ? window : this);
