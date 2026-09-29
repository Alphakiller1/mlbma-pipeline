/*
 * MLB playoff prediction bracket, built for recording in the site booth.
 *
 * Teams, seeds and series come live from MLB's stats API (via /__booth/api/bracket).
 * Picks cascade: advancing a club fills it into the next round. Real results take over
 * as series finish, and every pick is marked right or wrong against them.
 *
 * Mouse: click a club to advance it; click it again to set the series length ("in 5");
 * right-click a series to clear it. Keys: Backspace undoes, Delete clears every pick.
 * Picks are kept per season in this browser, so a bracket can be prepared and then
 * walked through on camera. ?clean hides the help line at the bottom.
 */
const $ = (s, el = document) => el.querySelector(s);
const params = new URLSearchParams(location.search);
const season = Number(params.get("season")) || new Date().getFullYear();
const KEY = `bracket.picks.${season}`;
if (params.has("clean")) document.body.classList.add("clean");
if (params.has("clean")) $(".foot .how").remove();

let data = null; // { teams, series }
let picks = load(); // { seriesId: { team, len } }
const history = [];
let changed = null; // series id to flash after a pick

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(picks));
  } catch {
    /* private window: picks last until reload */
  }
}

/* ── structure ── */
const byId = () => Object.fromEntries(data.series.map((s) => [s.id, s]));
const team = (id) => (id ? data.teams[id] : null);
const lengths = (bestOf) => {
  const need = Math.floor(bestOf / 2) + 1;
  return Array.from({ length: need }, (_, i) => need + i); // e.g. best of 5 -> 3, 4, 5 games
};

/** The series each series is fed by (two slots), and the one it feeds. */
function wiring() {
  const S = byId();
  const feeds = {}; // id -> [slot0 source, slot1 source]; a source is {team} or {from: seriesId}
  const next = {};
  for (const lg of ["AL", "NL"]) {
    const wc = data.series.filter((s) => s.round === "F" && s.league === lg);
    const ds = data.series.filter((s) => s.round === "D" && s.league === lg);
    for (const d of ds) {
      const bye = team(d.home);
      // #1 meets the 4/5 winner, #2 the 3/6 winner
      const want = bye?.seed === 1 ? [4, 5] : [3, 6];
      const f = wc.find((w) => want.includes(team(w.home)?.seed) || want.includes(team(w.away)?.seed));
      feeds[d.id] = [{ team: d.home }, f ? { from: f.id } : { team: d.away }];
      if (f) next[f.id] = d.id;
    }
    const cs = data.series.find((s) => s.round === "L" && s.league === lg);
    if (cs) {
      const [d1, d2] = [...ds].sort((a, b) => (team(a.home)?.seed ?? 9) - (team(b.home)?.seed ?? 9));
      feeds[cs.id] = [{ from: d1.id }, { from: d2.id }];
      next[d1.id] = next[d2.id] = cs.id;
    }
    for (const w of wc) feeds[w.id] = [{ team: w.home }, { team: w.away }]; // higher seed on top
  }
  const ws = data.series.find((s) => s.round === "W");
  const al = data.series.find((s) => s.round === "L" && s.league === "AL");
  const nl = data.series.find((s) => s.round === "L" && s.league === "NL");
  if (ws && al && nl) {
    feeds[ws.id] = [{ from: al.id }, { from: nl.id }];
    next[al.id] = next[nl.id] = ws.id;
  }
  return { S, feeds, next };
}

