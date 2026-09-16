const LEGACY_ADMIN_CACHE_PREFIX = "royallagn-admin-";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(LEGACY_ADMIN_CACHE_PREFIX))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

// Keep authenticated and frequently changing marketplace data network-only.
// This handler satisfies installability checks without caching user data.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).catch(() => new Response("", {
      status: 503,
      statusText: "Temporarily unavailable",
    })),
  );
});
