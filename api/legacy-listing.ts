import type { IncomingMessage, ServerResponse } from "node:http";

type RequestWithQuery = IncomingMessage & { query?: Record<string, string | string[] | undefined> };

function queryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const canonicalCategorySlugs: Record<string, string> = {
  venue: "venues", "wedding-hall": "venues", caterer: "caterers", catering: "caterers",
  photographer: "photographers", photography: "photographers", decorator: "decorators", decor: "decorators",
  "makeup-artist": "makeup-artists", makeup: "makeup-artists", "mehndi-artist": "mehndi-artists",
  "mehendi-artist": "mehndi-artists", dj: "djs", "bridal-outfit": "bridal-wear", "groom-outfit": "groom-wear",
  jewellery: "jewellery-accessories", jewelry: "jewellery-accessories", pandit: "pandits",
  invites: "invites-cards", "pre-wedding-shoots": "pre-wedding-shoot", "music-and-dance": "music-dance",
};

/** Redirects old category-query URLs to the single readable public route. */
export default function handler(request: RequestWithQuery, response: ServerResponse) {
  const category = queryValue(request.query?.category);
  if (!category) {
    response.writeHead(301, { Location: "/Categories", "Cache-Control": "public, max-age=86400" });
    response.end();
    return;
  }
  const categorySlug = slugify(category);
  response.writeHead(301, { Location: `/wedding-${canonicalCategorySlugs[categorySlug] ?? categorySlug}`, "Cache-Control": "public, max-age=86400" });
  response.end();
}
