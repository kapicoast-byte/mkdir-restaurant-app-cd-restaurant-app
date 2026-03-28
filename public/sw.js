// RestaurantOS Service Worker
// Strategy: cache-first for app shell assets, network-only for Firebase API calls

const CACHE_NAME = 'restaurantos-v1';

// App shell files to pre-cache on install
const SHELL_URLS = [
  '/',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.svg',
  '/icon-512.svg',
];

// ── Install: pre-cache the app shell ───────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  // Take over immediately without waiting for old SW to be released
  self.skipWaiting();
});

// ── Activate: clean up old cache versions ─────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Claim clients so this SW controls pages without a reload
  self.clients.claim();
});

// ── Fetch: cache-first for navigation + static assets; skip Firebase ───────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Always go to network for Firebase (Auth, Firestore, Storage, Functions)
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('firebasestorage.googleapis.com') ||
    url.hostname.includes('googleapis.com')
  ) {
    return; // Let the browser handle it natively (no SW interception)
  }

  // For same-origin navigations (HTML pages), use network-first so deploys
  // are picked up quickly, falling back to cache for offline support.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // For all other same-origin requests (JS, CSS, images): cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(
        (cached) => cached || fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
      )
    );
  }
});
