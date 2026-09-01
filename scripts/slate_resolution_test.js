/**
 * Regression guard for slate-day resolution in dashboard/matchup_shared.js.
 *
 * On 2026-08-31 at 20:19 ET the client's flat "past 17:00 ET" rollover had already moved
 * to the 09-01 slate while the pipeline - whose rule waits until every game on the card
 * has started - was still publishing 08-31 with three games yet to throw a pitch. Every
 * Today_* tab was rejected as the wrong day: the matchup hero silently fell back to the
 * bare MLB schedule, and pitcher_profile.html and bullpen_report.html failed outright
 * with "Could not load Google Sheets".
 *
 * These cases pin both halves of the fix: the client follows the day the pipeline says it
 * published, and an unpublished look-ahead degrades to the current card instead of
 * throwing - while a genuinely old snapshot is still refused, which is what the guard is
 * for in the first place.
 *
 * Run: node scripts/slate_resolution_test.js
 */
const fs = require('fs');
const vm = require('vm');

function makeCtx(nowIso, storedSlateDay) {
  const store = {};
  if (storedSlateDay) store['mlbma_slate_day'] = storedSlateDay;
  const sessionStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k,v) => { store[k]=String(v); },
    removeItem: k => { delete store[k]; },
    get length(){ return Object.keys(store).length; },
    key: i => Object.keys(store)[i],
  };
  const RealDate = Date;
  const FIXED = new RealDate(nowIso).getTime();
  function FakeDate(...a){ return a.length ? new RealDate(...a) : new RealDate(FIXED); }
  FakeDate.now = () => FIXED;
  FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC; FakeDate.prototype = RealDate.prototype;
  const ctx = {
    console, setTimeout, clearTimeout, Promise, JSON, Math, RegExp, Error, String, Number, Array, Object, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
    Date: FakeDate, sessionStorage, localStorage: sessionStorage,
    AbortController: class { constructor(){ this.signal={}; } abort(){} },
    document: { addEventListener(){}, querySelectorAll:()=>[], getElementById:()=>null, createElement:()=>({style:{},classList:{add(){},toggle(){}}}) },
    location: { pathname: '/dashboard/pitcher_profile.html', href:'' },
    navigator: { userAgent:'node' },
    requestIdleCallback: null,
    MLBMA_CONFIG: { SHEET_ID:'SID', SUPABASE:{ enabled:false }, SHEET_TABS:{ last_updated:'Last_Updated' } },
    fetch: null,
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  return ctx;
}

const SRC = fs.readFileSync('dashboard/matchup_shared.js','utf8');

async function run(label, nowIso, csvSlateDate, storedSlateDay, expect) {
  const ctx = makeCtx(nowIso, storedSlateDay);
  ctx.fetch = async (url) => ({
    ok:true,
    text: async () => 'Slate_Date,Away,Home\n' + csvSlateDate + ',SFG,ATL\n',
  });
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const S = ctx.MLBMASharedMatchup;
  let got, err=null;
  try { const rows = await S.fetchSheetTab('Today_Matchups'); got = rows.length ? rows[0].Slate_Date : '(empty)'; }
  catch(e){ err = e.message; }
  const ok = expect === (err ? 'THROW' : got);
  console.log(`${ok?'PASS':'*** FAIL ***'}  ${label}`);
  console.log(`        now=${nowIso}  published=${csvSlateDate}  session=${storedSlateDay||'-'}  asked=${S.easternDateIso()}  -> ${err?('THROW: '+err):got}  (expected ${expect})`);
  return ok;
}

(async () => {
  let all = true;
  // 20:19 ET on 08-31: clock rule wants 09-01, only 08-31 is published.
  all &= await run('evening, tomorrow not published yet -> serves tonight',
    '2026-09-01T00:19:00Z', '2026-08-31', null, '2026-08-31');
  // Same moment, but the pipeline published its own decision (08-31) into the session.
  all &= await run('evening, pipeline says 08-31 -> asks for and serves 08-31',
    '2026-09-01T00:19:00Z', '2026-08-31', '2026-08-31', '2026-08-31');
  // Pipeline has rolled to 09-01 and published it.
  all &= await run('pipeline rolled to 09-01 -> serves 09-01',
    '2026-09-01T00:19:00Z', '2026-09-01', '2026-09-01', '2026-09-01');
  // Afternoon, normal case.
  all &= await run('afternoon, same-day slate',
    '2026-08-31T18:00:00Z', '2026-08-31', null, '2026-08-31');
  // The real staleness case the guard exists for: a month-old snapshot.
  all &= await run('genuinely stale snapshot is still refused',
    '2026-09-01T00:19:00Z', '2026-08-06', null, 'THROW');
  // Yesterday's slate after midnight must also be refused.
  all &= await run('yesterday slate after midnight is refused',
    '2026-09-01T14:00:00Z', '2026-08-31', null, 'THROW');
  // A stale session value from a previous day must not pin the slate backwards.
  all &= await run('stale session day is ignored',
    '2026-09-01T14:00:00Z', '2026-09-01', '2026-08-30', '2026-09-01');
  console.log(all ? '\nALL SLATE TESTS PASS' : '\n*** SOME TESTS FAILED ***');
  process.exit(all?0:1);
})();
