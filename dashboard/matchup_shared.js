/**
 * Shared matchup utilities — lineups, weather, badges, sheet parsing.
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function numOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    var s = String(v).trim();
    if (s === '--' || s === '—' || s === 'N/A' || s === 'n/a') return null;
    var n = parseFloat(s.replace(/%/g, ''));
    return isNaN(n) ? null : n;
  }

  function pickCol(row) {
    var keys = Object.keys(row || {});
    var rawArgs = Array.prototype.slice.call(arguments, 1);
    var names = [];
    rawArgs.forEach(function(arg) {
      if (Array.isArray(arg)) {
        arg.forEach(function(n) { names.push(n); });
      } else {
        names.push(arg);
      }
    });
    for (var i = 0; i < names.length; i++) {
      var label = names[i];
      if (row[label] !== undefined && row[label] !== '') return row[label];
      var norm = String(label).toLowerCase().replace(/[^a-z0-9]/g, '');
      for (var k = 0; k < keys.length; k++) {
        if (keys[k].toLowerCase().replace(/[^a-z0-9]/g, '') === norm) return row[keys[k]];
      }
    }
    return '';
  }

  function normName(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  function teamKey(t) {
    return String(t || '').trim().toUpperCase();
  }

  function cloneObject(obj) {
    return Object.assign({}, obj || {});
  }

  function createFilterState(seed) {
    var defaults = (global.MLBMA_CONFIG && MLBMA_CONFIG.FILTER_DEFAULTS) || {
      hand: 'both',
      location: 'all',
      pitcher: 'both',
      batSide: 'both',
      segment: 'full',
      window: 'YTD'
    };
    return normalizeFilter(Object.assign({}, defaults, seed || {}));
  }

  function normalizeFilter(filter) {
    var f = cloneObject(filter);
    f.hand = String(f.hand || 'both').toLowerCase();
    f.location = String(f.location || 'all').toLowerCase();
    f.pitcher = String(f.pitcher || 'both').toLowerCase();
    f.batSide = String(f.batSide || 'both').toLowerCase();
    f.segment = String(f.segment || 'full').toLowerCase();
    f.window = String(f.window || 'YTD').toUpperCase();
    return f;
  }

  function filterKey(filter) {
    var f = normalizeFilter(filter || {});
    return [f.hand, f.location, f.pitcher, f.batSide, f.segment, f.window].join('|');
  }

  function createScopeState(seed) {
    var defaults = (global.MLBMA_CONFIG && MLBMA_CONFIG.SCOPE_DEFAULTS) || { mode: 'all', team: null };
    var scope = Object.assign({}, defaults, seed || {});
    scope.mode = String(scope.mode || 'all').toLowerCase();
    scope.team = scope.team ? teamKey(scope.team) : null;
    if (scope.mode !== 'team') scope.mode = 'all';
    return scope;
  }

  function parseCSVLine(line) {
    var out = [], cur = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
      var c = line.charAt(i);
      if (c === '"') {
        if (inQ && line.charAt(i + 1) === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  function repairCsvRow(line) {
    // Rejoin cells that were split by commas inside unquoted JSON/array values
    var cells = [];
    var cur = '';
    var depth = 0;
    for (var i = 0; i < line.length; i++) {
      var c = line.charAt(i);
      if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') depth--;
      if (c === ',' && depth === 0) {
        cells.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    cells.push(cur);
    return cells.join(',');
  }

  function parseCsvText(text) {
    var lines = String(text || '').trim().split('\n');
    if (lines.length < 2) return [];
    var headers = parseCSVLine(lines[0]).map(function(h) { return h.replace(/^"|"$/g, '').trim(); });
    return lines.slice(1).filter(function(line) { return line.trim(); }).map(function(line) {
      line = repairCsvRow(line);
      var cols = parseCSVLine(line);
      var row = {};
      headers.forEach(function(h, i) {
        row[h] = (cols[i] || '').replace(/^"|"$/g, '').replace(/""/g, '"').trim();
      });
      return row;
    });
  }

  var _sheetTabCache = {};
  var _sheetTabInflight = {};
  var SHEET_TAB_PERSIST_PREFIX = 'mlbma_tab_v1:';
  var SHEET_TAB_PERSIST_TTL_MS = 45 * 60 * 1000;
  var LINEUP_MODEL_CORE_CACHE_PREFIX = 'mlbma_lm_core_v1:';

  // Persist sheet tabs in localStorage so they survive across tabs and full navigations.
  // (This used to be sessionStorage, which is wiped on every fresh tab/visit — forcing a
  // cold re-fetch of large tabs like Team_Results and making Team Rankings slow to load.)
  // Falls back to sessionStorage, then null, when storage is unavailable (e.g. private mode).
  var _tabPersistStore = (function() {
    try {
      var ls = global.localStorage;
      var probe = SHEET_TAB_PERSIST_PREFIX + '__probe';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    } catch (e) { /* fall through */ }
    try { return global.sessionStorage; } catch (e2) { return null; }
  })();

  function sheetSyncBust() {
    var bust = global.MLBMA_SHEET_BUST;
    if (bust != null && bust !== '') return String(bust);
    try {
      var stored = sessionStorage.getItem('mlbma_sheet_sync_ts');
      if (stored) return String(stored);
    } catch (e) { /* ignore */ }
    return '';
  }

  /** Parse sheet Last_Updated or Supabase updated_at into epoch ms. */
  function parseSyncTimestampMs(raw) {
    if (raw == null || raw === '') return null;
    var s = String(raw).trim();
    if (!s) return null;
    var direct = Date.parse(s);
    if (!isNaN(direct)) return direct;
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  }

  /** True when hub_dataset updated_at is older than the live sheet Last_Updated probe. */
  function isSupabaseDatasetStale(updatedAt) {
    var bust = sheetSyncBust();
    if (!bust || !updatedAt) return false;
    var sheetMs = parseSyncTimestampMs(bust);
    var sbMs = parseSyncTimestampMs(updatedAt);
    if (sheetMs == null || sbMs == null) return false;
    return sbMs + 60000 < sheetMs;
  }

  function sheetTabPersistKey(cacheKey) {
    return SHEET_TAB_PERSIST_PREFIX + cacheKey + '|' + sheetSyncBust();
  }

  function readPersistedSheetTab(cacheKey) {
    if (!_tabPersistStore) return null;
    try {
      var raw = _tabPersistStore.getItem(sheetTabPersistKey(cacheKey));
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj.rows || !obj.ts) return null;
      if (Date.now() - obj.ts > SHEET_TAB_PERSIST_TTL_MS) return null;
      return obj.rows;
    } catch (e) { return null; }
  }

  // Drop any older entries for this tab written under a different sync-bust, so the
  // persisted store keeps at most one entry per tab and can't grow unbounded over time.
  function evictStalePersistedTab(cacheKey, keepKey) {
    if (!_tabPersistStore) return;
    var prefix = SHEET_TAB_PERSIST_PREFIX + cacheKey + '|';
    try {
      var toRemove = [];
      for (var i = 0; i < _tabPersistStore.length; i++) {
        var k = _tabPersistStore.key(i);
        if (k && k.indexOf(prefix) === 0 && k !== keepKey) toRemove.push(k);
      }
      toRemove.forEach(function(k) { _tabPersistStore.removeItem(k); });
    } catch (e) { /* ignore */ }
  }

  function writePersistedSheetTab(cacheKey, rows) {
    if (!_tabPersistStore) return;
    if (isSlateTab(String(cacheKey).split('|')[0])) return;
    var key = sheetTabPersistKey(cacheKey);
    evictStalePersistedTab(cacheKey, key);
    var payload = JSON.stringify({ ts: Date.now(), rows: rows });
    try {
      _tabPersistStore.setItem(key, payload);
    } catch (e) {
      // Quota exceeded — clear all persisted tabs and retry once so the freshest tab
      // still gets cached instead of silently failing to persist forever.
      clearPersistedSheetTabs();
      try { _tabPersistStore.setItem(key, payload); } catch (e2) { /* give up */ }
    }
  }

  function clearPersistedSheetTabs(tabName) {
    if (!_tabPersistStore) return;
    try {
      var keys = [];
      for (var i = 0; i < _tabPersistStore.length; i++) {
        var k = _tabPersistStore.key(i);
        if (!k || k.indexOf(SHEET_TAB_PERSIST_PREFIX) !== 0) continue;
        if (!tabName || k.indexOf(SHEET_TAB_PERSIST_PREFIX + String(tabName)) === 0) keys.push(k);
      }
      keys.forEach(function(k) { _tabPersistStore.removeItem(k); });
    } catch (e) { /* ignore */ }
  }

  function lineupModelCoreCacheKey() {
    var bust = sheetSyncBust();
    return LINEUP_MODEL_CORE_CACHE_PREFIX + (bust || 'default');
  }

  function lineupModelReadCoreCache() {
    if (!_tabPersistStore) return null;
    try {
      var obj = JSON.parse(_tabPersistStore.getItem(lineupModelCoreCacheKey()) || 'null');
      if (!obj || !obj.raw || !obj.ts || !obj.raw._coreLoaded) return null;
      if (Date.now() - obj.ts > SHEET_TAB_PERSIST_TTL_MS) return null;
      return obj.raw;
    } catch (e) { return null; }
  }

  function lineupModelWriteCoreCache(raw) {
    if (!_tabPersistStore || !raw || !raw._coreLoaded) return;
    try {
      _tabPersistStore.setItem(lineupModelCoreCacheKey(), JSON.stringify({
        ts: Date.now(),
        raw: {
          rhp: raw.rhp || [],
          lhp: raw.lhp || [],
          profiles: raw.profiles || [],
          teamResults: raw.teamResults || [],
          _coreLoaded: true,
          _hasTeamResults: !!raw._hasTeamResults,
          _hasPitcherSplits: !!raw._hasPitcherSplits,
          _hasPals: !!raw._hasPals
        }
      }));
    } catch (e) { /* ignore quota */ }
  }

  var SLATE_TABS = { Today_Matchups: 1, Today_Lineups: 1, Today_Games: 1 };

  function isSlateTab(tabName) {
    var t = String(tabName || '');
    return !!(SLATE_TABS[t] || t.indexOf('Today_') === 0);
  }

  function isTeamRankingsPage() {
    var path = (global.location && global.location.pathname) || '';
    return /team_rankings/i.test(path);
  }

  function scheduleSheetTabRevalidate(tabName, options, cacheKey) {
    if (_sheetTabInflight[cacheKey]) return;
    var run = function() {
      fetchSheetTab(tabName, Object.assign({}, options, { revalidate: true })).catch(function() { /* best-effort */ });
    };
    var delay = isTeamRankingsPage() ? 12000 : 4000;
    if (global.requestIdleCallback) {
      global.requestIdleCallback(run, { timeout: delay });
    } else {
      setTimeout(run, delay);
    }
  }

  function fetchSheetTab(tabName, options) {
    options = options || {};
    var sid = global.MLBMA_CONFIG && MLBMA_CONFIG.SHEET_ID;
    if (!sid) return Promise.reject(new Error('no sheet id'));
    var slateDay = options.slateDay || (isSlateTab(tabName) ? easternDateIso() : '');
    var key = String(tabName) + (slateDay ? '|' + slateDay : '');
    var skipCacheRead = !!(options.forceRefresh || options.revalidate);
    if (!skipCacheRead && _sheetTabCache[key]) {
      return Promise.resolve(_sheetTabCache[key].slice());
    }
    if (!skipCacheRead && !isSlateTab(tabName)) {
      var persisted = readPersistedSheetTab(key);
      if (persisted && persisted.length) {
        _sheetTabCache[key] = persisted;
        if (!options.revalidate) scheduleSheetTabRevalidate(tabName, options, key);
        return Promise.resolve(persisted.slice());
      }
    }
    if (_sheetTabInflight[key]) {
      return _sheetTabInflight[key].then(function(rows) { return rows.slice(); });
    }

    function doNetworkFetch() {
      var bust = sheetSyncBust() || String(Date.now());
      var pageBust = (global.MLBMA_PAGE_LOAD_BUST != null) ? global.MLBMA_PAGE_LOAD_BUST : Date.now();
      var url = 'https://docs.google.com/spreadsheets/d/' + sid + '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(tabName)
        + '&_b=' + encodeURIComponent(String(bust)) + '&_p=' + encodeURIComponent(String(pageBust))
        + (slateDay ? '&_d=' + encodeURIComponent(slateDay) : '');
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function() { try { ctrl.abort(); } catch (e) { /* ignore */ } }, 15000) : null;
      return fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined }).then(function(r) {
        if (!r.ok) throw new Error('fetch ' + tabName);
        return r.text();
      }).then(parseCsvText).then(function(rows) {
        _sheetTabCache[key] = rows;
        writePersistedSheetTab(key, rows);
        return rows;
      }).finally(function() {
        if (timer) clearTimeout(timer);
      });
    }

    // Supabase is the primary source for the tabs that have been mirrored into
    // public.hub_dataset (one fast indexed JSON request instead of a Google Sheets gviz
    // CSV round-trip). Anything not mirrored — and any Supabase failure — falls back to
    // Sheets, so a Supabase hiccup can never break the dashboard.
    var sb = global.MLBMA_CONFIG && MLBMA_CONFIG.SUPABASE;
    var useSupabase = !!(sb && sb.enabled && sb.url && sb.publishable_key
      && !isSlateTab(tabName) && sb.tabs && sb.tabs.indexOf(String(tabName)) >= 0);

    function doSupabaseFetch() {
      var base = String(sb.url).replace(/\/$/, '') + '/rest/v1/' + (sb.table || 'hub_dataset')
        + '?name=eq.' + encodeURIComponent(tabName) + '&select=rows,updated_at';
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function() { try { ctrl.abort(); } catch (e) { /* ignore */ } }, 12000) : null;
      return fetch(base, {
        headers: { apikey: sb.publishable_key, Authorization: 'Bearer ' + sb.publishable_key },
        signal: ctrl ? ctrl.signal : undefined
      }).then(function(r) {
        if (!r.ok) throw new Error('supabase ' + tabName + ' ' + r.status);
        return r.json();
      }).then(function(arr) {
        var entry = arr && arr[0];
        var rows = entry && entry.rows;
        if (!rows || !rows.length) throw new Error('supabase empty ' + tabName);
        if (isSupabaseDatasetStale(entry.updated_at)) {
          throw new Error('supabase stale ' + tabName);
        }
        _sheetTabCache[key] = rows;
        writePersistedSheetTab(key, rows);
        return rows;
      }).finally(function() { if (timer) clearTimeout(timer); });
    }

    function fetchRemote() {
      if (options.preferSheets || options.revalidate) {
        return doNetworkFetch();
      }
      return useSupabase ? doSupabaseFetch().catch(doNetworkFetch) : doNetworkFetch();
    }

    // Consume an early-page prefetch (fired in the HTML <head>, keyed by tab name) so the
    // data download overlaps script loading. The prefetch value may be a CSV-text promise
    // (Sheets) or a pre-parsed rows-array promise (Supabase). On any failure, fall back to
    // the normal remote fetch — and concurrent callers ride the same promise.
    var pfStore = global.__MLBMA_TAB_PREFETCH;
    var pf = (!skipCacheRead && pfStore) ? pfStore[String(tabName)] : null;
    var work;
    if (pf) {
      delete pfStore[String(tabName)];
      work = Promise.resolve(pf).then(function(val) {
        var rows = Array.isArray(val) ? val : (val && val.rows ? val.rows : parseCsvText(val));
        var updatedAt = val && val.updated_at;
        if (!rows || !rows.length) throw new Error('empty prefetch');
        if (updatedAt && isSupabaseDatasetStale(updatedAt)) throw new Error('prefetch stale ' + tabName);
        _sheetTabCache[key] = rows;
        writePersistedSheetTab(key, rows);
        return rows;
      }).catch(fetchRemote);
    } else {
      work = fetchRemote();
    }
    _sheetTabInflight[key] = work;
    work.then(function() {}, function() {}).then(function() {
      if (_sheetTabInflight[key] === work) delete _sheetTabInflight[key];
    });
    return work.then(function(rows) { return rows.slice(); });
  }

  function clearSheetTabCache(tabName) {
    if (tabName) {
      delete _sheetTabCache[String(tabName)];
      clearPersistedSheetTabs(tabName);
    } else {
      _sheetTabCache = {};
      _sheetTabInflight = {};
      clearPersistedSheetTabs();
    }
  }

  function normalizeGameKey(raw) {
    return String(raw || '').trim().toUpperCase().replace(/\s+/g, '').replace(/\u0040/g, '@');
  }

  function matchupGameKey(m) {
    if (!m) return '';
    if (m.away && m.home) {
      return normalizeTeamAbbrShared(m.away) + '@' + normalizeTeamAbbrShared(m.home);
    }
    return '';
  }

  var TEAM_ABBR_ALIASES = {
    TB: 'TBR', WSH: 'WSN', KC: 'KCR', CWS: 'CHW', SD: 'SDP', SF: 'SFG',
    OAK: 'ATH', AZ: 'ARI', FLA: 'MIA'
  };

  function normalizeTeamAbbrShared(t) {
    var u = teamKey(t);
    return TEAM_ABBR_ALIASES[u] || u;
  }

  function normalizePitcherHandShared(h) {
    var s = String(h || '').trim().toUpperCase();
    if (!s) return '?';
    if (s === 'L' || s === 'LHP' || s.indexOf('LEFT') === 0) return 'L';
    if (s === 'R' || s === 'RHP' || s.indexOf('RIGHT') === 0) return 'R';
    if (s.charAt(0) === 'L') return 'L';
    if (s.charAt(0) === 'R') return 'R';
    return '?';
  }

  function parseBatOrderShared(row) {
    var boRaw = pickCol(row, 'Bat_Order', 'Bat Order', 'bat_order', 'Order', '#', 'BO');
    if (boRaw === '' || boRaw === undefined) {
      if (row.Bat_Order !== undefined && row.Bat_Order !== '') boRaw = row.Bat_Order;
      else if (row['Bat Order'] !== undefined) boRaw = row['Bat Order'];
    }
    if (typeof boRaw === 'number' && !isNaN(boRaw)) return Math.round(boRaw);
    var bo = parseInt(boRaw, 10);
    return isNaN(bo) ? 99 : bo;
  }

  function normalizeLineupGameKeyShared(raw) {
    var gk = normalizeGameKey(raw);
    var at = gk.indexOf('@');
    if (at < 0) return gk;
    return normalizeTeamAbbrShared(gk.slice(0, at)) + '@' + normalizeTeamAbbrShared(gk.slice(at + 1));
  }

  function parseLineupRows(rows) {
    return (rows || []).map(function(row) {
      var game = normalizeLineupGameKeyShared(pickCol(row, 'Game', 'game_key', 'GameKey'));
      var team = normalizeTeamAbbrShared(pickCol(row, 'Team', 'team', 'Tm'));
      if (!team) return null;
      return {
        game: game,
        team: team,
        side: String(pickCol(row, 'Side', 'side', 'Home_Away')).trim().toUpperCase(),
        batOrder: parseBatOrderShared(row),
        position: String(pickCol(row, 'Position', 'Pos', 'position')).trim() || '\u2014',
        player: String(pickCol(row, 'Player', 'Name', 'player_name')).trim() || 'TBD',
        bats: String(pickCol(row, 'Bats', 'Bats Hand', 'Hand', 'bat_hand')).trim() || '?'
      };
    }).filter(Boolean);
  }

  function slateDateFromRow(row) {
    return String(pickCol(row, 'Slate_Date', 'Slate Date', 'Slate_Date_ET', 'Date') || '').trim().slice(0, 10);
  }

  /** Prefer today's slate; match by game key when matchups are known. */
  function filterLineupSheetRows(rows, matchupKeys) {
    if (!rows || !rows.length) return [];
    var live = global.LIVE_DATA || {};
    var today = easternDateIso();
    var dated = rows.filter(function(row) {
      var d = slateDateFromRow(row);
      return d && /^\d{4}-\d{2}-\d{2}$/.test(d);
    });
    if (!dated.length) {
      live._slateSheetDate = null;
      return [];
    }
    var sheetDays = {};
    dated.forEach(function(row) {
      var d = slateDateFromRow(row);
      sheetDays[d] = (sheetDays[d] || 0) + 1;
    });
    var latest = Object.keys(sheetDays).sort().pop();

    function rowsForKeys(sourceRows) {
      if (!matchupKeys || !matchupKeys.length) return sourceRows;
      var keySet = {};
      matchupKeys.forEach(function(k) {
        if (k) keySet[normalizeLineupGameKeyShared(k)] = true;
      });
      return sourceRows.filter(function(row) {
        var gk = normalizeLineupGameKeyShared(pickCol(row, 'Game', 'game_key', 'GameKey'));
        return keySet[gk];
      });
    }

    var todayRows = dated.filter(function(row) { return slateDateFromRow(row) === today; });
    if (todayRows.length) {
      live._slateSheetDate = today;
      return rowsForKeys(todayRows);
    }

    live._slateSheetDate = latest || null;
    var latestRows = dated.filter(function(row) { return slateDateFromRow(row) === latest; });
    if (matchupKeys && matchupKeys.length) {
      var matched = rowsForKeys(latestRows);
      if (matched.length) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[LINEUPS] No slate for ET', today, '— using sheet date', latest, 'for', matched.length, 'rows matching today matchups');
        }
        return matched;
      }
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[LINEUPS] No rows for ET', today, '(sheet has', latest + ') — run: python -m scrapers.scrape_lineups');
      }
      return [];
    }
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[LINEUPS] No rows for ET', today, '— using latest sheet slate', latest);
    }
    return latestRows;
  }

  function syncLiveLineupsFromSheet(rawRows, matchups, liveSchedule) {
    rawRows = rawRows || [];
    var live = global.LIVE_DATA || {};
    live._rawLineupSheetRows = rawRows;
    var mlist = matchups && matchups.length ? matchups : (live.matchups || []);
    var keys = collectLineupMatchupKeys(mlist, liveSchedule || live._liveSchedule, rawRows);
    var filtered = filterLineupSheetRows(rawRows, keys);
    var parsed = parseLineupRows(filtered);
    live.lineups = parsed;
    live._lineupGameCount = keys.length
      ? Object.keys(filtered.reduce(function(acc, row) {
          acc[normalizeLineupGameKeyShared(pickCol(row, 'Game', 'game_key', 'GameKey'))] = 1;
          return acc;
        }, {})).length
      : 0;
    if (typeof console !== 'undefined' && console.info) {
      console.info('[LINEUPS] synced', parsed.length, 'parsed rows from', filtered.length, 'sheet rows across',
        live._lineupGameCount, 'game(s);', keys.length, 'matchup key(s)');
    }
    return parsed;
  }

  function buildMatchupLineupBlock(m, opts) {
    opts = opts || {};
    var expanded = opts.expanded !== false;
    var hideToggle = !!opts.hideToggle;
    var live = global.LIVE_DATA || {};
    var gk = matchupGameKey(m);
    var lu = live.lineups || [];
    var awayRows = parseLineup(lu, gk, m.away, 'AWAY');
    var homeRows = parseLineup(lu, gk, m.home, 'HOME');
    var awayFaces = normalizePitcherHandShared(m.homeHand);
    var homeFaces = normalizePitcherHandShared(m.awayHand);
    var inner;
    if (!awayRows.length && !homeRows.length) {
      var slateDay = easternDateIso();
      var sheetDay = live._slateSheetDate || '';
      var hasAnyLineups = !!(lu && lu.length);
      var staleNote = '';
      if (sheetDay && sheetDay !== slateDay) {
        staleNote = ' Sheet slate is dated <strong>' + esc(sheetDay) + '</strong> (today is <strong>' + esc(slateDay) + '</strong>). Run: <code>python -m scrapers.scrape_lineups</code>.';
      } else if (sheetDay === slateDay && hasAnyLineups) {
        staleNote = ' Rotowire has not posted a projected lineup for this game yet.';
      } else if ((live.matchups || []).length && !hasAnyLineups) {
        staleNote = ' Run: <code>python -m scrapers.scrape_lineups</code> to refresh Today_Lineups.';
      }
      inner = '<div class="matchup-lineup-empty">No projected lineup in <strong>Today_Lineups</strong> for <span style="font-family:var(--mono)">' + esc(gk) + '</span>.' + staleNote + '</div>';
    } else {
      inner = '<div class="matchup-lineup-grid">'
        + buildLineupColCompact(m.away + ' (away)', awayRows, awayFaces, 'away')
        + buildLineupColCompact(m.home + ' (home)', homeRows, homeFaces, 'home')
        + '</div>';
    }
    if (hideToggle) {
      return '<div class="hmc-lineups is-open hmc-lineups--always" onclick="event.stopPropagation()">'
        + '<div class="hmc-lineups-label">Projected lineups</div>'
        + '<div class="matchup-lineup-panel is-open">' + inner + '</div></div>';
    }
    return '<div class="hmc-lineups' + (expanded ? ' is-open' : '') + '" onclick="event.stopPropagation()">'
      + '<button type="button" class="hmc-lineup-toggle" aria-expanded="' + (expanded ? 'true' : 'false') + '">'
      + (expanded ? 'Hide Lineups \u25BE' : 'Show Lineups \u25BE') + '</button>'
      + '<div class="matchup-lineup-panel' + (expanded ? ' is-open' : '') + '">'
      + inner
      + '</div></div>';
  }

  /** @param {Array} lineups - parsed lineup rows @param {string} gameKey @param {string} team @param {string} [side] */
  function parseLineup(lineups, gameKey, team, side) {
    var gk = normalizeLineupGameKeyShared(gameKey);
    var tm = normalizeTeamAbbrShared(team);
    var want = String(side || '').toUpperCase();
    function sideOk(sd) {
      sd = String(sd || '').toUpperCase();
      if (want === 'AWAY') return sd === 'AWAY' || sd === 'A' || sd === '0';
      if (want === 'HOME') return sd === 'HOME' || sd === 'H' || sd === '1';
      return true;
    }
    var primary = (lineups || []).filter(function(r) {
      return normalizeLineupGameKeyShared(r.game) === gk && normalizeTeamAbbrShared(r.team) === tm && sideOk(r.side);
    });
    var rows = primary.length ? primary : (lineups || []).filter(function(r) {
      return normalizeLineupGameKeyShared(r.game) === gk && normalizeTeamAbbrShared(r.team) === tm;
    });
    return rows.slice().sort(function(a, b) { return a.batOrder - b.batOrder; }).slice(0, 9);
  }

  function normalizeBatsHand(bats) {
    var c = String(bats || '?').trim().toUpperCase().charAt(0);
    if (c === 'L' || c === 'R' || c === 'S' || c === 'B') return c === 'B' ? 'S' : c;
    return '?';
  }

  function platoonHighlight(batterHand, spHand) {
    var b = normalizeBatsHand(batterHand);
    var o = String(spHand || '').trim().toUpperCase().charAt(0);
    if (o !== 'L' && o !== 'R') return false;
    if (o === 'R' && (b === 'L' || b === 'S')) return true;
    if (o === 'L' && b === 'R') return true;
    return false;
  }

  function platoonHighlightClass(batterHand, spHand) {
    if (!platoonHighlight(batterHand, spHand)) return '';
    var o = String(spHand || '').trim().toUpperCase().charAt(0);
    return o === 'R' ? 'lineup-row--platoon-l' : 'lineup-row--platoon-r';
  }

  function batterProfileLink(name) {
    if (!name || name === 'TBD') return esc(name || 'TBD');
    return '<a href="batter_profile.html?player=' + encodeURIComponent(name) + '" class="lineup-name-link" onclick="event.stopPropagation()">' + esc(name) + '</a>';
  }

  function lineupFormFlag(r) {
    if (!r) return null;
    if (r.formFlag && r.formFlag.label) return r.formFlag;
    if (r.rcv != null && !isNaN(r.rcv) && r.rcv >= 75) {
      return { label: 'Power', cls: 'lb-flag lb-flag--power' };
    }
    var tr = String(r.trend || r.formTrend || '').toLowerCase();
    if (tr === 'rising' || tr === 'up' || tr === 'hot') {
      return { label: 'Hot', cls: 'lb-flag lb-flag--hot' };
    }
    if (tr === 'falling' || tr === 'down' || tr === 'cold') {
      return { label: 'Cold', cls: 'lb-flag lb-flag--cold' };
    }
    if (r.osi != null && !isNaN(r.osi) && r.osi >= 78) {
      return { label: 'Hot', cls: 'lb-flag lb-flag--hot' };
    }
    return null;
  }

  function buildLineupBoard(lineupRows, opts) {
    opts = opts || {};
    var compact = !!opts.compact;
    var oppHand = opts.oppHand != null ? opts.oppHand : opts.opposingSPHand;
    var teamLabel = opts.team || opts.teamLabel || '';
    if (!lineupRows || !lineupRows.length) {
      return '<div class="lineup-board lineup-board--empty' + (compact ? ' lineup-board--compact' : '') + '"><div class="lineup-empty">Lineup not yet confirmed</div></div>';
    }
    var A = global.MLBMAAssets;
    var headHtml = '';
    if (teamLabel || opts.title) {
      var handLbl = oppHand === 'L' || oppHand === 'R' ? oppHand + 'HP' : '?HP';
      var title = opts.title || ('Projected lineup · ' + teamLabel);
      var purpose = opts.purpose != null ? opts.purpose : ('vs ' + handLbl);
      if (compact) {
        headHtml = '<div class="lineup-board-head lineup-board-head--compact">'
          + '<span class="lineup-board-head__team">' + esc(title) + '</span>'
          + '<span class="lineup-board-head__vs">vs ' + esc(handLbl) + '</span>'
          + '</div>';
      } else if (A && A.caSectionHeadHtml) {
        headHtml = A.caSectionHeadHtml(opts.icon || 'users', opts.kicker || 'Tonight', title, purpose);
      } else {
        headHtml = '<div class="lineup-table-head">' + esc(title) + ' · vs ' + esc(handLbl) + '</div>';
      }
    }
    var body = '';
    lineupRows.slice(0, 9).forEach(function(r) {
      var bn = normalizeBatsHand(r.bats);
      var platCls = platoonHighlightClass(bn, oppHand);
      var platoonRowCls = platCls ? platCls.replace('lineup-row', 'lb-row') : '';
      var rowCls = 'lb-row' + (compact ? ' lb-row--compact' : '') + (platoonRowCls ? ' ' + platoonRowCls : '');
      if (compact) {
        body += '<div class="' + rowCls + '">'
          + '<span class="lb-ord">' + (r.batOrder <= 9 ? r.batOrder : '\u2014') + '</span>'
          + '<span class="lb-pos">' + esc(r.position) + '</span>'
          + '<span class="lb-name">' + batterProfileLink(r.player) + '</span>'
          + '<span class="lb-hand lb-hand--' + (bn === '?' ? 'unk' : bn.toLowerCase()) + '">' + esc(bn === '?' ? '?' : bn) + '</span>'
          + '</div>';
        return;
      }
      var flag = lineupFormFlag(r);
      var flagHtml = flag
        ? '<span class="' + flag.cls + '">' + esc(flag.label) + '</span>'
        : '<span class="lb-flag-empty" aria-hidden="true"></span>';
      body += '<div class="' + rowCls + '">'
        + '<span class="lb-ord">' + (r.batOrder <= 9 ? r.batOrder : '\u2014') + '</span>'
        + '<span class="lb-pos">' + esc(r.position) + '</span>'
        + '<span class="lb-name">' + batterProfileLink(r.player) + '</span>'
        + flagHtml
        + '<span class="lb-hand">' + esc(bn === '?' ? '?' : bn) + '</span>'
        + '</div>';
    });
    return '<div class="lineup-board' + (compact ? ' lineup-board--compact' : '') + '">' + headHtml + body + '</div>';
  }

  function buildLineupTable(lineupRows, opposingSPHand) {
    return buildLineupBoard(lineupRows, { opposingSPHand: opposingSPHand });
  }

  /** Flat, dense lineup column for matchup hero cards (no scorecard wrapper). */
  function lineupColHeadHtml(teamLabel, handLbl) {
    var I = (typeof global !== 'undefined' && global.MLBMAIcons) ? global.MLBMAIcons : null;
    var iconHtml = (I && I.iconHtml) ? I.iconHtml('lineup', 13) : '';
    var raw = String(teamLabel || '').trim();
    var parsed = raw.match(/^(.+?)\s*\((away|home)\)\s*$/i);
    var team = parsed ? parsed[1].trim() : raw;
    var side = parsed ? parsed[2].toLowerCase() : '';
    var meta = (side ? side + ' · ' : '') + 'vs ' + handLbl;
    return '<div class="matchup-lineup-col-head">'
      + (iconHtml ? '<span class="matchup-lineup-col-head__icon" aria-hidden="true">' + iconHtml + '</span>' : '')
      + '<span class="matchup-lineup-col-head__team">' + esc(team) + '</span>'
      + '<span class="matchup-lineup-col-head__meta">' + esc(meta) + '</span>'
      + '</div>';
  }

  function buildLineupColCompact(teamLabel, lineupRows, oppHand, side) {
    var sideKey = side === 'home' ? 'home' : 'away';
    var sideCls = ' matchup-lineup-col--' + sideKey;
    var handLbl = oppHand === 'L' || oppHand === 'R' ? oppHand + 'HP' : '?HP';
    var head = lineupColHeadHtml(teamLabel, handLbl);
    if (!lineupRows || !lineupRows.length) {
      return '<div class="matchup-lineup-col matchup-lineup-col--compact' + sideCls + '">' + head
        + '<div class="matchup-lineup-empty">No rows</div></div>';
    }
    var body = lineupRows.slice(0, 9).map(function(r) {
      var bn = normalizeBatsHand(r.bats);
      var plat = platoonHighlightClass(bn, oppHand);
      var bp = esc(bn === '?' ? '?' : bn);
      var bo = '<span class="lineup-bo">' + ((r.batOrder >= 1 && r.batOrder <= 9) ? String(r.batOrder) : '\u2014') + '</span>';
      var pos = '<span class="lineup-pos">' + esc(r.position) + '</span>';
      var name = '<span class="lineup-name">' + batterProfileLink(r.player) + '</span>';
      var bats = '<span class="bats-pill hand-' + (bn === '?' ? 'unk' : bn.toLowerCase()) + '">' + bp + '</span>';
      var cells = sideKey === 'home' ? (bats + name + pos + bo) : (bo + pos + name + bats);
      return '<div class="lineup-row' + (plat ? ' ' + plat : '') + '">' + cells + '</div>';
    }).join('');
    return '<div class="matchup-lineup-col matchup-lineup-col--compact' + sideCls + '">' + head + body + '</div>';
  }

  function parseWeatherString(raw) {
    var s = String(raw || '').trim();
    var out = {
      raw: s || '—',
      temp: null,
      wind: null,
      windDir: null,
      conditions: s || '—',
      dome: false
    };
    if (!s) return out;
    if (/dome|roof|indoor|retractable/i.test(s)) out.dome = true;
    var tempM = s.match(/(\d+)\s*°?\s*F/i);
    if (tempM) out.temp = parseInt(tempM[1], 10);
    var windM = s.match(/wind[:\s]*(\d+)\s*mph(?:\s+([A-Za-z]+))?/i);
    if (windM) {
      out.wind = parseInt(windM[1], 10);
      out.windDir = windM[2] || null;
    }
    if (/clear/i.test(s)) out.conditions = 'Clear';
    else if (/cloud/i.test(s)) out.conditions = 'Cloudy';
    else if (/rain/i.test(s)) out.conditions = 'Rain';
    return out;
  }

  function parseWeatherRow(row) {
    if (!row) return parseWeatherString('');
    var cond = pickCol(row, 'conditions', 'Conditions', 'Weather', 'Summary') || '—';
    var windSpd = numOrNull(pickCol(row, 'wind_speed_mph', 'Wind', 'Wind_Speed', 'wind_mph'));
    var windDir = pickCol(row, 'wind_direction', 'Wind_Dir', 'Wind Direction', 'wind_dir') || null;
    var windStr = windSpd != null
      ? 'Wind ' + windSpd + 'mph' + (windDir ? ' ' + windDir : '')
      : null;
    return {
      raw: cond,
      temp: numOrNull(pickCol(row, 'temperature_f', 'Temp', 'Temperature', 'temp_f')),
      wind: windSpd,
      windDir: windDir,
      conditions: cond,
      stadium: pickCol(row, 'stadium_name', 'Stadium', 'Venue', 'Ballpark') || '',
      dome: /dome|roof|indoor/i.test(String(cond))
        || String(pickCol(row, 'is_dome', 'Is_Dome', 'Roof')).toLowerCase() === 'true'
    };
  }

  function weatherHasData(w) {
    if (!w) return false;
    if (w.dome) return true;
    if (w.temp != null && !isNaN(w.temp)) return true;
    if (w.wind != null && !isNaN(w.wind)) return true;
    var cond = w.cond || w.conditions || w.raw || '';
    return !!(cond && String(cond) !== '—' && String(cond).toLowerCase() !== 'dome');
  }

  function normalizeStadiumKey(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function parseWeatherMap(rows) {
    var map = {};
    var byHome = {};
    var byStadium = {};
    (rows || []).forEach(function(row) {
      var away = normalizeTeamAbbrShared(pickCol(row, 'away_team', 'Away'));
      var home = normalizeTeamAbbrShared(pickCol(row, 'home_team', 'Home'));
      if (!away || !home) return;
      var w = parseWeatherRow(row);
      var key = away + '@' + home;
      map[key] = w;
      if (!byHome[home] || weatherHasData(w)) byHome[home] = w;
      var sk = normalizeStadiumKey(w.stadium);
      if (sk && (!byStadium[sk] || weatherHasData(w))) byStadium[sk] = w;
    });
    map._byHome = byHome;
    map._byStadium = byStadium;
    return map;
  }

  /** Resolve weather for a matchup — normalized team keys (TB/TBR, etc.). */
  function weatherLookup(map, away, home, stadium) {
    if (!map || !away || !home) return null;
    var a = normalizeTeamAbbrShared(away);
    var h = normalizeTeamAbbrShared(home);
    var direct = map[a + '@' + h]
      || map[teamKey(away) + '@' + teamKey(home)]
      || map[away + '@' + home];
    if (direct && weatherHasData(direct)) return direct;
    var sk = normalizeStadiumKey(stadium);
    if (sk && map._byStadium && map._byStadium[sk] && weatherHasData(map._byStadium[sk])) {
      return map._byStadium[sk];
    }
    if (map._byHome && map._byHome[h] && weatherHasData(map._byHome[h])) {
      return map._byHome[h];
    }
    return null;
  }

  var FIXED_DOME_HOME = { MIA: 1, TBR: 1, TB: 1, TOR: 1 };

  var TEAM_WEATHER_CITY = {
    ARI: 'Phoenix', ATH: 'Sacramento', ATL: 'Atlanta', BAL: 'Baltimore', BOS: 'Boston',
    CHC: 'Chicago', CHW: 'Chicago', CIN: 'Cincinnati', CLE: 'Cleveland', COL: 'Denver',
    DET: 'Detroit', HOU: 'Houston', KCR: 'Kansas City', KC: 'Kansas City', LAA: 'Anaheim',
    LAD: 'Los Angeles', MIA: 'Miami', MIL: 'Milwaukee', MIN: 'Minneapolis', NYM: 'New York',
    NYY: 'Bronx', PHI: 'Philadelphia', PIT: 'Pittsburgh', SDP: 'San Diego', SD: 'San Diego',
    SEA: 'Seattle', SFG: 'San Francisco', SF: 'San Francisco', STL: 'St Louis', TBR: 'St Petersburg',
    TEX: 'Arlington', TOR: 'Toronto', WSN: 'Washington', WSH: 'Washington'
  };

  var _weatherGeoCache = {};
  var _weatherMeteoCache = {};

  function isDomeStadium(home, stadium) {
    var h = normalizeTeamAbbrShared(home);
    if (FIXED_DOME_HOME[h]) return true;
    var s = String(stadium || '').toLowerCase();
    return /tropicana|rogers centre|rogers center/.test(s);
  }

  function openMeteoCodeToCond(code) {
    var c = Number(code);
    if (c === 0) return 'clear';
    if (c <= 3) return 'cloudy';
    if (c <= 48) return 'cloudy';
    if (c <= 67) return 'rain';
    if (c <= 77) return 'snow';
    if (c <= 86) return 'snow';
    if (c <= 99) return 'storm';
    return 'cloudy';
  }

  function assignWeatherToMatchup(map, away, home, w) {
    if (!map || !away || !home || !w) return;
    var a = normalizeTeamAbbrShared(away);
    var h = normalizeTeamAbbrShared(home);
    map[a + '@' + h] = w;
    if (!map._byHome) map._byHome = {};
    if (!map._byStadium) map._byStadium = {};
    map._byHome[h] = w;
    var sk = normalizeStadiumKey(w.stadium);
    if (sk) map._byStadium[sk] = w;
  }

  function geocodeWeatherCity(city) {
    if (_weatherGeoCache[city]) return Promise.resolve(_weatherGeoCache[city]);
    var url = 'https://geocoding-api.open-meteo.com/v1/search?name='
      + encodeURIComponent(city) + '&count=1&language=en&format=json';
    return fetch(url, { cache: 'no-store' }).then(function(r) {
      if (!r.ok) throw new Error('geocode ' + city);
      return r.json();
    }).then(function(data) {
      var hit = data && data.results && data.results[0];
      if (!hit) return null;
      var coords = { lat: hit.latitude, lon: hit.longitude };
      _weatherGeoCache[city] = coords;
      return coords;
    }).catch(function() { return null; });
  }

  function fetchOpenMeteoWeather(lat, lon) {
    var key = lat + ',' + lon;
    if (_weatherMeteoCache[key]) return Promise.resolve(_weatherMeteoCache[key]);
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + encodeURIComponent(lat)
      + '&longitude=' + encodeURIComponent(lon)
      + '&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code'
      + '&wind_speed_unit=mph&temperature_unit=fahrenheit';
    return fetch(url, { cache: 'no-store' }).then(function(r) {
      if (!r.ok) throw new Error('open-meteo');
      return r.json();
    }).then(function(data) {
      var cur = data && data.current;
      if (!cur) return null;
      var w = {
        temp: cur.temperature_2m != null ? Math.round(Number(cur.temperature_2m)) : null,
        wind: cur.wind_speed_10m != null ? Math.round(Number(cur.wind_speed_10m)) : null,
        windDir: cur.wind_direction_10m,
        conditions: openMeteoCodeToCond(cur.weather_code),
        raw: openMeteoCodeToCond(cur.weather_code),
        source: 'open-meteo'
      };
      _weatherMeteoCache[key] = w;
      return w;
    }).catch(function() { return null; });
  }

  /** Fill missing sheet weather via home-stadium city lookup (Open-Meteo). */
  function enrichMissingWeatherFromApi(matchups, weatherMap) {
    weatherMap = weatherMap || {};
    if (!weatherMap._byHome) weatherMap._byHome = {};
    if (!weatherMap._byStadium) weatherMap._byStadium = {};
    var byHome = {};
    (matchups || []).forEach(function(m) {
      if (!m || !m.away || !m.home) return;
      if (weatherHasData(weatherLookup(weatherMap, m.away, m.home, m.stadium))) return;
      var home = normalizeTeamAbbrShared(m.home);
      if (!byHome[home]) byHome[home] = [];
      byHome[home].push(m);
    });
    var homes = Object.keys(byHome);
    if (!homes.length) return Promise.resolve(weatherMap);
    var tasks = homes.map(function(home) {
      var sample = byHome[home][0];
      if (isDomeStadium(home, sample.stadium)) {
        var domeWx = { dome: true, conditions: 'dome', stadium: sample.stadium || '' };
        byHome[home].forEach(function(m) {
          assignWeatherToMatchup(weatherMap, m.away, m.home, domeWx);
        });
        return Promise.resolve();
      }
      var city = TEAM_WEATHER_CITY[home];
      if (!city) return Promise.resolve();
      return geocodeWeatherCity(city).then(function(coords) {
        if (!coords) return;
        return fetchOpenMeteoWeather(coords.lat, coords.lon).then(function(wx) {
          if (!wx || !weatherHasData(wx)) return;
          wx.stadium = sample.stadium || '';
          byHome[home].forEach(function(m) {
            assignWeatherToMatchup(weatherMap, m.away, m.home, wx);
          });
        });
      });
    });
    return Promise.all(tasks).then(function() { return weatherMap; });
  }

  /** Approximate center-field bearing from home plate (degrees clockwise from north). */
  var STADIUM_CF_BEARING = {
    ARI: 45, ATH: 55, ATL: 35, BAL: 45, BOS: 45, CHC: 95, CHW: 125, CIN: 45, CLE: 25,
    COL: 5, DET: 150, HOU: 45, KCR: 45, KC: 45, LAA: 45, LAD: 35, MIA: 125, MIL: 45,
    MIN: 45, NYM: 25, NYY: 75, PHI: 25, PIT: 115, SDP: 355, SD: 355, SEA: 45, SFG: 85,
    SF: 85, STL: 65, TBR: 45, TB: 45, TEX: 45, TOR: 45, WSN: 45, WSH: 45
  };

  var WIND_COMPASS16 = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5
  };

  function parseWindFromDeg(windDir) {
    if (windDir == null || windDir === '') return null;
    var s = String(windDir).trim().toUpperCase().replace(/\./g, '');
    if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s) % 360;
    if (WIND_COMPASS16[s] != null) return WIND_COMPASS16[s];
    var m = s.match(/\b(NNW|NW|WNW|W|WSW|SW|SSW|S|SSE|SE|ESE|E|ENE|NE|NNE|N)\b/);
    if (m && WIND_COMPASS16[m[1]] != null) return WIND_COMPASS16[m[1]];
    return null;
  }

  function compassUnitVec(bearingDeg) {
    var r = bearingDeg * Math.PI / 180;
    return { x: Math.sin(r), y: Math.cos(r) };
  }

  /** Wind FROM bearing vs CF bearing -> plate-relative carry label. */
  function windPlateEffect(windFromDeg, cfBearingDeg) {
    if (windFromDeg == null || cfBearingDeg == null) {
      return { label: '', icon: 'wind', cls: 'hmc-wind--unknown', title: 'Wind direction unknown' };
    }
    var windTo = (windFromDeg + 180) % 360;
    var w = compassUnitVec(windTo);
    var cf = compassUnitVec(cfBearingDeg);
    var left = compassUnitVec((cfBearingDeg - 90 + 360) % 360);
    var along = w.x * cf.x + w.y * cf.y;
    var cross = w.x * left.x + w.y * left.y;
    if (Math.abs(along) >= Math.abs(cross)) {
      if (along > 0.35) return { label: 'Out', icon: 'arrow-up', cls: 'hmc-wind--out', title: 'Wind blowing out toward center field' };
      if (along < -0.35) return { label: 'In', icon: 'arrow-down', cls: 'hmc-wind--in', title: 'Wind blowing in toward home plate' };
    }
    if (cross > 0.35) return { label: 'L→R', icon: 'arrow-left-right', cls: 'hmc-wind--lr', title: 'Crosswind left to right (3B → 1B)' };
    if (cross < -0.35) return { label: 'R→L', icon: 'arrow-left-right', cls: 'hmc-wind--rl', title: 'Crosswind right to left (1B → 3B)' };
    return { label: 'Cross', icon: 'wind', cls: 'hmc-wind--cross', title: 'Crosswind' };
  }

  function tempColorCss(temp) {
    if (temp == null || isNaN(temp)) return 'var(--text-2, #D1D5DB)';
    var t = Math.max(45, Math.min(95, Number(temp)));
    var pct = (t - 45) / 50;
    var r = Math.round(96 + pct * (248 - 96));
    var g = Math.round(165 + pct * (113 - 165));
    var b = Math.round(250 + pct * (113 - 250));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function formatWeatherMetaHtml(weather, homeTeam) {
    if (!weather) return '';
    if (typeof weather === 'string') {
      var su = weather.toUpperCase();
      if (su.indexOf('DOME') >= 0 || su.indexOf('ROOF') >= 0) {
        return '<span class="hmc-weather-chip hmc-weather-chip--dome">Dome</span>';
      }
      return '<span class="hmc-weather-chip">' + esc(weather) + '</span>';
    }
    if (weather.dome) return '<span class="hmc-weather-chip hmc-weather-chip--dome">Dome</span>';
    var cond = weather.cond || weather.conditions || weather.weather || weather.raw || '';
    if (cond && String(cond).toUpperCase().indexOf('DOME') >= 0) {
      return '<span class="hmc-weather-chip hmc-weather-chip--dome">Dome</span>';
    }

    var parts = [];
    if (weather.temp != null && !isNaN(weather.temp)) {
      var tc = tempColorCss(weather.temp);
      parts.push('<span class="hmc-weather-chip hmc-weather-chip--temp" style="--temp-color:' + tc + '">'
        + '<strong>' + Math.round(Number(weather.temp)) + '°</strong></span>');
    }
    if (weather.wind != null && !isNaN(weather.wind)) {
      var home = normalizeTeamAbbrShared(homeTeam || weather.home || '');
      var cf = STADIUM_CF_BEARING[home] != null ? STADIUM_CF_BEARING[home] : 45;
      var fromDeg = parseWindFromDeg(weather.windDir);
      var effect = windPlateEffect(fromDeg, cf);
      var I = global.MLBMAIcons;
      var iconHtml = (I && I.iconHtml) ? I.iconHtml(effect.icon, 13) : '';
      parts.push('<span class="hmc-weather-chip hmc-weather-chip--wind ' + effect.cls + '" title="' + esc(effect.title || '') + '">'
        + (iconHtml ? '<span class="hmc-wind-arrow" aria-hidden="true">' + iconHtml + '</span>' : '')
        + (effect.label ? '<span class="hmc-wind-label">' + esc(effect.label) + '</span>' : '')
        + '<strong class="hmc-wind-mph">' + Math.round(Number(weather.wind)) + '</strong>'
        + '<span class="hmc-wind-unit">mph</span></span>');
    }
    if (cond && String(cond).toLowerCase() !== 'dome' && String(cond) !== '—') {
      parts.push('<span class="hmc-weather-chip hmc-weather-chip--cond">' + esc(String(cond)) + '</span>');
    }
    if (!parts.length) return '';
    return '<span class="hmc-weather-group">' + parts.join('') + '</span>';
  }

  function weatherBadge(weatherData, homeTeam) {
    return formatWeatherMetaHtml(weatherData, homeTeam);
  }

  function pitchTier(score) {
    if (score == null || isNaN(score)) return { label: '—', cls: 'tier-mid' };
    if (score >= 70) return { label: 'Elite', cls: 'tier-elite' };
    if (score >= 55) return { label: 'Solid', cls: 'tier-solid' };
    if (score >= 40) return { label: 'Avg', cls: 'tier-mid' };
    return { label: 'Volatile', cls: 'tier-vol' };
  }

  /** K%/BB% as percentage points (22.5 not 0.225). */
  function rateAsPctPoints(v) {
    var d = pctDecimal(v);
    if (d == null) return null;
    return d * 100;
  }

  function invOsiScore(osiAllowed) {
    if (osiAllowed == null || isNaN(osiAllowed)) return null;
    return Math.max(0, Math.min(100, 100 - osiAllowed));
  }

  function kRateScore(kPct) {
    var kp = rateAsPctPoints(kPct);
    if (kp == null) return null;
    return Math.max(0, Math.min(100, ((kp - 15) / 20) * 100));
  }

  /** Composite SP grade — pool Pitch Score + run suppression + K% blend. */
  function pitcherStaffGrade(m) {
    m = m || {};
    var ps = numOrNull(m.pitchScore);
    var osi = invOsiScore(m.osiAllowed);
    var kb = kRateScore(m.kPct);
    var parts = [];
    var w = 0;
    if (ps != null) { parts.push([ps, 0.45]); w += 0.45; }
    if (osi != null) { parts.push([osi, 0.40]); w += 0.40; }
    if (kb != null) { parts.push([kb, 0.15]); w += 0.15; }
    if (!parts.length) return null;
    var sum = parts.reduce(function(acc, pair) { return acc + pair[0] * pair[1]; }, 0);
    return Math.round((sum / w) * 10) / 10;
  }

  /**
   * Rotation tier — multi-signal (Pitch Score + OSI Allowed + K%).
   * Aligns with Pitcher Lab elite-stuff thresholds; avoids PS-only mislabels on small samples.
   */
  function pitcherStaffTier(m) {
    m = m || {};
    var ps = numOrNull(m.pitchScore);
    var osi = numOrNull(m.osiAllowed);
    var k = rateAsPctPoints(m.kPct);
    var grade = pitcherStaffGrade(m);

    if (k != null && osi != null) {
      if (k >= 26 && osi <= 50) {
        return {
          label: 'Ace',
          cls: 'tier-ace',
          hint: 'Elite K% (' + k.toFixed(1) + '%) with strong run suppression'
        };
      }
      if (k >= 22 && osi <= 55) {
        grade = Math.max(grade || 0, 72);
      }
    }

    if (grade == null && ps != null) grade = ps;
    if (grade == null) return { label: '—', cls: '', hint: '' };

    var label;
    var cls;
    if (grade >= 78 || (ps != null && ps >= 82)) {
      label = 'Ace';
      cls = 'tier-ace';
    } else if (grade >= 65 || (k != null && osi != null && k >= 22 && osi <= 55)) {
      label = 'Solid';
      cls = 'tier-solid';
    } else if (grade >= 52) {
      label = 'Average';
      cls = 'tier-average';
    } else {
      label = 'Volatile';
      cls = 'tier-volatile';
    }

    var hintParts = [];
    if (ps != null) hintParts.push('Pitch Score ' + ps);
    if (osi != null) hintParts.push('OSI Allowed ' + osi);
    if (k != null) hintParts.push('K% ' + k.toFixed(1));
    return { label: label, cls: cls, hint: hintParts.join(' · ') };
  }

  function gamescriptBadge(awayABQ, homeABQ, awayPitchScore, homePitchScore, awayRcv, homeRcv, awayHr9, homeHr9) {
    awayABQ = awayABQ != null ? awayABQ : 50;
    homeABQ = homeABQ != null ? homeABQ : 50;
    awayPitchScore = awayPitchScore != null ? awayPitchScore : 50;
    homePitchScore = homePitchScore != null ? homePitchScore : 50;
    awayRcv = awayRcv != null ? awayRcv : 50;
    homeRcv = homeRcv != null ? homeRcv : 50;
    awayHr9 = awayHr9 != null ? awayHr9 : 1;
    homeHr9 = homeHr9 != null ? homeHr9 : 1;
    var abqAvg = (awayABQ + homeABQ) / 2;
    var psAvg = (awayPitchScore + homePitchScore) / 2;
    var maxRcv = Math.max(awayRcv, homeRcv);
    var maxHr9 = Math.max(awayHr9, homeHr9);
    if (maxRcv >= 65 && maxHr9 >= 1.2) return { label: 'Power Showdown', cls: 'script-badge script-orange' };
    if (abqAvg > 60 && psAvg > 65) return { label: 'Pitching Duel', cls: 'script-badge script-gray' };
    if (abqAvg > 60 && psAvg < 50) return { label: 'Lineup Grinds SP', cls: 'script-badge script-amber' };
    if (abqAvg < 50 && psAvg > 65) return { label: 'Quick Game', cls: 'script-badge script-blue' };
    return { label: 'Balanced', cls: 'script-badge script-muted' };
  }

  function f5Badge(awayPs, homePs, awayBpAllowed, homeBpAllowed) {
    awayPs = awayPs != null ? awayPs : 50;
    homePs = homePs != null ? homePs : 50;
    awayBpAllowed = awayBpAllowed != null ? awayBpAllowed : 55;
    homeBpAllowed = homeBpAllowed != null ? homeBpAllowed : 55;
    var maxPs = Math.max(awayPs, homePs);
    var minBp = Math.min(awayBpAllowed, homeBpAllowed);
    var maxBp = Math.max(awayBpAllowed, homeBpAllowed);
    if (maxPs >= 70 && minBp < 50) return { label: 'F5 + Full', cls: 'f5-badge f5-green' };
    if (maxPs >= 70 && maxBp > 60) return { label: 'F5 Only', cls: 'f5-badge f5-amber' };
    if (maxPs < 55 && minBp < 50) return { label: 'Full Only', cls: 'f5-badge f5-blue' };
    return { label: 'Lineup Edge', cls: 'f5-badge f5-muted' };
  }

  function pctDecimal(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = parseFloat(String(v).replace(/%/g, ''));
    if (isNaN(n)) return null;
    return n > 1.5 ? n / 100 : n;
  }

  function normalizePool(values) {
    var nums = values.filter(function(v) { return v != null && !isNaN(v); });
    if (!nums.length) return values.map(function() { return 50; });
    var mn = Math.min.apply(null, nums);
    var mx = Math.max.apply(null, nums);
    if (mx === mn) return values.map(function() { return 50; });
    return values.map(function(v) {
      if (v == null || isNaN(v)) return null;
      return ((v - mn) / (mx - mn)) * 100;
    });
  }

  function invertPool(normValues) {
    return normValues.map(function(v) {
      return v == null || isNaN(v) ? null : 100 - v;
    });
  }

  /** Client-side PitchScore fallback when sheet value missing (K/BB/HR only — team tab uses pipeline WHIP). */
  function computePitchScoreFromRates(kPct, bbPct, hr9, pool) {
    var k = pctDecimal(kPct);
    var bb = pctDecimal(bbPct);
    var hr = hr9 != null && !isNaN(hr9) ? Number(hr9) : null;
    if (k == null || bb == null || hr == null) return null;
    if (pool && pool.length) {
      var kArr = pool.map(function(p) { return pctDecimal(p.k); });
      var bbArr = pool.map(function(p) { return pctDecimal(p.bb); });
      var hrArr = pool.map(function(p) { return p.hr; });
      var nk = normalizePool(kArr);
      var nbb = invertPool(normalizePool(bbArr));
      var nhr = invertPool(normalizePool(hrArr));
      var idx = pool.findIndex(function(p) {
        return pctDecimal(p.k) === k && pctDecimal(p.bb) === bb && p.hr === hr;
      });
      if (idx < 0) {
        var allK = kArr.concat([k]);
        var allBB = bbArr.concat([bb]);
        var allHR = hrArr.concat([hr]);
        nk = normalizePool(allK);
        nbb = invertPool(normalizePool(allBB));
        nhr = invertPool(normalizePool(allHR));
        idx = allK.length - 1;
      }
      return Math.round((0.4 * (nk[idx] || 50) + 0.35 * (nbb[idx] || 50) + 0.25 * (nhr[idx] || 50)) * 10) / 10;
    }
    var kPts = k * 100;
    var bbInv = (1 - bb) * 100;
    var hrInv = (1 - Math.min(hr / 3, 1)) * 100;
    var raw = kPts * 0.4 + bbInv * 0.35 + hrInv * 0.25;
    return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
  }

  function pitcherOorFromTeamHand(team, hand, oorByTeam) {
    if (!oorByTeam || !team) return null;
    var row = oorByTeam[teamKey(team)];
    if (!row) return null;
    var h = String(hand || 'R').trim().toUpperCase().charAt(0);
    if (h === 'L' && row.hvL != null) return row.hvL;
    if (h === 'R' && row.hvR != null) return row.hvR;
    if (row.hvP != null) return row.hvP;
    if (row.hvR != null && row.hvL != null) return row.hvR * 0.55 + row.hvL * 0.45;
    return row.oor != null ? row.oor : null;
  }

  function buildOorByTeam(oorRows) {
    var map = {};
    (oorRows || []).forEach(function(row) {
      var t = teamKey(pickCol(row, 'Tm', 'tm', 'team', 't'));
      if (!t) return;
      map[t] = {
        t: t,
        hvP: numOrNull(pickCol(row, 'HvP', 'hvP')),
        hvL: numOrNull(pickCol(row, 'HvL', 'hvL')),
        hvR: numOrNull(pickCol(row, 'HvR', 'hvR')),
        oor: numOrNull(pickCol(row, 'OOR', 'oor'))
      };
    });
    return map;
  }

  /** Enrich SP_Profiles rows with PitchScore, OOR proxy, FIP fallback — mutates rows in place. */
  function enrichSpProfiles(rows, oorByTeam) {
    if (!rows || !rows.length) return rows;
    var pool = rows.map(function(row) {
      return {
        k: pickCol(row, 'K_pct', 'K%', 'k_pct'),
        bb: pickCol(row, 'BB_pct', 'BB%', 'bb_pct'),
        hr: numOrNull(pickCol(row, 'HR9', 'HR/9', 'hr9'))
      };
    });
    rows.forEach(function(row, i) {
      var kPct = pickCol(row, 'K_pct', 'K%', 'k_pct');
      var bbPct = pickCol(row, 'BB_pct', 'BB%', 'bb_pct');
      var hr9 = numOrNull(pickCol(row, 'HR9', 'HR/9', 'hr9'));
      var ps = computePitchScoreFromRates(kPct, bbPct, hr9, pool);
      if (ps != null) row.PitchScore = ps;
      var era = numOrNull(pickCol(row, 'ERA', 'era'));
      var fip = numOrNull(pickCol(row, 'FIP', 'fip'));
      row.FIP = fip != null ? fip : era;
      row.FIP_na = fip == null && era == null;
      row.xFIP = null;
      var team = pickCol(row, 'pitcher_team', 'Team', 'Tm');
      var hand = pickCol(row, 'pitcher_hand', 'Hand', 'hand');
      var oor = pitcherOorFromTeamHand(team, hand, oorByTeam);
      if (oor != null) row.OOR = oor;
      var staleRaw = pickCol(row, 'stale', 'staleness_flag', 'Staleness');
      row.stale = staleRaw === true || staleRaw === 'True' || staleRaw === 'true' || staleRaw === '1';
      row.staleness_flag = row.stale;
      row.L14_drift = row.stale ? 'Stale' : null;
    });
    return rows;
  }

  function scoreRowFromSheet(row) {
    var t = teamKey(pickCol(row, 'Tm', 'Team', 'tm'));
    if (!t) return null;
    var abq = numOrNull(pickCol(row, 'ABQ', 'abq'));
    var rcv = numOrNull(pickCol(row, 'RCV', 'rcv'));
    var obr = numOrNull(pickCol(row, 'OBR', 'obr'));
    var osi = numOrNull(pickCol(row, 'OSI', 'osi'));
    var projOSI = numOrNull(pickCol(row, 'projOSI', 'ProjOSI', 'proj_osi'));
    var reg = numOrNull(pickCol(row, 'reg_signal', 'reg', 'Reg_signal'));
    var ppGap = numOrNull(pickCol(row, 'PP-Gap', 'ppGap', 'PP_Gap'));
    if (abq === null || rcv === null || obr === null || osi === null) return null;
    if (projOSI == null) projOSI = osi;
    if (ppGap == null && abq != null && rcv != null) ppGap = abq - rcv;
    var woba = numOrNull(pickCol(row, 'wOBA', 'woba', 'woba_rhp'));
    var xwoba = numOrNull(pickCol(row, 'xwOBA', 'xwoba'));
    var slg = numOrNull(pickCol(row, 'SLG', 'slg'));
    var obp = numOrNull(pickCol(row, 'OBP', 'obp'));
    var ops = numOrNull(pickCol(row, 'OPS', 'ops'));
    var avg = numOrNull(pickCol(row, 'AVG', 'avg'));
    var wrc = numOrNull(pickCol(row, 'wRC+', 'wrc_plus', 'wRC'));
    var iso = numOrNull(pickCol(row, 'ISO', 'iso'));
    var k = numOrNull(pickCol(row, 'K%', 'k_pct'));
    var bb = numOrNull(pickCol(row, 'BB%', 'bb_pct'));
    var barrel = numOrNull(pickCol(row, 'Barrel%', 'barrel_pct'));
    var hard = numOrNull(pickCol(row, 'HardHit%', 'hardhit_pct'));
    if (woba === 0) woba = null;
    if (xwoba === 0) xwoba = null;
    if (slg === 0) slg = null;
    if (obp === 0) obp = null;
    if (avg === 0) avg = null;
    if (wrc === 0) wrc = null;
    if (xwoba == null && woba != null) xwoba = woba;
    if (ops == null && obp != null && slg != null) ops = Math.round((obp + slg) * 1000) / 1000;
    if (iso == null && slg != null && avg != null) {
      iso = Math.round((slg - avg) * 1000) / 1000;
    }
    return {
      t: t, abq: abq, rcv: rcv, obr: obr, osi: osi,
      projOSI: projOSI, reg_signal: reg, reg: reg, ppGap: ppGap,
      wrc: wrc, iso: iso, avg: avg, obp: obp, ops: ops, woba: woba, xwoba: xwoba, slg: slg,
      k: k, bb: bb, barrel: barrel, hard: hard
    };
  }

  /** ISO from sheet column or SLG − AVG (matches FanGraphs ISO when column absent). */
  function resolveIso(row) {
    if (!row) return null;
    if (row.iso != null && !isNaN(row.iso)) return row.iso;
    if (row.slg != null && row.avg != null && !isNaN(row.slg) && !isNaN(row.avg)) {
      return Math.round((row.slg - row.avg) * 1000) / 1000;
    }
    return null;
  }

  function _ptfPlusFromXfipLeague(palsMap, team) {
    if (!palsMap || !team) return null;
    var tk = teamKey(team);
    var pack = palsMap[tk];
    if (!pack || pack.xfip == null || isNaN(pack.xfip)) return null;
    var vals = [];
    Object.keys(palsMap).forEach(function(t) {
      var x = palsMap[t] && palsMap[t].xfip;
      if (x != null && !isNaN(x)) vals.push(x);
    });
    if (vals.length < 10) return null;
    var min = Math.min.apply(null, vals);
    var max = Math.max.apply(null, vals);
    if (max <= min) return null;
    var norm = ((pack.xfip - min) / (max - min)) * 100;
    return Math.round((100 - norm) * 10) / 10;
  }

  function resolvePtfPlus(palsPack, palsMap, team) {
    if (!palsPack) return null;
    if (palsPack.ptfPlus != null && !isNaN(palsPack.ptfPlus)) return palsPack.ptfPlus;
    if (palsMap) return _ptfPlusFromXfipLeague(palsMap, team || palsPack.t);
    return null;
  }

  /** SOS = 100 − PTF+ (higher = harder pitching schedule faced). */
  function sosFromPalsPack(palsPack, palsMap, team) {
    if (!palsPack) return null;
    if (palsPack.sos != null && !isNaN(palsPack.sos)) return palsPack.sos;
    var ptf = resolvePtfPlus(palsPack, palsMap, team || palsPack.t);
    if (ptf == null || isNaN(ptf)) return null;
    return Math.round((100 - ptf) * 10) / 10;
  }

  function enrichPalsMap(map) {
    if (!map) return map;
    var teams = Object.keys(map);
    teams.forEach(function(t) {
      var pack = map[t];
      if (!pack) return;
      if (pack.ptfPlus == null) {
        pack.ptfPlus = _ptfPlusFromXfipLeague(map, t);
      }
      if (pack.sos == null) {
        var ptf = pack.ptfPlus;
        if (ptf != null && !isNaN(ptf)) pack.sos = Math.round((100 - ptf) * 10) / 10;
      }
    });
    return map;
  }

  function findScoreRow(rows, team) {
    var tk = teamKey(team);
    if (!tk || !rows || !rows.length) return null;
    for (var i = 0; i < rows.length; i++) {
      if (teamKey(rows[i].t) === tk) return rows[i];
    }
    return null;
  }

  /** vs RHP / vs LHP YTD ratios vs blended Both — scales Team_Profiles window fields by platoon. */
  function handMetricRatios(hand, team, scR, scL, scBoth) {
    if (!hand || hand === 'both') return null;
    var both = findScoreRow(scBoth, team);
    var handRow = findScoreRow(hand === 'r' ? scR : scL, team);
    if (!both || !handRow) return null;
    var ratios = {};
    ['osi', 'abq', 'rcv', 'obr', 'projOSI'].forEach(function(m) {
      var b = both[m], h = handRow[m];
      if (b != null && h != null && !isNaN(b) && !isNaN(h) && Math.abs(b) > 0.01) {
        ratios[m] = h / b;
      }
    });
    return Object.keys(ratios).length ? ratios : null;
  }

  /** PA-weighted team ABQ/RCV/OBR/OSI (+ wRC+/wOBA/SLG) from Batter_Splits_Home/Away rows. */
  function aggregateTeamOffenseFromBatterRows(rows) {
    var map = {};
    (rows || []).forEach(function(row) {
      var team = teamKey(pickCol(row, 'Tm', 'Team', 'team', 'team_abbr', 't'));
      if (!team) return;
      if (!map[team]) {
        map[team] = {
          t: team, paSum: 0,
          osi: 0, abq: 0, rcv: 0, obr: 0,
          wrc: 0, woba: 0, xwoba: 0, slg: 0, obp: 0,
          avg: 0, bb: 0, avgPa: 0, bbPa: 0,
          hasOsi: false, hasRate: false
        };
      }
      var d = map[team];
      var pa = parseFloat(pickCol(row, 'PA', 'pa')) || 0;
      if (pa < 1) pa = 1;
      var osi = numOrNull(pickCol(row, 'OSI', 'osi'));
      var abq = numOrNull(pickCol(row, 'ABQ', 'abq'));
      var rcv = numOrNull(pickCol(row, 'RCV', 'rcv'));
      var obr = numOrNull(pickCol(row, 'OBR', 'obr'));
      if (osi != null && abq != null && rcv != null && obr != null) {
        d.osi += osi * pa;
        d.abq += abq * pa;
        d.rcv += rcv * pa;
        d.obr += obr * pa;
        d.hasOsi = true;
        d.paSum += pa;
      }
      var wrc = numOrNull(pickCol(row, 'wRC+', 'wrc', 'wRC'));
      var woba = numOrNull(pickCol(row, 'wOBA', 'woba'));
      var xwoba = numOrNull(pickCol(row, 'xwOBA', 'xwoba'));
      var slg = numOrNull(pickCol(row, 'SLG', 'slg'));
      var obp = numOrNull(pickCol(row, 'OBP', 'obp'));
      var avg = numOrNull(pickCol(row, 'AVG', 'avg'));
      var bbRaw = numOrNull(pickCol(row, 'BB%', 'BB_pct', 'bb_pct'));
      var bb = bbRaw != null ? rateAsPctPoints(bbRaw) : null;
      if (bb != null) bb = Math.round(bb * 10) / 10;
      if (wrc != null) {
        d.wrc += wrc * pa;
        d.woba += (woba != null ? woba : 0) * pa;
        d.xwoba += (xwoba != null ? xwoba : woba != null ? woba : 0) * pa;
        d.slg += (slg != null ? slg : 0) * pa;
        d.obp += (obp != null ? obp : 0) * pa;
        if (avg != null) {
          d.avg += avg * pa;
          d.avgPa += pa;
        }
        if (bb != null) {
          d.bb += bb * pa;
          d.bbPa += pa;
        }
        d.hasRate = true;
        if (!d.hasOsi) d.paSum += pa;
      }
    });
    return Object.keys(map).sort().map(function(t) {
      var d = map[t];
      var pa = d.paSum > 0 ? d.paSum : 1;
      var out = { t: d.t };
      if (d.hasOsi) {
        out.osi = Math.round(d.osi / pa * 10) / 10;
        out.abq = Math.round(d.abq / pa * 10) / 10;
        out.rcv = Math.round(d.rcv / pa * 10) / 10;
        out.obr = Math.round(d.obr / pa * 10) / 10;
        out.ppGap = out.abq - out.rcv;
        out.projOSI = out.osi;
      }
      if (d.hasRate) {
        var ratePa = d.paSum > 0 ? d.paSum : pa;
        out.wrc = Math.round(d.wrc / ratePa * 10) / 10;
        out.woba = Math.round(d.woba / ratePa * 1000) / 1000;
        out.xwoba = Math.round(d.xwoba / ratePa * 1000) / 1000;
        out.slg = Math.round(d.slg / ratePa * 1000) / 1000;
        out.obp = Math.round(d.obp / ratePa * 1000) / 1000;
        if (out.obp != null && out.slg != null) {
          out.ops = Math.round((out.obp + out.slg) * 1000) / 1000;
        }
        if (d.avgPa > 0) out.avg = Math.round(d.avg / d.avgPa * 1000) / 1000;
        if (d.bbPa > 0) out.bb = Math.round(d.bb / d.bbPa * 10) / 10;
      }
      if (out.osi == null && out.wrc != null) {
        // Phase 0 proxy: when split tabs provide only rate stats, map headline process metrics
        // through a light wRC+ anchored transform so context can still move values.
        var base = out.wrc;
        out.osi = base;
        out.rcv = base;
        out.abq = base;
        out.obr = base;
        out.ppGap = 0;
        out.projOSI = out.osi;
      }
      if (out.osi == null && out.woba != null) {
        var proxy = out.woba * 250;
        out.osi = proxy;
        out.rcv = proxy;
        out.abq = proxy;
        out.obr = proxy;
        out.ppGap = 0;
        out.projOSI = out.osi;
      }
      if (out.osi == null) return null;
      return _backfillXwoba(out);
    }).filter(Boolean);
  }

  function applyHandMetricRatios(row, ratios) {
    if (!row || !ratios) return row;
    var out = Object.assign({}, row);
    Object.keys(ratios).forEach(function(m) {
      if (out[m] != null && !isNaN(out[m]) && ratios[m] != null && ratios[m] !== 1) {
        out[m] = out[m] * ratios[m];
      }
    });
    if (out.abq != null && out.rcv != null) out.ppGap = out.abq - out.rcv;
    return out;
  }

  function scaleRowMetrics(row, ratio) {
    var out = Object.assign({}, row);
    if (ratio == null || isNaN(ratio) || ratio === 1) return out;
    ['osi', 'abq', 'rcv', 'obr', 'projOSI', 'wrc', 'woba', 'xwoba', 'slg'].forEach(function(k) {
      if (out[k] != null && !isNaN(out[k])) out[k] = out[k] * ratio;
    });
    if (out.abq != null && out.rcv != null) out.ppGap = out.abq - out.rcv;
    return out;
  }

  function blendSplits(scR, scL) {
    var by = {};
    (scR || []).forEach(function(r) { if (r && r.t) by[r.t] = { r: r }; });
    (scL || []).forEach(function(l) {
      if (!l || !l.t) return;
      if (!by[l.t]) by[l.t] = {};
      by[l.t].l = l;
    });
    return Object.keys(by).sort().map(function(t) {
      var pack = by[t], r = pack.r, l = pack.l;
      if (!r && l) return Object.assign({}, l);
      if (r && !l) return Object.assign({}, r);
      function b(k) {
        var rv = numOrNull(r[k]);
        var lv = numOrNull(l[k]);
        if (rv == null && lv == null) return null;
        if (rv == null) return lv;
        if (lv == null) return rv;
        return 0.5 * rv + 0.5 * lv;
      }
      var row = {
        t: t,
        abq: b('abq'),
        rcv: b('rcv'),
        obr: b('obr'),
        osi: b('osi'),
        projOSI: b('projOSI'),
        reg: r.reg != null ? r.reg : l.reg,
        ppGap: null,
        wrc: b('wrc'),
        woba: b('woba'),
        xwoba: b('xwoba'),
        slg: b('slg'),
        obp: b('obp'),
        ops: b('ops'),
        avg: b('avg'),
        bb: b('bb')
      };
      if (row.ops == null && row.obp != null && row.slg != null) {
        row.ops = Math.round((row.obp + row.slg) * 1000) / 1000;
      }
      if (row.abq != null && row.rcv != null) row.ppGap = row.abq - row.rcv;
      return row;
    });
  }

  function normalizeHubFilter(filter) {
    return normalizeFilter(filter || {});
  }

  function _windowSuffix(windowKey) {
    if (windowKey === 'L30') return 'l30';
    if (windowKey === 'L14') return 'l14';
    if (windowKey === 'L7') return 'l7';
    return null;
  }

  function _num(v) {
    return v == null || v === '' || isNaN(v) ? null : Number(v);
  }

  /** Team profiles and location splits often have wOBA but not xwOBA — mirror vs_RHP sheet fallback. */
  function _backfillXwoba(row) {
    if (!row) return row;
    if (_num(row.xwoba) == null && _num(row.woba) != null) row.xwoba = _num(row.woba);
    return row;
  }

  function _profileForTeam(teamProfiles, team) {
    var tk = teamKey(team);
    return (teamProfiles && (teamProfiles[tk] || teamProfiles[team])) || {};
  }

  function _trend(ytd, l14, l7) {
    ytd = _num(ytd); l14 = _num(l14); l7 = _num(l7);
    if (ytd == null) return 'Stable';
    if (l14 != null && l7 != null && l14 > ytd + 3 && l7 > ytd + 3) return 'Rising';
    if ((l14 != null && l14 < ytd - 3) || (l7 != null && l7 < ytd - 5)) return 'Cooling';
    if (l7 != null && l7 > ytd + 5 && l14 != null && Math.abs(l14 - ytd) <= 2) return 'Fake Hot';
    return 'Stable';
  }

  function _tier(osi) {
    osi = _num(osi);
    if (osi == null) return { label: '—', cls: 'tier-incon' };
    if (osi >= 85) return { label: 'Elite', cls: 'tier-elite' };
    if (osi >= 75) return { label: 'High-Level', cls: 'tier-high' };
    if (osi >= 65) return { label: 'Dangerous', cls: 'tier-danger' };
    if (osi >= 50) return { label: 'Inconsistent', cls: 'tier-incon' };
    return { label: 'Weak', cls: 'tier-weak' };
  }

  function _resultsWindowSuffix(windowKey) {
    if (windowKey === 'L30') return 'l30';
    if (windowKey === 'L14') return 'l14';
    if (windowKey === 'L7') return 'l7';
    return null;
  }

  /** Team_Results stores rates as 0–1; dashboard Surface-wins uses 0–100. */
  function _pctFromResults(raw) {
    var v = _num(raw);
    if (v == null) return null;
    if (v >= 0 && v <= 1) return Math.round(v * 1000) / 10;
    return Math.round(v * 10) / 10;
  }

  function _teamResultsPopulated(resultsByTeam) {
    var map = resultsByTeam || {};
    return Object.keys(map).some(function(t) {
      return _pctFromResults(map[t].win_pct) != null;
    });
  }

  function resultVal(resultsRow, metric, filter) {
    if (!resultsRow || !metric) return null;
    var winSuf = _resultsWindowSuffix(filter && filter.window);
    var locSuf = filter && filter.location === 'home' ? 'home'
      : filter && filter.location === 'away' ? 'away' : null;
    var candidates = [];
    if (winSuf && locSuf) {
      candidates.push(metric + '_' + winSuf);
      candidates.push(metric + '_' + locSuf);
    } else if (winSuf) {
      candidates.push(metric + '_' + winSuf);
    } else if (locSuf) {
      candidates.push(metric + '_' + locSuf);
    }
    candidates.push(metric);
    for (var i = 0; i < candidates.length; i++) {
      var col = candidates[i];
      var raw = resultsRow[col];
      if (raw == null || raw === '') raw = pickCol(resultsRow, col, col.toUpperCase());
      var v = _pctFromResults(raw);
      if (v != null) return v;
    }
    return null;
  }

  function parseTeamResultsMap(rows) {
    var map = {};
    (rows || []).forEach(function(row) {
      var t = teamKey(pickCol(row, 'team', 'Tm', 'Team', 'tm'));
      if (!t) return;
      var rec = {};
      Object.keys(row || {}).forEach(function(k) {
        if (!k || k === 'team') return;
        var v = numOrNull(row[k]);
        if (v != null) rec[String(k).trim().toLowerCase()] = v;
      });
      map[t] = rec;
    });
    return map;
  }

  function parseL10SpHandMap(rows) {
    var map = {};
    (rows || []).forEach(function(row) {
      if (!row) return;
      var team = teamKey(pickCol(row, 'team', 'Tm', 'Team'));
      var hand = String(pickCol(row, 'opp_starter_hand', 'opp starter hand', 'Opp_Starter_Hand') || '').trim().toUpperCase();
      if (!team || (hand !== 'R' && hand !== 'L')) return;
      map[team + ':' + hand] = row;
    });
    return map;
  }

  function buildSpPitchScoreById(rows) {
    var list = (rows || []).slice();
    if (!list.length) return {};
    enrichSpProfiles(list, null);
    var map = {};
    list.forEach(function(row) {
      var pid = pickCol(row, 'pitcher_id', 'pitcher id', 'Pitcher_ID');
      if (pid == null || pid === '') return;
      var ps = numOrNull(pickCol(row, 'PitchScore', 'Pitching Score'));
      if (ps != null) map[String(pid)] = ps;
    });
    return map;
  }

  function _l10PitchScoreFromRow(row) {
    if (!row) return null;
    return _num(pickCol(row, 'pitch_score_against', 'pitch score against', 'Pitch Score Against'));
  }

  function _filterL10GamesForPitchScore(games, tk, f) {
    return (games || []).filter(function(g) {
      if (!g) return false;
      if (teamKey(pickCol(g, 'team', 'Tm', 'Team')) !== tk) return false;
      if (f.hand === 'r' || f.hand === 'l') {
        var hand = String(pickCol(g, 'opp_starter_hand', 'opp starter hand', 'Opp_Starter_Hand') || '').trim().toUpperCase();
        if (f.hand === 'r' && hand !== 'R') return false;
        if (f.hand === 'l' && hand !== 'L') return false;
      }
      if (f.location === 'home' || f.location === 'away') {
        var loc = String(pickCol(g, 'home_away', 'home away', 'Home_Away') || '').trim().toLowerCase();
        if (f.location === 'home' && loc !== 'home') return false;
        if (f.location === 'away' && loc !== 'away') return false;
      }
      var pa = _num(pickCol(g, 'vs_sp_pa', 'vs sp pa', 'Vs_SP_PA'));
      return pa != null && pa > 0;
    }).sort(function(a, b) {
      return String(pickCol(b, 'date', 'Date')).localeCompare(String(pickCol(a, 'date', 'Date')));
    });
  }

  function _windowGameCount(windowKey) {
    if (windowKey === 'L7') return 7;
    if (windowKey === 'L14') return 14;
    if (windowKey === 'L30') return 30;
    return null;
  }

  function _pitchScoreFromGames(games, spPitchById, maxN) {
    var slice = maxN ? games.slice(0, maxN) : games;
    var vals = [];
    slice.forEach(function(g) {
      var pid = pickCol(g, 'opp_starter_id', 'opp starter id', 'Opp_Starter_ID');
      if (pid == null || pid === '') return;
      var ps = spPitchById[String(pid)];
      if (ps == null) ps = spPitchById[String(Number(pid))];
      if (ps != null) vals.push(ps);
    });
    if (!vals.length) return null;
    return Math.round(vals.reduce(function(s, v) { return s + v; }, 0) / vals.length * 10) / 10;
  }

  function resolvePitchScoreFaced(tk, f, prof, palsRow, store) {
    var l10Map = (store && store.l10SpHandMap) || {};
    var games = (store && store.l10SpHandGames) || [];
    var spPitchById = (store && store.spPitchById) || {};
    var wantsLocation = f.location === 'home' || f.location === 'away';
    var wantsWindow = f.window && f.window !== 'YTD';

    if (wantsLocation || wantsWindow || f.hand === 'r' || f.hand === 'l') {
      var filtered = _filterL10GamesForPitchScore(games, tk, f);
      var n = wantsWindow ? _windowGameCount(f.window) : null;
      var fromGames = _pitchScoreFromGames(filtered, spPitchById, n);
      if (fromGames != null) return fromGames;
    }

    if (f.hand === 'r' || f.hand === 'l') {
      var handChar = f.hand === 'l' ? 'L' : 'R';
      var handPs = _l10PitchScoreFromRow(l10Map[tk + ':' + handChar]);
      if (handPs != null) return handPs;
    } else if (f.hand === 'both') {
      var rRow = l10Map[tk + ':R'];
      var lRow = l10Map[tk + ':L'];
      var rPs = _l10PitchScoreFromRow(rRow);
      var lPs = _l10PitchScoreFromRow(lRow);
      var rGames = rRow ? _num(rRow.games) : null;
      var lGames = lRow ? _num(lRow.games) : null;
      if (rPs != null && lPs != null && rGames != null && lGames != null && (rGames + lGames) > 0) {
        return Math.round(((rPs * rGames) + (lPs * lGames)) / (rGames + lGames) * 10) / 10;
      }
      if (rPs != null && lPs == null) return rPs;
      if (lPs != null && rPs == null) return lPs;
    }

    if (palsRow && _num(palsRow.pitchScoreFaced) != null) return _num(palsRow.pitchScoreFaced);
    return _num(prof.avg_pitching_score);
  }

  function resolveLineupRows(store, filter, options) {
    var f = normalizeHubFilter(filter);
    var data = store || {};
    var scR = data.scR || [];
    var scL = data.scL || [];
    var scBoth = (data.scBoth && data.scBoth.length) ? data.scBoth : blendSplits(scR, scL);
    var scHome = data.scHome || [];
    var scAway = data.scAway || [];
    var scVsSp = data.scVsSp || [];
    var scVsRp = data.scVsRp || [];
    var teamProfiles = data.teamProfiles || {};
    var palsByTeam = data.palsByTeam || {};
    var resultsByTeam = data.resultsByTeam || {};
    var resultsPopulated = _teamResultsPopulated(resultsByTeam);
    var opts = options || {};
    var resultsFilter = { window: f.window, location: f.location };

    var source = scBoth;
    var sourceKey = 'both';
    if (f.hand === 'r') { source = scR; sourceKey = 'hand:r'; }
    else if (f.hand === 'l') { source = scL; sourceKey = 'hand:l'; }

    var unavailable = {
      window: false,
      location: false,
      pitcher: false,
      segment: false
    };
    var windowAppliedAny = false;
    var locationAppliedAny = false;
    var pitcherAppliedAny = false;

    if (f.window === 'YTD' && f.hand === 'both') {
      if (f.location === 'home') {
        if (scHome.length >= 10) { source = scHome; sourceKey = 'ytd:home'; }
        else unavailable.location = true;
      } else if (f.location === 'away') {
        if (scAway.length >= 10) { source = scAway; sourceKey = 'ytd:away'; }
        else unavailable.location = true;
      }

      if (f.pitcher === 'sp') {
        if (scVsSp.length >= 10) { source = scVsSp; sourceKey = 'ytd:sp'; }
        else unavailable.pitcher = true;
      } else if (f.pitcher === 'rp') {
        if (scVsRp.length >= 10) { source = scVsRp; sourceKey = 'ytd:rp'; }
        else unavailable.pitcher = true;
      }
    }

    var homeMap = {};
    var awayMap = {};
    var bothMap = {};
    var spMap = {};
    var rpMap = {};
    scHome.forEach(function(r) { if (r && r.t) homeMap[teamKey(r.t)] = r; });
    scAway.forEach(function(r) { if (r && r.t) awayMap[teamKey(r.t)] = r; });
    scBoth.forEach(function(r) { if (r && r.t) bothMap[teamKey(r.t)] = r; });
    scVsSp.forEach(function(r) { if (r && r.t) spMap[teamKey(r.t)] = r; });
    scVsRp.forEach(function(r) { if (r && r.t) rpMap[teamKey(r.t)] = r; });

    var rows = (source || []).map(function(base) {
      var d = _backfillXwoba(Object.assign({}, base));
      var t = d.t;
      var tk = teamKey(t);
      var prof = _profileForTeam(teamProfiles, t);
      var palsRow = palsByTeam[tk] || null;
      if (d.ppGap == null && d.abq != null && d.rcv != null) d.ppGap = d.abq - d.rcv;
      if (_num(d.pals) == null && palsRow && _num(palsRow.pals) != null) d.pals = _num(palsRow.pals);
      if (_num(d.xfip) == null && palsRow && _num(palsRow.xfip) != null) d.xfip = _num(palsRow.xfip);
      d.ytdOSI = prof.osi_ytd != null ? _num(prof.osi_ytd) : _num(d.osi);
      d.l30OSI = _num(prof.osi_l30);
      d.l14OSI = _num(prof.osi_l14);
      d.l7OSI = _num(prof.osi_l7);
      d.pitchScoreFaced = resolvePitchScoreFaced(tk, f, prof, palsRow, data);
      d.pitchScore = d.pitchScoreFaced != null ? d.pitchScoreFaced : _num(prof.avg_pitching_score);
      var ipNorm = _num(prof.avg_ip_per_start);
      var ipPerStart = ipNorm != null ? (ipNorm > 0 && ipNorm < 1.5 ? ipNorm * 9 : ipNorm) : null;
      var difSuf = f.window !== 'YTD' ? _windowSuffix(f.window) : null;
      // Real pitches/inning forced (windowed) from team_results; 92/IP-per-start proxy only as fallback.
      var realPitchInn = _num(difSuf ? prof['pitch_inn_' + difSuf] : prof.pitch_inn);
      if (realPitchInn == null) realPitchInn = _num(prof.pitch_inn);
      d.pitchInn = realPitchInn != null ? realPitchInn
        : (ipPerStart != null && ipPerStart > 0 ? (92 / ipPerStart) : null);
      // QS% allowed (windowed) from team_results, falling back to season then an IP/start proxy.
      var qsRaw = _num(difSuf ? prof['qs_against_pct_' + difSuf] : null);
      if (qsRaw == null) qsRaw = _num(prof.qs_against_pct != null ? prof.qs_against_pct : prof.qs_against);
      if (qsRaw != null) d.qs = qsRaw;
      else if (ipPerStart != null) d.qs = Math.max(0, Math.min(100, ((ipPerStart - 4.0) / 2.5) * 100)); // IP/start -> QS% proxy

      if (f.window !== 'YTD') {
        var suf = _windowSuffix(f.window);
        var applied = false;
        ['osi', 'abq', 'rcv', 'obr'].forEach(function(m) {
          var wv = _num(prof[m + '_' + suf]);
          if (wv != null) {
            d[m] = wv;
            applied = true;
          }
        });
        if (applied) windowAppliedAny = true;
        if (applied && f.hand !== 'both') {
          var ratios = handMetricRatios(f.hand, t, scR, scL, scBoth);
          if (ratios) d = applyHandMetricRatios(d, ratios);
        }
      }

      if (f.location === 'home' || f.location === 'away') {
        var loc = f.location;
        var alreadyScoped = f.window === 'YTD' && f.hand === 'both'
          && ((loc === 'home' && scHome.length >= 10) || (loc === 'away' && scAway.length >= 10));
        if (!alreadyScoped) {
          var locRow = loc === 'home' ? homeMap[teamKey(t)] : awayMap[teamKey(t)];
          var locRatio = null;
          var locOsi = _num(prof[loc + '_osi']);
          var baseOsi = _num(prof.osi_ytd) != null ? _num(prof.osi_ytd) : _num(prof.osi);
          if (locOsi != null && baseOsi != null && Math.abs(baseOsi) > 0.0001) locRatio = locOsi / baseOsi;
          if (locRatio == null && locRow) {
            var baseBothForLoc = bothMap[teamKey(t)];
            if (baseBothForLoc && _num(locRow.osi) != null && _num(baseBothForLoc.osi) != null && Math.abs(_num(baseBothForLoc.osi)) > 0.0001) {
              locRatio = _num(locRow.osi) / _num(baseBothForLoc.osi);
            }
          }
          var scaled = false;
          ['osi', 'abq', 'rcv', 'obr'].forEach(function(m) {
            var locVal = _num(prof[loc + '_' + m]);
            var ytdVal = m === 'osi' ? (_num(prof.osi_ytd) != null ? _num(prof.osi_ytd) : _num(prof.osi)) : _num(prof[m]);
            if (locVal == null || ytdVal == null || Math.abs(ytdVal) < 0.01) return;
            if (_num(d[m]) != null) {
              d[m] = d[m] * (locVal / ytdVal);
              scaled = true;
            }
          });
          if (scaled) {
            locationAppliedAny = true;
            ['wrc', 'woba', 'xwoba', 'slg'].forEach(function(m) {
              var v = _num(prof[loc + '_' + m]);
              if (v == null && locRow) v = _num(locRow[m]);
              if (locRow && (m === 'woba' || m === 'xwoba') && _num(d[m]) != null) {
                var baseBothForWoba = bothMap[teamKey(t)];
                var locWrc = _num(locRow.wrc);
                var baseWrc = baseBothForWoba ? _num(baseBothForWoba.wrc) : null;
                if (locWrc != null && baseWrc != null && Math.abs(baseWrc) > 0.0001) {
                  v = _num(d[m]) * (locWrc / baseWrc);
                }
              }
              if (v == null && locRatio != null && _num(d[m]) != null) v = _num(d[m]) * locRatio;
              if (v != null) d[m] = v;
            });
            if (d.abq != null && d.rcv != null) d.ppGap = d.abq - d.rcv;
          } else if (locRow) {
            // If explicit location aggregate rows exist, apply them directly so location context is never silently ignored.
            ['wrc', 'woba', 'xwoba', 'slg'].forEach(function(m) {
              var lv = _num(locRow[m]);
              if ((m === 'woba' || m === 'xwoba') && _num(d[m]) != null) {
                var baseBothForWoba2 = bothMap[teamKey(t)];
                var locWrc2 = _num(locRow.wrc);
                var baseWrc2 = baseBothForWoba2 ? _num(baseBothForWoba2.wrc) : null;
                if (locWrc2 != null && baseWrc2 != null && Math.abs(baseWrc2) > 0.0001) {
                  lv = _num(d[m]) * (locWrc2 / baseWrc2);
                }
              }
              if (lv == null && locRatio != null && _num(d[m]) != null) lv = _num(d[m]) * locRatio;
              if (lv != null) d[m] = lv;
            });
            var baseBoth = bothMap[teamKey(t)];
            if (baseBoth && _num(locRow.osi) != null && _num(baseBoth.osi) != null && Math.abs(_num(baseBoth.osi)) > 0.0001) {
              ['osi', 'abq', 'rcv', 'obr', 'projOSI'].forEach(function(m) {
                if (_num(d[m]) == null) return;
                d[m] = d[m] * (_num(locRow.osi) / _num(baseBoth.osi));
              });
              if (d.abq != null && d.rcv != null) d.ppGap = d.abq - d.rcv;
            }
            locationAppliedAny = true;
          }
        }
      }

      if (f.pitcher === 'sp' || f.pitcher === 'rp') {
        var alreadyPitchScoped = f.window === 'YTD' && f.hand === 'both' && f.location === 'all'
          && ((f.pitcher === 'sp' && scVsSp.length >= 10) || (f.pitcher === 'rp' && scVsRp.length >= 10));
        if (!alreadyPitchScoped) {
          var pitchRow = f.pitcher === 'sp' ? spMap[teamKey(t)] : rpMap[teamKey(t)];
          var baseBoth = bothMap[teamKey(t)];
          if (pitchRow && baseBoth) {
            pitcherAppliedAny = true;
            var ratioBase = null;
            if (_num(pitchRow.wrc) != null && _num(baseBoth.wrc) != null && Math.abs(_num(baseBoth.wrc)) > 0.0001) {
              ratioBase = _num(pitchRow.wrc) / _num(baseBoth.wrc);
            } else if (_num(pitchRow.woba) != null && _num(baseBoth.woba) != null && Math.abs(_num(baseBoth.woba)) > 0.0001) {
              ratioBase = _num(pitchRow.woba) / _num(baseBoth.woba);
            }
            ['osi', 'abq', 'rcv', 'obr', 'wrc', 'woba', 'xwoba', 'slg', 'projOSI'].forEach(function(m) {
              var pv = _num(pitchRow[m]);
              var bv = _num(baseBoth[m]);
              if (_num(d[m]) == null) return;
              if (pv != null && bv != null && Math.abs(bv) > 0.0001) {
                d[m] = d[m] * (pv / bv);
              } else if (ratioBase != null) {
                d[m] = d[m] * ratioBase;
              }
            });
            ['bb', 'avg', 'ops', 'obp'].forEach(function(m) {
              var pv = _num(pitchRow[m]);
              if (pv != null) d[m] = pv;
            });
            if (d.abq != null && d.rcv != null) d.ppGap = d.abq - d.rcv;
          }
        }
      }

      if (f.pitcher === 'sp' || f.pitcher === 'rp') {
        var rpOrSpRow = f.pitcher === 'rp' ? rpMap[tk] : spMap[tk];
        if (rpOrSpRow) {
          if (_num(d.bb) == null) d.bb = _num(rpOrSpRow.bb);
          if (_num(d.avg) == null) d.avg = _num(rpOrSpRow.avg);
          if (_num(d.ops) == null) d.ops = _num(rpOrSpRow.ops);
        }
      }

      if (f.segment === 'f5') {
        if (_num(d.abq) != null && _num(d.obr) != null && _num(d.rcv) != null) {
          d.osi = (d.abq * 0.45) + (d.obr * 0.35) + (d.rcv * 0.20);
        }
        if (_num(d.abq) != null && _num(d.rcv) != null) d.ppGap = d.abq - d.rcv;
      }

      var R = resultsByTeam[tk] || null;
      if (resultsPopulated) {
        d.winPct = resultVal(R, 'win_pct', resultsFilter);
        d.f5WinPct = resultVal(R, 'f5_win_pct', resultsFilter);
        d.pitcherWinPct = resultVal(R, f.pitcher === 'rp' ? 'rp_win_pct' : 'sp_win_pct', resultsFilter);
      } else {
        d.winPct = null;
        d.f5WinPct = null;
        d.pitcherWinPct = null;
      }

      d.trend = _trend(d.ytdOSI, d.l14OSI, d.l7OSI);
      d.tier = _tier(d.osi);
      return _backfillXwoba(d);
    }).filter(Boolean);

    if (opts.includeMeta) {
      if (f.window !== 'YTD' && !windowAppliedAny) unavailable.window = true;
      if ((f.location === 'home' || f.location === 'away') && !locationAppliedAny && !(f.window === 'YTD' && f.hand === 'both')) {
        unavailable.location = true;
      }
      if ((f.pitcher === 'sp' || f.pitcher === 'rp') && !pitcherAppliedAny && !(f.window === 'YTD' && f.hand === 'both')) {
        unavailable.pitcher = true;
      }
      if (f.segment === 'f5') {
        // No dedicated F5 split tabs currently; F5 context uses derived proxy.
        unavailable.segment = true;
      }
      if (opts.debugSource && typeof console !== 'undefined' && console.debug) {
        console.debug('[LineupModel] resolved_source', sourceKey, 'filter=', f, 'unavailable=', unavailable);
      }
      return {
        rows: rows,
        meta: {
          sourceKey: sourceKey,
          approxWindow: f.window !== 'YTD',
          approxLocation: (f.location === 'home' || f.location === 'away') && f.hand !== 'both',
          teamResultsEmpty: !resultsPopulated,
          resultsPitcherUnsplit: resultsPopulated && (f.pitcher === 'sp' || f.pitcher === 'rp'),
          resultsHandUnsplit: resultsPopulated && f.hand !== 'both',
          unavailable: unavailable
        }
      };
    }
    return rows;
  }

  function splitOSI(teamData, spHand) {
    if (!teamData) return null;
    var h = String(spHand || '').trim().toUpperCase().charAt(0);
    if (h === 'L') return teamData.vsL || teamData.l || null;
    if (h === 'R') return teamData.vsR || teamData.r || null;
    return teamData.both || teamData.b || null;
  }

  function localDateIso(d) {
    d = d || new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  /** MLB slate day is Eastern Time; avoid browser-local "yesterday" mismatch. */
  function easternDateIso(d) {
    d = d || new Date();
    try {
      // en-CA returns YYYY-MM-DD
      var iso = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    } catch (e) { /* ignore */ }
    return localDateIso(d);
  }

  function formatGameTimeEt(isoUtc) {
    if (!isoUtc) return 'TBD';
    try {
      var dt = new Date(isoUtc);
      if (isNaN(dt.getTime())) return 'TBD';
      return dt.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }) + ' ET';
    } catch (e) {
      return 'TBD';
    }
  }

  function fetchJsonWithTimeout(url, ms) {
    ms = ms || 10000;
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function() {
      try { ctrl.abort(); } catch (e) { /* ignore */ }
    }, ms) : null;
    return fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .finally(function() { if (timer) clearTimeout(timer); });
  }

  /** Live MLB Stats API schedule — source of truth for today's slate. */
  function fetchMlbTodaySchedule(dateIso) {
    var dateStr = dateIso || easternDateIso();
    var url = 'https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=' + encodeURIComponent(dateStr)
      + '&hydrate=probablePitcher,team,venue';
    return fetchJsonWithTimeout(url, 10000).then(function(data) {
      var games = [];
      (data.dates || []).forEach(function(block) {
        (block.games || []).forEach(function(game) {
          var awayNode = game.teams && game.teams.away;
          var homeNode = game.teams && game.teams.home;
          var awayTeam = awayNode && awayNode.team;
          var homeTeam = homeNode && homeNode.team;
          if (!awayTeam || !homeTeam) return;
          var away = normalizeTeamAbbrShared(awayTeam.abbreviation || awayTeam.teamName || awayTeam.name);
          var home = normalizeTeamAbbrShared(homeTeam.abbreviation || homeTeam.teamName || homeTeam.name);
          if (!away || !home) return;
          var awayProb = awayNode.probablePitcher || {};
          var homeProb = homeNode.probablePitcher || {};
          var awaySP = awayProb.fullName || 'TBD';
          var homeSP = homeProb.fullName || 'TBD';
          var awayHand = normalizePitcherHandShared(
            awayProb.pitchHand && awayProb.pitchHand.code
          );
          var homeHand = normalizePitcherHandShared(
            homeProb.pitchHand && homeProb.pitchHand.code
          );
          games.push({
            away: away,
            home: home,
            time: formatGameTimeEt(game.gameDate),
            awaySP: awaySP,
            homeSP: homeSP,
            awaySPId: awayProb.id || null,
            homeSPId: homeProb.id || null,
            awayHand: awayHand,
            homeHand: homeHand,
            stadium: (game.venue && game.venue.name) || '',
            gameKey: away + '@' + home,
            source: 'mlb-api'
          });
        });
      });
      console.info('[MATCHUPS] MLB API schedule', dateStr + ':', games.length, 'games');
      return { date: dateStr, games: games, source: 'mlb-api' };
    }).catch(function(err) {
      console.warn('[MATCHUPS] MLB schedule fetch failed', err);
      return { date: dateStr, games: [], error: err && err.message ? err.message : String(err) };
    });
  }

  function collectLineupMatchupKeys(matchups, liveSchedule, rawRows) {
    var keySet = {};
    function addKey(k) {
      k = normalizeLineupGameKeyShared(k);
      if (k) keySet[k] = true;
    }
    (matchups || []).forEach(function(m) { addKey(matchupGameKey(m)); });
    if (liveSchedule && liveSchedule.games) {
      liveSchedule.games.forEach(function(g) { addKey(matchupGameKey(g)); });
    }
    if (!Object.keys(keySet).length && rawRows && rawRows.length) {
      var today = easternDateIso();
      var dated = rawRows.filter(function(row) {
        var d = slateDateFromRow(row);
        return d && /^\d{4}-\d{2}-\d{2}$/.test(d);
      });
      var source = dated.filter(function(row) { return slateDateFromRow(row) === today; });
      if (!source.length && dated.length) {
        var sheetDays = {};
        dated.forEach(function(row) { sheetDays[slateDateFromRow(row)] = 1; });
        var latest = Object.keys(sheetDays).sort().pop();
        source = dated.filter(function(row) { return slateDateFromRow(row) === latest; });
      }
      source.forEach(function(row) {
        addKey(pickCol(row, 'Game', 'game_key', 'GameKey'));
      });
    }
    return Object.keys(keySet);
  }

  function parseMatchupRows(rows) {
    return (rows || []).map(function(row) {
      var away = normalizeTeamAbbrShared(pickCol(row, 'Away', 'Away_Team', 'away_team'));
      var home = normalizeTeamAbbrShared(pickCol(row, 'Home', 'Home_Team', 'home_team'));
      if (!away && !home) return null;
      return {
        time: String(pickCol(row, 'Time', 'Game_Time')).trim(),
        away: away,
        home: home,
        awaySP: String(pickCol(row, 'Away_SP', 'Away SP')).trim(),
        awayHand: normalizePitcherHandShared(pickCol(row, 'Away_Hand', 'Away Hand', 'Away_SP_Hand')),
        awayK: numOrNull(pickCol(row, 'Away_K%', 'Away K%')),
        awayBB: numOrNull(pickCol(row, 'Away_BB%', 'Away BB%')),
        awayHR9: numOrNull(pickCol(row, 'Away_HR9', 'Away HR/9')),
        awayERA: numOrNull(pickCol(row, 'Away_ERA', 'Away ERA')),
        awayFIP: numOrNull(pickCol(row, 'Away_FIP', 'Away FIP')),
        awayXFIP: numOrNull(pickCol(row, 'Away_xFIP', 'Away xFIP')),
        homeSP: String(pickCol(row, 'Home_SP', 'Home SP')).trim(),
        homeHand: normalizePitcherHandShared(pickCol(row, 'Home_Hand', 'Home Hand', 'Home_SP_Hand')),
        homeK: numOrNull(pickCol(row, 'Home_K%', 'Home K%')),
        homeBB: numOrNull(pickCol(row, 'Home_BB%', 'Home BB%')),
        homeHR9: numOrNull(pickCol(row, 'Home_HR9', 'Home HR/9')),
        homeERA: numOrNull(pickCol(row, 'Home_ERA', 'Home ERA')),
        homeFIP: numOrNull(pickCol(row, 'Home_FIP', 'Home FIP')),
        homeXFIP: numOrNull(pickCol(row, 'Home_xFIP', 'Home xFIP')),
        awayOSI: numOrNull(pickCol(row, 'Away_OSI', 'Away OSI')),
        homeOSI: numOrNull(pickCol(row, 'Home_OSI', 'Home OSI')),
        lineupEdge: String(pickCol(row, 'Lineup_Edge', 'Lineup Edge')).trim(),
        stadium: String(pickCol(row, 'Stadium', 'Venue', 'Ballpark')).trim()
      };
    }).filter(Boolean);
  }

  function parseBullpenUnitRows(rows) {
    var map = {};
    (rows || []).forEach(function(row) {
      var t = teamKey(pickCol(row, 'team', 'Tm', 'Team'));
      if (!t) return;
      var osiAllowed = numOrNull(pickCol(row, 'overall_OSI_allowed', 'OSI_allowed'));
      var bullpenScore = osiAllowed != null
        ? Math.max(0, Math.min(100, 100 - osiAllowed))
        : null;
      map[t] = {
        t: t,
        osiAllowed: osiAllowed,
        bullpenScore: bullpenScore,
        abqAllowed: numOrNull(pickCol(row, 'overall_ABQ_allowed')),
        rcvAllowed: numOrNull(pickCol(row, 'overall_RCV_allowed')),
        obrAllowed: numOrNull(pickCol(row, 'overall_OBR_allowed')),
        bbPct: numOrNull(pickCol(row, 'overall_BB_pct', 'BB%', 'BB_pct')),
        fip: numOrNull(pickCol(row, 'overall_FIP', 'FIP', 'fip')),
        era: numOrNull(pickCol(row, 'overall_ERA', 'ERA', 'era')),
        hiLevEra: numOrNull(pickCol(row, 'high_leverage_ERA', 'High Leverage ERA')),
        medLevEra: numOrNull(pickCol(row, 'medium_leverage_ERA', 'Medium Leverage ERA')),
        loLevEra: numOrNull(pickCol(row, 'low_leverage_ERA')),
        woba: numOrNull(pickCol(row, 'overall_wOBA', 'wOBA')),
        vsRhhOsi: numOrNull(pickCol(row, 'vs_rhh_OSI_allowed', 'vs_RHH_OSI_allowed', 'osi_allowed_vs_rhh')),
        vsLhhOsi: numOrNull(pickCol(row, 'vs_lhh_OSI_allowed', 'vs_LHH_OSI_allowed', 'osi_allowed_vs_lhh')),
        opsAllowed: numOrNull(pickCol(row, 'overall_OPS_allowed', 'OPS_allowed')),
        avgAllowed: numOrNull(pickCol(row, 'overall_AVG_allowed', 'AVG_allowed')),
        oor: osiAllowed
      };
    });
    return map;
  }

  function parsePalsRows(rows) {
    var map = {};
    (rows || []).forEach(function(row) {
      var t = teamKey(pickCol(row, 'Tm', 'Team', 'tm', 'team', 'TEAM'));
      if (!t) return;
      var palsVal = numOrNull(pickCol(row, 'PALS', 'pals', 'Pals', 'APLs', 'apls', 'APL', 'apl'));
      var xfip = numOrNull(pickCol(row, 'avg_xFIP_faced', 'Avg xFIP Faced', 'avg xfip faced', 'Avg_xFIP_Faced'));
      if (xfip == null) {
        var keys = Object.keys(row || {});
        for (var i = 0; i < keys.length; i++) {
          if (/xfip/i.test(keys[i]) && /avg|faced/i.test(keys[i])) {
            xfip = numOrNull(row[keys[i]]);
            if (xfip != null) break;
          }
        }
      }
      var ptfPlus = numOrNull(pickCol(row, 'PTF_plus', 'PTF+', 'PTF_Plus', 'ptf_plus'));
      if (ptfPlus == null) {
        var ptfKeys = Object.keys(row || {});
        for (var pi = 0; pi < ptfKeys.length; pi++) {
          if (/ptf/i.test(ptfKeys[pi]) && (/plus/i.test(ptfKeys[pi]) || /\+/.test(ptfKeys[pi]))) {
            ptfPlus = numOrNull(row[ptfKeys[pi]]);
            if (ptfPlus != null) break;
          }
        }
      }
      map[t] = {
        t: t,
        osi: numOrNull(pickCol(row, 'OSI', 'osi', 'Osi')),
        pals: palsVal,
        xfip: xfip,
        ptfPlus: ptfPlus,
        baPlus: numOrNull(pickCol(row, 'BA_plus', 'BA+', 'BA_Plus', 'ba_plus')),
        pitchScoreFaced: numOrNull(pickCol(row, 'avg_pitch_score_faced', 'Avg Pitch Score Faced', 'avg_pitch_score_faced')),
        sos: ptfPlus != null ? Math.round((100 - ptfPlus) * 10) / 10 : null
      };
    });
    return enrichPalsMap(map);
  }

  function parsePitchingRows(rows) {
    var map = {};
    (rows || []).forEach(function(row) {
      var t = teamKey(pickCol(row, 'Tm', 'Team', 'tm'));
      if (!t) return;
      map[t] = {
        t: t,
        kPct: numOrNull(pickCol(row, 'K%', 'K_pct')),
        bbPct: numOrNull(pickCol(row, 'BB%', 'BB_pct')),
        hr9: numOrNull(pickCol(row, 'HR/9', 'HR9')),
        pitchScore: numOrNull(pickCol(row, 'PitchScore', 'Pitching Score'))
      };
    });
    return map;
  }

  function findSpProfile(profiles, pitcherName, team) {
    var key = normName(pitcherName);
    if (!key || key === 'tbd') return null;
    return (profiles || []).find(function(p) {
      var n = normName(pickCol(p, 'pitcher_name', 'Pitcher', 'Name'));
      var tm = teamKey(pickCol(p, 'pitcher_team', 'Team', 'Tm'));
      if (n === key) {
        if (!team || !tm) return true;
        return tm === teamKey(team);
      }
      return false;
    }) || null;
  }

  function spProfileMetrics(profile) {
    if (!profile) return null;
    var kPct = numOrNull(pickCol(profile, 'K_pct', 'K%', 'k_pct'));
    var bbPct = numOrNull(pickCol(profile, 'BB_pct', 'BB%', 'bb_pct'));
    var hr9 = numOrNull(pickCol(profile, 'HR9', 'HR/9', 'hr9'));
    var pitchScore = numOrNull(profile.PitchScore);
    if (pitchScore == null) {
      pitchScore = computePitchScoreFromRates(kPct, bbPct, hr9, null);
    }
    var era = numOrNull(pickCol(profile, 'ERA', 'era'));
    var fip = numOrNull(pickCol(profile, 'FIP', 'fip'));
    if (fip == null) fip = era;
    var staleRaw = pickCol(profile, 'stale', 'staleness_flag', 'Staleness');
    var stale = staleRaw === true || staleRaw === 'True' || staleRaw === 'true' || staleRaw === '1';
    return {
      kPct: kPct,
      bbPct: bbPct,
      hr9: hr9,
      fip: fip,
      fipNa: profile.FIP_na === true,
      xfip: null,
      era: era,
      osiAllowed: numOrNull(pickCol(profile, 'OSI_allowed', 'OSI Allowed', 'osi_allowed')),
      osiAllowedL30: null,
      osiAllowedL14: null,
      abqAllowed: numOrNull(pickCol(profile, 'ABQ_allowed', 'ABQ Allowed')),
      rcvAllowed: numOrNull(pickCol(profile, 'RCV_allowed', 'RCV Allowed')),
      obrAllowed: numOrNull(pickCol(profile, 'OBR_allowed', 'OBR Allowed')),
      pitchScore: pitchScore,
      oor: numOrNull(pickCol(profile, 'OOR', 'oor')),
      stale: stale,
      l14Drift: stale ? 'Stale' : null,
      l14Note: 'L14 requires pipeline data'
    };
  }

  function palsStatus(teamOsi, palsVal) {
    if (palsVal == null || teamOsi == null) return { label: 'Unconfirmed', cls: 'pals-neutral' };
    var gap = teamOsi - palsVal;
    if (Math.abs(gap) < 5) return { label: 'Confirmed', cls: 'pals-confirmed' };
    if (gap >= 8) return { label: 'Inflated', cls: 'pals-inflated' };
    if (gap <= -8) return { label: 'Deflated', cls: 'pals-deflated' };
    return { label: 'Monitor', cls: 'pals-neutral' };
  }

  function metricColor(v, invert) {
    return A && A.metricColor ? A.metricColor(v, 'osi', invert) : '#71717A';
  }

  function osiTierLabel(osi) {
    if (osi == null || isNaN(osi)) return '—';
    if (osi >= 75) return 'Elite';
    if (osi >= 65) return 'Strong';
    if (osi >= 55) return 'Above Avg';
    if (osi >= 45) return 'Average';
    return 'Weak';
  }

  function lineupEdgeIndicator(lineupOsi, pitcherAllowed) {
    if (lineupOsi == null || pitcherAllowed == null) return { label: 'Even', cls: 'edge-even' };
    var diff = lineupOsi - (100 - pitcherAllowed);
    if (diff >= 6) return { label: 'Lineup Advantage', cls: 'edge-lineup' };
    if (diff <= -6) return { label: 'Pitcher Advantage', cls: 'edge-pitcher' };
    return { label: 'Even', cls: 'edge-even' };
  }

  function bullpenRisk(unit) {
    if (!unit || unit.osiAllowed == null) return { label: 'Unknown', cls: 'risk-mid' };
    if (unit.osiAllowed <= 48) return { label: 'Strong', cls: 'risk-good' };
    if (unit.osiAllowed >= 58) return { label: 'Weak', cls: 'risk-bad' };
    if (unit.hiLevEra != null && unit.loLevEra != null && unit.hiLevEra > unit.loLevEra + 1.5) {
      return { label: 'Volatile', cls: 'risk-vol' };
    }
    return { label: 'Average', cls: 'risk-mid' };
  }

  function bullpenPitchScore(unit) {
    if (!unit) return null;
    if (unit.bullpenScore != null) return unit.bullpenScore;
    if (unit.osiAllowed == null) return null;
    return Math.max(0, Math.min(100, 100 - unit.osiAllowed));
  }

  function parkFactor(team) {
    var pf = global.MLBMA_CONFIG && MLBMA_CONFIG.PARK_FACTORS;
    if (!pf) return 1;
    return pf[teamKey(team)] != null ? pf[teamKey(team)] : 1;
  }

  function parkImpactLabel(factor, weather) {
    if (weather && weather.dome) return { label: 'Dome', detail: 'Indoor — weather neutralized' };
    if (factor >= 1.1) return { label: "Hitter's park", detail: 'Elevated run environment' };
    if (factor <= 0.95) return { label: "Pitcher's park", detail: 'Suppressed run environment' };
    if (weather && weather.wind != null && weather.wind >= 12) return { label: 'Wind-aided over lean', detail: 'Strong wind may carry flies' };
    return { label: 'Neutral', detail: 'Typical run environment' };
  }

  function recordHtml(team) {
    return global.MLBMAStandings ? MLBMAStandings.recordHtml(team) : '';
  }

  function teamLogo(team, px) {
    return A ? A.teamLogoImg(team, px || 40) : '';
  }

  function headshot(name, px, opts) {
    if (!A) return '';
    var o = Object.assign({ crop: 'compare', className: 'compare-headshot' }, opts || {});
    if (px) o.size = px;
    return A.pitcherAvatar(name, o);
  }

  function extractWindowOSI(val) {
    if (val == null || val === '') return null;
    var n = parseFloat(val);
    if (!isNaN(n)) return n;
    if (typeof val === 'string') {
      var m = val.match(/OSI[\s":]+([0-9.]+)/i);
      if (m) return parseFloat(m[1]);
    }
    return null;
  }

  function parseTeamProfilesMap(rows) {
    var map = {};
    (rows || []).forEach(function(row) {
      var t = teamKey(pickCol(row, 'team', 'Tm', 'Team'));
      if (!t) return;
      var prof = {
        osi_ytd: extractWindowOSI(pickCol(row, 'osi_ytd', 'OSI_YTD', 'osi', 'OSI')),
        osi_l30: extractWindowOSI(pickCol(row, 'osi_l30', 'OSI_L30', 'L30_OSI')),
        osi_l14: extractWindowOSI(pickCol(row, 'osi_l14', 'OSI_L14', 'L14_OSI')),
        osi_l7: extractWindowOSI(pickCol(row, 'osi_l7', 'OSI_L7', 'L7_OSI')),
        osi: extractWindowOSI(pickCol(row, 'osi', 'OSI', 'osi_ytd', 'OSI_YTD')),
        abq: numOrNull(pickCol(row, 'abq', 'ABQ')),
        rcv: numOrNull(pickCol(row, 'rcv', 'RCV')),
        obr: numOrNull(pickCol(row, 'obr', 'OBR')),
        avg_pitching_score: numOrNull(pickCol(row, 'avg_pitching_score', 'avg pitching score', 'avg_pitchscore', 'Avg Pitching Score', 'Pitch Score Against')),
        avg_ip_per_start: numOrNull(pickCol(row, 'avg_ip_per_start', 'avg ip per start', 'avg_ip', 'Avg IP Per Start')),
        qs_against_pct: numOrNull(pickCol(row, 'qs_against_pct', 'QS_Against_Pct', 'QS% Allowed', 'qs against pct')),
        qs_against: numOrNull(pickCol(row, 'qs_against', 'QS_Against', 'qs against'))
      };
      ['home', 'away'].forEach(function(loc) {
        ['osi', 'abq', 'rcv', 'obr', 'wrc', 'woba', 'xwoba', 'slg'].forEach(function(m) {
          var key = loc + '_' + m;
          prof[key] = numOrNull(pickCol(row, key, key.toUpperCase()));
        });
      });
      ['abq', 'rcv', 'obr'].forEach(function(m) {
        ['l30', 'l14', 'l7'].forEach(function(w) {
          prof[m + '_' + w] = numOrNull(pickCol(row, m + '_' + w, m.toUpperCase() + '_' + w.toUpperCase(), w + '_' + m));
        });
      });
      map[t] = prof;
    });
    return map;
  }

  function lineupStoreFromScored(scR, scL, teamProfiles, scVsSp, scVsRp, palsByTeam, resultsByTeam) {
    var both = blendSplits(scR, scL);
    var home = [];
    var away = [];
    Object.keys(teamProfiles || {}).forEach(function(t) {
      var p = teamProfiles[t];
      if (!p) return;
      var h = { t: t };
      var a = { t: t };
      var hasH = false;
      var hasA = false;
      ['osi', 'abq', 'rcv', 'obr', 'wrc', 'woba', 'xwoba', 'slg'].forEach(function(m) {
        var hv = numOrNull(p['home_' + m]);
        var av = numOrNull(p['away_' + m]);
        if (hv != null) { h[m] = hv; hasH = true; }
        if (av != null) { a[m] = av; hasA = true; }
      });
      if (hasH) {
        if (h.abq != null && h.rcv != null) h.ppGap = h.abq - h.rcv;
        if (h.projOSI == null && h.osi != null) h.projOSI = h.osi;
        home.push(_backfillXwoba(h));
      }
      if (hasA) {
        if (a.abq != null && a.rcv != null) a.ppGap = a.abq - a.rcv;
        if (a.projOSI == null && a.osi != null) a.projOSI = a.osi;
        away.push(_backfillXwoba(a));
      }
    });
    return {
      scR: scR || [],
      scL: scL || [],
      scBoth: both || [],
      scHome: home,
      scAway: away,
      scVsSp: scVsSp || [],
      scVsRp: scVsRp || [],
      teamProfiles: teamProfiles || {},
      palsByTeam: palsByTeam || {},
      resultsByTeam: resultsByTeam || {}
    };
  }

  var _lineupModelRaw = null;
  var _lineupModelStore = null;
  var _lineupModelInflight = null;

  function _emptyLineupModelRaw() {
    return {
      rhp: [], lhp: [], profiles: [], splitVsSp: [], splitVsRp: [], pals: [], teamResults: [],
      l10SpHand: [], l10SpHandGames: [], spProfiles: [],
      _coreLoaded: false, _hasTeamResults: false, _hasPitcherSplits: false, _hasPals: false,
      _hasL10SpHand: false
    };
  }

  var _lineupTeamResultsInflight = null;
  var _lineupModelUpdateListeners = [];

  function _notifyLineupModelUpdate(reason) {
    _lineupModelUpdateListeners.slice().forEach(function(fn) {
      try { fn(reason); } catch (e) { console.warn('[LineupModel] update listener failed', e); }
    });
  }

  function lineupModelStoreNeeds(options) {
    options = options || {};
    return {
      needPitcherSplits: !!options.needPitcherSplits,
      needPals: !!options.needPals,
      needTeamResults: !!options.needTeamResults,
      needL10SpHand: !!options.needL10SpHand
    };
  }

  function lineupModelFilterNeeds(filter) {
    var f = normalizeFilter(filter || {});
    return { needPitcherSplits: f.pitcher === 'sp' || f.pitcher === 'rp' };
  }

  function lineupModelRankNeeds(filter, family) {
    var fam = String(family || 'scoring').toLowerCase();
    return Object.assign({}, lineupModelFilterNeeds(filter), {
      needPals: fam === 'status' || fam === 'difficulty',
      needL10SpHand: fam === 'difficulty',
      needTeamResults: fam === 'surface'
    });
  }

  function lineupModelRawReady(raw, needs, options) {
    options = options || {};
    if (!raw || !raw._coreLoaded) return false;
    if (needs.needPitcherSplits && !raw._hasPitcherSplits) return false;
    if (needs.needPals && !raw._hasPals) return false;
    if (needs.needL10SpHand && !raw._hasL10SpHand) return false;
    if (needs.needTeamResults && !raw._hasTeamResults && !options.allowPartialTeamResults) return false;
    return true;
  }

  function lineupModelBuildStore(raw) {
    var scR = (raw.rhp || []).map(scoreRowFromSheet).filter(Boolean);
    var scL = (raw.lhp || []).map(scoreRowFromSheet).filter(Boolean);
    var profiles = parseTeamProfilesMap(raw.profiles || []);
    var scVsSp = aggregateTeamOffenseFromBatterRows(raw.splitVsSp || []);
    var scVsRp = aggregateTeamOffenseFromBatterRows(raw.splitVsRp || []);
    var palsByTeam = parsePalsRows(raw.pals || []);
    var resultsByTeam = parseTeamResultsMap(raw.teamResults || []);
    var store = lineupStoreFromScored(scR, scL, profiles, scVsSp, scVsRp, palsByTeam, resultsByTeam);
    store.l10SpHandMap = parseL10SpHandMap(raw.l10SpHand || []);
    store.l10SpHandGames = raw.l10SpHandGames || [];
    store.spPitchById = buildSpPitchScoreById(raw.spProfiles || []);
    return store;
  }

  function lineupModelFetchProgressive(existing, needs, options) {
    var tabs = global.MLBMA_CONFIG && global.MLBMA_CONFIG.SHEET_TABS;
    if (!tabs) return Promise.reject(new Error('SHEET_TABS missing'));
    var raw = existing || _emptyLineupModelRaw();
    var chain = Promise.resolve(raw);

    var prefetchTeamResults = !!options.prefetchTeamResults
      || (isTeamRankingsPage() && needs.needTeamResults);
    var prefetchL10SpHand = !!options.prefetchL10SpHand
      || (isTeamRankingsPage() && !needs.needL10SpHand);
    var prefetchPalsOnRankings = isTeamRankingsPage() && !needs.needPals;

    function fetchTeamResultsRows(r) {
      return fetchSheetTab(tabs.team_results, options).catch(function() { return []; }).then(function(rows) {
        r.teamResults = rows || [];
        r._hasTeamResults = true;
        _lineupModelRaw = r;
        _lineupModelStore = null;
        lineupModelWriteCoreCache(r);
        _notifyLineupModelUpdate('teamResults');
        return r;
      });
    }

    function queueTeamResultsPrefetch(r) {
      if (!tabs.team_results || r._hasTeamResults || _lineupTeamResultsInflight) return;
      _lineupTeamResultsInflight = fetchTeamResultsRows(r).finally(function() {
        _lineupTeamResultsInflight = null;
      });
    }

    if (!raw._coreLoaded) {
      chain = chain.then(function() {
        return Promise.all([
          fetchSheetTab(tabs.vs_rhp, options),
          fetchSheetTab(tabs.vs_lhp, options),
          fetchSheetTab(tabs.team_profiles, options)
        ]).then(function(res) {
          raw.rhp = res[0] || [];
          raw.lhp = res[1] || [];
          raw.profiles = res[2] || [];
          raw._coreLoaded = true;
          _lineupModelRaw = raw;
          _lineupModelStore = null;
          lineupModelWriteCoreCache(raw);
          if (prefetchTeamResults) queueTeamResultsPrefetch(raw);
          return raw;
        });
      });
    }

    if (!raw._hasTeamResults && tabs.team_results) {
      var blockOnResults = needs.needTeamResults && !options.allowPartialTeamResults;
      if (blockOnResults) {
        chain = chain.then(fetchTeamResultsRows);
      } else {
        chain = chain.then(function(r) {
          queueTeamResultsPrefetch(r);
          return r;
        });
      }
    } else if (!raw._hasTeamResults) {
      raw._hasTeamResults = true;
    }

    if (needs.needPitcherSplits && !raw._hasPitcherSplits) {
      chain = chain.then(function(r) {
        return Promise.all([
          fetchSheetTab(tabs.batter_splits_vs_sp, options).catch(function() { return []; }),
          fetchSheetTab(tabs.batter_splits_vs_rp, options).catch(function() { return []; })
        ]).then(function(res) {
          r.splitVsSp = res[0] || [];
          r.splitVsRp = res[1] || [];
          r._hasPitcherSplits = true;
          _lineupModelRaw = r;
          _lineupModelStore = null;
          return r;
        });
      });
    }

    function fetchPalsRows(r) {
      if (!tabs.pals) {
        r._hasPals = true;
        return Promise.resolve(r);
      }
      return fetchSheetTab(tabs.pals, options).catch(function() { return []; }).then(function(rows) {
        r.pals = rows || [];
        r._hasPals = true;
        _lineupModelRaw = r;
        _lineupModelStore = null;
        _notifyLineupModelUpdate('pals');
        return r;
      });
    }

    if (needs.needPals && !raw._hasPals) {
      chain = chain.then(fetchPalsRows);
    } else if (prefetchPalsOnRankings && !raw._hasPals) {
      chain = chain.then(function(r) {
        fetchPalsRows(r);
        return r;
      });
    }

    function fetchL10SpHandRows(r) {
      var jobs = [];
      if (tabs.team_l10_sp_hand) {
        jobs.push(fetchSheetTab(tabs.team_l10_sp_hand, options).catch(function() { return []; }));
      } else jobs.push(Promise.resolve([]));
      if (tabs.team_l10_sp_hand_games) {
        jobs.push(fetchSheetTab(tabs.team_l10_sp_hand_games, options).catch(function() { return []; }));
      } else jobs.push(Promise.resolve([]));
      if (tabs.sp_profiles) {
        jobs.push(fetchSheetTab(tabs.sp_profiles, options).catch(function() { return []; }));
      } else jobs.push(Promise.resolve([]));
      return Promise.all(jobs).then(function(res) {
        r.l10SpHand = res[0] || [];
        r.l10SpHandGames = res[1] || [];
        r.spProfiles = res[2] || [];
        r._hasL10SpHand = true;
        _lineupModelRaw = r;
        _lineupModelStore = null;
        _notifyLineupModelUpdate('l10SpHand');
        return r;
      });
    }

    if (needs.needL10SpHand && !raw._hasL10SpHand) {
      chain = chain.then(fetchL10SpHandRows);
    } else if (prefetchL10SpHand && !raw._hasL10SpHand) {
      chain = chain.then(function(r) {
        fetchL10SpHandRows(r);
        return r;
      });
    }

    return chain.then(function(r) {
      _lineupModelRaw = r;
      return r;
    });
  }

  function lineupModelRefreshPals(options) {
    options = options || {};
    if (_lineupModelRaw) {
      _lineupModelRaw.pals = [];
      _lineupModelRaw._hasPals = false;
    }
    _lineupModelStore = null;
    var tabs = global.MLBMA_CONFIG && global.MLBMA_CONFIG.SHEET_TABS;
    if (tabs && tabs.pals) clearSheetTabCache(tabs.pals);
    return lineupModelFetchAll(Object.assign({}, options, { needPals: true, forceRefreshPals: true }));
  }

  function lineupModelFetchAll(options) {
    options = options || {};
    var needs = lineupModelStoreNeeds(options);
    if (!options.forceRefresh && !_lineupModelRaw) {
      var cachedCore = lineupModelReadCoreCache();
      if (cachedCore && cachedCore._coreLoaded) _lineupModelRaw = cachedCore;
    }
    if (options.forceRefresh) {
      _lineupModelRaw = null;
      _lineupModelStore = null;
      clearSheetTabCache();
    } else if (options.forceRefreshPals) {
      if (_lineupModelRaw) {
        _lineupModelRaw.pals = [];
        _lineupModelRaw._hasPals = false;
      }
      _lineupModelStore = null;
      var palsTab = global.MLBMA_CONFIG && global.MLBMA_CONFIG.SHEET_TABS && global.MLBMA_CONFIG.SHEET_TABS.pals;
      if (palsTab) clearSheetTabCache(palsTab);
    }
    if (!options.forceRefresh && !options.forceRefreshPals && _lineupModelRaw && lineupModelRawReady(_lineupModelRaw, needs, options)) {
      lineupModelFetchProgressive(_lineupModelRaw, needs, options).catch(function(err) {
        console.warn('[LineupModel] background revalidate failed', err);
      });
      return Promise.resolve(_lineupModelRaw);
    }
    var fulfill = function() {
      return lineupModelFetchProgressive(_lineupModelRaw, needs, options);
    };
    if (_lineupModelInflight) {
      return _lineupModelInflight.then(function(raw) {
        _lineupModelRaw = raw;
        if (lineupModelRawReady(raw, needs, options)) return raw;
        return fulfill();
      });
    }
    _lineupModelInflight = fulfill().finally(function() {
      _lineupModelInflight = null;
    });
    return _lineupModelInflight;
  }

  function lineupModelScoreRow(raw) {
    return scoreRowFromSheet(raw);
  }

  function lineupModelEnsureStore(options) {
    options = options || {};
    return lineupModelFetchAll(options).then(function(raw) {
      if (!options.forceRefresh && !options.forceRefreshPals && _lineupModelStore && _lineupModelStore._rawRef === raw) {
        return _lineupModelStore.store;
      }
      var store = lineupModelBuildStore(raw);
      _lineupModelStore = { _rawRef: raw, store: store };
      return store;
    });
  }

  function lineupModelResolve(team, filter, options) {
    options = Object.assign({}, options || {}, lineupModelFilterNeeds(filter));
    return lineupModelEnsureStore(options).then(function(store) {
      var f = normalizeFilter(filter || {});
      var rows = resolveLineupRows(store, f);
      var tk = teamKey(team);
      var row = (rows || []).find(function(r) { return teamKey(r.t) === tk; }) || null;
      if (!row) return null;
      return Object.assign({ approx: false }, row);
    });
  }

  function _leadMetricForFamily(family) {
    if (family === 'surface') return 'winPct';
    if (family === 'difficulty') return 'abq';
    if (family === 'status') return 'osi';
    return 'osi';
  }

  function lineupModelRankAll(filter, family, options) {
    options = Object.assign({
      allowPartialTeamResults: true,
      prefetchTeamResults: isTeamRankingsPage()
    }, options || {}, lineupModelRankNeeds(filter, family));
    return lineupModelEnsureStore(options).then(function(store) {
      var f = normalizeFilter(filter || {});
      var resolved = resolveLineupRows(store, f, {
        includeMeta: !!(options && options.includeMeta),
        debugSource: !!(options && options.debugSource)
      });
      var rows = ((resolved && resolved.rows) ? resolved.rows : resolved).slice();
      var lead = _leadMetricForFamily(String(family || 'scoring').toLowerCase());
      rows.sort(function(a, b) {
        var av = numOrNull(a[lead]);
        var bv = numOrNull(b[lead]);
        if (av == null) return 1;
        if (bv == null) return -1;
        return bv - av;
      });
      var ranked = rows.map(function(r, i) {
        var pct = rows.length > 1 ? Math.round(((rows.length - (i + 1)) / (rows.length - 1)) * 100) : 100;
        return Object.assign({ rank: i + 1, pct: pct }, r);
      });
      if (options && options.includeMeta) {
        return { rows: ranked, meta: resolved && resolved.meta ? resolved.meta : {} };
      }
      return ranked;
    });
  }

  function lineupModelWindowDelta(team, metric, filter, options) {
    var f = normalizeFilter(filter || {});
    return Promise.all([
      lineupModelResolve(team, f, options),
      lineupModelResolve(team, Object.assign({}, f, { window: 'YTD' }), options)
    ]).then(function(res) {
      var cur = res[0];
      var ytd = res[1];
      if (!cur || !ytd) return null;
      var m = String(metric || 'osi');
      var a = numOrNull(cur[m]);
      var b = numOrNull(ytd[m]);
      if (a == null || b == null) return null;
      return a - b;
    });
  }

  function lineupModelLeaguePool(metric, options) {
    return lineupModelLeaguePoolsBulk(options).then(function(pools) {
      return pools[metric] || { mean: null, sd: null, values: [] };
    });
  }

  var _leaguePoolsCache = null;
  var _leaguePoolsInflight = null;

  function lineupModelBuildLeaguePools(rows) {
    var metrics = ['osi', 'abq', 'rcv', 'obr', 'wrc', 'woba', 'xwoba', 'xfip', 'pals', 'projOSI', 'ppGap', 'pitchScore', 'pitchScoreFaced'];
    var pools = {};
    metrics.forEach(function(metric) {
      var vals = (rows || []).map(function(r) { return numOrNull(r[metric]); }).filter(function(v) { return v != null && !isNaN(v); });
      if (!vals.length) {
        pools[metric] = { mean: null, sd: null, values: [] };
        return;
      }
      var mean = vals.reduce(function(a, b) { return a + b; }, 0) / vals.length;
      var variance = vals.reduce(function(acc, v) { return acc + Math.pow(v - mean, 2); }, 0) / vals.length;
      pools[metric] = { mean: mean, sd: Math.sqrt(variance), values: vals };
    });
    return pools;
  }

  function lineupModelLeaguePoolsBulk(options) {
    options = options || {};
    if (_leaguePoolsCache && !options.forceRefresh) {
      return Promise.resolve(_leaguePoolsCache);
    }
    if (_leaguePoolsInflight && !options.forceRefresh) {
      return _leaguePoolsInflight;
    }
    var f = createFilterState({ hand: 'both', location: 'all', pitcher: 'both', batSide: 'both', segment: 'full', window: 'YTD' });
    _leaguePoolsInflight = lineupModelRankAll(f, 'scoring', options).then(function(rows) {
      var pools = lineupModelBuildLeaguePools(rows);
      _leaguePoolsCache = pools;
      return pools;
    }).finally(function() {
      _leaguePoolsInflight = null;
    });
    return _leaguePoolsInflight;
  }

  var LineupModel = {
    fetchAll: lineupModelFetchAll,
    ensureStore: lineupModelEnsureStore,
    scoreRow: lineupModelScoreRow,
    blendSplits: blendSplits,
    resolve: lineupModelResolve,
    rankAll: lineupModelRankAll,
    windowDelta: lineupModelWindowDelta,
    leaguePool: lineupModelLeaguePool,
    leaguePoolsBulk: lineupModelLeaguePoolsBulk,
    onUpdate: function(fn) {
      if (typeof fn === 'function') _lineupModelUpdateListeners.push(fn);
      return function() {
        _lineupModelUpdateListeners = _lineupModelUpdateListeners.filter(function(x) { return x !== fn; });
      };
    },
    refreshPals: lineupModelRefreshPals,
    clearCache: function() {
      _lineupModelRaw = null;
      _lineupModelStore = null;
      _lineupModelInflight = null;
      _lineupTeamResultsInflight = null;
      _leaguePoolsCache = null;
      _leaguePoolsInflight = null;
      clearSheetTabCache();
    },
    buildLeaguePools: lineupModelBuildLeaguePools
  };

  global.MLBMASharedMatchup = {
    esc: esc,
    numOrNull: numOrNull,
    pickCol: pickCol,
    teamKey: teamKey,
    createFilterState: createFilterState,
    normalizeFilter: normalizeFilter,
    filterKey: filterKey,
    createScopeState: createScopeState,
    normName: normName,
    fetchSheetTab: fetchSheetTab,
    clearSheetTabCache: clearSheetTabCache,
    parseCsvText: parseCsvText,
    parseLineupRows: parseLineupRows,
    parseLineup: parseLineup,
    filterLineupSheetRows: filterLineupSheetRows,
    syncLiveLineupsFromSheet: syncLiveLineupsFromSheet,
    collectLineupMatchupKeys: collectLineupMatchupKeys,
    buildMatchupLineupBlock: buildMatchupLineupBlock,
    platoonHighlight: platoonHighlight,
    platoonHighlightClass: platoonHighlightClass,
    buildLineupTable: buildLineupTable,
    buildLineupBoard: buildLineupBoard,
    buildLineupColCompact: buildLineupColCompact,
    parseWeatherString: parseWeatherString,
    parseWeatherRow: parseWeatherRow,
    parseWeatherMap: parseWeatherMap,
    weatherLookup: weatherLookup,
    enrichMissingWeatherFromApi: enrichMissingWeatherFromApi,
    weatherBadge: weatherBadge,
    formatWeatherMetaHtml: formatWeatherMetaHtml,
    tempColorCss: tempColorCss,
    windPlateEffect: windPlateEffect,
    pctDecimal: pctDecimal,
    computePitchScoreFromRates: computePitchScoreFromRates,
    rateAsPctPoints: rateAsPctPoints,
    pitcherStaffGrade: pitcherStaffGrade,
    pitcherStaffTier: pitcherStaffTier,
    enrichSpProfiles: enrichSpProfiles,
    buildOorByTeam: buildOorByTeam,
    pitcherOorFromTeamHand: pitcherOorFromTeamHand,
    gamescriptBadge: gamescriptBadge,
    f5Badge: f5Badge,
    splitOSI: splitOSI,
    scoreRowFromSheet: scoreRowFromSheet,
    findScoreRow: findScoreRow,
    handMetricRatios: handMetricRatios,
    applyHandMetricRatios: applyHandMetricRatios,
    aggregateTeamOffenseFromBatterRows: aggregateTeamOffenseFromBatterRows,
    scaleRowMetrics: scaleRowMetrics,
    blendSplits: blendSplits,
    resolveLineupRows: resolveLineupRows,
    parseMatchupRows: parseMatchupRows,
    normalizeTeamAbbr: normalizeTeamAbbrShared,
    parseBullpenUnitRows: parseBullpenUnitRows,
    parseTeamProfilesMap: parseTeamProfilesMap,
    parsePalsRows: parsePalsRows,
    resolveIso: resolveIso,
    resolvePtfPlus: resolvePtfPlus,
    sosFromPalsPack: sosFromPalsPack,
    enrichPalsMap: enrichPalsMap,
    parsePitchingRows: parsePitchingRows,
    findSpProfile: findSpProfile,
    spProfileMetrics: spProfileMetrics,
    palsStatus: palsStatus,
    metricColor: metricColor,
    osiTierLabel: osiTierLabel,
    lineupEdgeIndicator: lineupEdgeIndicator,
    bullpenRisk: bullpenRisk,
    bullpenPitchScore: bullpenPitchScore,
    pitchTier: pitchTier,
    parkFactor: parkFactor,
    parkImpactLabel: parkImpactLabel,
    recordHtml: recordHtml,
    teamLogo: teamLogo,
    headshot: headshot,
    matchupGameKey: matchupGameKey,
    normalizeGameKey: normalizeGameKey,
    fetchMlbTodaySchedule: fetchMlbTodaySchedule,
    localDateIso: localDateIso,
    easternDateIso: easternDateIso,
    formatGameTimeEt: formatGameTimeEt
  };
  global.LineupModel = LineupModel;
  global.MLBMALineupModel = LineupModel;

  (function warmupSharedSheets() {
    var cfg = global.MLBMA_CONFIG;
    if (!cfg || !cfg.SHEET_TABS) return;
    var t = cfg.SHEET_TABS;
    var rankings = isTeamRankingsPage();
    var warmTabs = rankings
      ? [t.vs_rhp, t.vs_lhp, t.team_profiles]
      : [t.vs_rhp, t.vs_lhp, t.team_profiles];
    warmTabs.forEach(function(tab) {
      if (!tab) return;
      fetchSheetTab(tab).catch(function() { return []; });
    });
    if (!rankings) {
      if (t.today_lineups) {
        fetchSheetTab(t.today_lineups).catch(function() { return []; });
      }
      if (t.today_matchups) {
        fetchSheetTab(t.today_matchups).catch(function() { return []; });
      }
      [
        t.pitching_score, t.bullpen_unit, t.sp_profiles, t.player_registry, t.pals, t.oor,
        t.batter_profiles, t.team_results
      ].forEach(function(tab) {
        if (!tab) return;
        var defer = function() { fetchSheetTab(tab).catch(function() { return []; }); };
        if (global.requestIdleCallback) global.requestIdleCallback(defer, { timeout: 8000 });
        else setTimeout(defer, 1500);
      });
    }
  })();
})(typeof window !== 'undefined' ? window : this);
