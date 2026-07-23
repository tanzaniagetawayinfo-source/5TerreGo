import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const mapSource = await readFile(path.join(root, 'map.html'), 'utf8');
const url = mapSource.match(/var SUPABASE_URL = '([^']+)'/)?.[1];
const key = mapSource.match(/var SUPABASE_ANON_KEY = '([^']+)'/)?.[1];

if (!url || !key) {
  throw new Error('Supabase public connection not found in map.html');
}

const endpoint = `${url}/rest/v1/blog_posts?select=id,title,slug,excerpt,cover_image,category,status,published_at,created_at,related_pois&status=eq.published&order=published_at.desc.nullslast,created_at.desc`;
const response = await fetch(endpoint, {
  headers: { apikey:key, Authorization:`Bearer ${key}` }
});

if (!response.ok) {
  throw new Error(`Stories request failed: ${response.status} ${await response.text()}`);
}

const stories = (await response.json()).map((story) => ({
  id: story.id,
  title: String(story.title || '').trim(),
  slug: String(story.slug || '').trim(),
  excerpt: String(story.excerpt || '').replace(/\s+/g, ' ').trim().slice(0, 420),
  cover_image: /^https:\/\//i.test(String(story.cover_image || '').trim()) ? String(story.cover_image).trim() : '',
  category: String(story.category || '').trim(),
  status: 'published',
  published_at: story.published_at || null,
  created_at: story.created_at || null,
  related_pois: Array.isArray(story.related_pois) ? story.related_pois : []
})).filter((story) => story.title && story.slug);

await writeFile(path.join(root, 'data', 'stories-lite.json'), `${JSON.stringify(stories, null, 2)}\n`, 'utf8');
console.log(`Generated ${stories.length} lightweight Story summaries.`);
