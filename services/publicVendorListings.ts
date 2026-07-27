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

export type PublicVendorListing = {
  id: string;
  name: string;
  category: string;
  rating: number;
  reviews: number;
  priceLevel: string;
  location: string;
  tags: string[];
  services: string[];
  startingPrice: string;
  startingPriceValue: number;
  image: string;
  isTopRated: boolean;
  isFeatured: boolean;
  isAvailable: boolean;
  description: string;
  contactPhone: string;
  contactEmail: string;
  website: string;
  instagram: string;
  facebook: string;
  portfolioImages: string[];
  portfolioAlbums: PublicPortfolioAlbum[];
  heroMedia: VendorPortfolioMedia[];
};

export type PublicMarketplaceCategory = {
  id: string;
  name: string;
};

const PUBLIC_VENDOR_LIST_SELECT = `
  id,
  business_name,
  description,
  city,
  state,
  logo_url,
  tags,
  is_verified,
  is_featured,
  categories(name),
  vendor_services(title,price,is_active),
  vendor_availability(date,status)
`;

const PUBLIC_VENDOR_DETAIL_SELECT = `
  ${PUBLIC_VENDOR_LIST_SELECT},
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
let categoryCache: PublicMarketplaceCategory[] | null = null;
let categoryRequest: Promise<PublicMarketplaceCategory[]> | null = null;
const marketplaceListeners = new Set<() => void>();
let marketplaceChannel: ReturnType<typeof supabase.channel> | null = null;
let marketplaceRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

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
};

export function normalizeMarketplaceCategoryName(value: string) {
  const trimmed = value.trim();
  return MARKETPLACE_CATEGORY_NAMES[trimmed.toLowerCase()] ?? trimmed;
}

function normalizeVendor(
  row: any,
  reviewSummary?: ReviewSummary,
): PublicVendorListing | null {
  const databaseCategory = relatedOne<{ name?: string }>(row.categories)?.name?.trim();
  if (!row.is_verified || !databaseCategory) return null;
  const category = normalizeMarketplaceCategoryName(databaseCategory);

  const activeServices = (row.vendor_services ?? []).filter(
    (service: any) => service.is_active,
  );
  const prices = activeServices
    .map((service: any) => Number(service.price))
    .filter((price: number) => Number.isFinite(price) && price > 0);
  const startingPriceValue = prices.length ? Math.min(...prices) : 0;
  const today = new Date().toISOString().slice(0, 10);
  const isAvailable = (row.vendor_availability ?? []).some(
    (availability: any) =>
      availability.status === "available" && availability.date >= today,
  );
  const portfolioAlbums: PublicPortfolioAlbum[] = (row.vendor_portfolio_albums ?? [])
    .filter((album: any) => album.is_visible)
    .sort((a: any, b: any) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0))
    .map((album: any) => {
      const media = (album.media ?? [])
        .filter((item: any) =>
          item.upload_status === "completed"
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

  return {
    id: row.id,
    name: row.business_name,
    category,
    rating: reviewSummary?.average_rating ?? 0,
    reviews: reviewSummary?.review_count ?? 0,
    priceLevel: "₹ ₹",
    location: [row.city, row.state].filter(Boolean).join(", "),
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
    description: row.description?.trim() || "",
    contactPhone: row.contact_phone?.trim() || "",
    contactEmail: row.contact_email?.trim() || "",
    website: row.website?.trim() || "",
    instagram: row.instagram?.trim() || "",
    facebook: row.facebook?.trim() || "",
    portfolioImages,
    portfolioAlbums,
    heroMedia,
  };
}

export function invalidatePublicVendorCache() {
  marketplaceCacheVersion += 1;
  marketplaceCache = null;
  marketplaceRequest = null;
  categoryCache = null;
  categoryRequest = null;
}

export async function getPublicMarketplaceCategories(): Promise<PublicMarketplaceCategory[]> {
  if (categoryCache) return categoryCache;
  if (categoryRequest) return categoryRequest;

  const requestVersion = marketplaceCacheVersion;
  const request = (async () => {
    const { data, error } = await supabase
      .from("categories")
      .select("id,name")
      .order("name");
    if (error) throw error;
    const categories = (data ?? []).map((category) => ({
      id: category.id,
      name: category.name,
    }));
    if (requestVersion === marketplaceCacheVersion) categoryCache = categories;
    return categories;
  })();
  categoryRequest = request;
  try {
    return await request;
  } finally {
    if (categoryRequest === request) categoryRequest = null;
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
    const { data, error } = await supabase
      .from("vendors")
      .select(PUBLIC_VENDOR_LIST_SELECT)
      .eq("is_verified", true)
      .order("is_featured", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) throw error;

    const vendorIds = (data ?? []).map((row: any) => row.id);
    const reviewSummaries = vendorIds.length
      ? await listReviewSummaries(vendorIds).catch(() => ({}))
      : {};
    const uniqueVendors = new Map<string, PublicVendorListing>();
    (data ?? [])
      .map((row: any) => normalizeVendor(row, reviewSummaries[row.id]))
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
  const [{ data, error }, reviewSummaries] = await Promise.all([
    supabase
      .from("vendors")
      .select(PUBLIC_VENDOR_DETAIL_SELECT)
      .eq("id", vendorId)
      .eq("is_verified", true)
      .maybeSingle(),
    listReviewSummaries([vendorId]).catch(() => ({})),
  ]);
  if (error) throw error;
  return data ? normalizeVendor(data, reviewSummaries[vendorId]) : null;
}

export function subscribeToPublicVendorChanges(onChange: () => void) {
  marketplaceListeners.add(onChange);

  if (!marketplaceChannel) {
    const scheduleMarketplaceChanged = () => {
      if (marketplaceRefreshTimer) clearTimeout(marketplaceRefreshTimer);
      marketplaceRefreshTimer = setTimeout(() => {
        marketplaceRefreshTimer = null;
        invalidatePublicVendorCache();
        marketplaceListeners.forEach((listener) => listener());
      }, 60);
    };
    marketplaceChannel = supabase
      .channel("public-marketplace")
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
