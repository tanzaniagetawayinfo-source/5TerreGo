const CLIENT_MARKER = 'data-ftg-ai-client="v1"';
const CLIENT_SCRIPT = `<script ${CLIENT_MARKER} src="/assets/ftg-ai-client.js?v=20260718"></script>`;

export async function onRequest(context) {
  const asset = await context.env.ASSETS.fetch(context.request);
  if (context.request.method === 'HEAD' || !asset.ok) return asset;

  const contentType = asset.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) return asset;

  const html = await asset.text();
  if (html.includes(CLIENT_MARKER)) return new Response(html, asset);

  const headers = new Headers(asset.headers);
  headers.set('Cache-Control', 'no-cache');
  headers.delete('Content-Length');

  return new Response(`${html}\n${CLIENT_SCRIPT}\n`, {
    status: asset.status,
    statusText: asset.statusText,
    headers
  });
}
