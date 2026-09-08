/** Regression guard: two failed primary reads open a session breaker; Sheets stays next. */
const fs = require('fs');
const vm = require('vm');

const store = {};
const storage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
  get length() { return Object.keys(store).length; },
  key: i => Object.keys(store)[i],
};
let primaryCalls = 0;
let sheetCalls = 0;
const ctx = {
  console, setTimeout, clearTimeout, Promise, JSON, Math, RegExp, Error, String, Number,
  Array, Object, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, Date,
  sessionStorage: storage, localStorage: storage,
  AbortController: class { constructor() { this.signal = {}; } abort() {} },
  document: { addEventListener() {}, querySelectorAll: () => [], getElementById: () => null },
  location: { pathname: '/dashboard/matchup_compare.html', search: '', hostname: 'example.test' },
  navigator: { userAgent: 'node' }, requestIdleCallback: null,
  MLBMA_CONFIG: {
    SHEET_ID: 'SID',
    SHEET_TABS: {},
    SUPABASE: { enabled: true, url: 'https://primary.test', publishable_key: 'public', table: 'hub_dataset', tabs: ['Team_Profiles'] },
  },
  fetch: async url => {
    if (String(url).startsWith('https://primary.test')) {
      primaryCalls++;
      throw new Error('primary wedged');
    }
    sheetCalls++;
    return { ok: true, text: async () => 'Team,OSI\nNYY,100\n' };
  },
};
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('dashboard/matchup_shared.js', 'utf8'), ctx);

(async () => {
  for (let i = 0; i < 3; i++) {
    await ctx.MLBMASharedMatchup.fetchSheetTab('Team_Profiles', { forceRefresh: true });
  }
  const breaker = JSON.parse(store.mlbma_supabase_breaker_v1 || '{}');
  const ok = primaryCalls === 2 && sheetCalls === 3 && breaker.open === true;
  console.log(`${ok ? 'PASS' : 'FAIL'} primary=${primaryCalls} sheets=${sheetCalls} breaker=${JSON.stringify(breaker)}`);
  process.exit(ok ? 0 : 1);
})().catch(err => { console.error(err); process.exit(1); });
