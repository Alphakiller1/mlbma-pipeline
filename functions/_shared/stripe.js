/**
 * Stripe helpers for Pages Functions — uses the Stripe REST API directly via fetch (no SDK,
 * no bundler dependency). The secret key is read from env only and never leaves the server.
 */
import { HttpError } from './http.js';

const STRIPE_API = 'https://api.stripe.com/v1';

// Flatten nested objects/arrays into Stripe's form-encoding (`a[b][0]=...`).
function form(obj) {
  const p = new URLSearchParams();
  const add = (key, val) => {
    if (val === undefined || val === null) return;
    if (Array.isArray(val)) {
      val.forEach((v, i) => add(`${key}[${i}]`, v));
    } else if (typeof val === 'object') {
      Object.keys(val).forEach((k) => add(`${key}[${k}]`, val[k]));
    } else {
      p.append(key, String(val));
    }
  };
  Object.keys(obj || {}).forEach((k) => add(k, obj[k]));
  return p;
}

async function stripeFetch(env, path, { method = 'POST', body } = {}) {
  if (!env.STRIPE_SECRET_KEY) throw new HttpError(500, 'config_error', 'Missing STRIPE_SECRET_KEY');
  const res = await fetch(`${STRIPE_API}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body ? form(body).toString() : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || 'Stripe API error';
    throw new HttpError(502, 'stripe_error', msg);
  }
  return data;
}

export async function createCustomer(env, { email, metadata }) {
  return stripeFetch(env, 'customers', { body: { email, metadata } });
}

export async function createCheckoutSession(env, { customer, priceId, successUrl, cancelUrl, clientReferenceId, metadata }) {
  return stripeFetch(env, 'checkout/sessions', {
    body: {
      mode: 'subscription',
      customer,
      client_reference_id: clientReferenceId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata
    }
  });
}

export async function createPortalSession(env, { customer, returnUrl }) {
  return stripeFetch(env, 'billing_portal/sessions', { body: { customer, return_url: returnUrl } });
}

/** Map a Stripe subscription status to our local subscription_status. */
export function mapSubscriptionStatus(stripeStatus) {
  switch (stripeStatus) {
    case 'active':
    case 'trialing': return 'active';
    case 'past_due': return 'past_due';
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired': return 'inactive';
    case 'incomplete': return 'incomplete';
    // TODO(phase-4+): if multiple price tiers are added, map price_id → plan here too.
    default: return 'inactive';
  }
}

/* ── webhook signature verification (Stripe scheme: `t=…,v1=…` HMAC-SHA256 hex) ────────── */
function toHex(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}
async function hmacHex(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verify a Stripe webhook and return the parsed event. Throws HttpError(400) if invalid. */
export async function constructWebhookEvent(env, rawBody, sigHeader, toleranceSeconds = 300) {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new HttpError(500, 'config_error', 'Missing STRIPE_WEBHOOK_SECRET');
  if (!sigHeader) throw new HttpError(400, 'bad_signature', 'Missing Stripe-Signature header');

  let t = null;
  const v1 = [];
  sigHeader.split(',').forEach((kv) => {
    const idx = kv.indexOf('=');
    if (idx < 0) return;
    const k = kv.slice(0, idx).trim();
    const v = kv.slice(idx + 1).trim();
    if (k === 't') t = v;
    else if (k === 'v1') v1.push(v);
  });
  if (!t || !v1.length) throw new HttpError(400, 'bad_signature', 'Malformed Stripe-Signature');

  const expected = await hmacHex(env.STRIPE_WEBHOOK_SECRET, `${t}.${rawBody}`);
  if (!v1.some((sig) => safeEqual(sig, expected))) throw new HttpError(400, 'bad_signature', 'Signature mismatch');

  const ts = parseInt(t, 10);
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSeconds) {
    throw new HttpError(400, 'bad_signature', 'Timestamp outside tolerance');
  }
  try { return JSON.parse(rawBody); } catch (e) { throw new HttpError(400, 'bad_payload', 'Invalid JSON body'); }
}
