import { loadCollegePropLines, loadNflPropLines } from '../../_shared/model-prop-lines.js';
import { json } from '../../_shared/http.js';

export async function onRequestGet({ request }) {
  const params = new URL(request.url).searchParams;
  if (!['nfl', 'cfb'].includes(params.get('sport'))) return json({ error: 'unsupported_sport' }, 400);
  try {
    if (params.get('sport') === 'cfb') return json(await loadCollegePropLines({
      event_id: params.get('event_id'), season: params.get('season')
    }));
    return json(await loadNflPropLines({
      home: params.get('home'), away: params.get('away'),
      season: params.get('season'), week: params.get('week')
    }));
  } catch (error) {
    return json({ error: error instanceof RangeError ? 'invalid_matchup' : 'quotes_unavailable',
      message: error instanceof RangeError ? error.message : 'Current prop lines could not be checked.' },
    error instanceof RangeError ? 400 : 503);
  }
}
