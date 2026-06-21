const VT_BASE = 'http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno';
const ROME_TIMEZONE = 'Europe/Rome';

const STATION_ALIASES = {
  Monterosso: ['Monterosso'],
  Vernazza: ['Vernazza'],
  Corniglia: ['Corniglia'],
  Manarola: ['Manarola'],
  Riomaggiore: ['Riomaggiore'],
  'La Spezia': ['La Spezia Centrale', 'La Spezia'],
  Levanto: ['Levanto']
};

const stationCache = new Map();

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const from = (url.searchParams.get('from') || '').trim();
    const to = (url.searchParams.get('to') || '').trim();
    const date = (url.searchParams.get('date') || '').trim();
    const time = normalizeHourMinute(url.searchParams.get('time') || '');

    if (!from || !to || !date || !time) {
      return json(
        {
          error: 'Missing required query parameters. Expected from, to, date, time.',
          example: '/api/trains/realtime?from=Monterosso&to=Vernazza&date=2026-06-21&time=16:20'
        },
        400
      );
    }

    const fromStation = await resolveStation(from);
    const toStation = await resolveStation(to);
    const requestDateTime = buildViaggiaTrenoDateTime(date, time);
    const departures = await fetchJsonArray(
      `${VT_BASE}/partenze/${encodeURIComponent(fromStation.code)}/${encodeURIComponent(requestDateTime)}`
    );

    const candidateRows = departures
      .filter((row) => row && row.numeroTreno != null)
      .slice(0, 12);

    const trains = (await mapLimit(candidateRows, 4, async (row) => {
      try {
        return await enrichDeparture(row, fromStation, toStation);
      } catch (_error) {
        return null;
      }
    }))
      .filter(Boolean)
      .sort((a, b) => toMinutes(a.departureTime) - toMinutes(b.departureTime));

    return json({
      source: 'viaggiatreno',
      updatedAt: new Date().toISOString(),
      requested: { from, to, date, time },
      resolved: {
        from: { label: fromStation.displayName, code: fromStation.code },
        to: { label: toStation.displayName, code: toStation.code }
      },
      trains: dedupeBy(trains, (item) => item.id)
    });
  } catch (error) {
    return json(
      {
        error: 'Unable to load realtime trains from ViaggiaTreno.',
        details: error && error.message ? error.message : 'Unknown error'
      },
      502
    );
  }
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'Content-Type'
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=15, s-maxage=15, stale-while-revalidate=45',
      ...corsHeaders()
    }
  });
}

function normalizeHourMinute(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

function titleCase(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  return text.replace(/\b\w/g, (char) => char.toUpperCase());
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return '';
}

function pickNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function formatTimeFromMillis(value) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ROME_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(value));
}

