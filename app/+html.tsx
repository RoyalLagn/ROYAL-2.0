import React from "react";
import { ScrollViewStyleReset } from "expo-router/html";

const LOCAL_SERVICE_WORKER_CLEANUP = `
(() => {
  if (!(location.hostname === "localhost" || location.hostname === "127.0.0.1")) return;
  if (!("serviceWorker" in navigator)) return;
  Promise.all([
    navigator.serviceWorker.getRegistrations().then((items) => Promise.all(items.map((item) => item.unregister()))),
    "caches" in window ? caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("royallagn-admin-")).map((key) => caches.delete(key)))) : Promise.resolve(),
  ]).then(() => {
    if (!navigator.serviceWorker.controller) {
      sessionStorage.removeItem("royallagn-sw-cleanup-reload");
      return;
    }
    if (sessionStorage.getItem("royallagn-sw-cleanup-reload") === "1") return;
    sessionStorage.setItem("royallagn-sw-cleanup-reload", "1");
    location.reload();
  }).catch(() => undefined);
})();`;

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <meta name="description" content="Discover trusted wedding vendors, venues, photographers and more with RoyalLagn." />
        <meta name="robots" content="index, follow, max-image-preview:large" />
        <meta property="og:site_name" content="RoyalLagn" />
        <script dangerouslySetInnerHTML={{ __html: LOCAL_SERVICE_WORKER_CLEANUP }} />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
