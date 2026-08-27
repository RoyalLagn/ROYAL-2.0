import { findMarketplaceCategory } from "@/data/marketplaceCategories";

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** A stable, human-readable path for public category discovery pages. */
export function buildVendorListingPath(category: string, location?: string | null) {
  const resolvedCategory = findMarketplaceCategory(category);
  const categorySlug = `wedding-${resolvedCategory?.slug ?? slugify(category)}`;
  const locationSlug = location ? slugify(location) : "";
  return locationSlug ? `/${categorySlug}/${locationSlug}` : `/${categorySlug}`;
}

/** The canonical public profile URL uses the vendor's durable business slug. */
export function buildVendorProfilePathBySlug(slug: string) {
  return `/vendor/${encodeURIComponent(slug.trim())}`;
}

export function displayLocationFromSlug(slug?: string | null) {
  if (!slug || slug === "india") return "";
  return slug.replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
