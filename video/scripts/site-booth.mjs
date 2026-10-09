#!/usr/bin/env node
/**
 * THE SITE BOOTH: record a breakdown ON chase-analytics.com itself - the real site on
 * stage, your camera in a bubble, markers drawn over the page, chapter markers dropped
 * as you go.
 *
 *   node scripts/site-booth.mjs [--origin https://chase-analytics.com] [--port 8792]
 *                               [--page /nfl/] [--ffmpeg PATH] [--no-open]
 *
 * How it works: this server proxies the site, so the page on stage is served from the
 * booth's own origin (http://localhost:8792/nfl/ is chase-analytics.com/nfl/). Same
 * origin is what lets the booth hear your hotkeys while you click around the site, pin
 * markers to the page so they scroll with it, and spotlight a real table row. The booth
 * page itself lives under /__booth/ where the site has nothing.
 *
 * A take is the stage only (Chrome/Edge tab capture cropped to it) plus your mic. It
 * streams to video/footage/site/<name>.webm while you record, then ffmpeg makes
 * <name>.mp4 at 1920x1080 or 1080x1920. Chapter markers go to <name>.chapters.txt in
 * YouTube's format.
 *
 * Point --origin at a local server (e.g. http://localhost:8788 from wrangler pages dev)
 * to record an unreleased build.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import crypto from "node:crypto";
import https from "node:https";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { createRelay, ensureBoothPfx, ensureFirewall, lanIps } from "./lib/phone-mic.mjs";
import { loadBracket } from "./lib/bracket-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const port = Number(opt("port", 8792));
const startPage = opt("page", null);
const phonePort = port + 1;
const origin = new URL(opt("origin", "https://chase-analytics.com")).origin;
const originHosts = [new URL(origin).host, "chase-analytics.com", "www.chase-analytics.com"];
const pageDir = path.join(root, "site-booth");
const footage = path.join(root, "footage", "site");

/* ── the phone-mic room: `--room CODE` sets it, video/.cache keeps it, so the phone link never changes ── */
const ROOM_RE = /^[a-z0-9]{8,32}$/;
const roomFile = path.join(root, ".cache", "phone-room.txt");
const phoneRoom = (() => {
  let code = String(opt("room", "") || "").trim().toLowerCase();
  if (!ROOM_RE.test(code)) {
    try {
      code = fs.readFileSync(roomFile, "utf8").trim();
    } catch {
      code = "";
    }
  }
  if (!ROOM_RE.test(code)) code = Array.from(crypto.randomBytes(12), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
  fs.mkdirSync(path.dirname(roomFile), { recursive: true });
  fs.writeFileSync(roomFile, code);
  return code;
})();
const phoneLink = `https://chase-analytics.com/mic/?room=${phoneRoom}`;
fs.mkdirSync(footage, { recursive: true });

/* ── ffmpeg: --ffmpeg, $FFMPEG, the Remotion compositor build, then PATH ── */
const findFfmpeg = () => {
  const exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const candidates = [
    opt("ffmpeg", null),
    process.env.FFMPEG,
    path.join(root, "node_modules", "@remotion", `compositor-${process.platform}-${process.arch}${process.platform === "win32" ? "-msvc" : ""}`, exe),
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  const r = spawnSync("ffmpeg", ["-version"], { encoding: "utf8", windowsHide: true });
  return r.status === 0 ? "ffmpeg" : null;
};
const ffmpeg = findFfmpeg();

/* ── content intelligence: the show plan (outputs/content_intel.py) ── */
const repo = path.resolve(root, "..");
const intelDir = path.join(root, "intel");
const roadmapFile = path.join(intelDir, "roadmap.json");
const findPython = () => {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const win = process.platform === "win32";
  const venv = (dir) => path.join(dir, "crawl_env", win ? "Scripts" : "bin", win ? "python.exe" : "python");
  return [process.env.PYTHON, venv(repo), home && venv(home)].filter(Boolean).find((c) => fs.existsSync(c)) || (win ? "python" : "python3");
};
const python = findPython();
/** Run `python -m outputs.content_intel ...` from the repo root. Never throws. */
const runIntel = (argv, timeoutMs = 90_000) =>
  new Promise((resolve) => {
    const p = spawn(python, ["-m", "outputs.content_intel", ...argv], { cwd: repo, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    let out = "";
    let err = "";
    const timer = setTimeout(() => p.kill(), timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: -1, out, err: `could not start ${python}: ${e.message}` });
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out: out.trim(), err: err.trim() });
    });
  });
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};
/**
 * The platforms' UI-safe areas, read from the one place they are defined
 * (src/ds/safe.ts) rather than restated here. Missing or unparseable: no guide.
 */
