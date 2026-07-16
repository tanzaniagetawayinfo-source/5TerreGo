import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const origin = 'https://www.5terrego.com';
const defaultImage = `${origin}/seo.png`;
const privatePages = new Set([
  'blog.html', 'blogeditor.html', 'discounteditor.html',
  'login.html', 'offline.html', 'poieditor.html', 'stories/index.html',
  'trails/index.html', 'trakeditor.html', 'visitors.html', 'partner.html', 'terms.html'
]);
const excludedDirs = new Set(['.git', 'vendor', 'node_modules']);

const pageCopy = {
  'index.html': ['Cinque Terre: mappa, sentieri, treni e guide | 5TerreGo', 'Organizza le Cinque Terre con mappa interattiva, sentieri, treni, battelli, meteo, guide locali e informazioni pratiche aggiornate.'],
  'map.html': ['Interactive Cinque Terre and Gulf of Poets Map | 5TerreGo', 'Explore a 3D map of Cinque Terre and the Gulf of Poets with villages, hiking trails, beaches, railway stations, ferries and useful places.'],
  'guide.html': ['Cinque Terre Travel Guides and Local Stories | 5TerreGo', 'Practical Cinque Terre travel guides, local stories and responsible itineraries for villages, trains, trails, beaches, food and seasonal trips.'],
  'sentieri.html': ['Sentieri delle Cinque Terre: difficoltà e durata | 5TerreGo', 'Confronta i sentieri delle Cinque Terre per difficoltà, durata, dislivello e partenza, con schede pratiche e collegamenti alle fonti ufficiali.'],
  'public-transport.html': ['Trasporti Cinque Terre: treni, battelli e autobus | 5TerreGo', 'Consulta treni, battelli e autobus per muoverti tra La Spezia, Levanto, le Cinque Terre e il Golfo dei Poeti con indicazioni pratiche.'],
  'weather.html': ['Meteo Cinque Terre: previsioni per borghi e sentieri', 'Controlla il meteo delle Cinque Terre, le previsioni orarie e giornaliere, vento, pioggia e condizioni utili per borghi, mare e sentieri.'],
  'discounts.html': ['Sconti locali nelle Cinque Terre | 5TerreGo', 'Scopri sconti dichiarati e offerte di attività locali selezionate nelle Cinque Terre, con condizioni trasparenti e informazioni per utilizzarli.'],
  'updates.html': ['Official Cinque Terre Updates: Trails and Transport', 'Check official sources for current Cinque Terre trail conditions, severe weather alerts, train information and transport updates before travelling.'],
  'advertise.html': ['Partnership locali e sponsorizzazioni | 5TerreGo', 'Scopri come collaborare con 5TerreGo attraverso partnership locali trasparenti per strutture, ristoranti, guide e servizi delle Cinque Terre.'],
  'chi-siamo.html': ['Chi siamo | 5TerreGo, guida indipendente alle Cinque Terre', 'Conosci il progetto 5TerreGo, la guida indipendente che riunisce mappe, informazioni pratiche e contenuti responsabili sulle Cinque Terre.'],
  'contatti.html': ['Contatti | 5TerreGo', 'Contatta 5TerreGo per segnalazioni, correzioni, collaborazioni editoriali e informazioni sul progetto dedicato alle Cinque Terre.'],
  'privacy-policy.html': ['Privacy Policy | 5TerreGo', 'Leggi come 5TerreGo tratta i dati personali, quali servizi tecnici utilizza e quali diritti puoi esercitare in materia di privacy.'],
  'cookie-policy.html': ['Cookie Policy | 5TerreGo', 'Consulta la Cookie Policy di 5TerreGo per conoscere cookie, strumenti tecnici, finalità, durata e modalità di gestione delle preferenze.'],
  'termini-e-condizioni.html': ['Termini e condizioni | 5TerreGo', 'Consulta i termini e le condizioni applicabili all’utilizzo di 5TerreGo, dei contenuti informativi, delle mappe e dei servizi disponibili.'],
  'copyright.html': ['Copyright e uso dei contenuti | 5TerreGo', 'Consulta le regole sul copyright, sulla proprietà intellettuale e sull’utilizzo consentito dei testi, delle immagini e dei contenuti di 5TerreGo.'],
  'dichiarazione-affiliate.html': ['Dichiarazione affiliazioni e trasparenza | 5TerreGo', 'Leggi come 5TerreGo segnala link affiliati, partnership e contenuti sponsorizzati per mantenere trasparenza e indipendenza editoriale.']
};

const hiddenHeadings = {
  'map.html': 'Interactive map of Cinque Terre and the Gulf of Poets',
  'public-transport.html': 'Trasporti pubblici nelle Cinque Terre e nel Golfo dei Poeti'
};

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return excludedDirs.has(entry.name) ? [] : walk(path.join(directory, entry.name));
    return entry.isFile() && entry.name.endsWith('.html') ? [path.join(directory, entry.name)] : [];
  });
}

function escapeAttribute(value) {
  return String(value).replace(/&(?!#\d+;|#x[\da-f]+;|[a-z][\w-]*;)/gi, '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function getTagContent(source, name) {
  const tag = source.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, 'i'))?.[0] || '';
  return tag.match(/content=["']([^"']*)["']/i)?.[1] || '';
}

