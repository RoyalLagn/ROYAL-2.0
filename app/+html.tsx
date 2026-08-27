import React from "react";
import { ScrollViewStyleReset } from "expo-router/html";

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
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
