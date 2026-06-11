/**
 * chase_links.js — THE single source of truth for outbound Chase Analytics links.
 *
 * Update a URL HERE, never inline in components. Loaded before mlbma_auth_ui.js so the
 * auth/CTA panel reads window.CHASE_LINKS (with safe fallbacks if this file is absent).
 *
 * Keep in sync with the Python side (core/config.py CHASE_ANALYTICS_DOMAIN) and the docs
 * (docs/LIVE_SITE_SETUP.md, docs/MARKETING_COPY_GUIDE.md).
 */
window.CHASE_LINKS = {
  DOMAIN: 'https://chase-analytics.com',
  DISCORD_INVITE: 'https://discord.gg/Fb3fHrqK',
  PATREON: 'https://www.patreon.com/ChaseAnalytics',
  // Signup/login currently live in the on-page account panel (the [data-mlbma-auth-panel]
  // section on the landing page), so these point at that anchor for now.
  SIGNUP: 'https://chase-analytics.com/#account',
  LOGIN: 'https://chase-analytics.com/#account'
};
