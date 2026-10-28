const CACHE_NAME = 'gta-radio-shell-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only cache GET requests for static app shell; audio streams are handled via IndexedDB
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.endsWith('.mp3') || url.pathname.endsWith('.aac') || url.pathname.endsWith('.m4a')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache same-origin valid responses (e.g. hashed Vite /assets/ JS/CSS files)
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      }).catch((error) => {
        // If network fails (e.g. offline vehicle commute), fallback to cached index.html for page navigation
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        throw error;
      });
    })
  );
});
