import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const origin = 'https://www.5terrego.com';
const buildDate = process.env.SEO_LASTMOD || new Date().toISOString().slice(0, 10);
const pois = JSON.parse(await readFile(path.join(root, 'data', 'pois-lite.json'), 'utf8'));
const guides = JSON.parse(await readFile(path.join(root, 'data', 'local-guides.json'), 'utf8'));

const privatePages = new Set([
  'blog.html', 'blogeditor.html', 'business-analytics.html', 'business-campaign.html',
  'business-menu.html', 'business-profile.html', 'business-staff.html',
  'discounteditor.html', 'global-actionbar.html', 'login.html', 'offline.html',
  'partner.html', 'poieditor.html', 'stories/index.html', 'terms.html',
  'trakeditor.html', 'visitors.html'
]);
const ignoredDirectories = new Set(['.git', 'node_modules', 'vendor']);
const centers = [
  { name: 'Riomaggiore', slug: 'riomaggiore', lat: 44.0992, lng: 9.7387 },
  { name: 'Manarola', slug: 'manarola', lat: 44.1074, lng: 9.7272 },
  { name: 'Corniglia', slug: 'corniglia', lat: 44.1196, lng: 9.7084 },
  { name: 'Vernazza', slug: 'vernazza', lat: 44.1352, lng: 9.6841 },
  { name: 'Monterosso al Mare', slug: 'monterosso', lat: 44.1464, lng: 9.6549 },
  { name: 'Levanto', slug: 'levanto', lat: 44.1707, lng: 9.6135 },
  { name: 'La Spezia', slug: 'la-spezia', lat: 44.1025, lng: 9.8241 },
  { name: 'Portovenere', slug: 'portovenere', lat: 44.0519, lng: 9.8353 },
  { name: 'Lerici', slug: 'lerici', lat: 44.0759, lng: 9.9116 }
];
const mapBounds = { south: 43.75, north: 44.48, west: 9.28, east: 10.28 };

const escapeHTML = (value = '') => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const strip = (value = '') => String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const slugify = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const truncate = (value, length) => {
  const clean = strip(value);
  if (clean.length <= length) return clean;
  return `${clean.slice(0, length - 1).replace(/\s+\S*$/, '')}…`;
};
const decodeEntities = (value = '') => String(value)
  .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const typeLabel = (value = '') => ({
  chiesa: 'Chiesa', stazione: 'Stazione ferroviaria', monumento: 'Monumento',
  castello: 'Castello', spiaggia: 'Spiaggia', curiosity: 'Storia e curiosità',
  'punto panoramico': 'Punto panoramico', ferry: 'Imbarco traghetti',
  'info point': 'Ufficio informazioni', piazza: 'Piazza',
  fontana: 'Fontana', ristorante: 'Ristorante', sentiero: 'Sentiero',
  'fermata bus': 'Fermata autobus', 'ascensore pubblico': 'Ascensore pubblico',
  atm: 'Bancomat', 'bagni pubblici': 'Bagni pubblici',
  parcheggio: 'Parcheggio', farmacia: 'Farmacia',
  'unknown spot': 'Luogo utile',
  transport: 'Trasporti', guide: 'Guida', tips: 'Consigli', trails: 'Sentieri',
  villages: 'Borghi', food: 'Cibo e vino'
}[String(value).toLowerCase()] || String(value || 'Luogo da visitare'));

