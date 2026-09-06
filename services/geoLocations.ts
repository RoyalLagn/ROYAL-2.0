import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/services/supabase";
import type {
  GeoDistrict,
  GeoSelection,
  GeoState,
  GeoTaluka,
  ValidatedGeoSelection,
} from "@/locations/types";
import { normalizeMarketplaceCategoryName, type PublicVendorListing } from "@/services/publicVendorListings";

// ============================================================================
// Client for the generic State -> District -> Taluka discovery hierarchy.
// Mirrors the caching/shape conventions of services/locations.ts (the
// existing City/Area client) but is fully independent of it.
// ============================================================================

const GUEST_GEO_PREFERENCE_KEY = "royallagn:guest-geo-preference:v1";

let statesCache: GeoState[] | null = null;
let statesRequest: Promise<GeoState[]> | null = null;
let districtsCache: Map<string, GeoDistrict[]> | null = null;
let talukasCache: Map<string, GeoTaluka[]> | null = null;

function mapState(row: any): GeoState {
  return { id: row.id, name: row.name, code: row.code, isActive: Boolean(row.is_active) };
}
function mapDistrict(row: any): GeoDistrict {
  return { id: row.id, stateId: row.state_id, name: row.name, isActive: Boolean(row.is_active) };
}
function mapTaluka(row: any): GeoTaluka {
  return {
    id: row.id,
    districtId: row.district_id,
    name: row.name,
    isActive: Boolean(row.is_active),
    acceptingApplications: Boolean(row.accept_vendor_applications ?? row.is_active),
  };
}

export function invalidateGeoCache() {
  statesCache = null;
  statesRequest = null;
  districtsCache = null;
  talukasCache = null;
}

export async function listActiveGeoStates(): Promise<GeoState[]> {
  if (statesCache) return statesCache;
  if (statesRequest) return statesRequest;
  const request = (async () => {
    const { data, error } = await supabase
      .from("geo_states")
      .select("id,name,code,is_active")
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    const result = (data ?? []).map(mapState);
    statesCache = result;
    return result;
  })();
  statesRequest = request;
  try {
    return await request;
  } finally {
    if (statesRequest === request) statesRequest = null;
  }
}

export async function listActiveGeoDistricts(stateId: string): Promise<GeoDistrict[]> {
  if (districtsCache?.has(stateId)) return districtsCache.get(stateId)!;
  const { data, error } = await supabase
    .from("geo_districts")
    .select("id,state_id,name,is_active")
    .eq("state_id", stateId)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  const result = (data ?? []).map(mapDistrict);
  districtsCache ??= new Map();
  districtsCache.set(stateId, result);
  return result;
}

export async function listActiveGeoTalukas(districtId: string): Promise<GeoTaluka[]> {
  if (talukasCache?.has(districtId)) return talukasCache.get(districtId)!;
  const { data, error } = await supabase
    .from("geo_talukas")
    .select("id,district_id,name,is_active,accept_vendor_applications")
    .eq("district_id", districtId)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  const result = (data ?? []).map(mapTaluka);
  talukasCache ??= new Map();
  talukasCache.set(districtId, result);
  return result;
}

export async function loadGuestGeoPreference(): Promise<GeoSelection | null> {
  const stored = await AsyncStorage.getItem(GUEST_GEO_PREFERENCE_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    // A preference saved before stateId existed on this type is no longer
    // trustworthy on its own (P1-4) -- treat it as absent rather than
    // guessing which State it belonged to. validateGeoSelection() below is
    // still the authority on whether *any* restored selection is usable.
    return typeof parsed?.stateId === "string"
      && typeof parsed?.districtId === "string"
      && typeof parsed?.talukaId === "string"
      ? { stateId: parsed.stateId, districtId: parsed.districtId, talukaId: parsed.talukaId }
      : null;
  } catch {
    return null;
  }
}

export async function saveGuestGeoPreference(selection: GeoSelection) {
  await AsyncStorage.setItem(GUEST_GEO_PREFERENCE_KEY, JSON.stringify(selection));
}

export async function clearGuestGeoPreference() {
  await AsyncStorage.removeItem(GUEST_GEO_PREFERENCE_KEY);
}

/**
 * Validates a (possibly stale/persisted) selection against the *current*
 * active hierarchy in a single bounded, indexed query -- never loads the
 * full State/District/Taluka tree just to check one selection. Returns
 * null if the State, District or Taluka no longer exists, is inactive, or
 * the chain doesn't actually nest the way the selection claims (e.g. a
 * Taluka that has since been moved to a different District). Callers
 * should clear the selection and prompt a fresh one when this returns null
 * (P1-4: "If a saved location is disabled or deleted, clear it safely and
 * request a new selection").
 */
