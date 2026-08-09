import type { CategoryRecord } from "@/services/CategoryService";

const RETIRED_CATEGORY_KEYS = new Set(["travel", "car-rental"]);

function categoryKey(value: string) {
  return value.trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const MarketplaceConfig = {
  defaultCategorySort: "sort_order" as const,
  visible(categories: CategoryRecord[]) {
    return categories
      .filter((category) =>
        category.isActive
        && !RETIRED_CATEGORY_KEYS.has(categoryKey(category.slug || category.name)))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  },
  home(categories: CategoryRecord[]) {
    return this.visible(categories).filter((category) => category.showOnHome);
  },
  search(categories: CategoryRecord[]) {
    return this.visible(categories).filter((category) => category.showInSearch);
  },
  vendorRegistration(categories: CategoryRecord[]) {
    return this.visible(categories).filter((category) => category.showInVendorRegistration);
  },
};