function parseCoordinates(value) {
  if (Array.isArray(value) && value.length >= 2) {
    const lat = Number(value[0]), lng = Number(value[1]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }
  const raw = String(value || '').trim().replace(/^\(|\)$/g, '');
  let match = raw.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (match) return { lat: Number(match[1]), lng: Number(match[2]) };
  match = raw.match(/^(-?\d+),(\d+)\s*,\s*(-?\d+),(\d+)$/);
  if (match) return { lat: Number(`${match[1]}.${match[2]}`), lng: Number(`${match[3]}.${match[4]}`) };
  return null;
}

function nearestCenter(coords) {
  if (!coords) return { name: 'Cinque Terre e Golfo dei Poeti', slug: 'cinque-terre' };
  return centers.reduce((best, center) => {
    const score = (center.lat - coords.lat) ** 2 + (center.lng - coords.lng) ** 2;
    return !best || score < best.score ? { ...center, score } : best;
  }, null);
}

function paragraphs(description) {
  return String(description || '').split(/\n+/).map(strip).filter(Boolean)
    .map((paragraph) => `<p>${escapeHTML(paragraph)}</p>`).join('');
}

const mapPlaces = pois
  .filter((poi) => poi.id !== null && poi.id !== undefined && poi.name)
  .map((poi) => {
    const coords = parseCoordinates(poi.coords);
    return {
      ...poi,
      coords,
      location: nearestCenter(coords),
      slug: `${slugify(poi.name)}-${poi.id}`,
      descriptionText: strip(poi.description)
    };
  })
  .filter((poi) => poi.coords
    && poi.coords.lat >= mapBounds.south && poi.coords.lat <= mapBounds.north
    && poi.coords.lng >= mapBounds.west && poi.coords.lng <= mapBounds.east)
  .sort((left, right) => Number(right.importance || 0) - Number(left.importance || 0));
const candidates = mapPlaces
  .filter((poi) => poi.descriptionText.length >= 180 && Number(poi.importance || 0) >= 60);
const detailPlaces = candidates.filter((poi) => poi.descriptionText.length >= 500);
const detailIds = new Set(detailPlaces.map((poi) => String(poi.id)));

function mapHref(poi) {
  const params = new URLSearchParams({
    poi: String(poi.id),
    name: String(poi.name),
    type: String(poi.type || 'unknown spot')
  });
  if (poi.coords) params.set('coords', `${poi.coords.lat},${poi.coords.lng}`);
  return `/map.html?${params.toString()}`;
}

function placeHref(poi) {
  return detailIds.has(String(poi.id))
    ? `/places/${poi.slug}.html`
    : mapHref(poi);
}

function relatedPlaces(poi) {
  return detailPlaces.filter((item) => item.id !== poi.id && item.location.slug === poi.location.slug).slice(0, 4);
}

function placePage(poi) {
  const canonical = `${origin}/places/${poi.slug}.html`;
  const title = truncate(`${poi.name}: cosa vedere a ${poi.location.name} | 5TerreGo`, 78);
  const description = truncate(`${poi.descriptionText} Informazioni, posizione e apertura sulla mappa interattiva 5TerreGo.`, 158);
  const mapUrl = mapHref(poi);
  const geo = poi.coords ? { '@type': 'GeoCoordinates', latitude: poi.coords.lat, longitude: poi.coords.lng } : undefined;
  const schema = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TouristAttraction', '@id': `${canonical}#place`, name: poi.name,
        description: poi.descriptionText, url: canonical, geo,
        containedInPlace: { '@type': 'Place', name: poi.location.name }
      },
      {
        '@type': 'WebPage', '@id': canonical, url: canonical, name: title,
        description, isPartOf: { '@type': 'WebSite', '@id': `${origin}/#website` },
        about: { '@id': `${canonical}#place` }, inLanguage: 'it'
      },
      {
        '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Luoghi', item: `${origin}/places/` },
          { '@type': 'ListItem', position: 2, name: poi.location.name, item: `${origin}/places/${poi.location.slug}.html` },
          { '@type': 'ListItem', position: 3, name: poi.name, item: canonical }
        ]
      }
    ]
  }).replace(/</g, '\\u003c');
  const related = relatedPlaces(poi).map((item) =>
    `<a class="related-card" href="/places/${item.slug}.html"><small>${escapeHTML(typeLabel(item.type))}</small><strong>${escapeHTML(item.name)}</strong><span>${escapeHTML(item.location.name)} →</span></a>`
  ).join('');
  const coordinateNote = poi.coords
    ? `<span>${poi.coords.lat.toFixed(5)}, ${poi.coords.lng.toFixed(5)}</span>`
    : '<span>Posizione disponibile sulla mappa</span>';
  return `<!doctype html>
<html lang="it"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escapeHTML(title)}</title><meta name="description" content="${escapeHTML(description)}">
<link rel="canonical" href="${canonical}"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<meta property="og:type" content="article"><meta property="og:site_name" content="5TerreGo"><meta property="og:locale" content="it_IT">
<meta property="og:title" content="${escapeHTML(title)}"><meta property="og:description" content="${escapeHTML(description)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${origin}/seo.png">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHTML(title)}"><meta name="twitter:description" content="${escapeHTML(description)}"><meta name="twitter:image" content="${origin}/seo.png">
<script type="application/ld+json">${schema}</script>
<style>
:root{--ink:#102033;--muted:#607083;--paper:#f6f2e9;--sea:#0d5960;--orange:#ff6b00;--line:#ded7ca}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.top{height:70px;display:flex;align-items:center;justify-content:space-between;padding:0 max(18px,calc((100vw - 1020px)/2));border-bottom:1px solid var(--line);background:rgba(246,242,233,.95);position:sticky;top:0;z-index:4}.logo{color:var(--ink);font-size:24px;font-weight:950;letter-spacing:-.06em;text-decoration:none}.logo b{color:var(--orange)}.back{color:var(--sea);font-weight:850;text-decoration:none}.page{width:min(1020px,calc(100% - 36px));margin:0 auto}.crumbs{display:flex;gap:8px;flex-wrap:wrap;padding-top:28px;color:var(--muted);font-size:13px}.crumbs a{color:inherit}.hero{padding:32px 0 38px;border-bottom:1px solid var(--line)}.tag{display:inline-flex;padding:8px 11px;border-radius:999px;background:#fff;border:1px solid var(--line);color:var(--orange);font-size:11px;font-weight:950;letter-spacing:.1em;text-transform:uppercase}.hero h1{max-width:900px;margin:18px 0 16px;font-family:Georgia,"Times New Roman",serif;font-size:clamp(42px,7vw,76px);line-height:.94;letter-spacing:-.055em}.place{color:var(--sea);font-size:18px;font-weight:900}.content{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr);gap:24px;padding:34px 0 56px}.article,.side{padding:clamp(22px,4vw,36px);border-radius:28px;background:#fff;border:1px solid var(--line)}.article p{margin:0 0 24px;color:#36495d;font-family:Georgia,"Times New Roman",serif;font-size:20px;line-height:1.72}.article p:last-child{margin-bottom:0}.side h2{margin:0 0 14px;font-size:24px}.facts{display:grid;gap:10px}.facts span{display:block;padding:13px;border-radius:14px;background:#f4f6f7;color:var(--muted);font-size:13px;line-height:1.45}.cta{display:flex;justify-content:center;align-items:center;min-height:52px;margin-top:14px;border-radius:15px;background:var(--sea);color:#fff;text-decoration:none;font-weight:900}.related{padding:30px 0 76px;border-top:1px solid var(--line)}.related h2{font-family:Georgia,"Times New Roman",serif;font-size:34px}.related-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.related-card{display:flex;flex-direction:column;min-height:155px;padding:18px;border-radius:20px;background:#fff;border:1px solid var(--line);color:var(--ink);text-decoration:none}.related-card small{color:var(--orange);font-weight:900}.related-card strong{margin:12px 0;font-family:Georgia,"Times New Roman",serif;font-size:21px;line-height:1.05}.related-card span{margin-top:auto;color:var(--sea);font-size:12px;font-weight:850}@media(max-width:760px){.top{height:62px}.page{width:min(100% - 28px,1020px)}.crumbs{padding-top:20px}.hero{padding-top:24px}.hero h1{font-size:clamp(40px,12vw,58px)}.content{grid-template-columns:1fr}.article,.side{border-radius:23px}.article p{font-size:18px}.related-grid{display:flex;overflow-x:auto}.related-card{min-width:235px}}
</style></head><body>
<header class="top"><a class="logo" href="/">5Terre<b>Go</b>.com</a><a class="back" href="/places/">Tutti i luoghi</a></header>
<main class="page"><nav class="crumbs" aria-label="Percorso"><a href="/">Home</a><span>›</span><a href="/places/">Luoghi</a><span>›</span><a href="/places/${poi.location.slug}.html">${escapeHTML(poi.location.name)}</a></nav>
<section class="hero"><span class="tag">${escapeHTML(typeLabel(poi.type))}</span><h1>${escapeHTML(poi.name)}</h1><div class="place">${escapeHTML(poi.location.name)} · Cinque Terre e Golfo dei Poeti</div></section>
<section class="content"><article class="article">${paragraphs(poi.description)}</article><aside class="side"><h2>Apri sulla mappa</h2><div class="facts"><span><strong>Categoria:</strong> ${escapeHTML(typeLabel(poi.type))}</span><span><strong>Zona:</strong> ${escapeHTML(poi.location.name)}</span>${coordinateNote}<span>Verifica sul posto eventuali orari, accessi e condizioni aggiornate.</span></div><a class="cta" href="${mapUrl}">Vedi posizione e indicazioni</a></aside></section>
${related ? `<section class="related"><h2>Altri luoghi vicino a ${escapeHTML(poi.location.name)}</h2><div class="related-grid">${related}</div></section>` : ''}
</main><script src="/site-analytics.js?v=4" defer></script></body></html>`;
}

