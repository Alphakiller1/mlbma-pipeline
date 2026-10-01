/*
 * Site booth page. The stage is the live site (proxied, same-origin) under an ink
 * canvas, with the camera bubble and brand strap on top. Recording is Chrome/Edge tab
 * capture restricted to the stage element, plus the mic, streamed to the booth server
 * in 1 s chunks so a long take never sits in memory.
 */
const $ = (id) => document.getElementById(id);
const stage = $("stage");
const zoomEl = $("zoom");
const cam = $("cam");
const camVideo = $("camVideo");

/* ── prefs (per-viewer conveniences only) ── */
const PREF_KEY = "siteBooth.prefs.v1";
const prefs = Object.assign(
  {
    aspect: "wide",
    siteWidth: { wide: 1280, vertical: 430, wideCompare: 960, verticalCompare: 430 },
    camOn: true,
    corner: "br",
    camSize: 1,
    camShape: "box", // new key, so a saved "circle" from before does not override the box
    mirror: true,
    sound: "computer", // computer | phone | both
    camFree: null, // {x, y} as fractions of the stage when dragged
    bug: false, // the site's own header already carries the logo
    lower: false,
    name: "",
    handle: "chase-analytics.com",
    countdown: true,
    autoChapters: true,
    fade: false,
    tone: 0,
    camId: "",
    micId: "",
    path: "/nfl/",
    tabs: null, // the open tabs' pages, restored next time
    tab: 0, // the active one
    pair: null, // [i, j] while comparing
    notes: "",
  },
  (() => {
    try {
      return JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
    } catch {
      return {};
    }
  })(),
);
const save = () => {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    /* private window: prefs just do not persist */
  }
};

const toastEl = $("toast");
let toastTimer = 0;
const toast = (msg, ms = 2600) => {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
};
const status = (msg, warn = false) => {
  $("status").textContent = msg;
  $("status").classList.toggle("warn", warn);
};

/* ── tones: the site's own palette ── */
const css = getComputedStyle(document.documentElement);
const token = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
const TONES = [
  ["Violet", token("--ca-violet-500", "#9A6BFF")],
  ["Amber", token("--ca-amber-500", "#E8C24A")],
  ["Green", token("--ca-green-500", "#3CCB7F")],
  ["Red", token("--ca-red-500", "#F2545B")],
  ["White", token("--ca-paper-50", "#F5F6FA")],
];
const tone = () => TONES[prefs.tone % TONES.length][1];

/* ── layout ──
 * The stage holds one tab, or two side by side (16:9) / stacked (9:16) when comparing.
 * Each visible tab gets a pane: a clip box at its spot on the stage, holding a viewport
 * that renders the site at `W` CSS px wide and is scaled by `k` to fit the pane. */
const geo = { sw: 0, sh: 0, zoom: { z: 1, tx: 0, ty: 0 } };
const CAM_SIZES = [0.22, 0.3, 0.4];
// The page width the site renders at, per format, alone and when comparing (each tab gets
// half the stage there, so a narrower page keeps the type readable).
const SITE_WIDTHS = { wide: 1280, vertical: 430, wideCompare: 960, verticalCompare: 430 };
const widthKey = () => `${prefs.aspect}${pair ? "Compare" : ""}`;
const siteWidth = () => Number(prefs.siteWidth?.[widthKey()]) || SITE_WIDTHS[widthKey()];
const divider = $("divider");
const focusBar = $("focus");

