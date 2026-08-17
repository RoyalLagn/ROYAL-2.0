import type { ImageURISource } from "react-native";
import { Music } from "lucide-react-native";
import { supabase } from "@/services/supabase";
import {
  findMarketplaceCategory,
  MARKETPLACE_CATEGORIES,
} from "@/data/marketplaceCategories";

export type CategoryRecord = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  iconUrl: string | null;
  imageUrl: string;
  fallbackImageUrl: string | null;
  homeImage: number | ImageURISource;
  fallbackImage: number | ImageURISource;
  isActive: boolean;
  isFeatured: boolean;
  showOnHome: boolean;
  showInSearch: boolean;
  showInVendorRegistration: boolean;
  localizationKey: string | null;
  vendorCount: number;
};

type CategoryRow = {
  id: string;
  slug?: string | null;
  name: string;
  description?: string | null;
  sort_order?: number | null;
  icon_url?: string | null;
  fallback_image_url?: string | null;
  is_active?: boolean | null;
  is_featured?: boolean | null;
  show_on_home?: boolean | null;
  show_in_search?: boolean | null;
  show_in_vendor_registration?: boolean | null;
  localization_key?: string | null;
};

let cache: CategoryRecord[] | null = null;
let request: Promise<CategoryRecord[]> | null = null;
let channelSequence = 0;

export function slugify(value: string) {
  return value.trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export type CreateCategoryInput = {
  name: string;
  slug: string;
  description?: string;
  iconUrl?: string | null;
  fallbackImageUrl?: string | null;
};

export type CategoryUsage = {
  vendors: number;
  vendorApplications: number;
  clips: number;
  heroSlides: number;
  total: number;
};

function presentation(row: CategoryRow, vendorCount: number): CategoryRecord {
  const local = findMarketplaceCategory(row.slug || row.name);
  const defaultLocal = MARKETPLACE_CATEGORIES[0];
  const iconUrl = row.icon_url ?? null;
  const fallbackImageUrl = row.fallback_image_url ?? null;
  return {
    id: row.id,
    slug: row.slug || local?.slug || slugify(row.name),
    name: local?.name ?? row.name,
    description: row.description || local?.description || "",
    sortOrder: Number(row.sort_order ?? 100),
    icon: local?.icon ?? Music,
    iconColor: local?.iconColor ?? "#E91E63",
    iconBg: local?.iconBg ?? "#FFF0F6",
    iconUrl,
    imageUrl: local?.cloudinaryImage ?? fallbackImageUrl ?? "",
    fallbackImageUrl,
    homeImage: (local?.homeImage as number | ImageURISource | undefined)
      ?? (iconUrl ? { uri: iconUrl } : defaultLocal.homeImage as number),
    fallbackImage: local?.fallbackImage
      ?? (fallbackImageUrl ? { uri: fallbackImageUrl } : defaultLocal.fallbackImage),
    isActive: row.is_active ?? true,
    isFeatured: row.is_featured ?? false,
    showOnHome: row.show_on_home ?? true,
    showInSearch: row.show_in_search ?? true,
    showInVendorRegistration: row.show_in_vendor_registration ?? true,
    localizationKey: row.localization_key ?? null,
    vendorCount,
  };
}

async function fetchCategories(): Promise<CategoryRecord[]> {
  const primary = await supabase
    .from("categories")
    .select("id,slug,name,description,sort_order,icon_url,fallback_image_url,is_active,is_featured,show_on_home,show_in_search,show_in_vendor_registration,localization_key")
    .order("sort_order")
    .order("name");

  let rows: CategoryRow[];
  if (primary.error) {
    const legacy = await supabase.from("categories").select("id,name").order("name");
    if (legacy.error) throw legacy.error;
    rows = (legacy.data as CategoryRow[]) ?? [];
  } else {
    rows = (primary.data as CategoryRow[]) ?? [];
  }

  const { data: vendors } = await supabase
    .from("vendors")
    .select("category_id")
    .eq("is_verified", true);
  const counts = new Map<string, number>();
  (vendors ?? []).forEach((vendor) => {
    counts.set(vendor.category_id, (counts.get(vendor.category_id) ?? 0) + 1);
  });

  return rows.map((row) => presentation(row, counts.get(row.id) ?? 0));
}

export const CategoryService = {
  peek() {
    return cache;
  },
  async list(options: { force?: boolean } = {}) {
    if (options.force) cache = null;
    if (cache) return cache;
    if (request) return request;
    request = fetchCategories()
      .then((categories) => {
        cache = categories;
        return categories;
      })
      .finally(() => {
        request = null;
      });
    return request;
  },
  invalidate() {
    cache = null;
  },
  /**
   * Real, live counts of every table with a foreign key to categories(id) —
   * used to show the admin an accurate usage warning before deletion. Never
   * hard-coded; always a fresh query against the actual dependent tables.
   */
  async usage(categoryId: string): Promise<CategoryUsage> {
    const countRows = async (table: string) => {
      const { count, error } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("category_id", categoryId);
      if (error) throw error;
      return count ?? 0;
    };
    const [vendors, vendorApplications, clips, heroSlides] = await Promise.all([
      countRows("vendors"),
      countRows("vendor_applications"),
      countRows("clips"),
      countRows("hero_slides"),
    ]);
    return { vendors, vendorApplications, clips, heroSlides, total: vendors + vendorApplications + clips + heroSlides };
  },
  /**
   * Permanently deletes the category row. vendors/vendor_applications/clips/
   * hero_slides.category_id are ON DELETE SET NULL (see migration
   * 20260817160000_categories_deletable_with_safe_disassociation.sql) — the
   * dependent rows themselves, and everything that references *them*
   * (profiles, portfolio media, reviews, enquiries, users), are never
   * touched by this. Gated by the existing categories_admin_delete RLS
   * policy (private.is_admin()) — no service_role, no bypass.
   */
  async remove(categoryId: string) {
    const { error } = await supabase.from("categories").delete().eq("id", categoryId);
    if (error) throw error;
    cache = null;
  },
  /**
   * Inserts into the same public.categories table every other category read
   * comes from — new rows are picked up everywhere CategoryService.list()/
   * CategoryContext is already used (home, search, vendor registration,
   * Admin Categories) with no separate configuration. id/created_at/
   * updated_at are left to the database defaults; is_active, sort_order,
   * show_on_home/search/vendor_registration all take their normal column
   * defaults (active, 100, true/true/true) so a new category behaves exactly
   * like an existing one from the moment it's created.
   */
  async create(input: CreateCategoryInput) {
    const { error } = await supabase.from("categories").insert({
      name: input.name,
      slug: input.slug,
      description: input.description ?? "",
      icon_url: input.iconUrl ?? null,
      fallback_image_url: input.fallbackImageUrl ?? null,
    });
    if (error) throw error;
    cache = null;
  },
  subscribe(onChange: () => void) {
    channelSequence += 1;
    const channel = supabase
      .channel(`category-service-${channelSequence}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, () => {
        cache = null;
        onChange();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "vendors" }, () => {
        cache = null;
        onChange();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  },
};
