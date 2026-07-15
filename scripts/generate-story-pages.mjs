import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const guideSource = await readFile(path.join(root, 'guide.html'), 'utf8');
const key = guideSource.match(/SUPABASE_ANON_KEY\s*=.*?\|\|\s*'([^']+)'/s)?.[1];
if (!key) throw new Error('Supabase anon key not found in guide.html');

const endpoint = 'https://jpflcbktcnhmlvaibzcw.supabase.co/rest/v1/blog_posts' +
  '?select=id,title,slug,excerpt,content,cover_image,category,status,author,published_at,created_at' +
  '&status=eq.published&order=published_at.desc.nullslast,created_at.desc';
const response = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
if (!response.ok) throw new Error(`Supabase returned ${response.status}: ${await response.text()}`);
const posts = (await response.json()).filter((post) => post.slug && post.title);

const escapeHTML = (value = '') => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const plainText = (value = '') => String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const description = (post) => (plainText(post.excerpt || post.content) || `Travel guide to ${post.title}`).slice(0, 158);
const readingMinutes = (post) => Math.max(3, Math.ceil(plainText(post.content || post.excerpt).split(/\s+/).filter(Boolean).length / 180));
const label = (value = '') => String(value).replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const linkify = (text) => text.replace(/(https?:\/\/[^\s<]+)/g, (url) => `<a href="${escapeHTML(url)}" rel="noopener noreferrer">${escapeHTML(url.replace(/^https?:\/\//, ''))}</a>`);

function renderContent(value = '', articleTitle = '') {
  const clean = String(value)
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<h2[^>]*>/gi, '\n## ')
    .replace(/<h3[^>]*>/gi, '\n### ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
  const lines = clean.split(/\r?\n/).map((line) => line.trim());
  const blocks = [];
  let paragraph = [];
  let list = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${linkify(escapeHTML(paragraph.join(' ')))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push(`<ul>${list.map((item) => `<li>${linkify(escapeHTML(item))}</li>`).join('')}</ul>`);
    list = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) { flushParagraph(); flushList(); continue; }
    if (line.toLowerCase() === String(articleTitle).trim().toLowerCase()) continue;
    if (line.startsWith('### ')) { flushParagraph(); flushList(); blocks.push(`<h3>${escapeHTML(line.slice(4))}</h3>`); continue; }
    if (line.startsWith('## ')) { flushParagraph(); flushList(); blocks.push(`<h2>${escapeHTML(line.slice(3))}</h2>`); continue; }
    if (/^[•*-]\s*/.test(line)) { flushParagraph(); list.push(line.replace(/^[•*-]\s*/, '')); continue; }
    if (line.length <= 64 && !/[.!?,:;]$/.test(line) && (/^(advantages|disadvantages)$/i.test(line) || /^(january|february|march|april|may|june|july|august|september|october|november|december)/i.test(line) || /^[•*-]\s*/.test(lines[index + 1] || ''))) {
      flushParagraph(); flushList(); blocks.push(`<h2>${escapeHTML(line)}</h2>`); continue;
    }
    flushList(); paragraph.push(line);
  }
  flushParagraph(); flushList();
  return blocks.join('\n') || '<p>Article coming soon.</p>';
}

function storyPage(post) {
  const title = escapeHTML(post.title);
  const desc = escapeHTML(description(post));
  const image = escapeHTML(post.cover_image || 'https://www.5terrego.com/seo.png');
  const canonical = `https://www.5terrego.com/stories/${encodeURIComponent(post.slug)}.html`;
  const published = post.published_at || post.created_at || '';
  const dateLabel = published ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' }).format(new Date(published)) : '';
  const structured = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Article', headline: post.title,
    description: description(post), image: [post.cover_image].filter(Boolean),
    datePublished: published || undefined, dateModified: published || undefined,
    author: { '@type': 'Organization', name: post.author || '5TerreGo Editorial' },
    publisher: { '@type': 'Organization', name: '5TerreGo', url: 'https://www.5terrego.com/' },
    mainEntityOfPage: canonical
  }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title} | 5TerreGo</title><meta name="description" content="${desc}">
