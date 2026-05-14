const CACHE_NAME = 'gis-pwa-v4';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icon.png',
  './js/app.js',
  './js/db.js',
  './js/format.js',
  './js/router.js',
  './js/store.js',
  './js/actions/drivers.js',
  './js/actions/kids.js',
  './js/actions/log-leg.js',
  './js/actions/top-up.js',
  './js/actions/history.js',
  './js/actions/monthly.js',
  './js/actions/sanity.js',
  'https://unpkg.com/dexie@4.0.8/dist/dexie.min.js',
  'https://unpkg.com/alpinejs@3.14.1/dist/cdn.min.js'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((res) => res || fetch(e.request)));
});
