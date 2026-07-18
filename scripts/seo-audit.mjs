import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ignoredDirs = new Set(['.git', 'vendor', 'node_modules']);
const privatePages = new Set([
  'blogeditor.html', 'discounteditor.html', 'poieditor.html', 'trakeditor.html',
  'blog.html', 'login.html', 'global-actionbar.html', 'offline.html', 'visitors.html',
  'stories/index.html', 'partner.html', 'terms.html', 'discounteditor.html',
  'business-analytics.html', 'business-campaign.html', 'business-menu.html',
  'business-profile.html', 'business-staff.html'
]);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return ignoredDirs.has(entry.name) ? [] : walk(path.join(directory, entry.name));
    return entry.isFile() && entry.name.endsWith('.html') ? [path.join(directory, entry.name)] : [];
  });
}

function has(source, pattern) { return pattern.test(source); }
function text(source, pattern) { return (source.match(pattern)?.[1] || '').replace(/\s+/g, ' ').trim(); }

const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const failures = [];
const rows = [];

for (const file of walk(root)) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  if (relative === 'global-actionbar.html') continue;
  const source = fs.readFileSync(file, 'utf8');
  const isPrivate = privatePages.has(relative);
  const title = text(source, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = text(source, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
    || text(source, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const canonical = text(source, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i)
    || text(source, /<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i);
  const noindex = has(source, /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i);
  const images = source.match(/<img\b[^>]*>/gi) || [];
  let jsonLdValid = true;
  for (const match of source.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { JSON.parse(match[1]); } catch { jsonLdValid = false; }
  }
  const checks = {
    lang: has(source, /<html[^>]+lang=["'][a-z]{2}(?:-[A-Za-z]{2})?["']/i),
    viewport: isPrivate || has(source, /<meta[^>]+name=["']viewport["']/i),
    title: title.length >= 10 && title.length <= 90,
    description: isPrivate || (description.length >= 50 && description.length <= 180),
    canonical: isPrivate ? noindex : canonical.startsWith('https://www.5terrego.com/'),
    robots: isPrivate ? noindex : has(source, /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*index/i),
    openGraph: isPrivate || (has(source, /property=["']og:title["']/i) && has(source, /property=["']og:description["']/i) && has(source, /property=["']og:image["']/i)),
    twitter: isPrivate || has(source, /name=["']twitter:card["']/i),
    h1: isPrivate || (source.match(/<h1\b/gi) || []).length >= 1,
    imageAlt: isPrivate || images.every((tag) => /\balt\s*=/i.test(tag)),
    jsonLd: jsonLdValid,
    sitemap: isPrivate || sitemap.includes(canonical)
  };
  const missing = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  rows.push({ page: relative, status: missing.length ? `FAIL: ${missing.join(', ')}` : 'PASS' });
  if (missing.length) failures.push(`${relative}: ${missing.join(', ')}`);
}

if (failures.length) {
  console.table(rows.filter((row) => row.status !== 'PASS'));
  console.error(`\nSEO audit failed (${failures.length} pages).`);
  process.exitCode = 1;
} else {
  console.log(`\nSEO audit passed for ${rows.length} HTML pages.`);
}
