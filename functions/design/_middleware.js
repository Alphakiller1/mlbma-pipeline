/** CORS for published TIER 1 tokens. GET already has ACAO via `_headers`;
 *  cross-origin `fetch()` from model repos still sends OPTIONS, which Pages
 *  otherwise answers 405. */
export async function onRequest(context) {
  const req = context.request;
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  const res = await context.next();
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