const safeZones = () => {
  try {
    const src = fs.readFileSync(path.join(root, "src", "ds", "safe.ts"), "utf8");
    const body = src.slice(src.indexOf("export const SAFE"), src.indexOf("};", src.indexOf("export const SAFE")));
    const out = {};
    for (const m of body.matchAll(/"?([\w-]+)"?\s*:\s*\{\s*top:\s*(\d+),\s*right:\s*(\d+),\s*bottom:\s*(\d+)\s*\}/g)) {
      out[m[1]] = { top: +m[2], right: +m[3], bottom: +m[4] };
    }
    return out;
  } catch {
    return {};
  }
};
const playbookSegments = () => {
  const pb = readJson(path.join(repo, "outputs", "content_playbook.json"));
  const segs = Object.fromEntries(Object.entries(pb?.segments ?? {}).map(([id, g]) => [id, g.name]));
  const plats = Object.fromEntries(Object.entries(pb?.platforms ?? {}).map(([id, p]) => [id, { label: p.label, base: p.base }]));
  return { segments: segs, platforms: plats };
};
/** Everything a take needs to be posted: per-platform title, caption, post text and length. */
const postKit = (name, body, episode) => {
  const L = [`# ${episode.title}`, "", `Take ${name} · ${stamp(body.duration || 0)} · ${episode.aspect === "vertical" ? "9:16" : "16:9"} · ${episode.name}`, ""];
  if (body.episode?.hook) L.push(`Hook used: ${body.episode.hook}`, "");
  for (const [id, k] of Object.entries(episode.platforms ?? {})) {
    const [lo, hi] = k.length_s;
    const d = body.duration || 0;
    const verdict = d > hi ? `OVER - cut to ${stamp(hi)} or less` : d < lo ? "short of the best range (fine if it loops)" : "fits";
    L.push(`## ${k.label}`, `- Length ${stamp(d)}: ${verdict} (best ${stamp(lo)}-${stamp(hi)})`);
    if (k.title) L.push(`- Title: ${k.title}`);
    L.push(`- Caption: ${k.caption}`);
    if (k.post_text) L.push(`- Post text: ${k.post_text}`);
    L.push(`- Post: ${k.post_window_et.join(", ")} ET`, `- ${k.packaging}`, `- After it's up a few days: log its numbers with Results on this take in the booth (${id}).`, "");
  }
  if (episode.compliance?.length) L.push("## Compliance", ...episode.compliance.map((c) => `- ${c}`), "");
  return L.join("\n");
};

/* ── helpers ── */
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
const sendFile = (res, file) => {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end("not found");
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "no-cache" });
  fs.createReadStream(file).pipe(res);
};
const json = (res, body, code = 200) => {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve, reject) => {
    const parts = [];
    req.on("data", (c) => parts.push(c));
    req.on("end", () => resolve(Buffer.concat(parts)));
    req.on("error", reject);
  });
