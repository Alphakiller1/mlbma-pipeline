/**
 * DataStatus — four distinct timestamps, aged at view time.
 * Replaces competing Last_Updated clocks. A failed fetch must NEVER look fresh.
 * Contract: as_of, source, freshness, blockers. Never Date.now() as as_of.
 */
(function (global) {
  'use strict';

  var NFL_STALE_MS = 5 * 24 * 60 * 60 * 1000;
  var MLB_STALE_MS = 24 * 60 * 60 * 1000;

  function parseTs(raw) {
    if (raw == null || raw === '') return null;
    var s = String(raw).trim();
    if (!s) return null;
    var t = Date.parse(s);
    if (isFinite(t)) return t;
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  }

  function fmtAge(ms, now) {
    if (ms == null) return 'unknown';
    now = now == null ? Date.now() : now;
    if (ms > now + 120000) return 'unknown (future timestamp)';
    var sec = Math.max(0, Math.round((now - ms) / 1000));
    if (sec < 90) return sec + 's ago';
    if (sec < 5400) return Math.round(sec / 60) + 'm ago';
    if (sec < 172800) return (sec / 3600).toFixed(1) + 'h ago';
    return Math.round(sec / 86400) + 'd ago';
  }

  function parseCsvLine(line) {
    var out = [];
    var cur = '';
    var q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; }
        else q = !q;
      } else if (c === ',' && !q) {
        out.push(cur);
        cur = '';
      } else cur += c;
    }
    out.push(cur);
    return out;
  }

  /** Parse Last_Updated sheet CSV into { as_of, slateDateEt }. Never invents a clock. */
  function parseLastUpdatedCsv(text) {
    var lines = String(text || '').replace(/^\ufeff/, '').trim().split(/\r?\n/);
    var asOf = null;
    var slateDateEt = null;
    var i, cols, k, v, cell;
    for (i = 0; i < lines.length; i++) {
      cols = parseCsvLine(lines[i]).map(function (x) {
        return String(x || '').replace(/^"|"$/g, '').trim();
      });
      if (!cols.length) continue;
      k = cols[0];
      v = cols[1] || '';
      if (/last\s*updated/i.test(k) && v) asOf = v;
      else if (/slate[_\s-]*date/i.test(k) && v) slateDateEt = v;
    }
    if (!asOf) {
      for (i = 0; i < lines.length; i++) {
        cols = parseCsvLine(lines[i]);
        for (var j = 0; j < cols.length; j++) {
          cell = String(cols[j] || '').replace(/^"|"$/g, '').trim();
          if (cell && /\d{4}-\d{2}-\d{2}/.test(cell) && !/^(season|source)/i.test(cell)) {
            asOf = cell;
            break;
          }
        }
        if (asOf) break;
      }
    }
    return { as_of: asOf, slateDateEt: slateDateEt };
  }

  function freshnessFromAsOf(asOfMs, sport) {
    if (asOfMs == null) return 'unknown';
    var now = Date.now();
    if (asOfMs > now + 120000) return 'unknown';
    var limit = sport === 'nfl' || sport === 'cfb' ? NFL_STALE_MS : MLB_STALE_MS;
    return (now - asOfMs) > limit ? 'stale' : 'ok';
  }

  function fieldsFromParsed(parsed, extra) {
    extra = extra || {};
    var asOf = parsed && parsed.as_of;
    var ms = parseTs(asOf);
    var sport = extra.sport || 'mlb';
    var state = extra.state || freshnessFromAsOf(ms, sport);
    return {
      as_of: asOf || null,
      source: extra.source || 'sheet',
      freshness: state,
      state: state,
      blockers: extra.blockers || extra.issues || [],
      issues: extra.issues || extra.blockers || [],
      dataCutoff: extra.dataCutoff || asOf,
      quoteTimestamp: extra.quoteTimestamp || null,
      publishedAt: extra.publishedAt || asOf,
      sport: sport
    };
  }

  function unknownFields(extra) {
    extra = extra || {};
    return {
      as_of: null,
      source: extra.source || 'unknown',
      freshness: 'unknown',
      state: 'unknown',
      blockers: extra.blockers || extra.issues || ['timestamp unavailable'],
      issues: extra.issues || extra.blockers || ['timestamp unavailable'],
      dataCutoff: null,
      quoteTimestamp: extra.quoteTimestamp || null,
      publishedAt: null
    };
  }

  function sheetCsvUrl(tab) {
    var cfg = global.MLBMA_CONFIG;
    var sid = (cfg && cfg.SHEET_ID) || global.MLBMA_SHEET_ID;
    var sheetTab = tab || (cfg && cfg.SHEET_TABS && (cfg.SHEET_TABS.last_updated || cfg.SHEET_TABS.Last_Updated)) || 'Last_Updated';
    if (!sid) return null;
    return 'https://docs.google.com/spreadsheets/d/' + sid +
      '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(sheetTab);
  }

  function fetchLastUpdated(opts) {
    opts = opts || {};
    var url = opts.url || sheetCsvUrl(opts.tab);
    if (!url) return Promise.resolve(unknownFields({ source: 'sheet', issues: ['no sheet id'] }));
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('sheet');
      return r.text();
    }).then(function (text) {
      var parsed = parseLastUpdatedCsv(text);
      if (!parsed.as_of) return unknownFields({ source: opts.source || 'sheet' });
      return fieldsFromParsed(parsed, opts);
    }).catch(function () {
      return unknownFields({ source: opts.source || 'sheet' });
    });
  }

  function render(el, fields) {
    if (!el) return;
    fields = fields || unknownFields();
    var now = Date.now();
    var cutoff = parseTs(fields.dataCutoff || fields.as_of);
    var quote = parseTs(fields.quoteTimestamp);
    var published = parseTs(fields.publishedAt);
    var displaySrc = published != null ? published : cutoff;
    var state = fields.state || fields.freshness || (displaySrc == null ? 'unknown' : 'unknown');
    if (state === 'unknown' && displaySrc != null) {
      state = freshnessFromAsOf(displaySrc, fields.sport);
    }
    var issues = fields.issues || fields.blockers || [];
    el.className = (el.className || '').replace(/\bca-datastatus\b/g, '').replace(/\s+/g, ' ').trim() + ' ca-datastatus';
    el.setAttribute('data-state', state);
    var age = fmtAge(displaySrc, now);
    var issueHtml = issues.length
      ? '<ul class="ca-datastatus-issues">' + issues.map(function (i) {
          return '<li>' + String(i).replace(/[<>]/g, '') + '</li>';
        }).join('') + '</ul>'
      : '';
    var src = fields.source ? '<span class="ca-datastatus-source">' + String(fields.source).replace(/[<>]/g, '') + '</span>' : '';
    el.innerHTML =
      '<span class="ca-datastatus-dot" aria-hidden="true"></span>' +
      '<span class="ca-datastatus-age">Display age: ' + age + '</span>' +
      src +
      '<span class="ca-datastatus-meta">Cutoff: ' + fmtAge(cutoff, now) +
      ' · Quote: ' + fmtAge(quote, now) +
      ' · Published: ' + fmtAge(published, now) + '</span>' +
      issueHtml;
    return { age: age, state: state, as_of: fields.as_of || null };
  }

  function bindResume(el, fieldsFn) {
    function tick() { return render(el, fieldsFn()); }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') tick();
    });
    window.addEventListener('focus', tick);
    tick();
    return tick;
  }

  global.ChaseDataStatus = {
    parseTs: parseTs,
    fmtAge: fmtAge,
    parseLastUpdatedCsv: parseLastUpdatedCsv,
    fieldsFromParsed: fieldsFromParsed,
    unknownFields: unknownFields,
    freshnessFromAsOf: freshnessFromAsOf,
    fetchLastUpdated: fetchLastUpdated,
    render: render,
    bindResume: bindResume
  };
})(typeof window !== 'undefined' ? window : this);
