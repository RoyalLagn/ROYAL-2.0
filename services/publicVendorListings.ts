import { supabase } from "@/services/supabase";
import {
  listReviewSummaries,
  type ReviewSummary,
} from "@/services/reviews";
import {
  portfolioMediaUrl,
  stableHeroSelection,
  type PublicPortfolioAlbum,
  type VendorPortfolioMedia,
} from "@/services/vendorPortfolio";
import { mapVendorServiceLocation } from "@/services/locations";
import type { VendorServiceLocation } from "@/locations/types";
import { effectiveAvailabilityStatus } from "@/services/vendorAvailability";

export type PublicVendorAvailability = {
  date: string;
  status: "available" | "tentative" | "blocked";
};

export type VendorBusinessHourEntry = {
  day: number;
  opens: string;
  closes: string;
  closed: boolean;
};

export type VendorFaq = {
  question: string;
  answer: string;
};

export type PublicVendorListing = {
  id: string;
  name: string;
  slug: string;
  category: string;
  rating: number;
  reviews: number;
  priceLevel: string;
  location: string;
  address: string;
  tags: string[];
  services: string[];
  startingPrice: string;
  startingPriceValue: number;
  image: string;
  isTopRated: boolean;
  isFeatured: boolean;
  isAvailable: boolean;
  availability: PublicVendorAvailability[];
  description: string;
  experience: number | null;
  contactPhone: string;
  contactEmail: string;
  website: string;
  instagram: string;
  facebook: string;
  portfolioImages: string[];
  portfolioAlbums: PublicPortfolioAlbum[];
  heroMedia: VendorPortfolioMedia[];
  primaryCityId: string | null;
  primaryAreaId: string | null;
  serviceLocations: VendorServiceLocation[];
  managementStatus: string;
  publicProfileEnabled: boolean;
  awards: string[];
  languages: string[];
  businessHours: VendorBusinessHourEntry[] | null;
  faqs: VendorFaq[];
  membershipPlan: string | null;
};

const PUBLIC_VENDOR_LIST_SELECT = `
  id,
  business_name,
  description,
  experience,
  address,
  city,
  state,
  logo_url,
  tags,
  is_verified,
  is_featured,
  slug,
  management_status,
  public_profile_enabled,
  awards,
  languages,
  business_hours,
  categories(name),
  vendor_services(title,price,discounted_price,is_active,status,display_order),
  vendor_availability(date,status),
  vendor_faqs(question,answer,display_order)
`;

const PUBLIC_VENDOR_LOCATION_SELECT = `
  ${PUBLIC_VENDOR_LIST_SELECT},
  primary_city_id,
  primary_area_id,
  vendor_service_locations(
    id,
    vendor_id,
    city_id,
    area_id,
    pincode,
    is_primary,
    supported_cities(name,state),
    supported_areas(name)
  )
`;

const PUBLIC_VENDOR_DETAIL_SELECT = `
  ${PUBLIC_VENDOR_LOCATION_SELECT},
  contact_phone,
  contact_email,
  website,
  instagram,
  facebook,
  vendor_portfolio_albums(
    id,
    vendor_id,
    title,
    description,
    display_order,
    is_visible,
    media_count,
    cover_media_id,
    created_at,
    updated_at,
    media:vendor_portfolio_media!vendor_portfolio_media_album_id_fkey(
      id,
      vendor_id,
      album_id,
      secure_url,
      optimized_url,
      hero_url,
      fullscreen_url,
      public_id,
      resource_type,
      format,
      width,
      height,
      aspect_ratio,
      duration,
      bytes,
      original_size_bytes,
      optimized_size_bytes,
      thumbnail_url,
      video_poster_url,
      focal_point_x,
      focal_point_y,
      display_order,
      is_cover,
      upload_status,
      processing_status,
      subscription_locked,
      created_at,
      updated_at
    )
  ),
  vendor_portfolio_hero_media(
    media_id,
    display_order
  )
`;

let marketplaceCache: PublicVendorListing[] | null = null;
let marketplaceRequest: Promise<PublicVendorListing[]> | null = null;
let marketplaceCacheVersion = 0;
const marketplaceListeners = new Set<() => void>();
let marketplaceChannel: ReturnType<typeof supabase.channel> | null = null;
let marketplaceChannelSequence = 0;
let marketplaceRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