const safeName = (n) => (/^[\w.-]{1,80}$/.test(n ?? "") && !n.includes("..") ? n : null);
const stamp = (s) => {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

/* ── takes ── */
const jobs = new Map(); // name -> { state: "encoding" | "done" | "failed", error?, started }

/*
 * Which build of the booth this is: a hash of the server code. A second launch compares
 * it with the booth already on the port, so an old window left open (from before an
 * update) is replaced instead of silently serving pages it does not know ("not found").
 */
const BUILD = (() => {
  const h = crypto.createHash("sha1");
  const libs = path.join(root, "scripts", "lib");
  for (const f of [fileURLToPath(import.meta.url), ...fs.readdirSync(libs).sort().map((n) => path.join(libs, n))]) {
    if (f.endsWith(".mjs")) h.update(fs.readFileSync(f));
  }
  return h.digest("hex").slice(0, 12);
})();
let lastChunkAt = 0;
const busy = () => Date.now() - lastChunkAt < 15_000 || [...jobs.values()].some((j) => j.state === "encoding");
const listTakes = () =>
  fs
    .readdirSync(footage)
    .filter((f) => f.endsWith(".webm"))
    .map((f) => {
      const name = f.slice(0, -5);
      const mp4 = path.join(footage, `${name}.mp4`);
      const job = jobs.get(name);
      return {
        name,
        mb: +(fs.statSync(path.join(footage, f)).size / 1e6).toFixed(1),
        mp4: fs.existsSync(mp4) && job?.state !== "encoding",
        state: job?.state ?? (fs.existsSync(mp4) ? "done" : "raw"),
        error: job?.error ?? "",
        chapters: fs.existsSync(path.join(footage, `${name}.chapters.txt`)),
        post: fs.existsSync(path.join(footage, `${name}.post.md`)),
        episode: readJson(path.join(footage, `${name}.json`))?.episode ?? null,
      };
    })
    .sort((a, b) => (a.name < b.name ? 1 : -1));

/**
 * YouTube chapters: the first must be 0:00, at least three, each >= 10 s. A marker that
 * lands within 10 s of the next one gives way to it (you moved on quickly, the later
 * label is the one that described what stayed on screen).
 */
const chapterSheet = (chapters, duration) => {
  const sorted = [...chapters].filter((c) => Number.isFinite(c.t) && c.t >= 0 && c.t < duration).sort((a, b) => a.t - b.t);
  const kept = [];
  // The same label twice in a row (a reload, a second marker on one page) is one chapter.
  const distinct = sorted.filter((c, i) => i === 0 || c.label !== sorted[i - 1].label);
  for (let i = 0; i < distinct.length; i++) {
    const next = distinct[i + 1]?.t ?? duration;
    if (next - distinct[i].t >= 10) kept.push(distinct[i]);
  }
  if (!kept.length || kept[0].t > 0) {
    if (kept[0] && kept[0].t < 10) kept[0] = { ...kept[0], t: 0 };
    else kept.unshift({ t: 0, label: distinct[0]?.label ?? "Intro" });
  }
  const lines = kept.map((c) => `${stamp(c.t)} ${String(c.label || "Chapter").replace(/[\r\n]+/g, " ").trim()}`);
  const note = kept.length < 3 ? "\n# YouTube shows chapters only when there are 3 or more (each 10 s+)." : "";
  return `${lines.join("\n")}\n${note}\n# Every marker you dropped (recording seconds):\n${sorted.map((c) => `# ${stamp(c.t)} ${c.label}`).join("\n")}\n`;
};

/**
 * `audioShift` (seconds) moves the sound EARLIER: the phone mic reaches the PC over
 * Wi-Fi a beat after the camera frame it belongs to (the booth measures it), so
 * without this the voice trails the lips. It is done by starting the audio input
 * that far in, which needs no filter the lean ffmpeg build might not have.
 */
const encode = (name, aspect, audioShift = 0) => {
  if (!ffmpeg) {
    jobs.set(name, { state: "failed", error: "ffmpeg not found - the .webm is your video (pass --ffmpeg PATH)" });
    return;
  }
  const [W, H] = aspect === "vertical" ? [1080, 1920] : [1920, 1080];
  const src = path.join(footage, `${name}.webm`);
  const out = path.join(footage, `${name}.mp4`);
  // The stage is always exactly 16:9 or 9:16, so a straight scale lands on the target.
  // The Remotion ffmpeg build is lean (no pad/fps filters, no positional filter args):
  // stick to scale + format with named options, and set the frame rate on the output.
  const vf = `scale=w=${W}:h=${H}:flags=lanczos,format=pix_fmts=yuv420p`;
  const shift = Math.min(1, Math.max(0, Number(audioShift) || 0));
  const inputs = shift >= 0.01 ? ["-i", src, "-ss", shift.toFixed(3), "-i", src, "-map", "0:v:0", "-map", "1:a:0?"] : ["-i", src];
  const argv = ["-y", "-hide_banner", "-loglevel", "error", ...inputs, "-vf", vf, "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", out];
  jobs.set(name, { state: "encoding", started: Date.now() });
  console.log(`  encoding ${name}.mp4 (${W}x${H}) ...`);
  const p = spawn(ffmpeg, argv, { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  let err = "";
  p.stderr.on("data", (d) => (err += d));
  p.on("error", (e) => jobs.set(name, { state: "failed", error: String(e) }));
  p.on("close", (code) => {
    if (code === 0) {
      jobs.set(name, { state: "done" });
      console.log(`  ready: ${path.relative(root, out)}`);
    } else {
      jobs.set(name, { state: "failed", error: err.trim().split("\n").slice(-2).join(" ") || `ffmpeg exited ${code}` });
      console.log(`  encode failed for ${name}: ${jobs.get(name).error}`);
    }
  });
};

const bracketCache = new Map();

/* ── the proxy ── */
const HOP = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-connection", "te", "trailer", "host", "accept-encoding", "content-length"]);
const DROP_RES = new Set([
  "content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive",
  "x-frame-options", "content-security-policy", "content-security-policy-report-only",
  "strict-transport-security", "report-to", "nel", "alt-svc",
]);
const TEXTUAL = /^(text\/html|text\/css|text\/javascript|application\/javascript|application\/json|application\/manifest\+json)/i;
const hostPattern = new RegExp(`https?://(?:${originHosts.map((h) => h.replace(/[.]/g, "\\.")).join("|")})(?=[/"'?#\\s)]|$)`, "g");
const INJECT = `<script src="/__booth/inject.js"></script><style id="__booth-style">html{scrollbar-width:none}html::-webkit-scrollbar{display:none}</style>`;

const proxy = async (req, res, url) => {
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k)) headers[k] = v;
  headers["accept-encoding"] = "identity";
  if (headers.origin) headers.origin = origin;
  if (headers.referer) headers.referer = headers.referer.replace(/^https?:\/\/[^/]+/, origin);
  const hasBody = !["GET", "HEAD"].includes(req.method);
  const upstream = await fetch(origin + url.pathname + url.search, {
    method: req.method,
    headers,
    body: hasBody ? await readBody(req) : undefined,
    redirect: "manual",
  });
  const out = {};
  upstream.headers.forEach((v, k) => {
    if (DROP_RES.has(k)) return;
    if (k === "location") v = v.replace(hostPattern, "") || "/";
    if (k === "set-cookie") return; // getSetCookie below keeps multiple cookies apart
    out[k] = v;
  });
  const cookies = upstream.headers.getSetCookie?.() ?? [];
  if (cookies.length) out["set-cookie"] = cookies.map((c) => c.replace(/;\s*domain=[^;]*/i, "").replace(/;\s*secure/i, ""));
  const type = upstream.headers.get("content-type") ?? "";
  if (!upstream.body || req.method === "HEAD") {
    res.writeHead(upstream.status, out).end();
    return;
  }
  if (TEXTUAL.test(type)) {
    // An absolute link to the site becomes a same-origin one ("https://site/x" -> "/x", bare "https://site" -> "/").
    let text = (await upstream.text()).replace(hostPattern, (m, at, all) => (all[at + m.length] === "/" ? "" : "/"));
    if (/^text\/html/i.test(type)) {
      text = /<head[^>]*>/i.test(text) ? text.replace(/<head[^>]*>/i, (m) => m + INJECT) : INJECT + text;
      out["cache-control"] = "no-cache";
    }
    res.writeHead(upstream.status, out).end(text);
    return;
  }
  res.writeHead(upstream.status, out);
  Readable.fromWeb(upstream.body).pipe(res);
};

/* ── routes ── */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const p = url.pathname;
  try {
    if (p === "/__booth" || p === "/__booth/") return sendFile(res, path.join(pageDir, "index.html"));
    if (p.startsWith("/__booth/api/")) {
      const api = p.slice("/__booth/api/".length);
      const name = safeName(url.searchParams.get("name"));
      if (api === "info") return json(res, { build: BUILD, pid: process.pid, busy: busy(), origin, ffmpeg: Boolean(ffmpeg), footage: path.relative(path.resolve(root, ".."), footage), room: phoneRoom });
      if (api === "takes") return json(res, { takes: listTakes() });
      if (api === "bracket") {
        // The playoff bracket page (/__booth/bracket/): live series from MLB's stats API, cached 60 s.
        const season = Number(url.searchParams.get("season")) || new Date().getFullYear();
        const hit = bracketCache.get(season);
        if (!hit || Date.now() - hit.at > 60_000) {
          try {
            bracketCache.set(season, { at: Date.now(), data: await loadBracket(season) });
          } catch (e) {
            if (!hit) return json(res, { error: `MLB stats API: ${e.message}` }, 502);
          }
        }
        return json(res, bracketCache.get(season).data);
      }
      if (api === "intel") {
        // The show plan. Built on first use; Refresh rebuilds it (live slates + logged results).
        let built = null;
        if (!fs.existsSync(roadmapFile)) built = await runIntel(["roadmap", "--quiet"]);
        const roadmap = readJson(roadmapFile);
        return json(res, { roadmap, safe: safeZones(), ...playbookSegments(), error: roadmap ? "" : built?.err || built?.out || "no roadmap" });
      }
      if (req.method === "POST" && api === "intel-refresh") {
        const r = await runIntel(["roadmap", "--quiet"]);
        return json(res, { ok: r.code === 0, message: r.code === 0 ? r.out.split("\n").pop() : r.err || r.out }, r.code === 0 ? 200 : 500);
      }
      if (req.method === "POST" && api === "perf") {
        // One post's results, logged through the intelligence module so validation lives in one place.
        let body;
        try {
          body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
        } catch {
          return json(res, { ok: false, message: "bad JSON" }, 400);
        }
        if (body.take && !safeName(body.take)) return json(res, { ok: false, message: "bad take name" }, 400);
        const r = await runIntel(["log", "--json", JSON.stringify(body)], 30_000);
        const message = (r.code === 0 ? r.out : r.err || r.out).replace(/^content intel:\s*/, "");
        return json(res, { ok: r.code === 0, message }, r.code === 0 ? 200 : 400);
      }
      if (api === "lan") return json(res, { urls: secureUp ? lanIps().map((ip) => `https://${ip}:${phonePort}/mic`) : [], port: phonePort });
      if (req.method === "POST" && api === "chunk") {
        // Chunks arrive in order (the page sends them one at a time); seq 0 starts the file.
        if (!name) return res.writeHead(400).end("bad name");
        const file = path.join(footage, `${name}.webm`);
        const body = await readBody(req);
        lastChunkAt = Date.now();
        if (url.searchParams.get("seq") === "0") fs.writeFileSync(file, body);
        else fs.appendFileSync(file, body);
        return res.writeHead(200).end("ok");
      }
      if (req.method === "POST" && api === "finish") {
        if (!name || !fs.existsSync(path.join(footage, `${name}.webm`))) return res.writeHead(404).end("recording not found");
        const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
        const duration = Number(body.duration) || 0;
        fs.writeFileSync(path.join(footage, `${name}.chapters.txt`), chapterSheet(body.chapters ?? [], duration));
        fs.writeFileSync(path.join(footage, `${name}.json`), JSON.stringify({ ...body, origin }, null, 2));
        const planned = body.episode?.id && readJson(roadmapFile)?.episodes?.find((e) => e.id === body.episode.id);
        if (planned) fs.writeFileSync(path.join(footage, `${name}.post.md`), postKit(name, body, planned));
        const mb = (fs.statSync(path.join(footage, `${name}.webm`)).size / 1e6).toFixed(1);
        console.log(`  saved ${name}.webm (${mb} MB, ${stamp(duration)}, ${(body.chapters ?? []).length} markers)`);
        encode(name, body.aspect === "vertical" ? "vertical" : "wide", body.audioDelay);
        return json(res, { ok: true });
      }
      if (req.method === "POST" && api === "reveal") {
        const target = name && [".mp4", ".webm"].map((e) => path.join(footage, name + e)).find((f) => fs.existsSync(f));
        if (process.platform === "win32") {
          spawn("explorer.exe", target ? [`/select,${target}`] : [footage], { detached: true, stdio: "ignore" }).unref();
        }
        return res.writeHead(200).end("ok");
      }
      if (req.method === "POST" && api === "delete") {
        if (!name) return res.writeHead(400).end("bad name");
        for (const e of [".webm", ".mp4", ".chapters.txt", ".json", ".post.md"]) fs.rmSync(path.join(footage, name + e), { force: true });
        jobs.delete(name);
        return res.writeHead(200).end("ok");
      }
      return res.writeHead(404).end("unknown api");
    }
    if (p.startsWith("/__booth/")) {
      let file = path.resolve(pageDir, "." + decodeURIComponent(p.slice("/__booth".length)));
      if (!file.startsWith(pageDir + path.sep)) return res.writeHead(403).end();
      // A folder (/__booth/bracket/) serves its index.html.
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
      return sendFile(res, file);
    }
    return await proxy(req, res, url);
  } catch (e) {
    console.error(`  ${req.method} ${p}: ${e.message}`);
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" });
    res.end(`booth proxy error: ${e.message}`);
  }
});