export async function validateGeoSelection(
  selection: GeoSelection,
): Promise<ValidatedGeoSelection | null> {
  if (!selection.talukaId) return null;
  const { data, error } = await supabase
    .from("geo_talukas")
    .select("id,name,is_active,geo_districts!inner(id,name,is_active,state_id,geo_states!inner(id,name,is_active))")
    .eq("id", selection.talukaId)
    .eq("district_id", selection.districtId)
    .eq("is_active", true)
    .eq("geo_districts.is_active", true)
    .eq("geo_districts.state_id", selection.stateId)
    .eq("geo_districts.geo_states.is_active", true)
    .maybeSingle();
  if (error || !data) return null;
  const district = Array.isArray(data.geo_districts) ? data.geo_districts[0] : data.geo_districts;
  const state = district ? (Array.isArray(district.geo_states) ? district.geo_states[0] : district.geo_states) : null;
  if (!district || !state) return null;
  return {
    stateId: state.id,
    stateName: state.name,
    districtId: district.id,
    districtName: district.name,
    talukaId: data.id,
    talukaName: data.name,
  };
}

/**
 * Applies a vendor's already-verified PIN code to the geo hierarchy. Reads
 * from the geo_pincodes cache populated by the lookup-india-pincode Edge
 * Function; never guesses a Taluka when the cache is empty or ambiguous.
 * Kept for Admin/standalone retries -- the normal vendor "save my location"
 * path no longer calls this separately (see replaceVendorServiceLocations
 * in services/locations.ts, which now resolves geo atomically in the same
 * transaction as the legacy location save).
 */
export async function applyVendorGeoPincode(vendorId: string, pincode: string) {
  const { data, error } = await supabase.rpc("apply_vendor_geo_pincode", {
    target_vendor_id: vendorId,
    target_pincode: pincode,
  });
  if (error) throw error;
  return data;
}

export type VendorGeoStatus = {
  status: "resolved" | "needs_review" | "unresolved";
  reviewReason: string | null;
  talukaId: string | null;
};

/**
 * Fresh, non-cached read of a vendor's current geo resolution outcome.
 * Used right after a location save to build an accurate message -- reading
 * the local hook state instead would risk showing a stale pre-save status,
 * since the hook's own refresh() is an async state update, not something
 * this call can await the result of.
 */
export async function getVendorGeoStatus(vendorId: string): Promise<VendorGeoStatus | null> {
  const { data, error } = await supabase
    .from("vendors")
    .select("geo_resolution_status,geo_review_reason,geo_taluka_id")
    .eq("id", vendorId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    status: (data.geo_resolution_status as VendorGeoStatus["status"]) ?? "unresolved",
    reviewReason: data.geo_review_reason ?? null,
    talukaId: data.geo_taluka_id ?? null,
  };
}

/** Admin-triggered re-resolution of a vendor's existing PIN against the
 * current geo_pincodes cache (e.g. after an Admin corrects/re-imports
 * data). Does not require the PIN value client-side. */
export async function adminRetryVendorGeoResolution(vendorId: string) {
  const { data, error } = await supabase.rpc("admin_retry_vendor_geo_resolution", {
    target_vendor_id: vendorId,
  });
  if (error) throw error;
  return data;
}

/** Admin correction for the vendor's selected PIN locality. The database
 * promotes that locality to admin-verified and re-resolves the vendor in the
 * same transaction, so discovery never sees a corrected locality paired with
 * a stale Taluka. */
export async function adminConfirmVendorPincodeLocality(vendorId: string, talukaId: string) {
  const { data, error } = await supabase.rpc("admin_confirm_vendor_pincode_locality", {
    target_vendor_id: vendorId,
    target_taluka_id: talukaId,
  });
  if (error) throw error;
  return data;
}

// ----------------------------------------------------------------------------
// Public vendor discovery: tiered (selected Taluka first, then automatically
// generated nearby Talukas), paginated, with full ready-to-render card data
// returned in a single bounded query (P2-1) -- no separate per-vendor
// membership/review RPC calls, and no client-side download of the full
// marketplace. Search/rating/price/sort are applied server-side over the
// complete eligible dataset before pagination (P2-2), so a filtered page
// can never look falsely empty.
// ----------------------------------------------------------------------------
const TALUKA_PAGE_SIZE = 20;