function locationPage(location, items) {
  const canonical = `${origin}/places/${location.slug}.html`;
  const title = `Cosa vedere a ${location.name}: luoghi e attrazioni | 5TerreGo`;
  const description = `Scopri cosa vedere a ${location.name}: monumenti, chiese, punti panoramici, stazioni e curiosità con descrizioni e collegamenti alla mappa interattiva.`;
  const cards = items.map((poi) => {
    const summary = poi.descriptionText
      ? truncate(poi.descriptionText, 210)
      : `Posizione, informazioni e indicazioni per ${poi.name}.`;
    return `<article class="card"><div><small>${escapeHTML(typeLabel(poi.type))}</small><h2><a href="${placeHref(poi)}">${escapeHTML(poi.name)}</a></h2><p>${escapeHTML(summary)}</p></div><a class="map-link" href="${mapHref(poi)}">Apri sulla mappa →</a></article>`;
  }).join('');
  const itemList = items.map((poi, index) => ({
    '@type': 'ListItem', position: index + 1, name: poi.name,
    url: detailIds.has(String(poi.id)) ? `${origin}/places/${poi.slug}.html` : `${origin}${mapHref(poi)}`
  }));
  const schema = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'ItemList', name: `Luoghi da vedere a ${location.name}`,
    description, numberOfItems: items.length, itemListElement: itemList
  }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(title)}</title><meta name="description" content="${escapeHTML(description)}"><link rel="canonical" href="${canonical}"><meta name="robots" content="index,follow,max-image-preview:large"><meta property="og:type" content="website"><meta property="og:site_name" content="5TerreGo"><meta property="og:title" content="${escapeHTML(title)}"><meta property="og:description" content="${escapeHTML(description)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${origin}/seo.png"><meta name="twitter:card" content="summary_large_image"><script type="application/ld+json">${schema}</script><style>