const openBrowser = (url) => {
  if (args.includes("--no-open") || process.platform !== "win32") return;
  // Chrome or Edge: the booth needs region capture, which Firefox does not have.
  // `start chrome` resolves through App Paths (Chrome is rarely on PATH), so look there.
  const registered = (exe) =>
    ["HKCU", "HKLM"].some(
      (hive) => spawnSync("reg", ["query", `${hive}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exe}`], { windowsHide: true }).status === 0,
    );
  const app = registered("chrome.exe") ? "chrome" : registered("msedge.exe") ? "msedge" : "";
  spawn("cmd.exe", ["/c", "start", "", ...(app ? [app] : []), url], { detached: true, stdio: "ignore" }).unref();
};
/* ── phone as a mic: an https port on the LAN that serves ONLY the mic page and the relay ── */
const onUpgrade = createRelay();
server.on("upgrade", onUpgrade);
let secureUp = false;
const pfx = ensureBoothPfx(root);
if (pfx) {
  // Never the proxy or the takes API: anyone on the Wi-Fi can reach this port.
  const secure = https.createServer({ pfx: fs.readFileSync(pfx), passphrase: "booth" }, (req, res) => {
    const p = new URL(req.url, "https://booth").pathname;
    if (p === "/mic" || p === "/") return sendFile(res, path.join(root, "..", "mic", "index.html"));
    res.writeHead(404).end("not found");
  });
  secure.on("upgrade", onUpgrade);
  let secureTries = 0;
  secure.on("error", (e) => {
    // While replacing an older booth, its phone port frees a moment after it exits.
    if (e.code === "EADDRINUSE" && ++secureTries <= 5) return setTimeout(() => secure.listen(phonePort, "0.0.0.0"), 1500);
    console.log(e.code === "EADDRINUSE" ? `  phone mic port ${phonePort} is already in use.` : `  phone mic https: ${e.message}`);
  });
  secure.listen(phonePort, "0.0.0.0", () => {
    secureUp = true;
    const urls = lanIps().map((ip) => `https://${ip}:${phonePort}/mic`);
    if (urls.length) console.log(`  phone as mic: open ${urls[0]} on the phone (same Wi-Fi)`);
    if (urls.length > 1) console.log(`    if that does not load, try: ${urls.slice(1).join("  ")}`);
    ensureFirewall(phonePort);
  });
}

