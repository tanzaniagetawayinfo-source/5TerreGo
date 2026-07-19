const MAX_ITEMS = 180;
const MAX_CHARS = 24000;
const TARGET_LANGUAGES = { it: 'IT', en: 'EN-US', fr: 'FR', de: 'DE', zh: 'ZH' };

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function onRequestPost(context) {
  try {
    const apiKey = context.env.DEEPL_API_KEY;
    if (!apiKey) return json({ error: 'Translation service is not configured.' }, 503);
    const body = await context.request.json();
    const target = TARGET_LANGUAGES[String(body.targetLanguage || '').toLowerCase()];
    const text = Array.isArray(body.text) ? body.text.map((item) => String(item || '')) : [];
    const total = text.reduce((sum, item) => sum + item.length, 0);
    if (!target || !text.length || text.length > MAX_ITEMS || total > MAX_CHARS) return json({ error: 'Invalid translation request.' }, 400);
    const upstream = await fetch('https://api.deepl.com/v2/translate', {
      method: 'POST',
      headers: { authorization: `DeepL-Auth-Key ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text, target_lang: target, preserve_formatting: true, formality: 'prefer_less' })
    });
    if (!upstream.ok) throw new Error(`DeepL ${upstream.status}`);
    const data = await upstream.json();
    const translations = Array.isArray(data.translations) ? data.translations.map((item) => String(item.text || '')) : [];
    if (translations.length !== text.length) throw new Error('Incomplete DeepL response');
    return json({ translations });
  } catch (error) {
    return json({ error: 'Translation failed.', details: error && error.message ? error.message : 'Unknown error' }, 502);
  }
}
function corsHeaders() { return { 'access-control-allow-origin': 'https://www.5terrego.com', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'Content-Type' }; }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...corsHeaders() } }); }