/** Resolve every series: its two clubs, the real winner, the predicted winner. */
function resolve() {
  const { S, feeds, next } = wiring();
  const out = {};
  const winnerOf = (id) => {
    if (!out[id]) solve(id);
    return out[id].real ?? out[id].pick;
  };
  const solve = (id) => {
    const s = S[id];
    const slots = (feeds[id] || [{ team: s.home }, { team: s.away }]).map((src, i) => {
      // A club MLB has already placed in this series is fact; otherwise it is our pick.
      const real = i === 0 ? s.home : s.away;
      if (src.team) return { id: src.team, real: true };
      if (real && (s.round === "D" || s.round === "L" || s.round === "W")) {
        const fromReal = S[src.from]?.winner;
        if (fromReal) return { id: fromReal, real: true };
      }
      return { id: winnerOf(src.from), real: false, from: src.from };
    });
    // Series home/away from MLB: map wins onto our slots by club
    const wins = slots.map((sl) => (sl.id && sl.id === s.home ? s.wins.home : sl.id && sl.id === s.away ? s.wins.away : 0));
    const p = picks[id];
    const valid = p && slots.some((sl) => sl.id === p.team);
    out[id] = { s, slots, wins, real: s.winner, pick: valid ? p.team : null, pickObj: p, stale: p && !valid };
  };
  for (const id of Object.keys(S)) winnerOf(id);
  return { out, next };
}

/* ── confidence: how sure you are in each pick, 1 (coin flip) to 5 (lock) ── */
const CONF = ["", "Coin flip", "Lean", "Confident", "Strong", "Lock"];
let hovered = null; // the series under the pointer, for the 1-5 keys
function setConf(id, level) {
  const p = picks[id];
  if (!p) return;
  snapshot();
  if (p.conf === level) delete p.conf; // same level again clears it
  else p.conf = level;
  changed = id;
  save();
  render();
}
const meter = (id, level, interactive) =>
  `<span class="conf${interactive ? "" : " static"}" title="Confidence: click a bar, or hover and press 1-5">` +
  [1, 2, 3, 4, 5].map((n) => `<i data-series="${id}" data-level="${n}" class="${level >= n ? "on" : ""}${level === 5 ? " lock" : ""}"></i>`).join("") +
  (level ? `<b>${CONF[level]}</b>` : "") +
  `</span>`;

/* ── picking ── */
function snapshot() {
  history.push(JSON.stringify(picks));
  if (history.length > 200) history.shift();
}
function clearDownstream(id, club, next) {
  for (let n = next[id]; n; n = next[n]) if (picks[n]?.team === club) delete picks[n];
}
function pick(id, club) {
  if (!club) return;
  const { next } = resolve();
  snapshot();
  const cur = picks[id];
  if (cur?.team === club) {
    // Same club again: step through the series lengths, then back to none.
    const opts = lengths(byId()[id].bestOf);
    const i = cur.len == null ? 0 : opts.indexOf(cur.len) + 1;
    if (i >= opts.length) delete cur.len;
    else cur.len = opts[i];
  } else {
    if (cur) clearDownstream(id, cur.team, next);
    picks[id] = { team: club };
  }
  changed = id;
  save();
  render();
}
function clearSeries(id) {
  if (!picks[id]) return;
  const { next } = resolve();
  snapshot();
  clearDownstream(id, picks[id].team, next);
  delete picks[id];
  save();
  render();
}
window.addEventListener("keydown", (e) => {
  if (/^[1-5]$/.test(e.key) && hovered && picks[hovered]) {
    e.preventDefault();
    setConf(hovered, Number(e.key));
    return;
  }
  if (e.key === "Backspace" && history.length) {
    e.preventDefault();
    picks = JSON.parse(history.pop());
    save();
    render();
  } else if (e.key === "Delete" && Object.keys(picks).length && confirm("Clear every pick in this bracket?")) {
    snapshot();
    picks = {};
    save();
    render();
  }
});

