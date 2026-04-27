// Clear all caches and unregister - force fresh load every time
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
    .then(() => self.clients.claim())
  );
});
// No caching - always fetch fresh
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request));
});
