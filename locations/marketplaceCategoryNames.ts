// Pure, dependency-free mapping between the raw `categories.name` value
// stored in the database and the public/display category name used
// throughout the app and URLs (e.g. DB "Photographer" <-> display
// "Photographers"). Deliberately has no imports (mirrors locations/domain.ts)
// so it can be unit-tested directly with plain `node` -- see
// scripts/test-location-discovery-domain.mjs -- and reused by both the
// client (services/publicVendorListings.ts, which re-exports these) and the
// geo-hierarchy Taluka discovery RPC caller (services/geoLocations.ts).
const MARKETPLACE_CATEGORY_NAMES: Record<string, string> = {
  photographer: "Photographers",
  decorator: "Decorators",
  "makeup artist": "Makeup Artists",
  "mehendi artist": "Mehndi Artists",
  dj: "DJs",
  "wedding hall": "Venues",
  caterer: "Caterers",
  jewellery: "Jewellery & Accessories",
  "invitation cards": "Invites & Cards",
  pandit: "Pandits",
  choreographer: "Music & Dance",
  "live orchestra": "Live Orchestra & Band",
  orchestra: "Live Orchestra & Band",
  "orchestra and band": "Live Orchestra & Band",
  "wedding band": "Live Orchestra & Band",
  "wedding bands": "Live Orchestra & Band",
};

export function normalizeMarketplaceCategoryName(value: string) {
  const trimmed = value.trim();
  return MARKETPLACE_CATEGORY_NAMES[trimmed.toLowerCase()] ?? trimmed;
}

/**
 * Inverse of normalizeMarketplaceCategoryName: given a display category
 * (e.g. "Photographers"), returns every raw `categories.name` value in the
 * database that normalizes to it (e.g. ["photographer"]), plus the display
 * name itself as a fallback for categories that need no renaming. Used by
 * server-side queries (e.g. the Taluka discovery RPC) that filter on the
 * raw category column instead of re-deriving this mapping in SQL.
 */
export function databaseCategoryCandidates(displayCategory: string): string[] {
  const needle = displayCategory.trim().toLowerCase();
  const matches = Object.entries(MARKETPLACE_CATEGORY_NAMES)
    .filter(([, display]) => display.toLowerCase() === needle)
    .map(([dbName]) => dbName);
  return [...new Set([...matches, displayCategory.trim()])];
}
