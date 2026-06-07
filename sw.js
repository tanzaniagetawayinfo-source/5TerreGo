const VERSION = '5terrego-sw-v1';
const APP_SHELL = [
  './',
  './index.html',
  './app.png',
  './gohome.png',
  './church.png',
  './monument.png',
  './sentiero.png',
  './beach.png',
  './station.png',
  './fountan.png',
  './ferrystation.png',
  './viewpoint.png',
  './ferry.png',
  './mascotterelax.webm',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim())
  );
});

function isTileRequest(requestUrl) {
  return requestUrl.includes('/MapServer/tile/') || requestUrl.includes('basemaps.cartocdn.com');
}

function isAssetRequest(requestUrl) {
  return /app\.png|gohome\.png|church\.png|monument\.png|sentiero\.png|beach\.png|station\.png|fountan\.png|ferrystation\.png|viewpoint\.png|ferry\.png|mascotterelax\.webm/i.test(requestUrl);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(VERSION).then(cache => cache.put('./index.html', copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  if (isTileRequest(url.href) || isAssetRequest(url.href)) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(hit => {
        if (hit) return hit;
        return fetch(request)
          .then(response => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(VERSION).then(cache => cache.put(request, copy)).catch(() => {});
            }
            return response;
          })
          .catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.ok && url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(VERSION).then(cache => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }))
  );
});