// Moved to locations/marketplaceCategoryNames.ts (dependency-free, so it can
// be unit-tested with plain `node` -- see
// scripts/test-location-discovery-domain.mjs) and re-exported here so every
// existing import of these two functions from this module keeps working.
import { normalizeMarketplaceCategoryName, databaseCategoryCandidates } from "@/locations/marketplaceCategoryNames";
export { normalizeMarketplaceCategoryName, databaseCategoryCandidates };

function normalizeVendor(
  row: any,
  reviewSummary?: ReviewSummary,
): PublicVendorListing | null {
  const databaseCategory = relatedOne<{ name?: string }>(row.categories)?.name?.trim();
  if (!row.is_verified || !databaseCategory) return null;
  const category = normalizeMarketplaceCategoryName(databaseCategory);

  const activeServices = (row.vendor_services ?? []).filter(
    (service: any) => service.is_active && (service.status ?? "active") === "active",
  ).sort((a: any, b: any) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0));
  const prices = activeServices
    .map((service: any) => Number(service.discounted_price ?? service.price))
    .filter((price: number) => Number.isFinite(price) && price > 0);
  const startingPriceValue = prices.length ? Math.min(...prices) : 0;
  const today = new Date().toISOString().slice(0, 10);
  const availability = (row.vendor_availability ?? [])
    .filter((item: any): item is PublicVendorAvailability =>
      typeof item.date === "string"
      && ["available", "tentative", "blocked"].includes(item.status))
    .sort((a: PublicVendorAvailability, b: PublicVendorAvailability) => a.date.localeCompare(b.date));
  const isAvailable = effectiveAvailabilityStatus(availability, today, today) === "available";
  const portfolioAlbums: PublicPortfolioAlbum[] = (row.vendor_portfolio_albums ?? [])
    .filter((album: any) => album.is_visible)
    .sort((a: any, b: any) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0))
    .map((album: any) => {
      const media = (album.media ?? [])
        .filter((item: any) =>
          item.upload_status === "completed"
          && !item.subscription_locked
          && (item.processing_status ?? "ready") === "ready",
        )
        .sort((a: any, b: any) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0)) as VendorPortfolioMedia[];
      const cover = media.find((item) => item.id === album.cover_media_id)
        ?? media.find((item) => item.is_cover)
        ?? media[0]
        ?? null;
      return {
        ...album,
        media,
        media_count: media.length,
        cover,
        hasVideo: media.some((item) => item.resource_type === "video"),
      };
    })
    .filter((album: PublicPortfolioAlbum) => album.media.length > 0);
  const selectedHeroIds = (row.vendor_portfolio_hero_media ?? [])
    .sort((a: any, b: any) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0))
    .map((selection: any) => selection.media_id);
  const heroMedia = stableHeroSelection(portfolioAlbums, selectedHeroIds);
  const portfolioImages = portfolioAlbums
    .flatMap((album) => album.media)
    .map((media) => portfolioMediaUrl(media, "card"));
  const serviceLocations = (row.vendor_service_locations ?? []).map(mapVendorServiceLocation);
  const primaryLocation = serviceLocations.find((item: VendorServiceLocation) => item.isPrimary)
    ?? serviceLocations[0]
    ?? null;
  const location = primaryLocation
    ? [primaryLocation.areaName, primaryLocation.cityName, primaryLocation.state].filter(Boolean).join(", ")
    : [row.city, row.state].filter(Boolean).join(", ");

  const faqs: VendorFaq[] = (row.vendor_faqs ?? [])
    .slice()
    .sort((a: any, b: any) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0))
    .map((faq: any) => ({ question: faq.question, answer: faq.answer }));

  return {
    id: row.id,
    name: row.business_name,
    slug: row.slug ?? "",
    category,
    rating: reviewSummary?.average_rating ?? 0,
    reviews: reviewSummary?.review_count ?? 0,
    priceLevel: "₹ ₹",
    location,
    address: row.address?.trim() || "",
    tags: Array.isArray(row.tags) ? row.tags : [],
    services: activeServices.map((service: any) => service.title).filter(Boolean),
    startingPrice: startingPriceValue
      ? `₹${startingPriceValue.toLocaleString("en-IN")}`
      : "Contact for price",
    startingPriceValue,
    image: row.logo_url || "",
    isTopRated: Boolean(row.is_featured),
    isFeatured: Boolean(row.is_featured),
    isAvailable,
    availability,
    description: row.description?.trim() || "",
    experience: typeof row.experience === "number" ? row.experience : null,
    contactPhone: row.contact_phone?.trim() || "",
    contactEmail: row.contact_email?.trim() || "",
    website: row.website?.trim() || "",
    instagram: row.instagram?.trim() || "",
    facebook: row.facebook?.trim() || "",
    portfolioImages,
    portfolioAlbums,
    heroMedia,
    primaryCityId: primaryLocation?.cityId ?? row.primary_city_id ?? null,
    primaryAreaId: primaryLocation?.areaId ?? row.primary_area_id ?? null,
    serviceLocations,
    managementStatus: row.management_status ?? "active",
    publicProfileEnabled: row.public_profile_enabled !== false,
    awards: Array.isArray(row.awards) ? row.awards : [],
    languages: Array.isArray(row.languages) ? row.languages : [],
    businessHours: Array.isArray(row.business_hours) ? row.business_hours : null,
    faqs,
    membershipPlan: row.membership_plan ?? null,
  };
}

