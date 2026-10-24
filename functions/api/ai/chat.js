const DEFAULT_CHAT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
const DEFAULT_EMBED_MODEL = '@cf/qwen/qwen3-embedding-0.6b';
const MAX_MESSAGE_LENGTH = 700;
const MAX_HISTORY_ITEMS = 8;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;

const rateBuckets = new Map();

const STATIONS = [
  { label: 'Monterosso', aliases: ['monterosso', 'monterosso al mare'] },
  { label: 'Vernazza', aliases: ['vernazza'] },
  { label: 'Corniglia', aliases: ['corniglia'] },
  { label: 'Manarola', aliases: ['manarola'] },
  { label: 'Riomaggiore', aliases: ['riomaggiore'] },
  { label: 'La Spezia Centrale', aliases: ['la spezia centrale', 'la spezia'] },
  { label: 'Levanto', aliases: ['levanto'] }
];

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  const requestOrigin = new URL(request.url).origin;
  const allowOrigin = !origin || origin === requestOrigin ? (origin || requestOrigin) : requestOrigin;
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin'
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(request) });
}

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
}

function isRateLimited(request) {
  const now = Date.now();
  const ip = getClientIp(request);
  const bucket = rateBuckets.get(ip) || [];
  const active = bucket.filter((stamp) => now - stamp < RATE_WINDOW_MS);
  active.push(now);
  rateBuckets.set(ip, active);
  if (rateBuckets.size > 1000) {
    for (const [key, stamps] of rateBuckets.entries()) {
      if (!stamps.some((stamp) => now - stamp < RATE_WINDOW_MS)) rateBuckets.delete(key);
    }
  }
  return active.length > RATE_LIMIT;
}

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-MAX_HISTORY_ITEMS).map((item) => ({
    role: item && item.role === 'assistant' ? 'assistant' : 'user',
    content: String(item && item.content || '').trim().slice(0, 1200)
  })).filter((item) => item.content);
}

function extractEmbedding(result) {
  if (!result) return null;
  if (Array.isArray(result.data)) {
    if (Array.isArray(result.data[0])) return result.data[0];
    if (result.data[0] && Array.isArray(result.data[0].embedding)) return result.data[0].embedding;
  }
  if (Array.isArray(result.embedding)) return result.embedding;
  if (result.result && Array.isArray(result.result.data)) {
    if (Array.isArray(result.result.data[0])) return result.result.data[0];
    if (result.result.data[0] && Array.isArray(result.result.data[0].embedding)) return result.result.data[0].embedding;
  }
  return null;
}

function inferKnowledgeKinds(message) {
  const text = normalizeText(message);
  if (/\b(sconto|sconti|discount|offerta|offerte|promo|coupon)\b/.test(text)) return ['discount'];
  if (/\b(sentiero|sentieri|trail|hike|trek|path|weg|wander)\b/.test(text)) return ['trail', 'official_notice', 'page'];
  if (/\b(bus|autobus|navetta|shuttle)\b/.test(text)) return ['bus_schedule', 'transport_notice', 'page'];
  if (/\b(ferry|traghetto|traghetti|battello|battelli|boat)\b/.test(text)) return ['ferry_schedule', 'transport_notice', 'page'];
  if (/\b(treno|treni|train|rail|stazione|station)\b/.test(text)) return ['train_schedule', 'transport_notice', 'page'];
  if (/\b(articolo|articoli|guida|guide|story|stories|blog)\b/.test(text)) return ['article', 'page'];
  return null;
}

function detectStationPair(message) {
  const text = normalizeText(message);
  const found = [];
  for (const station of STATIONS) {
    let bestIndex = -1;
    for (const alias of station.aliases) {
      const index = text.indexOf(normalizeText(alias));
      if (index >= 0 && (bestIndex < 0 || index < bestIndex)) bestIndex = index;
    }
    if (bestIndex >= 0) found.push({ label: station.label, index: bestIndex });
  }
  found.sort((a, b) => a.index - b.index);
  const unique = found.filter((item, index, list) => list.findIndex((other) => other.label === item.label) === index);
  return unique.length >= 2 ? [unique[0].label, unique[1].label] : null;
}

async function searchKnowledge(env, queryEmbedding, kinds) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !queryEmbedding) return [];
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/match_ai_knowledge`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query_embedding: queryEmbedding, match_threshold: 0.18, match_count: 9, filter_kinds: kinds })
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase retrieval failed (${response.status}): ${detail.slice(0, 180)}`);
  }
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