export type TalukaSortMode = "popular" | "rating" | "price";

/** Keyset cursor for the default ("popular") sort -- see the SQL function's
 * doc comment for why explicit rating/price sorts use plain offset instead. */
export type TalukaPageCursor = {
  tier: number;
  featuredRank: number;
  negReviewCount: number;
  negRating: number;
  negUpdatedAt: number;
  vendorId: string;
};

export type TieredVendorCard = {
  vendor: PublicVendorListing;
  tier: number;
  distanceKm: number;
  talukaId: string;
  talukaName: string;
  districtName: string;
  stateName: string;
  cursor: TalukaPageCursor;
};

export type TieredVendorPageResult = {
  cards: TieredVendorCard[];
  nextCursor: TalukaPageCursor | null;
  nextOffset: number;
};

function mapCardRow(row: any): TieredVendorCard {
  const startingPriceValue = Number(row.starting_price ?? 0);
  const vendor: PublicVendorListing = {
    id: row.vendor_id,
    name: row.business_name,
    slug: row.slug ?? "",
    category: normalizeMarketplaceCategoryName(row.category_name),
    rating: Number(row.average_rating ?? 0),
    reviews: Number(row.review_count ?? 0),
    priceLevel: "₹ ₹",
    location: `${row.taluka_name}, ${row.district_name}`,
    distanceKm: Number(row.distance_km ?? 0),
    address: "",
    tags: Array.isArray(row.tags) ? row.tags : [],
    services: Array.isArray(row.service_titles) ? row.service_titles : [],
    startingPrice: startingPriceValue ? `₹${startingPriceValue.toLocaleString("en-IN")}` : "Contact for price",
    startingPriceValue,
    image: row.logo_url || "",
    isTopRated: Boolean(row.is_featured),
    isFeatured: Boolean(row.is_featured),
    // Availability isn't rendered on the listing card (only on the detail
    // profile, loaded separately) -- deliberately not fetched here to keep
    // this a single bounded query. See "Keep vendor profile detail loading
    // separate from card/listing loading" (P2-1).
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
  return {
    vendor,
    tier: Number(row.tier ?? 0),
    distanceKm: Number(row.distance_km ?? 0),
    talukaId: row.taluka_id,
    talukaName: row.taluka_name,
    districtName: row.district_name,
    stateName: row.state_name,
    cursor: {
      tier: Number(row.tier ?? 0),
      featuredRank: Number(row.featured_rank ?? 1),
      negReviewCount: Number(row.neg_review_count ?? 0),
      negRating: Number(row.neg_rating ?? 0),
      negUpdatedAt: Number(row.neg_updated_at ?? 0),
      vendorId: row.vendor_id,
    },
  };
}

export async function fetchTalukaVendorPageCards(input: {
  /** Every raw categories.name value that maps to the selected display
   * category -- see databaseCategoryCandidates() in
   * services/publicVendorListings.ts. */
  categoryNames: string[];
  talukaId: string;
  search?: string;
  minRating?: number;
  maxPrice?: number;
  sort?: TalukaSortMode;
  limit?: number;
  /** Offset pagination, only used for explicit rating/price sorts. */
  offset?: number;
  /** Keyset pagination cursor, used for the default "popular" sort. */
  after?: TalukaPageCursor | null;
}): Promise<TieredVendorPageResult> {
  const limit = input.limit ?? TALUKA_PAGE_SIZE;
  const sort = input.sort ?? "popular";
  const { data, error } = await supabase.rpc("get_public_vendor_taluka_page_cards", {
    p_category_names: input.categoryNames,
    p_taluka_id: input.talukaId,
    p_search: input.search?.trim() || null,
    p_min_rating: input.minRating ?? null,
    p_max_price: input.maxPrice ?? null,
    p_sort: sort,
    p_limit: limit,
    p_offset: input.offset ?? 0,
    p_after_tier: sort === "popular" ? input.after?.tier ?? null : null,
    p_after_featured_rank: sort === "popular" ? input.after?.featuredRank ?? null : null,
    p_after_neg_review_count: sort === "popular" ? input.after?.negReviewCount ?? null : null,
    p_after_neg_rating: sort === "popular" ? input.after?.negRating ?? null : null,
    p_after_neg_updated_at: sort === "popular" ? input.after?.negUpdatedAt ?? null : null,
    p_after_vendor_id: sort === "popular" ? input.after?.vendorId ?? null : null,
  });
  if (error) throw error;
  const cards = (data ?? []).map(mapCardRow);
  return {
    cards,
    nextCursor: cards.length ? cards[cards.length - 1].cursor : null,
    nextOffset: (input.offset ?? 0) + cards.length,
  };
}

// ----------------------------------------------------------------------------
// Admin tools
// ----------------------------------------------------------------------------
export async function listAdminGeoStates(): Promise<GeoState[]> {
  const { data, error } = await supabase
    .from("geo_states").select("id,name,code,is_active").order("name");
  if (error) throw error;
  return (data ?? []).map(mapState);
}

export async function listAdminGeoDistricts(stateId: string): Promise<GeoDistrict[]> {
  const { data, error } = await supabase
    .from("geo_districts").select("id,state_id,name,is_active").eq("state_id", stateId).order("name");
  if (error) throw error;
  return (data ?? []).map(mapDistrict);
}

export async function listAdminGeoTalukas(districtId: string): Promise<GeoTaluka[]> {
  const { data, error } = await supabase
    .from("geo_talukas")
    .select("id,district_id,name,is_active,accept_vendor_applications")
    .eq("district_id", districtId)
    .order("name");
  if (error) throw error;
  return (data ?? []).map(mapTaluka);
}

export type AdminTalukaPincode = {
  pincode: string;
  localities: string[];
  trusted: boolean;
};

/** Admin-only reverse lookup for the canonical hierarchy. The PIN/locality
 * rows already power vendor resolution, so this deliberately does not read
 * the legacy supported_cities/supported_areas tables. */
export async function listAdminTalukaPincodes(talukaId: string): Promise<AdminTalukaPincode[]> {
  const { data, error } = await supabase
    .from("geo_pincode_localities")
    .select("pincode,locality_name,is_trusted,is_active")
    .eq("taluka_id", talukaId)
    .eq("is_active", true)
    .order("pincode")
    .order("locality_name");
  if (error) throw error;

  const grouped = new Map<string, AdminTalukaPincode>();
  for (const row of data ?? []) {
    const existing: AdminTalukaPincode = grouped.get(row.pincode) ?? {
      pincode: row.pincode,
      localities: [],
      trusted: true,
    };
    if (!existing.localities.includes(row.locality_name)) existing.localities.push(row.locality_name);
    existing.trusted = existing.trusted && Boolean(row.is_trusted);
    grouped.set(row.pincode, existing);
  }
  return [...grouped.values()];
}

/** Toggles whether this Taluka accepts NEW vendor applications. This never
 * touches is_active (public marketplace visibility for already-approved
 * vendors) -- there is deliberately no is_active setter here for
 * States/Districts/Talukas; /AdminGeoLocations only ever manages
 * accept_vendor_applications, so an already-approved vendor in this Taluka
 * stays publicly discoverable even while new applications are paused. Used
 * by the /AdminGeoLocations Taluka switches;
 * updating one Taluka's row can never affect another Taluka, District or
 * State since it's a single-row `eq("id", id)` update. */
export async function setGeoTalukaAcceptingApplications(id: string, accepting: boolean) {
  const { error } = await supabase.from("geo_talukas").update({ accept_vendor_applications: accepting }).eq("id", id);
  if (error) throw error;
  invalidateGeoCache();
}

/** Bulk on/off for every Taluka in one District, in a single atomic
 * `update ... where district_id = X` -- one round trip, and scoped strictly
 * to that District's own Talukas so it can never touch a sibling District
 * or State. Used by the "toggle all" switch next to the Taluka list header. */
export async function setDistrictTalukasAcceptingApplications(districtId: string, accepting: boolean) {
  const { error } = await supabase.from("geo_talukas").update({ accept_vendor_applications: accepting }).eq("district_id", districtId);
  if (error) throw error;
  invalidateGeoCache();
}

export async function adminConfirmGeoPincode(pincode: string, talukaId: string) {
  const { data, error } = await supabase.rpc("admin_confirm_geo_pincode", {
    target_pincode: pincode,
    target_taluka_id: talukaId,
  });
  if (error) throw error;
  invalidateGeoCache();
  return data;
}

export type PincodeLocalityCandidate = {
  id: string;
  name: string;
  talukaId: string | null;
  talukaName: string | null;
  trusted: boolean;
};

/** Every individual post office/locality row on record for one PIN,
 * regardless of which Taluka (if any) each one currently resolves to.
 * Admin-only read (RLS: geo_pincode_localities_admin_all) -- used to resolve
 * a genuinely multi-Taluka PIN one locality at a time, after the bulk
 * admin_confirm_geo_pincode action refuses it as conflicting. */
export async function listPincodeLocalityCandidates(pincode: string): Promise<PincodeLocalityCandidate[]> {
  const { data, error } = await supabase
    .from("geo_pincode_localities")
    .select("id,locality_name,is_trusted,is_active,geo_talukas(id,name)")
    .eq("pincode", pincode)
    .eq("is_active", true)
    .order("locality_name");
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const taluka = Array.isArray(row.geo_talukas) ? row.geo_talukas[0] : row.geo_talukas;
    return {
      id: String(row.id),
      name: String(row.locality_name),
      talukaId: taluka?.id ?? null,
      talukaName: taluka?.name ?? null,
      trusted: Boolean(row.is_trusted),
    };
  });
}

