import { supabase } from "@/services/supabase";
import {
  databaseCategoryCandidates,
  normalizeMarketplaceCategoryName,
  type PublicVendorListing,
} from "@/services/publicVendorListings";

// ============================================================================
// "Search by Location": PIN -> multi-locality vendor discovery. Independent
// of and additive to both the GPS-based services/vendorDiscovery.ts
// (get_nearby_vendors) and the Taluka-tiered services/geoLocations.ts
// (get_public_vendor_taluka_page_cards) -- neither of those is touched.
//
// This is locality-MEMBERSHIP based, not distance based: no coordinates are
// read or required anywhere in this file. A vendor appears in results if
// and only if their vendors.geo_pincode_locality_id is one of the
// localities being searched (all localities for the PIN by default, or a
// caller-selected subset).
// ============================================================================

const PINCODE_PAGE_SIZE = 20;

export type PincodeVendorCard = {
  vendor: PublicVendorListing;
  localityId: string;
  localityName: string;
};

export type PincodeVendorPageResult = {
  cards: PincodeVendorCard[];
  nextOffset: number;
  hasMore: boolean;
};

function mapPincodeRow(row: any): PincodeVendorCard {
  const startingPriceValue = Number(row.starting_price ?? 0);
  const locationLabel = [row.locality_name, row.district_name].filter(Boolean).join(", ");
  const vendor: PublicVendorListing = {
    id: row.vendor_id,
    name: row.business_name,
    slug: row.slug ?? "",
    category: normalizeMarketplaceCategoryName(row.category_name),
    rating: Number(row.average_rating ?? 0),
    reviews: Number(row.review_count ?? 0),
    priceLevel: "₹ ₹",
    location: locationLabel || row.state_name || "",
    address: "",
    tags: Array.isArray(row.tags) ? row.tags : [],
    services: Array.isArray(row.service_titles) ? row.service_titles : [],
    startingPrice: startingPriceValue ? `₹${startingPriceValue.toLocaleString("en-IN")}` : "Contact for price",
    startingPriceValue,
    image: row.logo_url || "",
    isTopRated: Boolean(row.is_featured),
    isFeatured: Boolean(row.is_featured),
    // Same rationale as the other card-mapping services: availability isn't
    // rendered on the listing card, deliberately not fetched here to keep
    // this a single bounded query.
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
  return { vendor, localityId: row.locality_id, localityName: row.locality_name };
}

export type FetchPincodeVendorsInput = {
  pincode: string;
  /** Display category (e.g. "Photographers"). Omit/undefined for "all
   * categories" in this PIN. */
  categoryDisplayName?: string;
  /** Omit/undefined (or empty array) to search every active locality for
   * this PIN -- the "All Locations" default. Provide one or more locality
   * ids to narrow to specific localities (OR semantics). */
  localityIds?: string[];
  minRating?: number;
  maxPrice?: number;
  limit?: number;
  offset?: number;
};

export async function fetchPincodeVendors(input: FetchPincodeVendorsInput): Promise<PincodeVendorPageResult> {
  const limit = input.limit ?? PINCODE_PAGE_SIZE;
  const offset = input.offset ?? 0;
  const categoryNames = input.categoryDisplayName
    ? databaseCategoryCandidates(input.categoryDisplayName)
    : null;
  const { data, error } = await supabase.rpc("get_public_vendor_pincode_locality_page_cards", {
    p_pincode: input.pincode,
    p_category_names: categoryNames,
    p_locality_ids: input.localityIds?.length ? input.localityIds : null,
    p_min_rating: input.minRating ?? null,
    p_max_price: input.maxPrice ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  const cards = (data ?? []).map(mapPincodeRow);
  return {
    cards,
    nextOffset: offset + cards.length,
    hasMore: cards.length === limit,
  };
}
