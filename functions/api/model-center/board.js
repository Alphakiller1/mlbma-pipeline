/**
 * GET /api/model-center/board?sport=mlb|nfl|wnba|cfb
 *
 * Public read-only proxy for the four producer boards. Keeping the sources
 * server-side gives the client one stable same-origin contract while allowing
 * each sport model to publish on its own cadence.
 */
import { json, errorResponse, HttpError } from '../../_shared/http.js';

const SPORTS = {
  mlb: ['MLB_MODEL_BOARD_URL', 'https://alphakiller1.github.io/mlb-model/board.json'],
  nfl: ['NFL_MODEL_BOARD_URL', 'https://alphakiller1.github.io/nfl-model/board.json'],
  wnba: ['WNBA_MODEL_BOARD_URL', 'https://alphakiller1.github.io/wnba-edge-model/board.json'],
  cfb: ['CFB_MODEL_BOARD_URL', 'https://alphakiller1.github.io/cfb-model/board.json']
};

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const sport = String(url.searchParams.get('sport') || 'mlb').toLowerCase();
    const source = SPORTS[sport];
    if (!source) throw new HttpError(400, 'bad_sport', 'sport must be mlb, nfl, wnba, or cfb');
    const boardUrl = (env && env[source[0]]) || source[1];
    // No `cache` option here: production runs on a Pages compat date older than
    // 2024-11-11, where the Workers runtime throws on that field and every sport
    // returned a 500. cacheTtl 0 keeps the edge from serving a stale board.
    const res = await fetch(boardUrl, { cf: { cacheTtl: 0 } });
    if (!res.ok) throw new HttpError(502, 'board_fetch_failed', 'Model board was not reachable');
    let board;
    try {
      board = await res.json();
    } catch (parseErr) {
      throw new HttpError(502, 'board_fetch_failed', 'Model board was not reachable');
    }
    return json({ sport, schema: (board && board.schema) || 'chase-board/1', board });
  } catch (err) {
    return errorResponse(err);
  }
}
