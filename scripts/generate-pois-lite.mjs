import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = JSON.parse(await readFile(path.join(root, 'data', 'pois.json'), 'utf8'));
const rows = Array.isArray(source) ? source : (source.pois || source.data || []);
const lite = rows.map((row) => ({
  id: row.id,
  name: row.name,
  coords: row.coords,
  description: row.description || '',
  importance: row.importance || 0,
  type: row.type || '',
  discount: row.discount || 0,
  discount_info: row.discount_info || ''
}));

await writeFile(path.join(root, 'data', 'pois-lite.json'), JSON.stringify(lite), 'utf8');
console.log(`Generated ${lite.length} lightweight POIs.`);
