import { access, readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const errors = [];
const exists = async (file) => access(file).then(() => true).catch(() => false);

async function htmlFiles(directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'vendor') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(full));
    else if (entry.name.endsWith('.html')) files.push(full);
  }
  return files;
}

for (const file of await htmlFiles()) {
  const source = await readFile(file, 'utf8');
  const relative = path.relative(root, file).replaceAll('\\', '/');
  const links = [...source.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)].map(match => match[1]);
  for (const raw of links) {
    if (!raw || /^(?:https?:|mailto:|tel:|data:|javascript:|#|\/\/)/i.test(raw) || raw.includes('${')) continue;
    const clean = raw.split(/[?#]/)[0];
    if (!clean || clean === '/') continue;
    const target = clean.startsWith('/') ? path.join(root, clean.slice(1)) : path.resolve(path.dirname(file), clean);
    if (!await exists(target)) errors.push(`${relative}: missing local target ${raw}`);
  }

  if (!/(?:editor|partner|visitors)\.html$/i.test(relative)) {
    if (/select\s*\([^)]*emails/i.test(source) || /select=id,emails/i.test(source)) {
      errors.push(`${relative}: public frontend queries private POI emails`);
    }
  }

  if (/const\s+ORS_API_KEY\s*=\s*["'][^"']{20,}["']/i.test(source)) {
    errors.push(`${relative}: exposes a third-party routing key in public HTML`);
  }
}

const forbiddenSnapshot = path.join(root, 'data', 'pois.json');
if (await exists(forbiddenSnapshot)) errors.push('data/pois.json must never be published');

const litePath = path.join(root, 'data', 'pois-lite.json');
const lite = JSON.parse(await readFile(litePath, 'utf8'));
const allowed = new Set(['id', 'name', 'coords', 'description', 'importance', 'type', 'discount', 'discount_info']);
for (const [index, row] of lite.entries()) {
  const unknown = Object.keys(row).filter(key => !allowed.has(key));
  if (unknown.length) errors.push(`data/pois-lite.json row ${index}: forbidden fields ${unknown.join(', ')}`);
}

const officialTrailsPath = path.join(root, 'data', 'official-trails.json');
const officialDataset = JSON.parse(await readFile(officialTrailsPath, 'utf8'));
const officialTrails = Array.isArray(officialDataset.trails) ? officialDataset.trails : [];
if (officialTrails.length < 3) errors.push('data/official-trails.json must contain at least 3 official trails');
for (const [index, trail] of officialTrails.entries()) {
  const points = Array.isArray(trail.points) ? trail.points : [];
  const geometry = trail.route_geojson?.geometry;
  if (!/^\d{3}(?:-\d)?\b/.test(String(trail.name || ''))) errors.push(`official trail ${index}: missing official route number`);
  if (!String(trail.official_url || '').startsWith('https://www.parconazionale5terre.it/')) errors.push(`official trail ${index}: invalid official source`);
  if (points.length < 50 || geometry?.type !== 'LineString' || geometry.coordinates?.length !== points.length) errors.push(`official trail ${index}: incomplete route geometry`);
  if (Object.prototype.hasOwnProperty.call(trail, 'owner_email')) errors.push(`official trail ${index}: owner email must not be published in the dataset`);
  for (const point of points) {
    if (!(point.lat >= 44.05 && point.lat <= 44.2 && point.lng >= 9.55 && point.lng <= 9.85)) {
      errors.push(`official trail ${index}: coordinate outside Cinque Terre bounds`);
      break;
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
try {
  execFileSync(process.execPath, [path.join(root, 'scripts', 'seo-audit.mjs')], { stdio: 'inherit' });
} catch {
  process.exit(1);
}
console.log(`Site checks passed: ${lite.length} safe POIs, ${officialTrails.length} official trails and no broken local links.`);