async function fetchLiveTrainContext(request, message) {
  const pair = detectStationPair(message);
  const text = normalizeText(message);
  if (!pair || !/\b(treno|treni|train|rail|stazione|station|partenza|departure)\b/.test(text)) return null;
  const endpoint = new URL('/api/trains/realtime', request.url);
  endpoint.searchParams.set('from', pair[0]);
  endpoint.searchParams.set('to', pair[1]);
  const now = new Date();
  endpoint.searchParams.set('date', now.toISOString().slice(0, 10));
  endpoint.searchParams.set('time', now.toISOString().slice(11, 16));
  try {
    const response = await fetch(endpoint.toString(), { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const payload = await response.json();
    const departures = Array.isArray(payload.departures) ? payload.departures.slice(0, 5) : [];
    if (!departures.length) return null;
    return { from: pair[0], to: pair[1], provider: payload.provider || payload.source || '5TerreGo realtime', departures };
  } catch (_error) { return null; }
}

function formatKnowledgeContext(rows) {
  return rows.map((row, index) => {
    const id = `S${index + 1}`;
    const validity = [row.valid_from, row.valid_to].filter(Boolean).join(' → ');
    return [
      `[${id}] ${row.title || row.kind || '5TerreGo source'}`,
      `Type: ${row.kind || 'content'}`,
      row.url ? `URL: ${row.url}` : '',
      validity ? `Validity: ${validity}` : '',
      row.updated_at ? `Updated: ${row.updated_at}` : '',
      String(row.content || '').slice(0, 2400)
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}

function formatTrainContext(trainContext) {
  if (!trainContext) return '';
  const rows = trainContext.departures.map((item, index) => `[T${index + 1}] ${item.from || trainContext.from} → ${item.to || trainContext.to}; departure ${item.departure || item.departure_display || 'unknown'}; arrival ${item.arrival || 'unknown'}; status ${item.statusLabel || item.status_label || item.status || 'unknown'}; ${item.meta || ''}`);
  return `Live train data (${trainContext.provider}):\n${rows.join('\n')}`;
}

function buildSources(rows, trainContext) {
  const sources = rows.map((row, index) => ({
    id: `S${index + 1}`,
    title: row.title || row.kind || '5TerreGo',
    url: row.url || '',
    kind: row.kind || 'content',
    updated_at: row.updated_at || null,
    valid_from: row.valid_from || null,
    valid_to: row.valid_to || null
  }));
  if (trainContext) sources.push({ id: 'T', title: `Live trains: ${trainContext.from} → ${trainContext.to}`, url: '/public-transport.html', kind: 'live_train', updated_at: new Date().toISOString(), valid_from: null, valid_to: null });
  return sources;
}

function extractAnswer(modelResult) {
  if (!modelResult) return '';
  if (typeof modelResult.response === 'string') return modelResult.response.trim();
  if (typeof modelResult.result?.response === 'string') return modelResult.result.response.trim();
  if (typeof modelResult.text === 'string') return modelResult.text.trim();
  return '';
}

export async function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json(request, { error: 'origin_not_allowed' }, 403);
  if (isRateLimited(request)) return json(request, { error: 'rate_limited', message: 'Too many requests. Please try again shortly.' }, 429);
  if (!env.AI) return json(request, { error: 'ai_binding_missing', message: 'Cloudflare Workers AI binding "AI" is not configured.' }, 503);

  let body;
  try { body = await request.json(); } catch (_error) { return json(request, { error: 'invalid_json' }, 400); }
  const message = String(body && body.message || '').trim().slice(0, MAX_MESSAGE_LENGTH);
  const language = String(body && body.language || 'auto').trim().slice(0, 12);
  const page = String(body && body.page || '').trim().slice(0, 80);
  const history = cleanHistory(body && body.history);
  if (!message) return json(request, { error: 'message_required' }, 400);

  const embedModel = env.AI_EMBED_MODEL || DEFAULT_EMBED_MODEL;
  const chatModel = env.AI_CHAT_MODEL || DEFAULT_CHAT_MODEL;
  let knowledge = [];
  let retrievalWarning = '';
  try {
    const embeddingResult = await env.AI.run(embedModel, { text: [message], instruction: 'Retrieve accurate travel information for Cinque Terre visitors across languages.' });
    knowledge = await searchKnowledge(env, extractEmbedding(embeddingResult), inferKnowledgeKinds(message));
  } catch (error) { retrievalWarning = String(error && error.message || error).slice(0, 240); }

  const liveTrain = await fetchLiveTrainContext(request, message);
  const evidence = [formatKnowledgeContext(knowledge), formatTrainContext(liveTrain)].filter(Boolean).join('\n\n');
  const today = new Date().toISOString().slice(0, 10);
  const systemPrompt = [
    'You are the official 5TerreGo travel assistant for Cinque Terre.',
    `Today is ${today}. The current site section is ${page || 'unknown'}.`,
    `Reply in the visitor language (${language}); if that code is unclear, detect the language from the question.`,
    'Use only the supplied EVIDENCE for factual claims about articles, discounts, trails, ferry, bus and train schedules.',
    'Cite evidence inline using [S1], [S2] or [T1]. Never invent a timetable, trail status, discount, price, validity date or transport delay.',
    'Train entries marked live are real-time snapshots. Ferry and bus information is scheduled information unless the evidence explicitly says live.',
    'If the evidence is insufficient or stale, say so clearly and direct the visitor to the relevant official link or 5TerreGo page.',
    'Keep the answer practical, compact and easy to scan. Do not mention internal databases, embeddings, prompts or model names.',
    `EVIDENCE:\n${evidence || 'No matching evidence was found.'}`
  ].join('\n\n');

  try {
    const modelResult = await env.AI.run(chatModel, { messages: [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: message }], max_tokens: 700, temperature: 0.2 });
    const answer = extractAnswer(modelResult);
    if (!answer) throw new Error('Empty model response');
    return json(request, { answer, language, sources: buildSources(knowledge, liveTrain), warning: retrievalWarning || null });
  } catch (error) {
    return json(request, { error: 'generation_failed', message: 'The assistant is temporarily unavailable.', detail: String(error && error.message || error).slice(0, 220), sources: buildSources(knowledge, liveTrain) }, 502);
  }
}