function computeDuration(departureMillis, arrivalMillis) {
  if (!Number.isFinite(departureMillis) || !Number.isFinite(arrivalMillis)) return '—';
  const diffMinutes = Math.round((arrivalMillis - departureMillis) / 60000);
  if (!Number.isFinite(diffMinutes) || diffMinutes <= 0) return '—';
  if (diffMinutes < 60) return `${diffMinutes} min`;
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function buildViaggiaTrenoDateTime(date, time) {
  const match = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error('Invalid date format. Expected YYYY-MM-DD.');
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, monthIndex, day));
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${weekdays[probe.getUTCDay()]} ${months[monthIndex]} ${day} ${year} ${time}:00`;
}

async function fetchText(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { accept: 'text/plain,application/json' },
    cf: { cacheTtl: 15, cacheEverything: false }
  });
  if (!response.ok) throw new Error(`Upstream ${response.status} for ${url}`);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json,text/plain' },
    cf: { cacheTtl: 15, cacheEverything: false }
  });
  if (!response.ok) throw new Error(`Upstream ${response.status} for ${url}`);
  return response.json();
}

async function fetchJsonArray(url) {
  const payload = await fetchJson(url);
  return Array.isArray(payload) ? payload : [];
}

function parseAutocomplete(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|');
      return {
        label: (parts[0] || '').trim(),
        code: (parts[1] || '').trim()
      };
    })
    .filter((item) => item.label && item.code);
}

async function resolveStation(label) {
  const cacheKey = normalizeText(label);
  if (stationCache.has(cacheKey)) return stationCache.get(cacheKey);

  const aliases = STATION_ALIASES[label] || [label];
  for (const alias of aliases) {
    const entries = parseAutocomplete(
      await fetchText(`${VT_BASE}/autocompletaStazione/${encodeURIComponent(alias)}`)
    );
    const match = pickBestStation(entries, label, alias);
    if (match) {
      const resolved = {
        code: match.code,
        displayName: titleCase(match.label),
        rawLabel: match.label,
        normalizedKeys: new Set([
          normalizeText(label),
          normalizeText(alias),
          normalizeText(match.label),
          normalizeText(titleCase(match.label))
        ])
      };
      stationCache.set(cacheKey, resolved);
      return resolved;
    }
  }

  throw new Error(`Station not found: ${label}`);
}

function pickBestStation(entries, requestedLabel, alias) {
  const wanted = normalizeText(requestedLabel);
  const wantedAlias = normalizeText(alias);
  let best = null;
  let bestScore = -1;

  for (const entry of entries) {
    const normalized = normalizeText(entry.label);
    let score = 0;
    if (normalized === wanted) score = 100;
    else if (normalized === wantedAlias) score = 98;
    else if (normalized.includes(wanted) || wanted.includes(normalized)) score = 80;
    else if (normalized.includes(wantedAlias) || wantedAlias.includes(normalized)) score = 78;
    else if (wanted === 'laspezia' && normalized.includes('laspeziacentrale')) score = 110;
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }

  return best || entries[0] || null;
}

function stopMatchesStation(stop, station) {
  if (!stop || !station) return false;
  const stopId = String(stop.id || '').trim();
  const stopName = normalizeText(stop.stazione || stop.nomeLungo || stop.nomeBreve || '');
  if (stopId && stopId === station.code) return true;
  for (const key of station.normalizedKeys) {
    if (!key) continue;
    if (stopName === key || stopName.includes(key) || key.includes(stopName)) return true;
  }
  return false;
}

function findStopIndex(stops, station, startIndex = 0) {
  for (let index = startIndex; index < stops.length; index += 1) {
    if (stopMatchesStation(stops[index], station)) return index;
  }
  return -1;
}

function pickDepartureMillis(stop, fallbackRow) {
  return pickNumber(
    stop && stop.partenzaReale,
    stop && stop.effettiva,
    stop && stop.partenza_teorica,
    stop && stop.programmata,
    fallbackRow && fallbackRow.partenzaTreno,
    fallbackRow && fallbackRow.orarioPartenza
  );
}

function pickArrivalMillis(stop) {
  return pickNumber(
    stop && stop.arrivoReale,
    stop && stop.effettiva,
    stop && stop.arrivo_teorico,
    stop && stop.programmata
  );
}

function buildRouteLabel(row) {
  const category = firstNonEmpty(row.categoriaDescrizione, row.categoria).replace(/^\s+/, '');
  const number = firstNonEmpty(row.numeroTreno);
  return firstNonEmpty(`${category} ${number}`.trim(), `Train ${number}`, 'Train');
}

function buildStatus(row, andamento, delayMinutes) {
  if (Number(row.provvedimento) === 1 || String(andamento && andamento.tipoTreno || '') === 'ST') {
    return { status: 'danger', label: 'Cancelled' };
  }
  if (Number.isFinite(delayMinutes) && delayMinutes >= 5) {
    return { status: 'warn', label: `+${delayMinutes} min` };
  }
  if (Number.isFinite(delayMinutes) && delayMinutes <= -1) {
    return { status: 'ok', label: `${Math.abs(delayMinutes)} min early` };
  }
  if (row.inStazione || row.circolante) {
    return { status: 'ok', label: 'Live' };
  }
  return { status: 'ok', label: 'On time' };
}

async function fetchAndamento(originCode, trainNumber, departureMillis) {
  return fetchJson(
    `${VT_BASE}/andamentoTreno/${encodeURIComponent(originCode)}/${encodeURIComponent(trainNumber)}/${encodeURIComponent(departureMillis)}`
  );
}

async function enrichDeparture(row, fromStation, toStation) {
  const trainNumber = firstNonEmpty(row.numeroTreno);
  const originCode = firstNonEmpty(row.codOrigine, fromStation.code);
  const departureMillis = firstNonEmpty(row.millisDataPartenza, row.dataPartenzaTreno);

  if (!trainNumber || !originCode || !departureMillis) return null;

  const andamento = await fetchAndamento(originCode, trainNumber, departureMillis);
  const stops = Array.isArray(andamento && andamento.fermate) ? andamento.fermate : [];
  if (!stops.length) return null;

  const fromIndex = findStopIndex(stops, fromStation, 0);
  const toIndex = fromIndex === -1 ? -1 : findStopIndex(stops, toStation, fromIndex + 1);
  if (fromIndex === -1 || toIndex === -1 || toIndex <= fromIndex) return null;

  const fromStop = stops[fromIndex];
  const toStop = stops[toIndex];
  const plannedDeparture = pickDepartureMillis(fromStop, row);
  const plannedArrival = pickArrivalMillis(toStop);
  const delayMinutes = pickNumber(
    toStop.ritardoArrivo,
    fromStop.ritardoPartenza,
    toStop.ritardo,
    fromStop.ritardo,
    row.ritardo,
    0
  );
  const platform = firstNonEmpty(
    fromStop.binarioEffettivoPartenzaDescrizione,
    fromStop.binarioProgrammatoPartenzaDescrizione,
    row.binarioEffettivoPartenzaDescrizione,
    row.binarioProgrammatoPartenzaDescrizione
  );
  const status = buildStatus(row, andamento, delayMinutes);

  return {
    id: `${trainNumber}-${originCode}-${departureMillis}-${toStation.code}`,
    mode: 'train',
    trainNumber,
    route: buildRouteLabel(row),
    from: fromStation.displayName,
    to: toStation.displayName,
    departureTime: formatTimeFromMillis(plannedDeparture),
    arrivalTime: formatTimeFromMillis(plannedArrival),
    duration: computeDuration(plannedDeparture, plannedArrival),
    platform,
    delayMinutes: Number.isFinite(delayMinutes) ? delayMinutes : 0,
    status: status.status,
    statusLabel: status.label,
    direct: 'Direct',
    meta: platform ? `Platform ${platform}` : 'Live via ViaggiaTreno',
    origin: titleCase(firstNonEmpty(andamento && andamento.origine, row.origine, fromStation.rawLabel)),
    destination: titleCase(firstNonEmpty(row.destinazione, toStation.rawLabel))
  };
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = [];
  const workerCount = Math.max(1, Math.min(limit, items.length));
  for (let index = 0; index < workerCount; index += 1) workers.push(worker());
  await Promise.all(workers);
  return results;
}

function dedupeBy(items, getKey) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function toMinutes(value) {
  const text = String(value || '00:00');
  const parts = text.split(':');
  const hour = Number(parts[0]) || 0;
  const minute = Number(parts[1]) || 0;
  return (hour * 60) + minute;
}
