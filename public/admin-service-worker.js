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
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Metro's development asset endpoint is intentionally dynamic. Let the
  // browser fetch it directly; wrapping it in respondWith() turns an ordinary
  // dev-server restart into an unhandled FetchEvent rejection.
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return;
  event.respondWith(fetch(event.request).catch(() => new Response("", {
    status: 503,
    statusText: "Temporarily unavailable",
  })));
});
