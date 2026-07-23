import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const mapSource = await readFile(path.join(root, 'map.html'), 'utf8');
const match = mapSource.match(/var IMPORTANT_POI_DESCRIPTIONS = (\{[\s\S]*?\n  \});\n  function getPreferredPOIDescription/);

if (!match) {
  throw new Error('IMPORTANT_POI_DESCRIPTIONS not found in map.html');
}

const descriptions = vm.runInNewContext(`(${match[1]})`, Object.create(null));
const dataPath = path.join(root, 'data', 'pois-lite.json');
const pois = JSON.parse(await readFile(dataPath, 'utf8'));
let updated = 0;

for (const poi of pois) {
  const preferred = descriptions[String(poi.id)] || '';
  if (preferred && preferred.length > String(poi.description || '').trim().length) {
    poi.description = preferred;
    updated += 1;
  }
}

await writeFile(dataPath, `${JSON.stringify(pois, null, 2)}\n`, 'utf8');
console.log(`Synced ${updated} important POI descriptions.`);
