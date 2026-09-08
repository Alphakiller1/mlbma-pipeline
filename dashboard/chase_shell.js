(function (global) {
  'use strict';
  function mount(opts) {
    opts = opts || {};
    var header = document.getElementById('chaseHeader');
    if (!header) return;
    var slot = header.querySelector('#caDataStatusSlot');
    if (!slot) {
      slot = document.createElement('div');
      slot.id = 'caDataStatusSlot';
      var status = header.querySelector('.chase-status');
      if (status) status.insertBefore(slot, status.firstChild);
    }
    return slot;
  }
  global.ChaseShell = { mount: mount };
})(window);
