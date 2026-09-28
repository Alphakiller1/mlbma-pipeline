/**
 * Phone-mic pairing room, shared by the phone page (/mic/) and the site booth.
 *
 * The phone and the booth on the PC find each other through a Supabase Realtime
 * broadcast channel named after a random room code, so the phone needs no PC IP
 * address, self-signed certificate or firewall port. Only the WebRTC handshake
 * (offer, answer, ICE candidates) passes through Supabase; the audio itself flows
 * phone -> PC directly. Uses the site's public publishable key from
 * /dashboard/mlbma_config.js (window.MLBMA_CONFIG), which the page must load first.
 */

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** A fresh room code: 12 characters, about 59 bits, nothing easy to misread. */
export const newRoomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => ALPHABET[b % ALPHABET.length]).join("");

export const isRoomCode = (code) => /^[a-z0-9]{8,32}$/.test(String(code || ""));

/**
 * Join a room. `onMsg` gets every message the other side sends; `onStatus` gets
 * "open" each time the channel is (re)joined and "closed" when it drops (it
 * reconnects by itself until `close()`). Messages sent before the join lands are queued.
 */
export function joinRoom(room, onMsg, onStatus = () => {}) {
  const cfg = window.MLBMA_CONFIG?.SUPABASE;
  if (!cfg?.url || !cfg.publishable_key) throw new Error("site config (mlbma_config.js) is not loaded");
  if (!isRoomCode(room)) throw new Error("bad room code");
  const url = `${cfg.url.replace(/^http/, "ws")}/realtime/v1/websocket?apikey=${encodeURIComponent(cfg.publishable_key)}&vsn=1.0.0`;
  const topic = `realtime:booth-mic-${room}`;
  let ws = null;
  let beat = 0;
  let ref = 0;
  let joined = false;
  let closed = false;
  const queue = [];

  const push = (event, payload, t = topic) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ topic: t, event, payload, ref: String(++ref) }));
  };
  const send = (msg) => {
    if (joined) push("broadcast", { type: "broadcast", event: "sig", payload: msg });
    else queue.push(msg);
  };
  const open = () => {
    joined = false;
    ws = new WebSocket(url);
    ws.onopen = () => {
      push("phx_join", { config: { broadcast: { self: false }, presence: { key: "" }, private: false } });
      beat = setInterval(() => push("heartbeat", {}, "phoenix"), 25000);
    };
    ws.onmessage = (ev) => {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (m.topic !== topic) return;
      if (m.event === "phx_reply" && !joined && m.payload?.status === "ok") {
        joined = true;
        onStatus("open");
        queue.splice(0).forEach(send);
      } else if (m.event === "broadcast" && m.payload?.event === "sig" && m.payload.payload) {
        onMsg(m.payload.payload);
      }
    };
    ws.onclose = () => {
      clearInterval(beat);
      joined = false;
      if (closed) return;
      onStatus("closed");
      setTimeout(open, 2000);
    };
  };
  open();
  return {
    send,
    close() {
      closed = true;
      clearInterval(beat);
      ws?.close();
    },
  };
}
