const CACHE_NAME = 'activiteitenweger-v16';
// Use relative paths so it works both locally and on GitHub Pages
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/data.js',
  './js/seed-data.js',
  './js/day-view.js',
  './js/week-view.js',
  './js/month-view.js',
  './js/stats.js',
  './js/excel-export.js',
  './js/chart-view.js',
  './js/sync.js',
  './js/app.js',
  './manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Network-first for everything: try network, fall back to cache
  e.respondWith(
    fetch(e.request).then(response => {
      // Update cache with fresh response
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      }
      return response;
    }).catch(() => caches.match(e.request))
  );
});