<link rel="canonical" href="${canonical}"><meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="article"><meta property="og:site_name" content="5TerreGo"><meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${desc}"><meta name="twitter:image" content="${image}">
${published ? `<meta property="article:published_time" content="${escapeHTML(published)}">` : ''}<script type="application/ld+json">${structured}</script>
<style>
:root{--ink:#122033;--muted:#66758a;--paper:#f6f2e9;--sea:#0d5960;--orange:#ff6b00;--line:#dfd8ca}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.top{height:76px;display:flex;align-items:center;justify-content:space-between;padding:0 max(22px,calc((100vw - 1180px)/2));border-bottom:1px solid var(--line);background:rgba(246,242,233,.94);position:sticky;top:0;z-index:5;backdrop-filter:blur(14px)}.logo{font-size:24px;font-weight:950;letter-spacing:-.06em;color:var(--ink);text-decoration:none}.logo b{color:var(--orange)}.back{color:var(--ink);font-weight:800;text-decoration:none}.hero{max-width:1180px;margin:34px auto 0;padding:0 24px;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(340px,.95fr);gap:42px;align-items:center}.cover{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:32px;box-shadow:0 28px 70px rgba(23,35,51,.14)}.kicker{margin:0 0 15px;color:var(--orange);font-size:13px;font-weight:900;letter-spacing:.15em;text-transform:uppercase}.hero h1{font-family:Georgia,"Times New Roman",serif;font-size:clamp(42px,5.4vw,76px);line-height:.94;letter-spacing:-.055em;margin:0}.dek{font-size:19px;line-height:1.55;color:var(--muted);margin:24px 0 0}.meta{display:flex;gap:12px;flex-wrap:wrap;margin-top:22px;font-size:13px;font-weight:800;color:var(--sea)}.article{width:min(760px,calc(100% - 40px));margin:58px auto 90px;font-family:Georgia,"Times New Roman",serif;font-size:20px;line-height:1.78}.article p{margin:0 0 26px}.article h2{font-family:Inter,-apple-system,sans-serif;font-size:34px;line-height:1.08;letter-spacing:-.04em;margin:54px 0 18px}.article h3{font-family:Inter,-apple-system,sans-serif;font-size:25px;margin:38px 0 14px}.article ul{padding-left:24px}.article li{margin:10px 0}.article a{color:var(--sea);text-underline-offset:3px;overflow-wrap:anywhere}.end{border-top:1px solid var(--line);padding-top:28px;margin-top:54px;font-family:Inter,-apple-system,sans-serif}.end a{display:inline-flex;padding:13px 18px;border-radius:999px;background:var(--ink);color:white;text-decoration:none;font-weight:850;font-size:14px}@media(max-width:760px){.top{height:64px}.hero{grid-template-columns:1fr;gap:25px;margin-top:18px;padding:0 16px}.cover{border-radius:24px}.hero-copy{order:2}.hero h1{font-size:clamp(38px,12vw,57px)}.dek{font-size:17px}.article{margin-top:44px;font-size:18px}.article h2{font-size:29px}}
</style></head><body>
<header class="top"><a class="logo" href="/">5Terre<b>Go</b>.com</a><a class="back" href="/guide.html">← All stories</a></header>
<main><section class="hero"><div><img class="cover" src="${image}" alt="${title}"></div><div class="hero-copy"><p class="kicker">${escapeHTML(label(post.category || 'Guide'))}</p><h1>${title}</h1><p class="dek">${desc}</p><div class="meta"><span>${readingMinutes(post)} min read</span>${dateLabel ? `<span>· ${escapeHTML(dateLabel)}</span>` : ''}<span>· ${escapeHTML(post.author || '5TerreGo Editorial')}</span></div></div></section>
<article class="article">${renderContent(post.content || post.excerpt, post.title)}<div class="end"><a href="/guide.html">Explore more Cinque Terre stories</a></div></article></main>
</body></html>`;
}

const storiesDir = path.join(root, 'stories');
await mkdir(storiesDir, { recursive: true });
await Promise.all(posts.map((post) => writeFile(path.join(storiesDir, `${post.slug}.html`), storyPage(post), 'utf8')));
await writeFile(path.join(storiesDir, 'index.html'), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/guide.html"><link rel="canonical" href="https://www.5terrego.com/guide.html"><title>5TerreGo Stories</title>', 'utf8');
const staticUrls = ['', 'guide.html', 'map.html', 'sentieri.html', 'public-transport.html', 'weather.html'];
const sitemapEntries = staticUrls.map((url) => `  <url><loc>https://www.5terrego.com/${url}</loc></url>`)
  .concat(posts.map((post) => {
    const lastModified = String(post.published_at || post.created_at || '').slice(0, 10);
    return `  <url><loc>https://www.5terrego.com/stories/${encodeURIComponent(post.slug)}.html</loc>${lastModified ? `<lastmod>${lastModified}</lastmod>` : ''}</url>`;
  }));
await writeFile(path.join(root, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries.join('\n')}\n</urlset>\n`, 'utf8');
await writeFile(path.join(root, 'robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: https://www.5terrego.com/sitemap.xml\n', 'utf8');
console.log(`Generated ${posts.length} SEO story pages.`);
