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

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

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