function getTitle(source) {
  return (source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
}

function getDescription(source, relative) {
  const configured = pageCopy[relative]?.[1];
  if (configured) return configured;
  const existing = getTagContent(source, 'description');
  if (existing.length >= 50) return existing;
  const paragraph = (source.match(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/i)?.[1] || '')
    .replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  const base = paragraph || existing || `Informazioni, guide e risorse di 5TerreGo dedicate alle Cinque Terre e al Golfo dei Poeti.`;
  return (base.length >= 70 ? base : `${base} Consulta informazioni pratiche e aggiornate per organizzare la visita.`).slice(0, 177).trim();
}

function canonicalFor(relative) {
  return relative === 'index.html' ? `${origin}/` : `${origin}/${relative}`;
}

function removeSeoTags(source) {
  return source
    .replace(/\s*<link[^>]+rel=["']canonical["'][^>]*>/gi, '')
    .replace(/\s*<meta[^>]+name=["']robots["'][^>]*>/gi, '')
    .replace(/\s*<meta[^>]+(?:property|name)=["'](?:og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, '');
}

function ensureDocumentShell(source, relative) {
  if (/<html\b/i.test(source)) return source;
  const lang = relative.startsWith('stories/') ? 'en' : 'it';
  return `<!doctype html><html lang="${lang}"><head>${source.replace(/^<!doctype html>/i, '')}</head><body></body></html>`;
}

const publicPages = [];
for (const file of walk(root)) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  if (relative === 'global-actionbar.html') continue;
  let source = ensureDocumentShell(fs.readFileSync(file, 'utf8'), relative);
  const isPrivate = privatePages.has(relative);
  const configuredTitle = pageCopy[relative]?.[0];
  const title = configuredTitle || getTitle(source) || '5TerreGo';
  const structuredImage = source.match(/"image"\s*:\s*\[?\s*"(https?:[^"\\]+)"/i)?.[1] || '';
  const existingSocialImage = getTagContent(source, 'og:image');

  source = removeSeoTags(source);
  if (configuredTitle && /<title[^>]*>[\s\S]*?<\/title>/i.test(source)) {
    source = source.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${escapeAttribute(configuredTitle)}</title>`);
  }

  if (isPrivate) {
    const privateMeta = '\n  <meta name="robots" content="noindex,nofollow,noarchive">\n';
    source = source.replace(/<\/head>/i, `${privateMeta}</head>`);
  } else {
    const description = getDescription(source, relative);
    const canonical = canonicalFor(relative);
    const image = structuredImage || existingSocialImage || defaultImage;
    const lang = source.match(/<html[^>]+lang=["']([^"']+)/i)?.[1] || 'it';
    const ogLocale = lang.toLowerCase().startsWith('en') ? 'en_US' : 'it_IT';
    if (/<meta[^>]+name=["']description["']/i.test(source)) {
      source = source.replace(/<meta[^>]+name=["']description["'][^>]*>/i, `<meta name="description" content="${escapeAttribute(description)}">`);
    } else {
      source = source.replace(/<title[^>]*>[\s\S]*?<\/title>/i, (match) => `${match}\n  <meta name="description" content="${escapeAttribute(description)}">`);
    }
    const seo = `
  <link rel="canonical" href="${canonical}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <meta property="og:type" content="${relative.startsWith('stories/') ? 'article' : 'website'}">
  <meta property="og:site_name" content="5TerreGo">
  <meta property="og:locale" content="${ogLocale}">
  <meta property="og:title" content="${escapeAttribute(title)}">
  <meta property="og:description" content="${escapeAttribute(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${escapeAttribute(image)}">
  <meta property="og:image:alt" content="${escapeAttribute(title)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeAttribute(title)}">
  <meta name="twitter:description" content="${escapeAttribute(description)}">
  <meta name="twitter:image" content="${escapeAttribute(image)}">
`;
    source = source.replace(/<\/head>/i, `${seo}</head>`);
    publicPages.push({ relative, canonical });
  }

  if (hiddenHeadings[relative] && !/<h1\b/i.test(source)) {
    source = source.replace(/<body([^>]*)>/i, `<body$1>\n<h1 style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0">${hiddenHeadings[relative]}</h1>`);
  }

  fs.writeFileSync(file, source);
}

const home = path.join(root, 'index.html');
let homeSource = fs.readFileSync(home, 'utf8');
if (!homeSource.includes('"@id":"https://www.5terrego.com/#website"')) {
  const structuredData = `
  <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","@id":"https://www.5terrego.com/#organization","name":"5TerreGo","url":"https://www.5terrego.com/","logo":{"@type":"ImageObject","url":"https://www.5terrego.com/app.png"}},{"@type":"WebSite","@id":"https://www.5terrego.com/#website","url":"https://www.5terrego.com/","name":"5TerreGo","alternateName":"5 Terre Go","description":"Mappe, sentieri, trasporti e guide pratiche per le Cinque Terre.","publisher":{"@id":"https://www.5terrego.com/#organization"},"inLanguage":["it","en"]}]}</script>
`;
  homeSource = homeSource.replace(/<\/head>/i, `${structuredData}</head>`);
  fs.writeFileSync(home, homeSource);
}

publicPages.sort((a, b) => a.canonical.localeCompare(b.canonical));
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${publicPages.map(({ canonical }) => `  <url><loc>${canonical}</loc></url>`).join('\n')}\n</urlset>\n`;
fs.writeFileSync(path.join(root, 'sitemap.xml'), sitemap);
console.log(`SEO metadata applied to ${publicPages.length} public pages; ${privatePages.size} utility pages set to noindex.`);
