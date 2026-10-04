/* Parejo · service worker: que la app abra rápido y funcione sin conexión. */
const VERSION = 'parejo-v1';
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Datos (Supabase, Mercado Pago) y funciones del servidor: siempre a la red.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Páginas: primero la red (para tener la última versión), si no hay conexión, la app guardada.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // JS, CSS e imágenes con hash en el nombre: nunca cambian, se sirven desde la caché.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && (url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/'))) {
            const copy = response.clone();
            caches.open(STATIC).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
