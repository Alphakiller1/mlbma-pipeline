// rl_tab_uix.js — Phase 0 compatibility shim.
(function() {
  'use strict';

  window.RLTabUIX = {
    init: function() {},
    onResearchSubtab: function() {},
    renderTrendHeatmap: function() {},
    renderSplitsTable: function() {},
    buildBlendedRows: function(rRows, lRows) {
      var shared = window.MLBMASharedMatchup;
      if (shared && shared.blendSplits) return shared.blendSplits(rRows || [], lRows || []);
      return [];
    }
  };
})();
