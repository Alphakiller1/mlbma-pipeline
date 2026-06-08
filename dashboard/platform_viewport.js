/**
 * MLBMA viewport tier helper — shared breakpoint contract.
 * CSS owns layout; this exposes tier state for components that must rerender.
 */
(function (global) {
  'use strict';

  var MOBILE_MAX = 767;
  var TABLET_MAX = 1099;
  var listeners = [];

  function width() {
    return global.innerWidth || document.documentElement.clientWidth || 0;
  }

  function tier() {
    var w = width();
    if (w <= MOBILE_MAX) return 'mobile';
    if (w <= TABLET_MAX) return 'tablet';
    return 'desktop';
  }

  function isMobile() { return tier() === 'mobile'; }
  function isTablet() { return tier() === 'tablet'; }
  function isDesktop() { return tier() === 'desktop'; }
  function isCompact() { return width() <= 479; }

  function applyDocumentState() {
    var t = tier();
    var root = document.documentElement;
    root.setAttribute('data-viewport', t);
    root.classList.toggle('is-mobile', t === 'mobile');
    root.classList.toggle('is-tablet', t === 'tablet');
    root.classList.toggle('is-desktop', t === 'desktop');
    root.classList.toggle('is-compact', isCompact());
  }

  function notify() {
    applyDocumentState();
    var current = tier();
    listeners.forEach(function(fn) {
      try { fn(current); } catch (e) { /* ignore */ }
    });
  }

  function onTierChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return function unsubscribe() {
      listeners = listeners.filter(function(f) { return f !== fn; });
    };
  }

  applyDocumentState();
  global.addEventListener('resize', notify, { passive: true });
  global.addEventListener('orientationchange', notify, { passive: true });

  global.MLBMAViewport = {
    tier: tier,
    isMobile: isMobile,
    isTablet: isTablet,
    isDesktop: isDesktop,
    isCompact: isCompact,
    onTierChange: onTierChange,
    MOBILE_MAX: MOBILE_MAX,
    TABLET_MAX: TABLET_MAX
  };
})(typeof window !== 'undefined' ? window : this);
