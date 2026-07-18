/*
  Generates SEO-localized copies after editorial review.
  Required: DEEPL_API_KEY. Example: $env:DEEPL_API_KEY='...'; node scripts/generate-locales.mjs
*/
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const key = process.env.DEEPL_API_KEY;
const locales = { en: 'EN-US', fr: 'FR', de: 'DE', zh: 'ZH' };
const ignore = new Set(['.git', 'vendor', 'node_modules', 'functions', 'supabase']);

if (!key) throw new Error('DEEPL_API_KEY is required. Keep it only in the deployment secret store.');

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    if (entry.isDirectory()) { if (!ignore.has(entry.name) && !Object.keys(locales).includes(entry.name)) output.push(...await walk(path.join(directory, entry.name))); }
    else if (entry.name.endsWith('.html') && !/(?:editor|login|business-|global-actionbar|offline|visitors)\.html$/i.test(entry.name)) output.push(path.join(directory, entry.name));
  }
  return output;
}

async function translate(text, target) {
  const response = await fetch('https://api.deepl.com/v2/translate', { method: 'POST', headers: { authorization: `DeepL-Auth-Key ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ text: [text], target_lang: target, tag_handling: 'html', preserve_formatting: true }) });
  if (!response.ok) throw new Error(`DeepL ${response.status}`);
  const data = await response.json();
  return data.translations?.[0]?.text || text;
}

for (const file of await walk(root)) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  const source = await fs.readFile(file, 'utf8');
  for (const [locale, target] of Object.entries(locales)) {
    let localized = await translate(source, target);
    localized = localized.replace(/<html([^>]*)\blang=["'][^"']+["']/i, `<html$1lang="${locale}"`);
    localized = localized.replace(/<link rel="canonical" href="https:\/\/www\.5terrego\.com\//i, `<link rel="canonical" href="https://www.5terrego.com/${locale}/`);
    const destination = path.join(root, locale, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, localized, 'utf8');
  }
}

console.log('Localized copies generated. Review editorial terminology before publishing.');