function layout() {
  const deck = $("deck");
  const note = $("deckNote").offsetHeight + 8;
  const aw = deck.clientWidth - 28 - 10; // 10 = the recording ring around the stage
  const ah = deck.clientHeight - 28 - 10 - note;
  const vertical = prefs.aspect === "vertical";
  const a = vertical ? 9 / 16 : 16 / 9;
  const sw = Math.floor(Math.min(aw, ah * a));
  const sh = Math.floor(sw / a);
  Object.assign(geo, { sw, sh });
  stage.style.width = `${sw}px`;
  stage.style.height = `${sh}px`;
  const W = siteWidth();
  // Comparing: two panes with a thin violet rule between them (recorded, so viewers see the split).
  const gap = pair ? Math.max(2, Math.round(Math.min(sw, sh) * 0.005)) : 0;
  const rects = !pair
    ? [[0, 0, sw, sh]]
    : vertical
      ? [
          [0, 0, sw, Math.floor((sh - gap) / 2)],
          [0, Math.floor((sh - gap) / 2) + gap, sw, sh - Math.floor((sh - gap) / 2) - gap],
        ]
      : [
          [0, 0, Math.floor((sw - gap) / 2), sh],
          [Math.floor((sw - gap) / 2) + gap, 0, sw - Math.floor((sw - gap) / 2) - gap, sh],
        ];
  const vis = shown();
  for (const t of tabs) t.pane.classList.toggle("hidden", !vis.includes(t));
  vis.forEach((t, i) => placeTab(t, rects[i], W));
  divider.classList.toggle("show", Boolean(pair));
  if (pair) {
    const [x, y, w, h] = vertical ? [0, rects[0][3], sw, gap] : [rects[0][2], 0, gap, sh];
    Object.assign(divider.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  }
  paintFocus();
  applyZoom();
  placeOverlays();
}

function placeTab(t, [x, y, pw, ph], W) {
  // A new page width reflows the site, so marks drawn on the old layout would land on the
  // wrong things. A spotlight pinned to an element follows it; an area one cannot.
  if (t.W && t.W !== W) {
    t.strokes.length = 0;
    if (t.spot && !t.spot.el) t.spot = null;
  }
  const k = pw / W;
  Object.assign(t, { x, y, pw, ph, W, k, H: Math.ceil(ph / k) });
  Object.assign(t.pane.style, { left: `${x}px`, top: `${y}px`, width: `${pw}px`, height: `${ph}px` });
  t.view.style.width = `${W}px`;
  t.view.style.height = `${t.H}px`;
  t.view.style.transform = `scale(${k})`;
  // Backing store at the zoomed-in resolution, so marks stay sharp at 2x zoom.
  const dpr = Math.min(4, (window.devicePixelRatio || 1) * k * 2);
  const iw = Math.min(8192, Math.round(W * dpr));
  const ih = Math.min(8192, Math.round(t.H * dpr));
  if (t.ink.width !== iw || t.ink.height !== ih) Object.assign(t.ink, { width: iw, height: ih });
}

/** Which tab has the keys and markers, shown OFF the recorded stage: a bar in the ring under (or beside) its pane. */
function paintFocus() {
  const on = Boolean(pair) && pair.includes(active);
  focusBar.classList.toggle("show", on);
  if (on) {
    const vertical = prefs.aspect === "vertical";
    const ring = 3; // the ring's padding: the bar sits in it, outside the stage
    Object.assign(
      focusBar.style,
      vertical
        ? { left: "0px", top: `${ring + active.y}px`, width: `${ring}px`, height: `${active.ph}px` }
        : { left: `${ring + active.x}px`, top: `${ring + geo.sh}px`, width: `${active.pw}px`, height: `${ring}px` },
    );
    const side = pair.indexOf(active) === 0 ? (vertical ? "top" : "left") : vertical ? "bottom" : "right";
    $("deckNote").textContent = `Comparing tabs ${tabs.indexOf(pair[0]) + 1} and ${tabs.indexOf(pair[1]) + 1}. Keys and markers go to the ${side} one (the violet bar); click the other side to switch.`;
  } else $("deckNote").textContent = DECK_NOTE;
}
const DECK_NOTE = $("deckNote").textContent;

function placeOverlays() {
  const { sw, sh } = geo;
  const m = Math.round(Math.min(sw, sh) * 0.035);
  const base = Math.min(sw, sh);
  const size = Math.round(base * CAM_SIZES[prefs.camSize] * (prefs.aspect === "vertical" ? 1.3 : 1));
  // The box is landscape 4:3, the webcam's own shape, so less of the picture is cropped.
  const box = prefs.camShape === "box";
  const w = box ? Math.round(size * 1.2) : size;
  const h = box ? Math.round(size * 0.9) : size;
  let x, y;
  if (prefs.camFree) {
    x = prefs.camFree.x * sw;
    y = prefs.camFree.y * sh;
  } else {
    x = prefs.corner.includes("l") ? m : sw - w - m;
    y = prefs.corner.includes("t") ? m : sh - h - m;
  }
  x = Math.max(0, Math.min(sw - w, x));
  y = Math.max(0, Math.min(sh - h, y));
  Object.assign(cam.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  cam.classList.toggle("off", !prefs.camOn);
  cam.classList.toggle("box", box);

  // Site mark: top-right (the site's own logo is top-left), top-left if the camera is there.
  const bug = $("bug");
  bug.style.setProperty("--bug-size", `${Math.max(11, Math.round(base * 0.028))}px`);
  const camTop = y < sh / 2;
  const camLeft = x < sw / 2;
  const bugLeft = prefs.camOn && camTop && !camLeft;
  Object.assign(bug.style, { top: `${m}px`, left: bugLeft ? `${m}px` : "auto", right: bugLeft ? "auto" : `${m}px` });
  bug.classList.toggle("off", !prefs.bug);

  // Name strap: bottom-left, beside the camera when the camera is down there.
  const lower = $("lower");
  lower.style.setProperty("--lower-size", `${Math.max(13, Math.round(base * 0.042))}px`);
  $("lowerName").textContent = prefs.name || "Chase Analytics";
  $("lowerHandle").textContent = prefs.handle;
  const beside = prefs.camOn && !camTop && camLeft;
  lower.style.left = `${beside ? x + w + m * 0.6 : 0}px`;
  lower.style.bottom = `${beside ? sh - (y + h) + h * 0.12 : m * 1.4}px`;
  lower.classList.toggle("off", !prefs.lower);
}

/* ── zoom (the whole stage, so it works the same alone or comparing) ── */
function applyZoom() {
  const { z, tx, ty } = geo.zoom;
  zoomEl.style.transform = `translate(${tx}px, ${ty}px) scale(${z})`;
}
/** Zoom so a rect in tab `t`'s viewport (site CSS px) coordinates fills the stage. */
function zoomTo(r, t) {
  const k = t.k;
  const pad = 16;
  const rx = t.x + (r.x - pad) * k;
  const ry = t.y + (r.y - pad) * k;
  const rw = (r.w + pad * 2) * k;
  const rh = (r.h + pad * 2) * k;
  const z = Math.max(1, Math.min(3, Math.min(geo.sw / rw, geo.sh / rh)));
  let tx = geo.sw / 2 - z * (rx + rw / 2);
  let ty = geo.sh / 2 - z * (ry + rh / 2);
  tx = Math.min(0, Math.max(geo.sw - z * geo.sw, tx));
  ty = Math.min(0, Math.max(geo.sh - z * geo.sh, ty));
  geo.zoom = { z, tx, ty };
  applyZoom();
}
const zoomOut = () => {
  geo.zoom = { z: 1, tx: 0, ty: 0 };
  applyZoom();
};

/* ── tabs: each one is a live page of the site that keeps its place, scroll and marks ── */
const MAX_TABS = 9; // keys 1-9
const tabs = [];
let active = null; // the tab the address bar, keys and markers work on
let pair = null; // [left/top, right/bottom] while comparing, else null
let previous = null; // the tab before `active`: compare's natural partner
let tabSeq = 0;
/** The tabs on stage right now, in screen order. */
const shown = () => (pair ? pair : active ? [active] : []);
const shownKey = () => shown().map((t) => t.id).join(",");

const win = (t = active) => {
  try {
    return t?.frame.contentWindow && t.frame.contentWindow.document ? t.frame.contentWindow : null;
  } catch {
    return null; // left the proxy somehow (cross-origin)
  }
};
const here = (w) => w.location.pathname + w.location.search + w.location.hash;
const go = (p, t = active) => {
  let target = String(p || "/").trim();
  try {
    const u = new URL(target, location.origin);
    if (/(^|\.)chase-analytics\.com$/.test(u.hostname) || u.origin === location.origin) target = u.pathname + u.search + u.hash;
  } catch {
    /* keep as typed */
  }
  if (!target.startsWith("/")) target = `/${target}`;
  // Booth pages other than the booth itself (the playoff bracket) may go on stage.
  if (target.startsWith("/__booth") && !target.startsWith("/__booth/bracket")) target = "/";
  t.path = target;
  t.frame.src = target;
  if (t === active) $("address").value = target;
};
const pageLabel = (w) => {
  const doc = w.document;
  const t = (doc.title || "").replace(/\s*[—|-]\s*Chase Analytics\s*$/i, "").trim();
  const h1 = doc.querySelector("h1")?.innerText?.trim();
  return (h1 && h1.length < 70 && !/chase analytics/i.test(h1) ? h1 : t) || w.location.pathname;
};
const tabLabel = (t) => t.label || t.path || "Loading...";
/** What is on stage, for chapter markers: one page, or "A vs B" when comparing. */
const stageLabel = () => shown().map(tabLabel).join(" vs ");
const stagePath = () => shown().map((t) => t.path).join(" | ");

function makeTab(path) {
  const pane = document.createElement("div");
  pane.className = "pane";
  const view = document.createElement("div");
  view.className = "viewport";
  const frame = document.createElement("iframe");
  frame.title = "chase-analytics.com";
  const ink = document.createElement("canvas");
  ink.classList.toggle("tool", tool !== "browse");
  view.append(frame, ink);
  pane.append(view);
  zoomEl.insertBefore(pane, divider);
  const t = { id: ++tabSeq, pane, view, frame, ink, ctx: ink.getContext("2d"), strokes: [], spot: null, lastPick: null, lastPage: "", path: "", label: "" };
  Object.assign(t, { x: 0, y: 0, pw: 0, ph: 0, W: 0, H: 0, k: 1 });
  tabs.push(t);
  wireTab(t);
  go(path, t);
  return t;
}

function wireTab(t) {
  t.frame.addEventListener("load", () => {
    const w = win(t);
    if (!w) {
      if (t === active) status("That page is off the site. Use the address bar to come back.", true);
      return;
    }
    t.path = here(w);
    if (t === active) $("address").value = t.path;
    w.addEventListener("keydown", onKey, true);
    // Clicking into a page while comparing aims the keys and markers at it.
    w.addEventListener("pointerdown", () => setActive(t, { focus: false }), true);
    w.addEventListener("scroll", () => (dirty = true), { passive: true });
    t.label = pageLabel(w);
    // A new page: marks and spotlight belonged to the old one.
    const page = w.location.pathname + w.location.search;
    if (page !== t.lastPage) {
      t.strokes.length = 0;
      t.spot = null;
      t.lastPick = null;
      const onStage = shown().includes(t);
      if (onStage) zoomOut();
      if (onStage && t.lastPage) autoChapter();
      t.lastPage = page;
    }
    saveTabs();
    paintTabs();
    dirty = true;
  });

  t.ink.addEventListener("pointerdown", (e) => {
    if (tool === "browse") return;
    e.preventDefault();
    setActive(t, { focus: false });
    t.ink.setPointerCapture(e.pointerId);
    const [vx, vy] = toView(e, t);
    const [sx, sy] = scroll(t);
    drawing = { t, kind: tool, tone: tone(), pts: [[vx + sx, vy + sy]], born: performance.now(), v0: [vx, vy], moved: false };
  });
  t.ink.addEventListener("pointermove", (e) => {
    if (!drawing || drawing.t !== t) return;
    const [vx, vy] = toView(e, t);
    const [sx, sy] = scroll(t);
    const p = [vx + sx, vy + sy];
    if (Math.hypot(vx - drawing.v0[0], vy - drawing.v0[1]) > 4) drawing.moved = true;
    if (drawing.kind === "pen" || drawing.kind === "highlight") drawing.pts.push(p);
    else drawing.pts[1] = p;
    dirty = true;
  });
  t.ink.addEventListener("pointerup", (e) => {
    const d = drawing;
    drawing = null;
    if (!d || d.t !== t) return;
    dirty = true;
    const [vx, vy] = toView(e, t);
    if ((d.kind === "spot" || d.kind === "zoom") && !d.moved) {
      // A click: that row or card. Clicking inside the same one again takes its parent.
      const el = pick(t, vx, vy, true);
      if (!el) return;
      if (d.kind === "spot") t.spot = { el, path: cssPath(el), rect: null };
      else {
        const r = el.getBoundingClientRect();
        zoomTo({ x: r.left, y: r.top, w: r.width, h: r.height }, t);
      }
      return;
    }
    if (!d.moved && d.kind !== "pen" && d.kind !== "highlight") return;
    const [a, b] = [d.pts[0], d.pts[1] ?? d.pts[0]];
    const rect = { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
    if (d.kind === "spot") t.spot = { rect };
    else if (d.kind === "zoom") {
      const [sx, sy] = scroll(t);
      zoomTo({ ...rect, x: rect.x - sx, y: rect.y - sy }, t);
    } else {
      d.born = performance.now();
      t.strokes.push(d);
    }
    t.lastPick = null;
  });
  // Scroll the site with the wheel while a marker tool has the pointer.
  t.ink.addEventListener(
    "wheel",
    (e) => {
      const w = win(t);
      if (!w) return;
      e.preventDefault();
      w.scrollBy({ left: e.deltaX, top: e.deltaY, behavior: "instant" });
    },
    { passive: false },
  );
}

/** After the active tab or the compare pair changed: re-lay the stage, and chapter it if what is on it changed. */
function afterSwitch(before, { focus = true } = {}) {
  const changed = shownKey() !== before;
  if (changed) zoomOut();
  layout();
  $("address").value = active.path;
  paintTabs();
  saveTabs();
  dirty = true;
  if (changed) autoChapter();
  // Keys like the arrows and Page Down should scroll the page now in front of you.
  if (focus) {
    try {
      active.frame.contentWindow?.focus();
    } catch {
      /* off the site */
    }
  }
}
function setActive(t, opts) {
  if (!t || t === active) return;
  const before = shownKey();
  // Comparing and picking a tab that is not on stage: it takes the active side's place.
  if (pair && !pair.includes(t)) pair[pair.indexOf(active)] = t;
  previous = active;
  active = t;
  afterSwitch(before, opts);
}
function newTab(path = active?.path || "/") {
  if (tabs.length >= MAX_TABS) {
    toast(`${MAX_TABS} tabs is the most (keys 1-9). Close one first.`);
    return;
  }
  const before = shownKey();
  const t = makeTab(path);
  if (pair) pair[pair.indexOf(active)] = t;
  previous = active;
  active = t;
  afterSwitch(before);
  toast(`Tab ${tabs.length} opened on this page. Go anywhere in it; ${pair ? "the other side stays put" : "K compares it with the tab you came from"}.`, 4000);
}
function closeTab(t) {
  if (tabs.length < 2) return;
  const before = shownKey();
  const i = tabs.indexOf(t);
  tabs.splice(i, 1);
  t.pane.remove();
  if (previous === t) previous = null;
  if (pair?.includes(t)) {
    const slot = pair.indexOf(t);
    const spare = (previous && !pair.includes(previous) && previous) || tabs.find((x) => !pair.includes(x));
    if (spare) pair[slot] = spare;
    else pair = null;
    if (active === t) active = pair ? pair[slot] : tabs[0];
  } else if (active === t) active = (previous && tabs.includes(previous) && previous) || tabs[Math.min(i, tabs.length - 1)];
  afterSwitch(before);
}
function toggleCompare() {
  const before = shownKey();
  if (pair) {
    pair = null;
    toast("One tab on stage.");
  } else {
    let other = previous && previous !== active && tabs.includes(previous) ? previous : null;
    if (!other && tabs.length > 1) other = tabs[tabs.indexOf(active) + 1] || tabs[tabs.indexOf(active) - 1];
    if (!other) {
      // Only one tab: open a second on the same page, and aim the keys at it.
      other = active;
      active = makeTab(active.path);
      previous = other;
    }
    pair = [active, other].sort((a, b) => tabs.indexOf(a) - tabs.indexOf(b));
    toast(`Comparing tabs ${tabs.indexOf(pair[0]) + 1} and ${tabs.indexOf(pair[1]) + 1}. Click a side (or press its number) to use it.`, 4000);
  }
  // The page width differs alone vs comparing; the slider shows the one in use.
  paintRail();
  afterSwitch(before);
}
/** Swap the two sides of the comparison. */
function swapSides() {
  if (!pair) return;
  pair.reverse();
  zoomOut();
  afterSwitch(shownKey(), { focus: false }); // the same pages in new places: no chapter
}

function saveTabs() {
  prefs.tabs = tabs.map((t) => t.path);
  prefs.tab = Math.max(0, tabs.indexOf(active));
  prefs.pair = pair ? pair.map((t) => tabs.indexOf(t)) : null;
  prefs.path = active?.path || prefs.path;
  save();
}
function paintTabs() {
  const box = $("tabs");
  box.innerHTML = "";
  const vis = shown();
  tabs.forEach((t, i) => {
    const el = document.createElement("div");
    el.className = "tab";
    el.classList.toggle("on", t === active);
    el.classList.toggle("shown", vis.includes(t) && t !== active);
    const pick = document.createElement("button");
    pick.className = "tab-go";
    pick.title = `${t.path} (${i + 1})`;
    const num = document.createElement("b");
    num.textContent = i + 1;
    const name = document.createElement("span");
    name.textContent = tabLabel(t);
    pick.append(num, name);
    pick.onclick = () => setActive(t);
    el.append(pick);
    if (tabs.length > 1) {
      const x = document.createElement("button");
      x.className = "tab-x";
      x.title = "Close tab";
      x.setAttribute("aria-label", `Close tab ${i + 1}`);
      x.textContent = "×";
      x.onclick = () => closeTab(t);
      el.append(x);
    }
    box.append(el);
  });
  const add = document.createElement("button");
  add.className = "tab-add";
  add.title = "New tab on this page (+)";
  add.textContent = "+";
  add.disabled = tabs.length >= MAX_TABS;
  add.onclick = () => newTab();
  box.append(add);
  $("compareBtn").classList.toggle("on", Boolean(pair));
  $("compareBtn").textContent = pair ? "Back to one tab (K)" : "Compare side by side (K)";
  $("swapBtn").disabled = !pair;
}

// Hash / pushState changes do not fire load: keep the address bar, the tab names and the saved tabs honest.
setInterval(() => {
  let changed = false;
  for (const t of tabs) {
    const w = win(t);
    if (!w) continue;
    const now = here(w);
    const label = pageLabel(w);
    if (now !== t.path || label !== t.label) {
      t.path = now;
      t.label = label;
      changed = true;
    }
  }
  if (changed) {
    saveTabs();
    paintTabs();
  }
  if (active && document.activeElement !== $("address") && $("address").value !== active.path) $("address").value = active.path;
}, 700);
window.addEventListener("message", (e) => {
  if (e.origin !== location.origin || !e.data?.booth) return;
  if (e.data.type === "external") toast(`Stayed on the site (that link goes to ${new URL(e.data.href).hostname}).`);
});

/* ── markers (each tab keeps its own, pinned to its page) ── */
let tool = "browse";
let drawing = null; // {t, kind, tone, pts:[[x,y]] in document coords, born}
let dirty = true;

const setTool = (name) => {
  tool = name;
  for (const t of tabs) t.ink.classList.toggle("tool", name !== "browse");
  document.querySelectorAll("#tools button").forEach((b) => b.classList.toggle("on", b.dataset.tool === name));
};
const scroll = (t) => {
  const w = win(t);
  return w ? [w.scrollX, w.scrollY] : [0, 0];
};
/** Pointer -> tab `t`'s viewport (site CSS px). Works through the stage scale and the zoom. */
const toView = (e, t) => {
  const r = t.view.getBoundingClientRect();
  return [((e.clientX - r.left) * t.W) / r.width, ((e.clientY - r.top) * t.H) / r.height];
};
/** The block under a point: a table row, a card, or the smallest box big enough to read as one. */
function pick(t, vx, vy, again) {
  const w = win(t);
  if (!w) return null;
  let el = w.document.elementFromPoint(vx, vy);
  if (!el) return null;
  if (again && t.lastPick && t.lastPick.contains(el)) {
    el = t.lastPick.parentElement || t.lastPick;
  } else {
    const row = el.closest("tr, li");
    if (row) el = row;
    while (el.parentElement && el !== w.document.body) {
      const r = el.getBoundingClientRect();
      if (r.width >= 140 && r.height >= 26) break;
      el = el.parentElement;
    }
  }
  if (el === w.document.body || el === w.document.documentElement) return null;
  t.lastPick = el;
  return el;
}

/** A selector that finds the same place again after the site re-renders: from the nearest id, by tag position. */
function cssPath(el) {
  const parts = [];
  for (let n = el; n && n.nodeType === 1 && n.tagName !== "HTML"; n = n.parentElement) {
    if (n.id && !/^\d/.test(n.id)) {
      parts.unshift(`#${CSS.escape(n.id)}`);
      break;
    }
    const same = [...(n.parentElement?.children ?? [])].filter((c) => c.tagName === n.tagName);
    parts.unshift(`${n.tagName.toLowerCase()}:nth-of-type(${same.indexOf(n) + 1})`);
  }
  return parts.join(" > ");
}

const undo = () => {
  if (!active) return;
  if (active.spot) active.spot = null;
  else active.strokes.pop();
  dirty = true;
};
const clearMarks = () => {
  if (!active) return;
  active.strokes.length = 0;
  active.spot = null;
  dirty = true;
};

function roundRect(c, x, y, w, h, r, keepPath = false) {
  r = Math.min(r, w / 2, h / 2);
  if (!keepPath) c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function drawStroke(c, s, u, alpha) {
  c.save();
  c.globalAlpha = alpha;
  c.strokeStyle = s.tone;
  c.fillStyle = s.tone;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.shadowColor = "rgba(0,0,0,0.55)";
  c.shadowBlur = 3 * u;
  const p = s.pts;
  const a = p[0];
  const b = p[1] ?? p[0];
  if (s.kind === "pen" || s.kind === "highlight") {
    if (s.kind === "highlight") {
      c.globalAlpha = alpha * 0.34;
      c.lineWidth = 20 * u;
      c.lineCap = "butt";
      c.shadowBlur = 0;
    } else c.lineWidth = 4.5 * u;
    c.beginPath();
    c.moveTo(a[0], a[1]);
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i][0] + p[i + 1][0]) / 2;
      const my = (p[i][1] + p[i + 1][1]) / 2;
      c.quadraticCurveTo(p[i][0], p[i][1], mx, my);
    }
    const last = p[p.length - 1];
    c.lineTo(last[0], last[1]);
    c.stroke();
  } else if (s.kind === "arrow") {
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const head = Math.min(26 * u, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.5);
    c.lineWidth = 5 * u;
    c.beginPath();
    c.moveTo(a[0], a[1]);
    c.lineTo(b[0] - Math.cos(ang) * head * 0.6, b[1] - Math.sin(ang) * head * 0.6);
    c.stroke();
    c.beginPath();
    c.moveTo(b[0], b[1]);
    c.lineTo(b[0] - head * Math.cos(ang - 0.45), b[1] - head * Math.sin(ang - 0.45));
    c.lineTo(b[0] - head * Math.cos(ang + 0.45), b[1] - head * Math.sin(ang + 0.45));
    c.closePath();
    c.fill();
  } else if (s.kind === "box") {
    c.lineWidth = 4 * u;
    roundRect(c, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 8 * u);
    c.stroke();
  } else if (s.kind === "circle") {
    c.lineWidth = 4 * u;
    c.beginPath();
    c.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2 + 6 * u, Math.abs(b[1] - a[1]) / 2 + 6 * u, 0, 0, Math.PI * 2);
    c.stroke();
  } else if (s.kind === "spot" || s.kind === "zoom") {
    // Rubber band while dragging out an area.
    c.setLineDash([8 * u, 6 * u]);
    c.lineWidth = 2.5 * u;
    c.shadowBlur = 0;
    c.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  }
  c.restore();
}