/* ── drawing ── */
const COLS = { F: "wc", D: "ds", L: "cs" };
function card(r) {
  const { s, slots, wins, real, pick: pk, pickObj, stale } = r;
  const el = document.createElement("div");
  el.className = "series";
  el.dataset.id = s.id;
  el.oncontextmenu = (e) => {
    e.preventDefault();
    clearSeries(s.id);
  };
  const decided = real ?? pk;
  for (const [i, sl] of slots.entries()) {
    const t = team(sl.id);
    const row = document.createElement("div");
    if (!t) {
      const src = sl.from ? byId()[sl.from] : null;
      const codes = src ? resolve().out[src.id].slots.map((x) => team(x.id)?.abbr) : [];
      // Name the slot by its matchup while both clubs are known, else by the round it comes from.
      const label = codes.length && codes.every(Boolean)
        ? `Winner of<br>${codes.join(" / ")}`
        : src?.round === "L" ? `${src.league} Champion` : src?.round === "D" ? `${src.league}DS winner` : "Wild Card winner";
      row.className = "team tbd";
      row.innerHTML = `<span></span><span></span><div class="nm">${label}</div><span></span>`;
    } else {
      row.className = "team" + (pk === sl.id ? " picked" : "") + (decided && decided !== sl.id ? " out" : "") + (real === sl.id ? " real-win" : "");
      const played = wins[0] + wins[1] > 0;
      row.innerHTML = `
        <img src="${t.logo}" alt="" loading="eager" />
        <span class="seed">${t.seed}</span>
        <div class="nm"><span class="full">${t.name}</span><span class="ab">${t.abbr}</span><small>${t.wins}-${t.losses}</small></div>
        <span class="score">${played ? wins[i] : ""}</span>`;
      row.onclick = () => pick(s.id, sl.id);
      row.title = `Pick the ${t.full}`;
    }
    el.append(row);
  }
  if (pickObj && (pk || stale)) {
    const t = team(pickObj.team);
    const line = document.createElement("div");
    line.className = "pickline";
    const verdict = real ? (real === pickObj.team ? `<span class="verdict good">✓ Correct</span>` : `<span class="verdict bad">✗ Missed</span>`) : stale ? `<span class="verdict bad">Eliminated</span>` : "";
    line.innerHTML = `<span class="pk">Pick: ${t?.name ?? "?"}${pickObj.len ? ` in ${pickObj.len}` : ""}</span>${verdict || meter(s.id, pickObj.conf || 0, true)}`;
    if (verdict && pickObj.conf) line.insertAdjacentHTML("beforeend", meter(s.id, pickObj.conf, false));
    line.querySelectorAll(".conf:not(.static) i").forEach((bar) => {
      bar.onclick = (e) => {
        e.stopPropagation();
        setConf(s.id, Number(bar.dataset.level));
      };
    });
    el.append(line);
  }
  el.onmouseenter = () => (hovered = s.id);
  el.onmouseleave = () => hovered === s.id && (hovered = null);
  if (changed === s.id) el.classList.add("just");
  return el;
}