const boothUrl = `http://localhost:${port}/__booth/${startPage ? `?page=${encodeURIComponent(startPage)}` : ""}`;
let replacing = false;
server.on("error", async (e) => {
  if (e.code !== "EADDRINUSE") throw e;
  let other = null;
  try {
    other = await (await fetch(`http://127.0.0.1:${port}/__booth/api/info`, { signal: AbortSignal.timeout(3000) })).json();
  } catch {
    /* not a booth, or not answering */
  }
  if (other?.build === BUILD) {
    console.log(`The site booth is already running at ${boothUrl} - opening it.`);
    openBrowser(boothUrl);
    process.exit(0);
  }
  if (other?.pid && !other.busy && !replacing) {
    // An older booth, idle: take its place so the latest pages and fixes are served.
    replacing = true;
    console.log("An older site booth was still running. Replacing it with this version...");
    try {
      process.kill(other.pid);
    } catch {
      /* already gone */
    }
    setTimeout(() => server.listen(port, "127.0.0.1"), 1500);
    return;
  }
  console.log(`\nAn OLDER site booth is still running on this port${other?.busy ? " and is recording or saving a take." : "."}`);
  console.log(other?.busy ? "Finish that take, then close its window and run this again." : "Close its window (the black one titled site-booth), then run this again.");
  process.exit(1);
});
server.listen(port, "127.0.0.1", () => {
  const url = boothUrl;
  console.log(`\nSite booth: ${url}`);
  console.log(`  stage shows ${origin} (proxied)`);
  console.log(`  PHONE MIC LINK (works on any network): ${phoneLink}`);
  console.log(`  takes save to ${path.relative(path.resolve(root, ".."), footage)}`);
  console.log(ffmpeg ? `  mp4 encode: ${ffmpeg}` : "  ffmpeg not found - takes stay .webm (pass --ffmpeg PATH to get .mp4)");
  console.log("Keep this window open while you record.\n");
  openBrowser(url);
});
