import { supabase } from "@/services/supabase";
import {
  databaseCategoryCandidates,
  normalizeMarketplaceCategoryName,
  type PublicVendorListing,
} from "@/services/publicVendorListings";

// ============================================================================
// GPS-based "Near Me" vendor discovery. Independent of and additive to the
// PIN-driven State/District/Taluka tiered discovery in services/geoLocations.ts
// (which stays untouched) -- this calls the true point-to-point distance RPC
// public.get_nearby_vendors instead of a Taluka-tier query, so it needs its
// own thin client rather than reusing fetchTalukaVendorPageCards.
// ============================================================================

const NEARBY_PAGE_SIZE = 20;

export type NearbyVendorCard = {
  vendor: PublicVendorListing;
  distanceKm: number;
};

export type NearbyVendorPageResult = {
  cards: NearbyVendorCard[];
  nextOffset: number;
  hasMore: boolean;
};

export type LocationRankedVendorSort = "popular" | "rating" | "price";

export function formatDistanceLabel(distanceKm: number): string {
  if (!Number.isFinite(distanceKm)) return "";
  if (distanceKm < 1) return `${Math.max(Math.round(distanceKm * 1000), 0)} m away`;
  return `${distanceKm.toFixed(1)} km away`;
}

function mapNearbyRow(row: any): NearbyVendorCard {
  const startingPriceValue = Number(row.starting_price ?? 0);
  const distanceKm = Number(row.distance_km ?? 0);
  const vendor: PublicVendorListing = {
    id: row.vendor_id,
    name: row.business_name,
    slug: row.slug ?? "",
    category: normalizeMarketplaceCategoryName(row.category_name),
    rating: Number(row.average_rating ?? 0),
    reviews: Number(row.review_count ?? 0),
    priceLevel: "₹ ₹",
    location: [row.city, row.state].filter(Boolean).join(", "),
    distanceKm,
    address: "",
    tags: Array.isArray(row.tags) ? row.tags : [],
    services: Array.isArray(row.service_titles) ? row.service_titles : [],
    startingPrice: startingPriceValue ? `₹${startingPriceValue.toLocaleString("en-IN")}` : "Contact for price",
    startingPriceValue,
    image: row.logo_url || "",
    isTopRated: Boolean(row.is_featured),
    isFeatured: Boolean(row.is_featured),
    // Same rationale as mapCardRow in services/geoLocations.ts: availability
    // isn't rendered on the listing card, deliberately not fetched here to
    // keep this a single bounded query.
    isAvailable: false,
    availability: [],
    description: row.description || "",
    experience: null,
    contactPhone: "",
    contactEmail: "",
    website: "",
    instagram: "",
    facebook: "",
    portfolioImages: [],
    portfolioAlbums: [],
    heroMedia: [],
    primaryCityId: null,
    primaryAreaId: null,
    serviceLocations: [],
    managementStatus: "active",
    publicProfileEnabled: true,
    awards: [],
    languages: [],
    businessHours: null,
    faqs: [],
    membershipPlan: row.membership_plan ?? null,
  };
  return { vendor, distanceKm };
}

export type FetchNearbyVendorsInput = {
  latitude: number;
  longitude: number;
  /** Display category (e.g. "Photographers"). Omit/undefined for "all
   * categories near me". */
  categoryDisplayName?: string;
  search?: string;
  radiusKm?: number;
  minRating?: number;
  maxPrice?: number;
  limit?: number;
  offset?: number;
};

export async function fetchNearbyVendors(input: FetchNearbyVendorsInput): Promise<NearbyVendorPageResult> {
  const limit = input.limit ?? NEARBY_PAGE_SIZE;
  const offset = input.offset ?? 0;
  const categoryNames = input.categoryDisplayName
    ? databaseCategoryCandidates(input.categoryDisplayName)
    : null;
  const { data, error } = await supabase.rpc("get_nearby_vendors", {
    user_lat: input.latitude,
    user_lng: input.longitude,
    p_category_names: categoryNames,
    p_search: input.search?.trim() || null,
    p_radius_km: input.radiusKm ?? 10,
    p_min_rating: input.minRating ?? null,
    p_max_price: input.maxPrice ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  const cards = (data ?? []).map(mapNearbyRow);
  return {
    cards,
    nextOffset: offset + cards.length,
    hasMore: cards.length === limit,
  };
}

export type FetchLocationRankedVendorsInput = {
  latitude: number;
  longitude: number;
  categoryDisplayName?: string;
  search?: string;
  minRating?: number;
  maxPrice?: number;
  sort?: LocationRankedVendorSort;
  limit?: number;
  offset?: number;
};

/**
 * Full category discovery ranked around the customer's position. Unlike the
 * dedicated Near Me search, this never applies a distance cutoff: vendors in
 * the nearby bucket are ranked first, and pagination continues into the rest
 * of the marketplace.
 */
export async function fetchLocationRankedVendors(
  input: FetchLocationRankedVendorsInput,
): Promise<NearbyVendorPageResult> {
  const limit = input.limit ?? NEARBY_PAGE_SIZE;
  const offset = input.offset ?? 0;
  const { data, error } = await supabase.rpc("get_location_ranked_vendors", {
    user_lat: input.latitude,
    user_lng: input.longitude,
    p_category_names: input.categoryDisplayName
      ? databaseCategoryCandidates(input.categoryDisplayName)
      : null,
    p_search: input.search?.trim() || null,
    p_min_rating: input.minRating ?? null,
    p_max_price: input.maxPrice ?? null,
    p_sort: input.sort ?? "popular",
    p_nearby_threshold_km: LISTING_NEARBY_THRESHOLD_KM,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  const cards = (data ?? []).map(mapNearbyRow);
  return {
    cards,
    nextOffset: offset + cards.length,
    hasMore: cards.length === limit,
  };
}

/** The radius choices exposed in the "Near Me" UI, 10 km selected by
 * default per product requirements. */
export const NEARBY_RADIUS_OPTIONS_KM = [5, 10, 20, 50] as const;
export const DEFAULT_NEARBY_RADIUS_KM = 10;
export const LISTING_NEARBY_THRESHOLD_KM = 20;
