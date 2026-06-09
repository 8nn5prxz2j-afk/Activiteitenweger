const CACHE_NAME = 'activiteitenweger-v21';
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
  // CDN-scripts mee-cachen zodat Grafiek, Sync en Export ook offline werken
  'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.min.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3.1.0/dist/chartjs-plugin-annotation.min.js',
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
  // Network-first met geforceerde revalidatie: zo verschijnen updates direct
  // (anders serveert de HTTP-cache tot 10 min oude bestanden); valt offline terug op de cache
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(response => {
      // Update cache with fresh response
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      }
      return response;
    }).catch(() => caches.match(e.request))
  );
});
