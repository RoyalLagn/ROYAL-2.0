const CACHE_VERSION = "royallagn-admin-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith("royallagn-admin-") && key !== CACHE_VERSION)
        .map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

// A functional fetch handler is required by browsers that still include a
// controlling service worker in their installability checks. Responses stay
// network-only: authenticated Admin data is never written to Cache Storage.
self.addEventListener("fetch", (event) => {
  if (event.request.method === "GET") {
    event.respondWith(fetch(event.request));
  }
});
