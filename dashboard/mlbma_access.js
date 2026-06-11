/**
 * mlbma_access.js — Phase 4 scaffold for tiered content access. NOT YET ENFORCED.
 *
 * Centralizes the (eventual) classification of dashboard content into tiers and a single
 * canAccess() check, so Phase 5 can gate premium data in ONE place instead of scattering
 * checks. Today everything resolves to FREE and nothing is blocked — hub_dataset stays
 * public and the public fallback is untouched.
 *
 * Phase 5 wiring: populate PREMIUM_TABS / ADMIN_TABS, then enforce in the data-loading path
 * (matchup_shared.js) AND in hub_dataset RLS. See docs/BILLING_DISCORD_ROLES.md.
 */
(function (global) {
  'use strict';

  var TIERS = { FREE: 'free', PREMIUM: 'premium', ADMIN: 'admin' };

  // hub_dataset tab → tier. Default FREE. Examples (left empty/commented so nothing gates yet):
  //   PREMIUM_TABS = { Signals_Today: true, Signals_Convergence: true };
  var PREMIUM_TABS = {};
  var ADMIN_TABS = {};

  function tierOf(tabName) {
    var t = String(tabName || '');
    if (ADMIN_TABS[t]) return TIERS.ADMIN;
    if (PREMIUM_TABS[t]) return TIERS.PREMIUM;
    return TIERS.FREE;
  }

  function isPaid(profile) { return !!(profile && profile.subscription_status === 'active'); }
  function isAdmin(profile) { return !!(profile && profile.role === 'admin'); }

  // Can a user with `profile` (null = signed out) access content of `tier`?
  function canAccess(tier, profile) {
    if (tier === TIERS.ADMIN) return isAdmin(profile);
    if (tier === TIERS.PREMIUM) return isPaid(profile) || isAdmin(profile);
    return true; // FREE
  }

  // Convenience: can this profile access this tab? (Always true today — nothing premium yet.)
  function canAccessTab(tabName, profile) { return canAccess(tierOf(tabName), profile); }

  global.MLBMA_ACCESS = {
    TIERS: TIERS,
    tierOf: tierOf,
    isPaid: isPaid,
    isAdmin: isAdmin,
    canAccess: canAccess,
    canAccessTab: canAccessTab,
    _premiumTabs: PREMIUM_TABS, // Phase 5 wiring points
    _adminTabs: ADMIN_TABS
  };
})(window);
