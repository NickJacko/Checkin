/**
 * sw.js – Service Worker für LearnHub
 * Strategie:
 *   • Statische Assets → Cache First (sofort offline verfügbar)
 *   • Firebase / externe URLs → Network First (frische Daten bevorzugt)
 *   • Offline-Fallback → index.html
 */

const CACHE_NAME  = 'learnhub-v1';
const CACHE_URLS  = [
  '/',
  '/index.html',
  '/typemaster.html',
  '/chess.html',
  '/style.css',
  '/app.js',
  '/chess.js',
  '/hub.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap',
];

/* ── INSTALL: Cache alle statischen Assets ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      /* Einzeln cachen damit ein Fehler nicht alles blockiert */
      return Promise.allSettled(CACHE_URLS.map(url =>
        cache.add(url).catch(() => {})
      ));
    }).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: Alte Caches löschen ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: Requests abfangen ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* Firebase & externe APIs → immer Network, kein Cache */
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('lichess.org') ||
    url.hostname.includes('gstatic.com')
  ) {
    event.respondWith(
      fetch(request).catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  /* Navigationsanfragen → Network First mit Cache-Fallback */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request).then(cached => cached || caches.match('/index.html'))
        )
    );
    return;
  }

  /* Statische Assets → Cache First mit Network-Update im Hintergrund */
  event.respondWith(
    caches.match(request).then(cached => {
      const networkFetch = fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return response;
        })
        .catch(() => null);

      return cached || networkFetch;
    })
  );
});

/* ── MESSAGE: Cache manuell leeren (für Updates) ── */
self.addEventListener('message', event => {
  if (event.data === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.source?.postMessage('CACHE_CLEARED');
    });
  }
});