:root{--ink:#102033;--muted:#607083;--paper:#f6f2e9;--sea:#0d5960;--orange:#ff6b00;--line:#ded7ca}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.top{height:70px;display:flex;align-items:center;justify-content:space-between;padding:0 max(18px,calc((100vw - 1060px)/2));border-bottom:1px solid var(--line);background:#f6f2e9;position:sticky;top:0}.logo{color:var(--ink);font-size:24px;font-weight:950;letter-spacing:-.06em;text-decoration:none}.logo b{color:var(--orange)}.top>a:last-child{color:var(--sea);font-weight:850}.page{width:min(1060px,calc(100% - 32px));margin:auto}.hero{padding:58px 0 38px}.kicker{color:var(--orange);font-size:12px;font-weight:950;letter-spacing:.13em;text-transform:uppercase}.hero h1{max-width:900px;margin:12px 0 18px;font-family:Georgia,"Times New Roman",serif;font-size:clamp(44px,8vw,78px);line-height:.94;letter-spacing:-.06em}.hero p{max-width:720px;color:var(--muted);font-size:18px;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px;padding-bottom:72px}.card{display:flex;flex-direction:column;justify-content:space-between;min-height:265px;padding:25px;border-radius:24px;background:#fff;border:1px solid var(--line)}.card small{color:var(--orange);font-weight:900;text-transform:uppercase}.card h2{margin:10px 0 13px;font-family:Georgia,"Times New Roman",serif;font-size:28px;line-height:1.02}.card h2 a{color:inherit;text-decoration:none}.card p{color:var(--muted);line-height:1.55}.map-link{margin-top:18px;color:var(--sea);font-weight:900;text-decoration:none}@media(max-width:680px){.top{height:62px}.hero{padding-top:38px}.grid{grid-template-columns:1fr}.card{min-height:230px}}
</style></head><body><header class="top"><a class="logo" href="/">5Terre<b>Go</b>.com</a><a href="/places/">Tutti i luoghi</a></header><main class="page"><section class="hero"><div class="kicker">Guida ai luoghi</div><h1>Cosa vedere a ${escapeHTML(location.name)}</h1><p>${escapeHTML(description)}</p></section><section class="grid">${cards}</section></main><script src="/site-analytics.js?v=4" defer></script></body></html>`;
}

function placesIndex(locationGroups) {
  const canonical = `${origin}/places/`;
  const title = 'Luoghi da vedere alle Cinque Terre: attrazioni e mappa | 5TerreGo';
  const description = 'Esplora monumenti, chiese, spiagge, stazioni, punti panoramici e curiosità delle Cinque Terre e del Golfo dei Poeti, con collegamenti alla mappa.';
  const sections = locationGroups.map(({ location, items }) => `<section class="group"><div class="group-head"><div><small>Zona</small><h2><a href="/places/${location.slug}.html">${escapeHTML(location.name)}</a></h2></div><span>${items.length} luoghi</span></div><div class="links">${items.map((poi) => `<a href="${placeHref(poi)}"><span>${escapeHTML(poi.name)}</span><small>${escapeHTML(typeLabel(poi.type))}</small></a>`).join('')}</div></section>`).join('');
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="${canonical}"><meta name="robots" content="index,follow,max-image-preview:large"><meta property="og:type" content="website"><meta property="og:site_name" content="5TerreGo"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${origin}/seo.png"><meta name="twitter:card" content="summary_large_image"><style>
:root{--ink:#102033;--muted:#607083;--paper:#f6f2e9;--sea:#0d5960;--orange:#ff6b00;--line:#ded7ca}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.top{height:70px;display:flex;align-items:center;justify-content:space-between;padding:0 max(18px,calc((100vw - 1080px)/2));border-bottom:1px solid var(--line);background:#f6f2e9}.logo{color:var(--ink);font-size:24px;font-weight:950;letter-spacing:-.06em;text-decoration:none}.logo b{color:var(--orange)}.top>a:last-child{color:var(--sea);font-weight:850}.page{width:min(1080px,calc(100% - 32px));margin:auto}.hero{padding:62px 0 46px}.hero small{color:var(--orange);font-weight:950;letter-spacing:.13em;text-transform:uppercase}.hero h1{max-width:940px;margin:12px 0 20px;font-family:Georgia,"Times New Roman",serif;font-size:clamp(44px,8vw,80px);line-height:.93;letter-spacing:-.06em}.hero p{max-width:760px;color:var(--muted);font-size:18px;line-height:1.6}.group{padding:30px 0;border-top:1px solid var(--line)}.group-head{display:flex;justify-content:space-between;align-items:end;gap:20px}.group-head small{color:var(--orange);font-weight:900;text-transform:uppercase}.group-head h2{margin:5px 0 0;font-family:Georgia,"Times New Roman",serif;font-size:38px}.group-head h2 a{color:inherit}.group-head>span{color:var(--muted);font-weight:800}.links{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:18px}.links>a{display:flex;flex-direction:column;justify-content:space-between;min-height:110px;padding:16px;border-radius:17px;background:#fff;border:1px solid var(--line);color:var(--ink);text-decoration:none;font-weight:850}.links small{margin-top:12px;color:var(--sea);font-size:10px;text-transform:uppercase}@media(max-width:720px){.top{height:62px}.hero{padding-top:40px}.links{grid-template-columns:1fr 1fr}.group-head h2{font-size:32px}}@media(max-width:450px){.links{grid-template-columns:1fr}}
</style></head><body><header class="top"><a class="logo" href="/">5Terre<b>Go</b>.com</a><a href="/map.html">Mappa interattiva</a></header><main class="page"><section class="hero"><small>Archivio dei luoghi</small><h1>Cosa vedere alle Cinque Terre e nel Golfo dei Poeti</h1><p>${description}</p></section>${sections}</main><script src="/site-analytics.js?v=4" defer></script></body></html>`;
}

