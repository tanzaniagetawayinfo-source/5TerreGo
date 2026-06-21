const DEFAULT_BASES = [
  'https://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno',
  'https://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/'
];

const NAME_ALIASES = {
  'monterosso': 'Monterosso',
  'monterosso al mare': 'Monterosso',
  'vernazza': 'Vernazza',
  'corniglia': 'Corniglia',
  'manarola': 'Manarola',
  'riomaggiore': 'Riomaggiore',
  'la spezia': 'La Spezia Centrale',
  'la spezia centrale': 'La Spezia Centrale',
  'levanto': 'Levanto'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type'
    }
  });
}

function normalizeName(value = '') {
  const key = String(value).trim().toLowerCase();
  return NAME_ALIASES[key] || String(value || '').trim();
}

function normalizeTime(value) {
  if (value == null) return '';
  const raw = String(value).trim();
  const hhmm = raw.match(/(\d{1,2}):(\d{2})/);
  if (hhmm) return `${hhmm[1].padStart(2, '0')}:${hhmm[2]}`;
  const compact = raw.match(/^(\d{1,2})(\d{2})$/);
  if (compact) return `${compact[1].padStart(2, '0')}:${compact[2]}`;
  return '';
}

function toMinutes(value) {
  const [h = '0', m = '0'] = String(value || '00:00').split(':');
  return (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
}

function inferDuration(departure, arrival) {
  if (!departure || !arrival) return '—';
  const diff = toMinutes(arrival) - toMinutes(departure);
  return diff > 0 ? `${diff} min` : '—';
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'accept': 'application/json,text/plain,*/*',
      'user-agent': '5TerreGo/1.0'
    }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}

function parseAutocomplete(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, code] = line.split('|');
      return { label: (label || '').trim(), code: (code || '').trim() };
    })
    .filter((row) => row.label && row.code);
}

async function resolveStation(base, name) {
  const query = encodeURIComponent(normalizeName(name));
  const text = await fetchText(`${base.replace(/\/$/, '')}/autocompleteStazione/${query}`);
  const rows = parseAutocomplete(text);
  const wanted = normalizeName(name).toLowerCase();
  return rows.find((row) => row.label.toLowerCase().includes(wanted)) || rows[0] || null;
}

function parseMaybeJson(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function normalizeRealtimeRow(row, fallbackFrom, fallbackTo) {
  const departure = normalizeTime(
    row.departure || row.departureTime || row.orarioPartenza || row.orarioPartenzaZero || row.partenza
  );
  const arrival = normalizeTime(
    row.arrival || row.arrivalTime || row.orarioArrivo || row.arrivo
  ) || '—';

  const rawDelay = row.delayMinutes ?? row.delay ?? row.ritardo ?? row.ritardoPartenza;
  const delay = Number.parseInt(rawDelay, 10);
  const rawStatus = String(row.status || row.stato || '').toLowerCase();
  const cancelled = Boolean(row.cancelled || row.canceled || row.soppresso || row.suppressed || rawStatus === 'cancelled');

  let status = 'ok';
  let statusLabel = 'On time';
  if (cancelled) {
    status = 'danger';
    statusLabel = 'Cancelled';
  } else if (!Number.isNaN(delay) && delay > 0) {
    status = 'warn';
    statusLabel = `+${delay} min`;
  } else if (rawStatus === 'scheduled') {
    status = 'neutral';
    statusLabel = 'Scheduled';
  }

  const platform = row.platform || row.binario || row.binarioEffettivoPartenzaDescrizione || row.binarioProgrammatoPartenzaDescrizione || '';
  const route = row.route || row.service || row.name || row.numeroTreno || row.trainNumber || row.compNumeroTreno || 'Train';
  const to = row.to || row.destination || row.destinazione || row.destinazioneFinale || fallbackTo;
  const from = row.from || row.origin || row.origine || fallbackFrom;

  return {
    id: row.id || row.numeroTreno || row.trainNumber || `${route}-${departure}`,
    mode: 'train',
    route: String(route),
    from: String(from),
    to: String(to),
    departure: departure || '—',
    arrival,
    duration: row.duration || inferDuration(departure, arrival),
    status,
    statusLabel,
    meta: platform ? `Platform ${platform}` : 'Live update',
    direct: row.note || row.direct || 'Real time'
  };
}

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  return payload.trains || payload.departures || payload.services || payload.data || payload.soluzioni || payload.solutions || [];
}

