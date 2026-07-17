const ATC_ENDPOINT = 'https://www.atcesercizio.it/atc/maps/ajax.php';

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function onRequestGet(context) {
  try {
    const requestUrl = new URL(context.request.url);
    const action = String(requestUrl.searchParams.get('action') || 'search').trim().toLowerCase();
    const value = String(requestUrl.searchParams.get(action === 'stop' ? 'stopId' : 'query') || '').trim();
    if (!value || value.length < (action === 'stop' ? 2 : 3)) return json({ error: 'Provide a stopId or at least 3 characters in query.' }, 400);

    let params;
    if (action === 'stop') params = { mode: 'orari', stop_id: value };
    else if (action === 'search') params = { mode: 'cercafermate', nome: value };
    else return json({ error: 'Unsupported action. Use search or stop.' }, 400);

    const payload = await fetchAtc(params);
    return json({
      source: 'ATC Esercizio',
      sourceUrl: 'https://www.atcesercizio.it/linee-e-orari/',
      updatedAt: new Date().toISOString(),
      action,
      query: value,
      data: action === 'stop' ? normalizeStopTimes(payload) : normalizeStops(payload)
    });
  } catch (error) {
    return json({ error: 'Unable to load ATC scheduled bus data.', details: error && error.message ? error.message : 'Unknown error' }, 502);
  }
}

async function fetchAtc(params) {
  const url = new URL(ATC_ENDPOINT);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    headers: {
      accept: 'application/json,text/plain,*/*',
      referer: 'https://www.atcesercizio.it/linee-e-orari/',
      'x-requested-with': 'XMLHttpRequest',
      'user-agent': '5TerreGo scheduled-transit service'
    },
    cf: { cacheTtl: 300, cacheEverything: true }
  });
  if (!response.ok) throw new Error(`ATC returned ${response.status}`);
  const text = await response.text();
  if (!text.trim()) throw new Error('ATC returned an empty response.');
  return JSON.parse(text);
}

function normalizeStops(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    id: String(row.stop_id || ''),
    name: String(row.stop_name || ''),
    municipality: String(row.comune || ''),
    direction: String(row.direzione || '')
  })).filter((row) => row.id && row.name);
}

function normalizeStopTimes(rows) {
  const group = Array.isArray(rows) ? rows[0] : null;
  const trips = group && group.orari && typeof group.orari === 'object' ? group.orari : {};
  return {
    label: String(group && group.nomelinea || ''),
    departures: Object.values(trips).map((trip) => ({
      time: String(trip && trip.stop && trip.stop.ora || trip && trip.da && trip.da.ora || ''),
      from: String(trip && trip.da && trip.da.luogo || ''),
      to: String(trip && trip.a && trip.a.luogo || ''),
      departureTime: String(trip && trip.da && (trip.da.partenza || trip.da.ora) || '')
    })).filter((trip) => trip.time).sort((a, b) => a.time.localeCompare(b.time))
  };
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'Content-Type'
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=900',
      ...corsHeaders()
    }
  });
}
