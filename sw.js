const CACHE_NAME = 'gis-pwa-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icon.png'
];

// Install event - caching assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching all assets');
      return cache.addAll(ASSETS);
    })
  );
});

// Activate event - cleaning old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// Fetch event - serving from cache
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => {
      return res || fetch(e.request);
    })
  );
});