async function tryJourney(base, fromCode, toCode, isoDate, time) {
  const stamp = `${isoDate}T${time}:00`;
  const epoch = String(Date.parse(stamp));
  const urls = [
    `${base.replace(/\/$/, '')}/soluzioniViaggioNew/${fromCode}/${toCode}/${epoch}`,
    `${base.replace(/\/$/, '')}/soluzioniViaggioNew/${fromCode}/${toCode}/${encodeURIComponent(stamp)}`,
    `${base.replace(/\/$/, '')}/soluzioniViaggioNew/${fromCode}/${toCode}/${encodeURIComponent(`${isoDate} ${time}`)}`
  ];

  for (const url of urls) {
    try {
      const text = await fetchText(url);
      const payload = parseMaybeJson(text);
      const rows = extractRows(payload);
      if (rows.length) return rows;
    } catch (_error) {
    }
  }
  return [];
}

async function tryDepartures(base, fromCode, isoDate, time) {
  const stamp = `${isoDate}T${time}:00`;
  const epoch = String(Date.parse(stamp));
  const urls = [
    `${base.replace(/\/$/, '')}/partenze/${fromCode}/${epoch}`,
    `${base.replace(/\/$/, '')}/partenze/${fromCode}/${encodeURIComponent(stamp)}`,
    `${base.replace(/\/$/, '')}/partenze/${fromCode}`
  ];

  for (const url of urls) {
    try {
      const text = await fetchText(url);
      const payload = parseMaybeJson(text);
      const rows = extractRows(payload);
      if (rows.length) return rows;
    } catch (_error) {
    }
  }
  return [];
}

function filterRows(rows, fromName, toName, time) {
  const wantedTo = normalizeName(toName).toLowerCase();
  const minMinutes = toMinutes(time);

  return rows
    .map((row) => normalizeRealtimeRow(row, normalizeName(fromName), normalizeName(toName)))
    .filter((row) => row.departure && row.departure !== '—')
    .filter((row) => row.to.toLowerCase().includes(wantedTo) || wantedTo.includes(row.to.toLowerCase()))
    .filter((row) => toMinutes(row.departure) >= minMinutes)
    .sort((a, b) => toMinutes(a.departure) - toMinutes(b.departure))
    .slice(0, 12);
}

export async function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const from = normalizeName(url.searchParams.get('from') || 'Monterosso');
  const to = normalizeName(url.searchParams.get('to') || 'Vernazza');
  const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const time = normalizeTime(url.searchParams.get('time') || '00:00') || '00:00';
  const bases = [context.env?.TRAIN_UPSTREAM_BASE, context.env?.VIAGGIATRENO_BASE, ...DEFAULT_BASES].filter(Boolean);

  for (const base of bases) {
    try {
      const fromStation = await resolveStation(base, from);
      const toStation = await resolveStation(base, to);
      if (!fromStation || !toStation) continue;

      let rows = await tryJourney(base, fromStation.code, toStation.code, date, time);
      if (!rows.length) {
        rows = await tryDepartures(base, fromStation.code, date, time);
      }

      const normalized = filterRows(rows, from, to, time);
      if (normalized.length) {
        return json({
          source: 'realtime',
          provider: 'train-upstream',
          from,
          to,
          date,
          time,
          departures: normalized
        });
      }
    } catch (_error) {
    }
  }

  return json({
    source: 'fallback',
    from,
    to,
    date,
    time,
    departures: []
  }, 200);
}