const placesDirectory = path.join(root, 'places');
await mkdir(placesDirectory, { recursive: true });
await Promise.all(detailPlaces.map((poi) => writeFile(path.join(placesDirectory, `${poi.slug}.html`), placePage(poi), 'utf8')));
const groups = centers.map((location) => ({
  location,
  items: mapPlaces.filter((poi) => poi.location.slug === location.slug)
})).filter((group) => group.items.length);
await Promise.all(groups.map((group) => writeFile(path.join(placesDirectory, `${group.location.slug}.html`), locationPage(group.location, group.items), 'utf8')));
await writeFile(path.join(placesDirectory, 'index.html'), placesIndex(groups), 'utf8');

const guidePath = path.join(root, 'guide.html');
let guideHTML = await readFile(guidePath, 'utf8');
const staticGuideCards = guides.slice(0, 12).map((post) => `<article class="story-card" data-slug="${escapeHTML(post.slug)}"><a class="story-link" href="/stories/${encodeURIComponent(post.slug)}.html"><div class="story-thumb"><img src="${escapeHTML(post.cover_image)}" alt="${escapeHTML(post.title)}" loading="lazy"></div><div class="story-body"><span class="story-category">${escapeHTML(typeLabel(post.category))}</span><h3 class="story-title">${escapeHTML(post.title)}</h3><p class="story-preview">${escapeHTML(post.excerpt)}</p></div></a></article>`).join('');
guideHTML = guideHTML.replace(
  /<!-- SEO_STATIC_STORIES_START -->[\s\S]*?<!-- SEO_STATIC_STORIES_END -->/,
  `<!-- SEO_STATIC_STORIES_START -->${staticGuideCards}<!-- SEO_STATIC_STORIES_END -->`
);
await writeFile(guidePath, guideHTML, 'utf8');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...await walk(path.join(directory, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(path.join(directory, entry.name));
    }
  }
  return files;
}