async function getPublicVendorMembershipPlan(vendorId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_public_vendor_membership_plan", {
    target_vendor_id: vendorId,
  });
  if (error) return null;
  return typeof data === "string" ? data : null;
}

function canUseLegacyVendorQuery(error: { message?: string; code?: string } | null) {
  return Boolean(error && /vendor_service_locations|primary_city_id|primary_area_id|schema cache|PGRST200|PGRST205|42P01|42703/i.test(`${error.code ?? ""} ${error.message ?? ""}`));
}

export function invalidatePublicVendorCache() {
  marketplaceCacheVersion += 1;
  marketplaceCache = null;
  marketplaceRequest = null;
}

const recordedProfileViews = new Set<string>();

export async function recordPublicVendorProfileView(vendorId: string) {
  if (!vendorId || recordedProfileViews.has(vendorId)) return;
  recordedProfileViews.add(vendorId);
  const { error } = await supabase.rpc("record_vendor_profile_view", {
    target_vendor_id: vendorId,
  });
  if (error) {
    recordedProfileViews.delete(vendorId);
    throw error;
  }
}

export async function getApprovedPublicVendors(
  options: { force?: boolean } = {},
): Promise<PublicVendorListing[]> {
  if (options.force) invalidatePublicVendorCache();
  if (marketplaceCache) return marketplaceCache;
  if (marketplaceRequest) return marketplaceRequest;

  const requestVersion = marketplaceCacheVersion;
  const request = (async () => {
    const primaryResult = await supabase
      .from("vendors")
      .select(PUBLIC_VENDOR_LOCATION_SELECT)
      .eq("is_verified", true)
      .order("is_featured", { ascending: false })
      .order("updated_at", { ascending: false });
    let data: any[] | null = primaryResult.data as any[] | null;
    let error: any = primaryResult.error;
    if (canUseLegacyVendorQuery(error)) {
      const legacy = await supabase
        .from("vendors")
        .select(PUBLIC_VENDOR_LIST_SELECT)
        .eq("is_verified", true)
        .order("is_featured", { ascending: false })
        .order("updated_at", { ascending: false });
      data = legacy.data;
      error = legacy.error;
    }
    if (error) throw error;

    const vendorIds = (data ?? []).map((row: any) => row.id);
    const [reviewSummaries, membershipEntries] = await Promise.all([
      vendorIds.length
        ? listReviewSummaries(vendorIds).catch((): Record<string, ReviewSummary> => ({}))
        : Promise.resolve({} as Record<string, ReviewSummary>),
      Promise.all(vendorIds.map(async (vendorId) => [vendorId, await getPublicVendorMembershipPlan(vendorId)] as const)),
    ]);
    const membershipPlans = new Map(membershipEntries);
    const uniqueVendors = new Map<string, PublicVendorListing>();
    (data ?? [])
      .map((row: any) => normalizeVendor({ ...row, membership_plan: membershipPlans.get(row.id) ?? null }, reviewSummaries[row.id]))
      .filter((vendor): vendor is PublicVendorListing => Boolean(vendor))
      .forEach((vendor) => uniqueVendors.set(vendor.id, vendor));
    const vendors = [...uniqueVendors.values()];
    if (requestVersion === marketplaceCacheVersion) marketplaceCache = vendors;
    return vendors;
  })();
  marketplaceRequest = request;

  try {
    return await request;
  } finally {
    if (marketplaceRequest === request) marketplaceRequest = null;
  }
}

