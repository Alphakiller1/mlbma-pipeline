(function (global) {
  'use strict';
  function html(ent) {
    ent = ent || {};
    var name = ent.name || '—';
    var src = ent.image || '';
    var fallback = ent.fallback || '';
    var img = src
      ? '<img src="' + src + '" alt="" width="32" height="32" onerror="this.onerror=null;this.src=\'' + fallback + '\';">'
      : '';
    return '<span class="ca-entity" data-sport="' + (ent.sport || '') + '" data-id="' + (ent.id || '') + '">' +
      img + '<span class="ca-entity-name">' + name + '</span></span>';
  }
  global.ChaseEntity = { html: html };
})(window);
