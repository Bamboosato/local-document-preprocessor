const CACHE_NAME = 'ldp-static-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/ldp_icon.png',
  '/ldp_icon-192.png',
  '/ldp_icon-512.png',
];

function isStaticAsset(url) {
  return (
    url.search === '' &&
    (url.pathname === '/' ||
      url.pathname === '/index.html' ||
      url.pathname === '/manifest.webmanifest' ||
      /^\/assets\/[^/]+$/.test(url.pathname) ||
      /^\/ldp_icon(?:-\d+)?\.png$/.test(url.pathname))
  );
}

function isAppDocument(url) {
  return url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/manifest.webmanifest';
}

function cacheNetworkResponse(request, response) {
  if (response.ok) {
    void caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
  }
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith('ldp-static-') && cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !isStaticAsset(url)) return;

  event.respondWith(
    isAppDocument(url)
      ? fetch(request)
          .then((networkResponse) => cacheNetworkResponse(request, networkResponse))
          .catch(() => caches.match(request))
      : caches.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return fetch(request).then((networkResponse) =>
            cacheNetworkResponse(request, networkResponse),
          );
        }),
  );
});
