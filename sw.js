// Bump SW_VERSION alongside the ?v= cache-busting number in index.html.
// A version bump wipes the old cache entirely on activate, guaranteeing
// everyone gets the fresh files instead of a stale offline copy.
const SW_VERSION = 'v61';
const CACHE_NAME = `subnetcraft-${SW_VERSION}`;

const CORE_ASSETS = [
  './',
  'index.html',
  'style.css',
  'manifest.json',
  'js/i18n.js',
  'js/lang-en.js',
  'js/modes.js',
  'js/bitbar.js',
  'js/ip-utils.js',
  'js/ipv6-utils.js',
  'js/calculator.js',
  'js/ipv6.js',
  'js/tools.js',
  'js/planner.js',
  'js/subnet-splitter.js',
  'js/splitter-image.js',
  'js/main.js',
  'assets/logo-header.png',
  'assets/favicon-32.png',
  'assets/favicon-64.png',
  'assets/apple-touch-icon.png',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/fonts/space-grotesk-latin.woff2',
  'assets/fonts/jetbrains-mono-latin.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  // Page navigations: try the network first (so returning visitors get the
  // latest version while online), fall back to the cached shell offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('index.html'))
        .then((res) => res || caches.match('index.html')),
    );
    return;
  }

  // Everything else (scripts, styles, fonts, images): serve from cache
  // instantly when available, and refresh that cache entry in the
  // background so the next load picks up any change.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    }),
  );
});