function paintInk(t, now) {
  const ctx = t.ctx;
  const sc = t.ink.width / t.W;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, t.ink.width, t.ink.height);
  const [sx, sy] = scroll(t);
  // One unit = 1/1000 of the stage width, so marks look the same at any page size and on either side.
  const u = geo.sw / 1000 / t.k;
  ctx.setTransform(sc, 0, 0, sc, -sx * sc, -sy * sc); // document coords from here

  const spot = t.spot;
  if (spot) {
    let r = spot.rect;
    if (spot.el) {
      // The site re-renders its cards on a timer, swapping the picked row for a new one
      // (the old node can stay in the document, hidden, at 0x0). Find the same spot in the
      // new markup; failing that, hold the last good position.
      const shownEl = (el) => el?.isConnected && el.getBoundingClientRect().width > 0;
      if (!shownEl(spot.el)) {
        const again = spot.path && win(t)?.document.querySelector(spot.path);
        if (shownEl(again)) spot.el = again;
      }
      if (shownEl(spot.el)) {
        const b = spot.el.getBoundingClientRect();
        spot.rect = { x: b.left + sx, y: b.top + sy, w: b.width, h: b.height };
      }
      r = spot.rect;
    }
    if (r) {
      const pad = 6 * u;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.62)";
      ctx.beginPath();
      ctx.rect(sx - 10, sy - 10, t.W + 20, t.H + 20);
      roundRect(ctx, r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2, 10 * u, true); // the hole
      ctx.fill("evenodd");
      ctx.strokeStyle = tone();
      ctx.lineWidth = 3 * u;
      roundRect(ctx, r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2, 10 * u);
      ctx.stroke();
      ctx.restore();
    }
  }
  const strokes = t.strokes;
  for (let i = strokes.length - 1; i >= 0; i--) {
    const age = now - strokes[i].born;
    if (prefs.fade && age > 4000) strokes.splice(i, 1);
  }
  for (const s of strokes) {
    const age = now - s.born;
    drawStroke(ctx, s, u, prefs.fade && age > 3000 ? Math.max(0, 1 - (age - 3000) / 1000) : 1);
  }
  if (drawing && drawing.t === t && drawing.pts.length) drawStroke(ctx, drawing, u, 1);
}

