const DEFAULT_EMBED_MODEL = '@cf/qwen/qwen3-embedding-0.6b';
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_CHUNKS = 24;
const TABLES = new Set(['articles', 'discounts', 'trails']);

function headers() { return { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }; }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: headers() }); }
function authorized(request, env) {
  const expected = String(env.AI_ADMIN_TOKEN || '');
  const supplied = String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  return expected.length >= 24 && supplied === expected;
}
function normalizeSpace(value) { return String(value || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(); }
function safeSlug(value) { return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'item'; }
function guessKind(url, fallback = 'page') {
  const value = String(url || '').toLowerCase();
  if (value.includes('sentier')) return 'trail';
  if (value.includes('discount') || value.includes('scont')) return 'discount';
  if (value.includes('bus')) return 'bus_schedule';
  if (value.includes('ferry') || value.includes('traghett') || value.includes('battell')) return 'ferry_schedule';
  if (value.includes('train') || value.includes('tren')) return 'train_schedule';
  if (value.includes('article') || value.includes('guide') || value.includes('storie')) return 'article';
  return fallback;
}
function chunkText(text, target = 1800, overlap = 240) {
  const clean = normalizeSpace(text);
  if (!clean) return [];
  const chunks = [];
  let start = 0;
  while (start < clean.length && chunks.length < MAX_CHUNKS) {
    let end = Math.min(clean.length, start + target);
    if (end < clean.length) {
      const paragraph = clean.lastIndexOf('\n\n', end);
      const sentence = clean.lastIndexOf('. ', end);
      const candidate = Math.max(paragraph, sentence);
      if (candidate > start + Math.floor(target * 0.55)) end = candidate + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks.filter(Boolean);
}
function extractEmbeddings(result) {
  const data = result && (result.data || result.result?.data);
  if (!Array.isArray(data)) return [];
  if (Array.isArray(data[0])) return data;
  return data.map((item) => item && item.embedding).filter(Array.isArray);
}
function inferTitle(markdown, fallback) {
  const match = String(markdown || '').match(/^#\s+(.+)$/m);
  return normalizeSpace(match && match[1] || fallback || '5TerreGo source').slice(0, 240);
}
function basenameFromUrl(url) {
  try { return new URL(url).pathname.split('/').filter(Boolean).pop() || 'page.html'; }
  catch (_error) { return 'page.html'; }
}
function isAllowedUrl(request, env, rawUrl) {
  let candidate;
  try { candidate = new URL(rawUrl); } catch (_error) { return false; }
  if (!/^https?:$/.test(candidate.protocol)) return false;
  const requestHost = new URL(request.url).hostname;
  const allowed = new Set([requestHost, '5terrego.com', 'www.5terrego.com', 'parconazionale5terre.it', 'www.parconazionale5terre.it', 'cinqueterre.it', 'www.cinqueterre.it', 'navigazionegolfodeipoeti.it', 'www.navigazionegolfodeipoeti.it']);
  String(env.AI_ALLOWED_HOSTS || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean).forEach((host) => allowed.add(host));
  return allowed.has(candidate.hostname.toLowerCase());
}
async function convertUrlToMarkdown(request, env, rawUrl) {
  if (!isAllowedUrl(request, env, rawUrl)) throw new Error('URL host is not allowed');
  const response = await fetch(rawUrl, { headers: { Accept: 'text/html,application/pdf,text/plain;q=0.9,*/*;q=0.5', 'User-Agent': '5TerreGo-AI-Indexer/1.0' } });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  const length = Number(response.headers.get('Content-Length') || 0);
  if (length && length > MAX_SOURCE_BYTES) throw new Error('Source is too large');
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_SOURCE_BYTES) throw new Error('Source is too large');
  const name = basenameFromUrl(rawUrl);
  const blob = new Blob([buffer], { type: response.headers.get('Content-Type') || 'application/octet-stream' });
  const converted = await env.AI.toMarkdown({ name, blob });
  const item = Array.isArray(converted) ? converted[0] : converted;
  if (!item || item.format === 'error') throw new Error(item && item.error || 'Markdown conversion failed');
  const markdown = normalizeSpace(item.data || item.markdown || item.text || '');
  if (!markdown) throw new Error('Converted source is empty');
  return { markdown, mime: blob.type, title: inferTitle(markdown, name) };
}
function rowToDocument(table, row, baseUrl) {
  const title = row.title || row.name || row.business_name || row.trail_name || row.slug || `${table} item`;
  const ignored = new Set(['embedding', 'image', 'image_url', 'cover', 'cover_url', 'photo', 'photos', 'gallery']);
  const lines = [];
  for (const [key, value] of Object.entries(row || {})) {
    if (ignored.has(key) || value == null || value === '') continue;
    if (typeof value === 'object') lines.push(`${key}: ${JSON.stringify(value)}`);
    else lines.push(`${key}: ${value}`);
  }
  const slug = row.slug || row.id || safeSlug(title);
  const pageMap = { articles: 'guide.html', discounts: 'discounts.html', trails: 'sentieri.html' };
  const url = row.url || row.link || `${String(baseUrl || 'https://www.5terrego.com').replace(/\/$/, '')}/${pageMap[table]}#${encodeURIComponent(String(slug))}`;
  const kindMap = { articles: 'article', discounts: 'discount', trails: 'trail' };
  return {
    sourceKey: `supabase:${table}:${String(row.id || row.slug || safeSlug(title))}`,
    title: String(title).slice(0, 240), url, kind: kindMap[table], language: row.language || row.lang || 'it',
    validFrom: row.valid_from || row.starts_at || row.start_date || null,
    validTo: row.valid_to || row.ends_at || row.end_date || row.expires_at || null,
    updatedAt: row.updated_at || row.published_at || row.created_at || new Date().toISOString(), text: lines.join('\n')
  };
}
async function fetchTableRows(env, table, offset, limit) {
  const url = new URL(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}`);
  url.searchParams.set('select', '*'); url.searchParams.set('offset', String(offset)); url.searchParams.set('limit', String(limit));
  const response = await fetch(url.toString(), { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } });
  if (!response.ok) throw new Error(`Unable to read ${table} (${response.status})`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}
async function embedTexts(env, texts) {
  const model = env.AI_EMBED_MODEL || DEFAULT_EMBED_MODEL;
  const result = await env.AI.run(model, { text: texts, instruction: 'Represent this Cinque Terre travel content for multilingual retrieval.' });
  const vectors = extractEmbeddings(result);
  if (vectors.length !== texts.length) throw new Error(`Embedding count mismatch: expected ${texts.length}, received ${vectors.length}`);
  return vectors;
}
async function upsertKnowledge(env, rows) {
  if (!rows.length) return;
  const endpoint = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/ai_knowledge?on_conflict=source_key`;
  const response = await fetch(endpoint, { method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Knowledge upsert failed (${response.status}): ${detail.slice(0, 240)}`);
  }
}
async function indexDocuments(env, documents) {
  const pending = [];
  for (const doc of documents) {
    const chunks = chunkText(doc.text);
    chunks.forEach((content, index) => pending.push({ doc, content, chunkIndex: index, chunkCount: chunks.length }));
  }
  const selected = pending.slice(0, MAX_CHUNKS);
  const vectors = await embedTexts(env, selected.map((item) => item.content));
  const now = new Date().toISOString();
  const rows = selected.map((item, index) => ({
    source_key: `${item.doc.sourceKey}#chunk-${item.chunkIndex + 1}`, kind: item.doc.kind, title: item.doc.title, url: item.doc.url,
    language: item.doc.language || 'it', content: item.content,
    metadata: { chunk_index: item.chunkIndex + 1, chunk_count: item.chunkCount, indexed_at: now, ...(item.doc.metadata || {}) },
    valid_from: item.doc.validFrom || null, valid_to: item.doc.validTo || null, updated_at: item.doc.updatedAt || now, embedding: vectors[index]
  }));
  await upsertKnowledge(env, rows);
  return rows.length;
}
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);
  if (!env.AI) return json({ error: 'ai_binding_missing' }, 503);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'supabase_secrets_missing' }, 503);
  let body;
  try { body = await request.json(); } catch (_error) { return json({ error: 'invalid_json' }, 400); }
  try {
    if (body.source === 'url') {
      const rawUrl = String(body.url || '').trim();
      if (!rawUrl) return json({ error: 'url_required' }, 400);
      const converted = await convertUrlToMarkdown(request, env, rawUrl);
      const count = await indexDocuments(env, [{ sourceKey: `url:${rawUrl}`, title: body.title || converted.title, url: rawUrl, kind: body.kind || guessKind(rawUrl), language: body.language || 'it', validFrom: body.valid_from || null, validTo: body.valid_to || null, updatedAt: new Date().toISOString(), metadata: { mime: converted.mime, source: 'url' }, text: converted.markdown }]);
      return json({ ok: true, source: 'url', url: rawUrl, chunks_indexed: count });
    }
    if (body.source === 'table') {
      const table = String(body.table || '').trim();
      if (!TABLES.has(table)) return json({ error: 'table_not_allowed' }, 400);
      const offset = Math.max(0, Number.parseInt(body.offset || 0, 10) || 0);
      const limit = Math.min(30, Math.max(1, Number.parseInt(body.limit || 12, 10) || 12));
      const rows = await fetchTableRows(env, table, offset, limit);
      const docs = rows.map((row) => rowToDocument(table, row, body.base_url));
      const count = docs.length ? await indexDocuments(env, docs) : 0;
      return json({ ok: true, source: 'table', table, offset, rows_read: rows.length, chunks_indexed: count, next_offset: rows.length === limit ? offset + limit : null });
    }
    return json({ error: 'unsupported_source', supported: ['url', 'table'] }, 400);
  } catch (error) {
    return json({ error: 'indexing_failed', detail: String(error && error.message || error).slice(0, 500) }, 500);
  }
}
