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

  function parseNewestSlateDateCsv(text) {
    var dates = String(text || '').match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
    return dates.sort().pop() || null;
  }

  function freshnessFromAsOf(asOfMs, sport) {
    if (asOfMs == null) return 'unknown';
    var now = Date.now();
    if (asOfMs > now + 120000) return 'unknown';
    var limit = sport === 'nfl' || sport === 'cfb' ? NFL_STALE_MS : MLB_STALE_MS;
    return (now - asOfMs) > limit ? 'stale' : 'ok';
  }

  function easternDateIso(now) {
    now = now || new Date();
    try {
      var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(now);
      var values = {};
      parts.forEach(function (part) { values[part.type] = part.value; });
      return values.year + '-' + values.month + '-' + values.day;
    } catch (e) {
      return now.toISOString().slice(0, 10);
    }
  }

  function slateAgeDays(slateDateEt, now) {
    var s = String(slateDateEt || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    var today = easternDateIso(now);
    var slateMs = Date.parse(s + 'T00:00:00Z');
    var todayMs = Date.parse(today + 'T00:00:00Z');
    if (!isFinite(slateMs) || !isFinite(todayMs)) return null;
    return Math.floor((todayMs - slateMs) / 86400000);
  }

  function fmtSlateDate(slateDateEt) {
    var s = String(slateDateEt || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'unknown';
    try {
      return new Date(s + 'T12:00:00Z').toLocaleDateString('en-US', {
        timeZone: 'America/New_York', month: 'short', day: 'numeric'
      });
    } catch (e) { return s; }
  }

  function fieldsFromParsed(parsed, extra) {
    extra = extra || {};
    var asOf = parsed && parsed.as_of;
    var ms = parseTs(asOf);
    var sport = extra.sport || 'mlb';
    var slateDateEt = (parsed && parsed.slateDateEt) || extra.slateDateEt || null;
    var slateAge = slateAgeDays(slateDateEt);
    var state = extra.state || freshnessFromAsOf(ms, sport);
    if (slateAge != null && slateAge > 0) state = 'stale';
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
      slateDateEt: slateDateEt,
      recoveryLabel: extra.recoveryLabel || 'Retry slate',
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
      publishedAt: null,
      slateDateEt: extra.slateDateEt || null,
      recoveryLabel: extra.recoveryLabel || 'Retry slate'
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
    url += (url.indexOf('?') >= 0 ? '&' : '?') + '_probe=' + Date.now();
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('sheet');
      return r.text();
    }).then(function (text) {
      var parsed = parseLastUpdatedCsv(text);
      if (!parsed.as_of) return unknownFields({ source: opts.source || 'sheet' });
      if (parsed.slateDateEt || opts.sport && opts.sport !== 'mlb') return fieldsFromParsed(parsed, opts);
      var cfg = global.MLBMA_CONFIG;
      var slateTab = opts.slateTab || (cfg && cfg.SHEET_TABS && cfg.SHEET_TABS.today_matchups) || 'Today_Matchups';
      var slateUrl = sheetCsvUrl(slateTab);
      if (!slateUrl) return fieldsFromParsed(parsed, opts);
      return fetch(slateUrl, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('slate');
        return r.text();
      }).then(function (slateText) {
        parsed.slateDateEt = parseNewestSlateDateCsv(slateText);
        return fieldsFromParsed(parsed, opts);
      }).catch(function () {
        return fieldsFromParsed(parsed, opts);
      });
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
    var slateAge = slateAgeDays(fields.slateDateEt, new Date(now));
    if (slateAge != null && slateAge > 0) state = 'stale';
    el.className = (el.className || '').replace(/\bca-datastatus\b/g, '').replace(/\s+/g, ' ').trim() + ' ca-datastatus';
    el.setAttribute('data-state', state);
    var age = fmtAge(displaySrc, now);
    var issueHtml = issues.length
      ? '<ul class="ca-datastatus-issues">' + issues.map(function (i) {
          return '<li>' + String(i).replace(/[<>]/g, '') + '</li>';
        }).join('') + '</ul>'
      : '';
    var src = fields.source ? '<span class="ca-datastatus-source">' + String(fields.source).replace(/[<>]/g, '') + '</span>' : '';
    var slateHtml = '';
    if (fields.slateDateEt) {
      var slateAgeText = slateAge == null ? 'age unknown'
        : slateAge <= 0 ? 'current'
          : slateAge + ' day' + (slateAge === 1 ? '' : 's') + ' old';
      slateHtml = '<span class="ca-datastatus-slate">Slate shown: ' + fmtSlateDate(fields.slateDateEt)
        + ' — ' + slateAgeText + '</span>';
      if (slateAge != null && slateAge > 0) {
        slateHtml += '<button type="button" class="ca-datastatus-retry">'
          + String(fields.recoveryLabel || 'Retry slate').replace(/[<>]/g, '') + '</button>';
      }
    }
    el.innerHTML =
      '<span class="ca-datastatus-dot" aria-hidden="true"></span>' +
      '<span class="ca-datastatus-age">Published: ' + age + '</span>' +
      src +
      slateHtml +
      '<span class="ca-datastatus-meta">Cutoff: ' + fmtAge(cutoff, now) +
      ' · Quote: ' + fmtAge(quote, now) +
      ' · Published: ' + fmtAge(published, now) + '</span>' +
      issueHtml;
    var retry = el.querySelector('.ca-datastatus-retry');
    if (retry) retry.addEventListener('click', function () {
      if (typeof fields.onRecover === 'function') fields.onRecover();
      else global.location.reload();
    });
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
    parseNewestSlateDateCsv: parseNewestSlateDateCsv,
    fieldsFromParsed: fieldsFromParsed,
    unknownFields: unknownFields,
    freshnessFromAsOf: freshnessFromAsOf,
    easternDateIso: easternDateIso,
    slateAgeDays: slateAgeDays,
    fmtSlateDate: fmtSlateDate,
    fetchLastUpdated: fetchLastUpdated,
    render: render,
    bindResume: bindResume
  };
})(typeof window !== 'undefined' ? window : this);
