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

// Keep application data network-first. The worker intentionally does not
// cache authenticated Admin responses or Supabase requests.
self.addEventListener("fetch", () => undefined);