/** Confirms ONE specific locality (never the whole PIN) to a chosen Taluka.
 * Used when a PIN genuinely spans multiple Talukas -- the bulk
 * admin_confirm_geo_pincode action refuses that case outright, by design. */
export async function adminConfirmGeoPincodeLocality(localityId: string, talukaId: string) {
  const { data, error } = await supabase.rpc("admin_confirm_geo_pincode_locality", {
    target_locality_id: localityId,
    target_taluka_id: talukaId,
  });
  if (error) throw error;
  invalidateGeoCache();
  return data;
}

export type GeoAdminOverview = {
  statesTotal: number;
  statesActive: number;
  districtsTotal: number;
  districtsActive: number;
  talukasTotal: number;
  talukasActive: number;
  talukasWithoutNeighbors: number;
  pincodesTotal: number;
  pincodesResolved: number;
  pincodesNeedsReview: number;
  pincodesUnresolved: number;
  vendorsResolved: number;
  vendorsNeedsReview: number;
  vendorsUnresolved: number;
  neighborsGeneratedAt: string | null;
};

export async function getGeoAdminOverview(): Promise<GeoAdminOverview> {
  const { data, error } = await supabase.rpc("get_geo_admin_overview");
  if (error) throw error;
  return {
    statesTotal: Number(data?.states_total ?? 0),
    statesActive: Number(data?.states_active ?? 0),
    districtsTotal: Number(data?.districts_total ?? 0),
    districtsActive: Number(data?.districts_active ?? 0),
    talukasTotal: Number(data?.talukas_total ?? 0),
    talukasActive: Number(data?.talukas_active ?? 0),
    talukasWithoutNeighbors: Number(data?.talukas_without_neighbors ?? 0),
    pincodesTotal: Number(data?.pincodes_total ?? 0),
    pincodesResolved: Number(data?.pincodes_resolved ?? 0),
    pincodesNeedsReview: Number(data?.pincodes_needs_review ?? 0),
    pincodesUnresolved: Number(data?.pincodes_unresolved ?? 0),
    vendorsResolved: Number(data?.vendors_resolved ?? 0),
    vendorsNeedsReview: Number(data?.vendors_needs_review ?? 0),
    vendorsUnresolved: Number(data?.vendors_unresolved ?? 0),
    neighborsGeneratedAt: data?.neighbors_generated_at ?? null,
  };
}

export async function rebuildTalukaNeighbors(input: {
  stateId?: string | null;
  maxNeighbors?: number;
  maxDistanceKm?: number;
} = {}) {
  const { data, error } = await supabase.rpc("rebuild_taluka_neighbors", {
    p_state_id: input.stateId ?? null,
    p_max_neighbors: input.maxNeighbors ?? 8,
    p_max_distance_km: input.maxDistanceKm ?? 150,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export type UnmappedVendorPincode = {
  vendorId: string;
  businessName: string;
  pincode: string;
  city: string;
  state: string;
  geoResolutionStatus: string;
  geoReviewReason: string | null;
};

export async function listUnmappedVendorPincodes(limit = 50): Promise<UnmappedVendorPincode[]> {
  const { data, error } = await supabase.rpc("list_unmapped_vendor_pincodes", { p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((row: any): UnmappedVendorPincode => ({
    vendorId: row.vendor_id,
    businessName: row.business_name,
    pincode: row.pincode,
    city: row.city,
    state: row.state,
    geoResolutionStatus: row.geo_resolution_status,
    geoReviewReason: row.geo_review_reason ?? null,
  }));
}