function render() {
  if (!data) return;
  const { out } = resolve();
  document.querySelectorAll(".col").forEach((c) => c.querySelectorAll(".series").forEach((x) => x.remove()));
  const { feeds } = wiring();
  // Wild Card cards sit level with the Division Series they feed.
  const order = (lg) => {
    const ds = data.series.filter((s) => s.round === "D" && s.league === lg).sort((a, b) => (team(a.home)?.seed ?? 9) - (team(b.home)?.seed ?? 9));
    return { D: ds.map((d) => d.id), F: ds.map((d) => feeds[d.id][1].from).filter(Boolean) };
  };
  for (const lg of ["AL", "NL"]) {
    const o = order(lg);
    for (const id of o.F) $(`[data-col="${lg.toLowerCase()}-wc"]`).append(card(out[id]));
    for (const id of o.D) $(`[data-col="${lg.toLowerCase()}-ds"]`).append(card(out[id]));
    const cs = data.series.find((s) => s.round === "L" && s.league === lg);
    if (cs) $(`[data-col="${lg.toLowerCase()}-cs"]`).append(card(out[cs.id]));
  }
  const ws = data.series.find((s) => s.round === "W");
  if (ws) $(`[data-col="ws"]`).append(card(out[ws.id]));

  // The champion
  const champ = $("#champ");
  const w = ws ? out[ws.id] : null;
  const club = w ? (w.real ?? w.pick) : null;
  const t = team(club);
  champ.classList.toggle("crowned", changed === ws?.id && Boolean(t));
  champ.innerHTML = t
    ? `<div class="lbl">${w.real ? "World Series Champion" : "Predicted Champion"}</div><img src="${t.logo}" alt="" /><div class="nm">${t.name}</div><div class="sub">${w.pickObj?.len && !w.real ? `in ${w.pickObj.len} games · ` : ""}${t.wins}-${t.losses} · ${t.league} #${t.seed} seed</div>${!w.real && w.pickObj?.conf ? `<div class="champ-conf">${meter(ws.id, w.pickObj.conf, false)}</div>` : ""}`
    : `<div class="lbl">Predicted Champion</div><div class="q">?</div><div class="sub">Pick the World Series</div>`;

  const n = Object.keys(out).length;
  const done = Object.values(out).filter((r) => r.pick).length;
  const right = Object.values(out).filter((r) => r.real && r.pickObj?.team === r.real).length;
  const graded = Object.values(out).filter((r) => r.real && r.pickObj).length;
  const rated = Object.values(out).filter((r) => r.pick && r.pickObj?.conf);
  const avg = rated.length ? rated.reduce((a, r) => a + r.pickObj.conf, 0) / rated.length : 0;
  const locks = rated.filter((r) => r.pickObj.conf === 5).length;
  $("#status").textContent =
    `${done} of ${n} series picked` +
    (rated.length ? ` · average confidence ${avg.toFixed(1)} of 5 (${CONF[Math.round(avg)]})${locks ? ` · ${locks} lock${locks > 1 ? "s" : ""}` : ""}` : "") +
    (graded ? ` · ${right} of ${graded} right so far` : "") +
    " · live from MLB";
  changed = null;
  requestAnimationFrame(wires);
}

/** Bracket lines: from each feeder card to the card it feeds. */
function wires() {
  const svg = $("#wires");
  const box = $("#bracket").getBoundingClientRect();
  const { feeds } = wiring();
  const S = byId();
  const { out } = resolve();
  let d = "";
  let live = "";
  for (const [id, srcs] of Object.entries(feeds)) {
    const to = $(`.series[data-id="${id}"]`);
    if (!to) continue;
    for (const src of srcs) {
      if (!src.from) continue;
      const from = $(`.series[data-id="${src.from}"]`);
      if (!from) continue;
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const rightward = a.left < b.left;
      const vertical = Math.abs(a.left - b.left) < 40; // narrow layout: final sits below
      let x1, y1, x2, y2, path;
      if (vertical) {
        x1 = a.left + a.width / 2 - box.left;
        y1 = (a.top < b.top ? a.bottom : a.top) - box.top;
        x2 = b.left + b.width / 2 - box.left;
        y2 = (a.top < b.top ? b.top : b.bottom) - box.top;
        const my = (y1 + y2) / 2;
        path = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
      } else {
        x1 = (rightward ? a.right : a.left) - box.left;
        y1 = a.top + a.height / 2 - box.top;
        x2 = (rightward ? b.left : b.right) - box.left;
        y2 = b.top + b.height / 2 - box.top;
        const mx = (x1 + x2) / 2;
        path = `M${x1},${y1} H${mx} V${y2} H${x2}`;
      }
      const decided = out[src.from] && (out[src.from].real ?? out[src.from].pick);
      if (decided) live += path + " ";
      else d += path + " ";
    }
  }
  svg.innerHTML = `<path d="${d}"/><path class="live" d="${live}"/>`;
  void S;
}
window.addEventListener("resize", () => requestAnimationFrame(wires));

/* ── data ── */
async function refresh() {
  try {
    const r = await fetch(`/__booth/api/bracket?season=${season}`);
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    data = j;
    $("#season").textContent = `${season} MLB Postseason · Chase Analytics`;
    render();
  } catch (e) {
    $("#status").textContent = `Could not load the bracket: ${e.message}`;
  }
}
refresh();
setInterval(refresh, 120_000);
