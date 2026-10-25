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
        <title>RoyalLagn</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <meta name="description" content="Discover trusted wedding photographers, venues, decorators, makeup artists and more with RoyalLagn. Explore verified wedding vendors and send enquiries directly." />
        <meta name="robots" content="index, follow, max-image-preview:large" />
        <link rel="canonical" href="https://royallagn.com/" />
        <meta property="og:site_name" content="RoyalLagn" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="RoyalLagn | Discover Trusted Wedding Vendors" />
        <meta property="og:description" content="Discover trusted wedding photographers, venues, decorators, makeup artists and more with RoyalLagn. Explore verified wedding vendors and send enquiries directly." />
        <meta property="og:url" content="https://royallagn.com/" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="RoyalLagn | Discover Trusted Wedding Vendors" />
        <meta name="twitter:description" content="Discover trusted wedding photographers, venues, decorators, makeup artists and more with RoyalLagn. Explore verified wedding vendors and send enquiries directly." />
        <script dangerouslySetInnerHTML={{ __html: LOCAL_SERVICE_WORKER_CLEANUP }} />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