export async function getApprovedPublicVendorById(
  vendorId: string,
): Promise<PublicVendorListing | null> {
  const [locationResult, reviewSummaries, membershipPlan] = await Promise.all([
    supabase
      .from("vendors")
      .select(PUBLIC_VENDOR_DETAIL_SELECT)
      .eq("id", vendorId)
      .eq("is_verified", true)
      .maybeSingle(),
    listReviewSummaries([vendorId]).catch((): Record<string, ReviewSummary> => ({})),
    getPublicVendorMembershipPlan(vendorId),
  ]);
  let data: any = locationResult.data;
  let error: any = locationResult.error;
  if (canUseLegacyVendorQuery(error)) {
    const legacy = await supabase
      .from("vendors")
      .select(PUBLIC_VENDOR_DETAIL_SELECT.replace(PUBLIC_VENDOR_LOCATION_SELECT, PUBLIC_VENDOR_LIST_SELECT))
      .eq("id", vendorId)
      .eq("is_verified", true)
      .maybeSingle();
    data = legacy.data;
    error = legacy.error;
  }
  if (error) throw error;
  if (data) data.membership_plan = membershipPlan;
  return data ? normalizeVendor(data, reviewSummaries[vendorId]) : null;
}

export async function getApprovedPublicVendorBySlug(
  slug: string,
): Promise<PublicVendorListing | null> {
  const primaryResult = await supabase
    .from("vendors")
    .select(PUBLIC_VENDOR_DETAIL_SELECT)
    .eq("slug", slug)
    .eq("is_verified", true)
    .maybeSingle();
  let data: any = primaryResult.data;
  let error: any = primaryResult.error;
  if (canUseLegacyVendorQuery(error)) {
    const legacy = await supabase
      .from("vendors")
      .select(PUBLIC_VENDOR_DETAIL_SELECT.replace(PUBLIC_VENDOR_LOCATION_SELECT, PUBLIC_VENDOR_LIST_SELECT))
      .eq("slug", slug)
      .eq("is_verified", true)
      .maybeSingle();
    data = legacy.data;
    error = legacy.error;
  }
  if (error) throw error;
  if (!data) return null;
  const [reviewSummaries, membershipPlan] = await Promise.all([
    listReviewSummaries([data.id]).catch((): Record<string, ReviewSummary> => ({})),
    getPublicVendorMembershipPlan(data.id),
  ]);
  data.membership_plan = membershipPlan;
  return normalizeVendor(data, reviewSummaries[data.id]);
}

export function subscribeToPublicVendorChanges(onChange: () => void) {
  marketplaceListeners.add(onChange);

  if (!marketplaceChannel) {
    marketplaceChannelSequence += 1;
    const scheduleMarketplaceChanged = () => {
      if (marketplaceRefreshTimer) clearTimeout(marketplaceRefreshTimer);
      marketplaceRefreshTimer = setTimeout(() => {
        marketplaceRefreshTimer = null;
        invalidatePublicVendorCache();
        marketplaceListeners.forEach((listener) => listener());
      }, 60);
    };
    marketplaceChannel = supabase
      .channel(`public-marketplace-${marketplaceChannelSequence}`)
      .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "vendors" },
      scheduleMarketplaceChanged,
      )
      .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "vendor_services" },
      scheduleMarketplaceChanged,
      )
      .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "vendor_service_locations" },
      scheduleMarketplaceChanged,
      )
      .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "categories" },
      scheduleMarketplaceChanged,
      )
      .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "vendor_availability" },
      scheduleMarketplaceChanged,
      )
      .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "vendor_portfolio_media" },
      scheduleMarketplaceChanged,
      )
      .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "vendor_portfolio_albums" },
      scheduleMarketplaceChanged,
      )
      .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "vendor_portfolio_hero_media" },
      scheduleMarketplaceChanged,
      )
      .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "reviews" },
      scheduleMarketplaceChanged,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") scheduleMarketplaceChanged();
      });
  }

  return () => {
    marketplaceListeners.delete(onChange);
    if (!marketplaceListeners.size && marketplaceChannel) {
      if (marketplaceRefreshTimer) {
        clearTimeout(marketplaceRefreshTimer);
        marketplaceRefreshTimer = null;
      }
      invalidatePublicVendorCache();
      const channel = marketplaceChannel;
      marketplaceChannel = null;
      void supabase.removeChannel(channel);
    }
  };
}
