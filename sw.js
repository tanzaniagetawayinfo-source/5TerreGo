const VERSION = '5terrego-sw-v5';
const STATIC_CACHE = `${VERSION}-static`;
const TILE_CACHE = `${VERSION}-tiles`;
const CORE_ASSETS = [
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './vendor/leaflet.css',
  './vendor/leaflet.js',
  './vendor/supabase.js',
  './data/pois-lite.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => Promise.allSettled(CORE_ASSETS.map(asset => cache.add(asset))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  const currentCaches = new Set([STATIC_CACHE, TILE_CACHE]);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => !currentCaches.has(key)).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isMapTile(url) {
  return url.includes('/MapServer/tile/') || url.includes('basemaps.cartocdn.com');
}

function isStaticAsset(request, url) {
  return url.origin === self.location.origin &&
    ['style', 'script', 'image', 'font'].includes(request.destination);
}

function isSensitivePath(pathname) {
  return /\/(?:login|partner|visitors|blogeditor|poieditor|trakeditor)\.html$/i.test(pathname);
}

async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map(key => cache.delete(key)));
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return (await caches.match(request, { ignoreSearch: true })) ||
      (await caches.match('./offline.html')) ||
      new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function networkFirstAsset(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok && response.type === 'basic') {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return (await caches.match(request)) ||
      new Response('', { status: 504, statusText: 'Asset unavailable offline' });
  }
}

async function cacheFirstTile(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(TILE_CACHE);
      await cache.put(request, response.clone());
      trimCache(TILE_CACHE, 120).catch(() => {});
    }
    return response;
  } catch (error) {
    return new Response('', { status: 504, statusText: 'Map tile unavailable offline' });
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const update = fetch(request).then(async response => {
    if (response && response.ok && response.type === 'basic') {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);
  return cached || (await update) || new Response('', { status: 504, statusText: 'Asset unavailable offline' });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    if (isSensitivePath(url.pathname)) return;
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isMapTile(url.href)) {
    event.respondWith(cacheFirstTile(request));
    return;
  }

  if (url.origin === self.location.origin && /\/site-analytics\.js$/i.test(url.pathname)) {
    event.respondWith(networkFirstAsset(request));
    return;
  }

  if (isStaticAsset(request, url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
