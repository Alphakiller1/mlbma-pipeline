import { json } from './http.js';

// Cache the small, normalized report rather than each matchup response. The
// conference's public viewer returns an entire slate, including large logos.
export async function availabilityFeed(context, key, seconds, load) {
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(new URL('/api/_availability-cache/' + key, context.request.url));
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return await hit.json();
    } catch (_) { /* A cache outage still permits an upstream check. */ }
  }
  const result = { data: await load(), checked_at_utc: new Date().toISOString() };
  if (cache) {
    const stored = cache.put(cacheKey, json(result, 200, { 'cache-control': 'public, max-age=' + seconds }));
    context.waitUntil(stored.catch(() => {}));
  }
  return result;
}

export async function availabilityResponse(url, init = {}) {
  const response = await fetch(url, { cache: 'no-store', ...init, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Availability source returned ' + response.status);
  return response;
}