function render(now) {
  requestAnimationFrame(render);
  const vis = shown();
  if (prefs.fade && vis.some((t) => t.strokes.some((s) => now - s.born > 3000))) dirty = true;
  if (vis.some((t) => t.spot?.el)) dirty = true; // the element can move (late data, layout)
  if (!dirty) return;
  dirty = false;
  for (const t of vis) paintInk(t, now);
}
requestAnimationFrame(render);

/* ── camera ──
 * The camera is PAINTED onto a canvas, not shown as a <video>. Chrome can hand a live
 * camera <video> to the graphics card as its own overlay layer, and tab capture then
 * records the empty box behind it (a grey bubble). A canvas is always composited. */
let camStream = null;
let camError = "";
const camCanvas = $("camCanvas");
const camCtx = camCanvas.getContext("2d");
function paintCam() {
  const w = Math.round(cam.clientWidth * (window.devicePixelRatio || 1));
  const h = Math.round(cam.clientHeight * (window.devicePixelRatio || 1));
  if (!w || !h) return;
  if (camCanvas.width !== w || camCanvas.height !== h) Object.assign(camCanvas, { width: w, height: h });
  const v = camVideo;
  camCtx.setTransform(1, 0, 0, 1, 0, 0);
  if (!camStream || v.readyState < 2 || !v.videoWidth) {
    camCtx.fillStyle = "#1a1a1e";
    camCtx.fillRect(0, 0, w, h);
    camCtx.fillStyle = "#a4a8b6";
    camCtx.font = `600 ${Math.max(11, Math.round(h * 0.07))}px system-ui, sans-serif`;
    camCtx.textAlign = "center";
    camCtx.textBaseline = "middle";
    const lines = camStream ? ["Camera starting..."] : ["No camera", camError || "allow it in the address bar"];
    lines.forEach((t, i) => camCtx.fillText(t.slice(0, 40), w / 2, h / 2 + (i - (lines.length - 1) / 2) * h * 0.1));
    return;
  }
  // object-fit: cover, mirrored when asked
  const k = Math.max(w / v.videoWidth, h / v.videoHeight);
  const dw = v.videoWidth * k;
  const dh = v.videoHeight * k;
  if (prefs.mirror) camCtx.setTransform(-1, 0, 0, 1, w, 0);
  camCtx.drawImage(v, (w - dw) / 2, (h - dh) / 2, dw, dh);
}
// Paint when the camera delivers a frame (30 a second) rather than on every screen
// refresh, so the booth is not redrawing the bubble twice as often as it changes while
// the recorder needs the machine. Size changes and the placeholder repaint on their own.
if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
  const onFrame = () => {
    paintCam();
    camVideo.requestVideoFrameCallback(onFrame);
  };
  camVideo.requestVideoFrameCallback(onFrame);
  new ResizeObserver(paintCam).observe(cam);
  setInterval(() => (!camStream || camVideo.readyState < 2) && paintCam(), 500);
} else {
  const loop = () => {
    paintCam();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/* ── sound: computer mic, phone, or both, mixed into ONE track the recorder records ── */
let micStream = null;
let phoneStream = null;
let phoneState = "wait"; // wait | live
const mix = { ctx: null, dest: null, an: null, nodes: [], delay: null };
// How late the phone's sound reaches us, in seconds (measured from the WebRTC stats).
let phoneLag = 0;
function ensureMix() {
  if (mix.ctx) return;
  mix.ctx = new AudioContext();
  mix.dest = mix.ctx.createMediaStreamDestination();
  mix.an = mix.ctx.createAnalyser();
  mix.an.fftSize = 512;
  const buf = new Uint8Array(mix.an.fftSize);
  const tick = () => {
    mix.an.getByteTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
    $("meter").style.width = `${Math.min(100, (peak / 128) * 160)}%`;
    requestAnimationFrame(tick);
  };
  tick();
  const wake = () => mix.ctx.state === "suspended" && mix.ctx.resume();
  document.addEventListener("pointerdown", wake);
  document.addEventListener("keydown", wake);
}
/** Which streams feed the recording right now. */
const soundSources = () => {
  const src = prefs.sound;
  return [(src === "computer" || src === "both") && micStream, (src === "phone" || src === "both") && phoneStream].filter(Boolean);
};
function rewireSound() {
  ensureMix();
  mix.nodes.forEach((n) => n.disconnect());
  mix.nodes = soundSources().map((stream) => {
    const n = mix.ctx.createMediaStreamSource(stream);
    let out = n;
    // Both: the computer mic is held back by the phone's lag so the two voices land
    // together instead of as an echo. The whole track is then pulled forward in the encode.
    if (prefs.sound === "both" && stream === micStream) {
      if (!mix.delay) {
        mix.delay = mix.ctx.createDelay(1);
        mix.delay.connect(mix.dest);
        mix.delay.connect(mix.an);
      }
      mix.delay.delayTime.value = phoneLag;
      n.connect(mix.delay);
      return n;
    }
    out.connect(mix.dest);
    out.connect(mix.an);
    return n;
  });
  paintSound();
}
function paintSound() {
  document.querySelectorAll("#soundSeg button").forEach((b) => b.classList.toggle("on", b.dataset.sound === prefs.sound));
  $("phoneBox").hidden = prefs.sound === "computer";
  $("micSel").hidden = prefs.sound === "phone";
  const st = $("phoneState");
  st.textContent =
    phoneState === "live"
      ? `Phone connected${phoneLag ? ` · ${Math.round(phoneLag * 1000)} ms behind, synced in the video` : ""}`
      : "Waiting for the phone";
  st.className = phoneState === "live" ? "ok" : "warn";
}

async function startDevices() {
  try {
    camStream?.getTracks().forEach((t) => t.stop());
    micStream?.getTracks().forEach((t) => t.stop());
    const [c, m] = await Promise.all(
      [
        navigator.mediaDevices
          .getUserMedia({ video: { deviceId: prefs.camId ? { exact: prefs.camId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } })
          .catch((e) => (prefs.camId ? navigator.mediaDevices.getUserMedia({ video: true }) : Promise.reject(e))),
        navigator.mediaDevices
          .getUserMedia({ audio: { deviceId: prefs.micId ? { exact: prefs.micId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
          .catch((e) => (prefs.micId ? navigator.mediaDevices.getUserMedia({ audio: true }) : Promise.reject(e))),
      ].map((p) => p.catch((e) => e)),
    );
    camStream = c instanceof MediaStream ? c : null;
    micStream = m instanceof MediaStream ? m : null;
    // NotReadableError = another app (Zoom, OBS, the other booth) has the camera.
    camError = camStream
      ? ""
      : c?.name === "NotReadableError"
        ? "another app is using it"
        : c?.name === "NotAllowedError"
          ? "blocked: allow it in the address bar"
          : c?.message || "";
    camVideo.srcObject = camStream;
    camVideo.play?.().catch(() => {});
    await listDevices();
    rewireSound();
    const miss = [!camStream && `camera (${camError})`, !micStream && prefs.sound !== "phone" && "mic"].filter(Boolean);
    if (miss.length) status(`No ${miss.join(" or ")}. Fix it, then reload.`, true);
    else status(captureNote());
  } catch (e) {
    status(`Devices: ${e.message}`, true);
  }
}
async function listDevices() {
  const all = await navigator.mediaDevices.enumerateDevices();
  const fill = (sel, kind, stream, key) => {
    const cur = stream?.getTracks()[0]?.getSettings().deviceId ?? prefs[key];
    sel.innerHTML = "";
    for (const d of all.filter((x) => x.kind === kind)) {
      const o = new Option(d.label || `${kind === "videoinput" ? "Camera" : "Mic"} ${sel.length + 1}`, d.deviceId);
      o.selected = d.deviceId === cur;
      sel.add(o);
    }
  };
  fill($("camSel"), "videoinput", camStream, "camId");
  fill($("micSel"), "audioinput", micStream, "micId");
}

/* ── the phone: WebRTC audio, signalled through the booth server's /ws relay ── */
const phoneSink = new Audio(); // Chrome only feeds a remote WebRTC stream into Web Audio while a media element plays it
phoneSink.muted = true;
function setPhone(stream) {
  phoneStream = stream;
  phoneState = stream ? "live" : "wait";
  phoneSink.srcObject = stream;
  if (stream) phoneSink.play().catch(() => {});
  rewireSound();
  if (stream) toast("Phone mic connected.");
  else if (rec.state !== "idle" && prefs.sound !== "computer") toast("The phone mic dropped. Keep its page open and the screen on.", 5000);
}
/* One handler for both ways the phone reaches us; `send` replies on the same route. */
let phonePc = null;
async function onPhoneSignal(msg, send) {
  if (msg.role === "phone") {
    send({ type: "booth-ready" }); // the phone joined the room after us: invite its offer
  } else if (msg.type === "offer" && msg.sdp) {
    phonePc?.close();
    const pc = (phonePc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] }));
    pc.onicecandidate = (e) => e.candidate && send({ type: "ice", candidate: e.candidate });
    pc.ontrack = (e) => setPhone(e.streams[0] ?? new MediaStream([e.track]));
    pc.onconnectionstatechange = () => {
      if (pc === phonePc && ["failed", "closed", "disconnected"].includes(pc.connectionState)) setPhone(null);
    };
    await pc.setRemoteDescription(msg.sdp);
    await pc.setLocalDescription(await pc.createAnswer());
    send({ type: "answer", sdp: pc.localDescription });
  } else if (msg.type === "ice" && msg.candidate && phonePc) {
    try {
      await phonePc.addIceCandidate(msg.candidate);
    } catch {
      /* stale candidate */
    }
  }
}
/* The phone's lag: the jitter buffer, half the round trip, and ~40 ms of the phone's own
   capture and Opus framing. Smoothed, and held still while a take is rolling. */
async function measurePhoneLag() {
  const pc = phonePc;
  if (!pc || phoneState !== "live") return;
  let jb = null;
  let rtt = 0;
  (await pc.getStats()).forEach((s) => {
    if (s.type === "inbound-rtp" && s.kind === "audio" && s.jitterBufferEmittedCount) jb = s.jitterBufferDelay / s.jitterBufferEmittedCount;
    if (s.type === "candidate-pair" && s.nominated && s.state === "succeeded" && s.currentRoundTripTime != null) rtt = s.currentRoundTripTime;
  });
  if (jb == null || pc !== phonePc) return;
  const lag = Math.min(0.8, jb + rtt / 2 + 0.04);
  phoneLag = phoneLag ? phoneLag * 0.7 + lag * 0.3 : lag;
  if (rec.state === "idle") {
    if (mix.delay) mix.delay.delayTime.value = phoneLag;
    paintSound();
  }
}
setInterval(() => measurePhoneLag().catch(() => {}), 2000);

/* Same Wi-Fi: the booth server's /ws relay (the https://<PC IP>:8793/mic link). */
function connectPhoneRelay() {
  const ws = new WebSocket(`ws://${location.host}/ws`);
  const send = (m) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));
  ws.onopen = () => send({ role: "booth" });
  ws.onmessage = (ev) => onPhoneSignal(JSON.parse(ev.data), send);
  ws.onclose = () => setTimeout(connectPhoneRelay, 2000);
}
/*
 * Any network: the phone opens chase-analytics.com/mic/?room=CODE and pairs through the
 * site's realtime room (mic/room.js, loaded through the proxy).
 */
const PHONE_SITE = "https://chase-analytics.com";
async function connectPhoneRoom() {
  const { joinRoom, isRoomCode } = await import("/mic/room.js");
  // The booth server owns the code (video/.cache/phone-room.txt, or --room), so the
  // link is the same in every browser and after every restart.
  const code = (await (await fetch("/__booth/api/info")).json()).room;
  if (!isRoomCode(code)) throw new Error("the booth server has no room code");
  const link = joinRoom(code, (msg) => onPhoneSignal(msg, link.send), (s) => s === "open" && link.send({ type: "booth-ready" }));
  return `${PHONE_SITE}/mic/?room=${code}`;
}
function showPhoneLink(url, alts) {
  $("phoneUrl").textContent = url || "Phone mic unavailable: the booth could not reach chase-analytics.com.";
  $("phoneUrl").dataset.url = url || "";
  $("phoneQr").hidden = !url || !window.qrcode;
  if (url && window.qrcode) {
    const qr = window.qrcode(0, "M");
    qr.addData(url);
    qr.make();
    $("phoneQr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }
  $("phoneAlt").hidden = !alts.length;
  $("phoneAlt").textContent = `Same Wi-Fi only, no internet link? ${alts.join(" or ")}`;
}
Promise.all([
  connectPhoneRoom().catch((e) => {
    console.warn("phone room:", e);
    return "";
  }),
  fetch("/__booth/api/lan")
    .then((r) => r.json())
    .then((d) => d.urls ?? [])
    .catch(() => []),
]).then(([url, lan]) => (url ? showPhoneLink(url, lan) : showPhoneLink(lan[0] || "", lan.slice(1))));

// Drag the camera anywhere on the stage.
cam.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  cam.setPointerCapture(e.pointerId);
  cam.classList.add("dragging");
  const s = stage.getBoundingClientRect();
  const c = cam.getBoundingClientRect();
  const off = [e.clientX - c.left, e.clientY - c.top];
  const move = (ev) => {
    prefs.camFree = { x: (ev.clientX - off[0] - s.left) / geo.sw, y: (ev.clientY - off[1] - s.top) / geo.sh };
    placeOverlays();
  };
  const up = () => {
    cam.classList.remove("dragging");
    cam.removeEventListener("pointermove", move);
    save();
  };
  cam.addEventListener("pointermove", move);
  cam.addEventListener("pointerup", up, { once: true });
});

/* ── recording ── */
const rec = { state: "idle", recorder: null, name: "", seq: 0, queue: Promise.resolve(), t0: 0, paused: 0, pauseAt: 0, chapters: [], pages: [] };
let capture = null;
let captureMode = "";

const captureNote = () =>
  !("CropTarget" in window) && !("RestrictionTarget" in window)
    ? "This browser cannot record just the stage. Open the booth in Chrome or Edge."
    : capture
      ? "Ready. R to record."
      : "Ready. R to record (the first time, Chrome asks to share this tab: pick Share).";

/** Tab pixels per CSS pixel that put the stage's long side at 1920. */
function captureScale() {
  const dpr = window.devicePixelRatio || 1;
  const r = stage.getBoundingClientRect();
  const long = prefs.aspect === "vertical" ? r.height : r.width;
  return long ? Math.min(2 * dpr, Math.max(dpr, 1920 / long)) : dpr;
}

async function ensureCapture() {
  const live = capture?.getVideoTracks()[0];
  if (live && live.readyState === "live") return live;
  capture = await navigator.mediaDevices.getDisplayMedia({
    // Sized so the STAGE comes out at about 1080p, the size the take is encoded to.
    // Asking for 4K made Chrome render and encode every frame at up to four times
    // that, which is where the dropped frames (the stutter in the takes) came from.
    video: {
      displaySurface: "browser",
      frameRate: { ideal: 30, max: 30 },
      width: { ideal: Math.round(innerWidth * captureScale()) },
      height: { ideal: Math.round(innerHeight * captureScale()) },
    },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    surfaceSwitching: "exclude",
    monitorTypeSurfaces: "exclude",
  });
  const track = capture.getVideoTracks()[0];
  // "detail" told Chrome to keep resolution and DROP FRAMES whenever it was busy, so
  // scrolls and zooms recorded choppy. The output is 1080p at a high bitrate, which
  // keeps text sharp anyway; smooth motion is what reads as quality on YouTube.
  track.contentHint = "motion";
  captureMode = "";
  try {
    if ("RestrictionTarget" in window) {
      await track.restrictTo(await window.RestrictionTarget.fromElement(stage));
      captureMode = "element";
    }
  } catch {
    captureMode = "";
  }
  if (!captureMode && "CropTarget" in window) {
    try {
      await track.cropTo(await window.CropTarget.fromElement(stage));
      captureMode = "crop";
    } catch (e) {
      capture.getTracks().forEach((t) => t.stop());
      capture = null;
      throw new Error("Share THIS tab (the booth) so only the stage is recorded.");
    }
  }
  if (!captureMode) toast("This browser records the whole tab. Chrome or Edge records just the stage.", 5000);
  track.addEventListener("ended", () => {
    capture = null;
    if (rec.state !== "idle") stopRecording();
    status("Tab sharing stopped. R shares it again.", true);
  });
  return track;
}

// H.264 first: Chrome/Edge encode it on the graphics card on almost every Windows PC.
// VP9 is encoded on the CPU, and at recording size that is what starved the frames.
const pickType = () =>
  ["video/webm;codecs=h264,opus", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"].find((t) =>
    MediaRecorder.isTypeSupported(t),
  ) ?? "";
const elapsed = () => {
  if (rec.state === "idle") return 0;
  const end = rec.state === "paused" ? rec.pauseAt : performance.now();
  return (end - rec.t0 - rec.paused) / 1000;
};
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

async function countdown() {
  if (!prefs.countdown) return;
  const el = $("countdown");
  el.classList.add("show");
  for (const n of [3, 2, 1]) {
    el.textContent = n;
    await new Promise((r) => setTimeout(r, 800));
  }
  el.classList.remove("show");
  // Let the overlay leave the composited frame before the first recorded one.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

async function startRecording() {
  if (rec.state !== "idle") return;
  if (prefs.sound !== "computer" && !phoneStream) {
    status("The phone mic is not connected yet. Open the phone link under Sound, or switch Sound to Computer.", true);
    return;
  }
  rec.state = "arming";
  let track;
  try {
    track = await ensureCapture();
  } catch (e) {
    rec.state = "idle";
    status(e.name === "NotAllowedError" ? "Sharing was cancelled. R to try again." : e.message, true);
    return;
  }
  setAspectLocked(true);
  await countdown();
  const tracks = [track];
  ensureMix();
  await mix.ctx.resume();
  if (soundSources().length) tracks.push(mix.dest.stream.getAudioTracks()[0]);
  rec.audioDelay = prefs.sound !== "computer" && phoneStream ? Math.round(phoneLag * 1000) / 1000 : 0;
  if (mix.delay) mix.delay.delayTime.value = phoneLag;
  else toast("Recording with no sound: no microphone is connected.", 5000);
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  rec.name = `site-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  rec.seq = 0;
  rec.queue = Promise.resolve();
  rec.chapters = [];
  rec.pages = [];
  rec.failed = false;
  if (shown().length) rec.chapters.push({ t: 0, label: stageLabel(), path: stagePath() });
  rec.recorder = new MediaRecorder(new MediaStream(tracks), { mimeType: pickType(), videoBitsPerSecond: 12_000_000, audioBitsPerSecond: 192_000 });
  rec.recorder.ondataavailable = (e) => {
    if (!e.data.size) return;
    const seq = rec.seq++;
    const name = rec.name;
    rec.queue = rec.queue.then(() =>
      fetch(`/__booth/api/chunk?name=${name}&seq=${seq}`, { method: "POST", body: e.data }).then((r) => {
        if (!r.ok) throw new Error(`save failed (${r.status})`);
      }).catch((err) => {
        rec.failed = true;
        status(`Saving the take failed: ${err.message}. Is the booth window still open?`, true);
      }),
    );
  };
  rec.recorder.start(1000);
  rec.t0 = performance.now();
  rec.paused = 0;
  rec.state = "recording";
  paintRec();
  status(`Recording ${rec.name}`);
}

async function stopRecording() {
  if (rec.state === "idle" || rec.state === "arming") return;
  const r = rec.recorder;
  const duration = elapsed();
  const stopped = new Promise((res) => (r.onstop = res));
  if (r.state !== "inactive") r.stop();
  rec.state = "idle";
  paintRec();
  setAspectLocked(false);
  await stopped;
  status("Saving the take...");
  await rec.queue;
  if (rec.failed) return;
  const res = await fetch(`/__booth/api/finish?name=${rec.name}`, {
    method: "POST",
    body: JSON.stringify({ duration, chapters: rec.chapters, aspect: prefs.aspect, siteWidth: active?.W, compare: Boolean(pair), capture: captureMode, audioDelay: rec.audioDelay || 0 }),
  });
  status(res.ok ? `Saved ${rec.name}. Making the mp4...` : `Finishing failed (${res.status}).`, !res.ok);
  refreshTakes();
}

function togglePause() {
  const r = rec.recorder;
  if (rec.state === "recording") {
    r.pause();
    rec.state = "paused";
    rec.pauseAt = performance.now();
  } else if (rec.state === "paused") {
    r.resume();
    rec.paused += performance.now() - rec.pauseAt;
    rec.state = "recording";
  }
  paintRec();
}

/** A chapter when what is on stage changes (a new page, another tab, compare on or off). */
function autoChapter() {
  if (rec.state === "recording" && prefs.autoChapters) addChapter(stageLabel(), true);
}
function addChapter(label, auto = false) {
  if (rec.state === "idle" || rec.state === "arming") {
    toast("Chapter markers are dropped while recording.");
    return;
  }
  const t = Math.round(elapsed() * 10) / 10;
  const text = label || stageLabel() || "Chapter";
  rec.chapters.push({ t, label: text, path: stagePath() });
  $("chapterCount").textContent = rec.chapters.length;
  toast(`${auto ? "Chapter (on stage now)" : "Chapter"} at ${clock(t)}: ${text}`);
}

function paintRec() {
  const live = rec.state === "recording" || rec.state === "paused";
  $("recBtn").classList.toggle("live", live);
  $("recLabel").textContent = live ? "Stop" : "Record";
  $("pauseBtn").disabled = !live;
  $("pauseBtn").textContent = rec.state === "paused" ? "Resume" : "Pause";
  $("timer").classList.toggle("paused", rec.state === "paused");
  $("chapterCount").textContent = live ? rec.chapters.length : "";
  $("ring").classList.toggle("live", live);
  document.title = live ? `${rec.state === "paused" ? "II" : "●"} REC - Site Booth` : "Site Booth";
}
setInterval(() => {
  if (rec.state === "recording" || rec.state === "paused") $("timer").textContent = clock(elapsed());
}, 250);
window.addEventListener("beforeunload", (e) => {
  if (rec.state !== "idle") e.preventDefault();
});

const setAspectLocked = (locked) => document.querySelectorAll("#aspectSeg button, #siteWidth, #camSel, #micSel").forEach((b) => (b.disabled = locked));

/* ── takes ── */
let takesTimer = 0;
async function refreshTakes() {
  clearTimeout(takesTimer);
  const { takes } = await fetch("/__booth/api/takes").then((r) => r.json()).catch(() => ({ takes: [] }));
  const ul = $("takes");
  ul.innerHTML = "";
  if (!takes.length) ul.innerHTML = `<li><small>No takes yet.</small></li>`;
  for (const t of takes.slice(0, 12)) {
    const li = document.createElement("li");
    const state =
      t.state === "encoding" ? "making mp4..." : t.state === "failed" ? `<span class="bad">mp4 failed: ${t.error}</span>` : t.mp4 ? "mp4 ready" : "webm";
    li.innerHTML = `<div>${t.name}<small>${t.mb} MB · ${state}${t.chapters ? " · chapters" : ""}</small></div><button data-show>Show</button><button data-del>Delete</button>`;
    li.querySelector("[data-show]").onclick = () => fetch(`/__booth/api/reveal?name=${t.name}`, { method: "POST" });
    li.querySelector("[data-del]").onclick = async () => {
      if (!confirm(`Delete ${t.name} (the recording, mp4 and chapters)?`)) return;
      await fetch(`/__booth/api/delete?name=${t.name}`, { method: "POST" });
      refreshTakes();
    };
    ul.append(li);
  }
  if (takes.some((t) => t.state === "encoding")) takesTimer = setTimeout(refreshTakes, 2500);
  else if (rec.state === "idle" && /Making the mp4/.test($("status").textContent)) {
    const t = takes[0];
    if (t?.state === "done") status(`${t.name}.mp4 is ready. Show opens the folder.`);
    else if (t?.state === "failed") status(`mp4 failed; the .webm is saved. ${t.error}`, true);
  }
}

/* ── hotkeys (heard from the booth AND from the site frame) ── */
function onKey(e) {
  const t = e.target;
  // Only text entry keeps its keys; a focused checkbox, slider or button must not eat R.
  const typing =
    t && (t.isContentEditable || /^(TEXTAREA|SELECT)$/.test(t.tagName) || (t.tagName === "INPUT" && !/^(checkbox|radio|range|button|submit|color)$/i.test(t.type)));
  if (typing) {
    if (e.key === "Escape") t.blur();
    return;
  }
  if (e.metaKey || e.altKey) return;
  if (e.ctrlKey) {
    if (e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
    }
    return;
  }
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const tools = { v: "browse", d: "pen", h: "highlight", a: "arrow", x: "box", o: "circle", s: "spot", z: "zoom" };
  let hit = true;
  if (k === "r") (rec.state === "idle" ? startRecording : stopRecording)();
  else if (k === "q") togglePause();
  else if (k === "m") addChapter();
  else if (tools[k]) setTool(tool === tools[k] && k !== "v" ? "browse" : tools[k]);
  else if (k === "Escape") {
    zoomOut();
    if (active) active.spot = null;
    dirty = true;
    setTool("browse");
  } else if (k === "t") setTone(prefs.tone + 1);
  else if (k === "u") undo();
  else if (k === "c") clearMarks();
  else if (k === "w") setPref("camOn", !prefs.camOn);
  else if (k === "e") {
    const order = ["tl", "tr", "br", "bl"];
    prefs.camFree = null;
    setPref("corner", order[(order.indexOf(prefs.corner) + 1) % 4]);
  } else if (k === "[") setPref("camSize", Math.max(0, prefs.camSize - 1));
  else if (k === "]") setPref("camSize", Math.min(2, prefs.camSize + 1));
  else if (k === "b") setPref("bug", !prefs.bug);
  else if (k === "n") setPref("lower", !prefs.lower);
  else if (/^[1-9]$/.test(k) && tabs[Number(k) - 1]) setActive(tabs[Number(k) - 1]);
  else if (k === "k") toggleCompare();
  else if (k === "+" || k === "=") newTab();
  else hit = false;
  if (hit) e.preventDefault();
}
window.addEventListener("keydown", onKey, true);

/* ── rail wiring ── */
function setPref(key, value) {
  prefs[key] = value;
  save();
  paintRail();
  placeOverlays();
}
function setTone(i) {
  prefs.tone = ((i % TONES.length) + TONES.length) % TONES.length;
  save();
  paintRail();
  dirty = true;
}
function paintRail() {
  document.querySelectorAll("#aspectSeg button").forEach((b) => b.classList.toggle("on", b.dataset.aspect === prefs.aspect));
  document.querySelectorAll("#cornerSeg button").forEach((b) => b.classList.toggle("on", !prefs.camFree && b.dataset.corner === prefs.corner));
  document.querySelectorAll("#sizeSeg button").forEach((b) => b.classList.toggle("on", Number(b.dataset.size) === prefs.camSize));
  document.querySelectorAll("#shapeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.shape === prefs.camShape));
  document.querySelectorAll("#tones button").forEach((b, i) => b.classList.toggle("on", i === prefs.tone % TONES.length));
  $("siteWidth").value = siteWidth();
  $("siteWidthOut").textContent = `${siteWidth()}px${pair ? " each" : ""}`;
  $("camOn").checked = prefs.camOn;
  $("mirror").checked = prefs.mirror;
  $("bugOn").checked = prefs.bug;
  $("lowerOn").checked = prefs.lower;
  $("countOn").checked = prefs.countdown;
  $("autoCh").checked = prefs.autoChapters;
  $("fade").checked = prefs.fade;
}

for (const [i, [label, color]] of TONES.entries()) {
  const b = document.createElement("button");
  b.title = label;
  b.style.background = color;
  b.onclick = () => setTone(i);
  $("tones").append(b);
}
document.querySelectorAll("#tools button").forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
document.querySelectorAll("#aspectSeg button").forEach(
  (b) =>
    (b.onclick = () => {
      prefs.aspect = b.dataset.aspect;
      // The site reflows, so drawn marks would land on the wrong things.
      for (const t of tabs) t.strokes.length = 0;
      save();
      paintRail();
      layout();
      dirty = true;
    }),
);
document.querySelectorAll("#cornerSeg button").forEach(
  (b) =>
    (b.onclick = () => {
      prefs.camFree = null;
      setPref("corner", b.dataset.corner);
    }),
);
document.querySelectorAll("#sizeSeg button").forEach((b) => (b.onclick = () => setPref("camSize", Number(b.dataset.size))));
document.querySelectorAll("#shapeSeg button").forEach((b) => (b.onclick = () => setPref("camShape", b.dataset.shape)));
document.querySelectorAll("#quick button").forEach((b) => (b.onclick = () => go(b.dataset.go)));
$("siteWidth").oninput = (e) => {
  // layout() clears the marks of a tab whose page width changes.
  prefs.siteWidth = { ...prefs.siteWidth, [widthKey()]: Number(e.target.value) };
  save();
  paintRail();
  layout();
  dirty = true;
};
$("camOn").onchange = (e) => setPref("camOn", e.target.checked);
$("mirror").onchange = (e) => setPref("mirror", e.target.checked);
$("bugOn").onchange = (e) => setPref("bug", e.target.checked);
$("lowerOn").onchange = (e) => setPref("lower", e.target.checked);
$("countOn").onchange = (e) => setPref("countdown", e.target.checked);
$("autoCh").onchange = (e) => setPref("autoChapters", e.target.checked);
$("fade").onchange = (e) => setPref("fade", e.target.checked);
$("nameIn").value = prefs.name;
$("handleIn").value = prefs.handle;
$("nameIn").oninput = (e) => setPref("name", e.target.value);
$("handleIn").oninput = (e) => setPref("handle", e.target.value);
$("notes").value = prefs.notes;
$("notes").oninput = (e) => {
  prefs.notes = e.target.value;
  save();
};
document.querySelectorAll("#soundSeg button").forEach(
  (b) =>
    (b.onclick = () => {
      prefs.sound = b.dataset.sound;
      save();
      rewireSound();
    }),
);
$("phoneUrl").onclick = (e) => {
  const u = e.target.dataset.url;
  if (u) navigator.clipboard?.writeText(u).then(() => toast("Link copied."), () => {});
};
$("camSel").onchange = (e) => {
  prefs.camId = e.target.value;
  save();
  startDevices();
};
$("micSel").onchange = (e) => {
  prefs.micId = e.target.value;
  save();
  startDevices();
};
$("recBtn").onclick = () => (rec.state === "idle" ? startRecording() : stopRecording());
$("pauseBtn").onclick = togglePause;
$("chapterBtn").onclick = () => addChapter();
$("undoBtn").onclick = undo;
$("clearBtn").onclick = clearMarks;
$("compareBtn").onclick = () => toggleCompare();
$("swapBtn").onclick = () => swapSides();
$("backBtn").onclick = () => win()?.history.back();
$("fwdBtn").onclick = () => win()?.history.forward();
$("reloadBtn").onclick = () => win()?.location.reload();
$("folderBtn").onclick = () => fetch("/__booth/api/reveal", { method: "POST" });
$("address").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    go(e.target.value, active);
    e.target.blur();
  }
});
navigator.mediaDevices?.addEventListener?.("devicechange", listDevices);

new ResizeObserver(() => {
  layout();
  dirty = true;
}).observe($("deck"));

// Reopen the tabs from last time. ?page=/nfl/ (from --page) wins for the tab in front.
{
  const saved = (Array.isArray(prefs.tabs) ? prefs.tabs : []).filter((p) => typeof p === "string" && p).slice(0, MAX_TABS);
  const paths = saved.length ? saved : [prefs.path];
  const front = Number.isInteger(prefs.tab) && paths[prefs.tab] ? prefs.tab : 0;
  const asked = new URLSearchParams(location.search).get("page");
  if (asked) paths[front] = asked;
  paths.forEach((p) => makeTab(p));
  active = tabs[front];
  const [i, j] = Array.isArray(prefs.pair) ? prefs.pair : [];
  if (tabs[i] && tabs[j] && i !== j) {
    pair = [tabs[i], tabs[j]];
    if (!pair.includes(active)) active = pair[0];
    previous = pair.find((t) => t !== active);
  }
}
paintRail();
paintTabs();
setTool("browse");
layout();
startDevices();
connectPhoneRelay();
refreshTakes();
fetch("/__booth/api/info")
  .then((r) => r.json())
  .then((i) => {
    if (!i.ffmpeg) toast("ffmpeg was not found: takes stay .webm. Start the booth with --ffmpeg PATH for mp4.", 6000);
  })
  .catch(() => {});