const guideDates = new Map(guides.map((guide) => [`stories/${guide.slug}.html`, String(guide.published_at || '').slice(0, 10)]));
const sitemapEntries = [];
for (const file of await walk(root)) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  if (privatePages.has(relative)) continue;
  let source = await readFile(file, 'utf8');
  if (relative.startsWith('trails/')) {
    const titleMatch = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const plainTitle = decodeEntities(strip(titleMatch?.[1] || ''));
    if (plainTitle.length > 86) {
      const shorterTitle = truncate(plainTitle.replace(/\s+\|\s+Sentieri Cinque Terre\s+\|\s+5TerreGo$/i, ''), 56);
      source = source.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${escapeHTML(`${shorterTitle} | Sentiero Cinque Terre`)}</title>`);
      await writeFile(file, source, 'utf8');
    }
  }
  if (/name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(source)) continue;
  const canonical = source.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1]
    || source.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical/i)?.[1];
  if (!canonical?.startsWith(`${origin}/`)) continue;
  const fileDate = guideDates.get(relative) || (await stat(file)).mtime.toISOString().slice(0, 10) || buildDate;
  sitemapEntries.push({ canonical, lastmod: fileDate });
}
sitemapEntries.sort((left, right) => left.canonical.localeCompare(right.canonical));
await writeFile(
  path.join(root, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries.map(({ canonical, lastmod }) => `  <url><loc>${canonical}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n')}\n</urlset>\n`,
  'utf8'
);

console.log(`Generated ${detailPlaces.length} detailed place pages, ${groups.length} location hubs and a ${sitemapEntries.length}-URL sitemap.`);
