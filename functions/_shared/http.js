/**
 * Shared HTTP helpers for Cloudflare Pages Functions.
 *
 * No external dependencies — uses only the Workers runtime globals (fetch, crypto.subtle,
 * btoa/atob, Response). Provides consistent JSON responses + error shapes, bearer-token
 * extraction, env validation, and HMAC-signed short-lived state tokens / cookies for the
 * Discord OAuth flow.
 */

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

// Map any thrown value to a consistent JSON error. Known HttpErrors keep their status/code;
// anything else is a generic 500 (never leak internals to the client).
export function errorResponse(err) {
  if (err instanceof HttpError) {
    return json({ error: err.code, message: err.message }, err.status);
  }
  return json({ error: 'internal_error', message: 'Unexpected server error' }, 500);
}

export function bearerToken(request) {
  const h = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

export function requireEnv(env, names) {
  const missing = names.filter((n) => !env || !env[n]);
  if (missing.length) throw new HttpError(500, 'config_error', 'Missing environment variables: ' + missing.join(', '));
}

// State/cookie signing secret — accept either name.
export function stateSecret(env) {
  const s = (env && (env.STATE_SECRET || env.COOKIE_SECRET)) || '';
  if (!s) throw new HttpError(500, 'config_error', 'Missing STATE_SECRET (or COOKIE_SECRET)');
  return s;
}

/* ── base64url ─────────────────────────────────────────────────────────────────────── */
function b64urlFromBytes(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlFromString(str) {
  return b64urlFromBytes(new TextEncoder().encode(str));
}
function bytesFromB64url(b64) {
  let s = b64.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function stringFromB64url(b64) {
  return new TextDecoder().decode(bytesFromB64url(b64));
}

async function hmacSign(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return b64urlFromBytes(new Uint8Array(sig));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Sign a small payload into a self-describing token: `base64url(json).hmac`. The token
 * carries its own expiry (`exp`, unix seconds), so it can't be replayed after `ttlSeconds`.
 */
export async function signPayload(secret, payload, ttlSeconds) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + (ttlSeconds || 600) };
  const encoded = b64urlFromString(JSON.stringify(body));
  const sig = await hmacSign(secret, encoded);
  return encoded + '.' + sig;
}

/** Verify + decode a token from signPayload. Returns the payload, or null if invalid/expired. */
export async function verifyPayload(secret, token) {
  if (!token || token.indexOf('.') < 0) return null;
  const idx = token.indexOf('.');
  const encoded = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = await hmacSign(secret, encoded);
  if (!timingSafeEqual(sig, expected)) return null;
  let body;
  try { body = JSON.parse(stringFromB64url(encoded)); } catch (e) { return null; }
  if (!body || typeof body.exp !== 'number' || body.exp < Math.floor(Date.now() / 1000)) return null;
  return body;
}

/* ── cookies ───────────────────────────────────────────────────────────────────────── */
// SameSite=Lax so the cookie IS sent on the top-level GET redirect back from Discord, but
// not on unrelated cross-site requests. Secure + HttpOnly: never readable by JS, HTTPS only.
export function setCookie(name, value, { maxAge = 600, path = '/' } = {}) {
  return `${name}=${value}; Path=${path}; Max-Age=${maxAge}; SameSite=Lax; Secure; HttpOnly`;
}
export function clearCookie(name, path = '/') {
  return `${name}=; Path=${path}; Max-Age=0; SameSite=Lax; Secure; HttpOnly`;
}
export function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || request.headers.get('cookie') || '';
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = raw.match(new RegExp('(?:^|;\\s*)' + escaped + '=([^;]*)'));
  return m ? m[1] : null;
}
