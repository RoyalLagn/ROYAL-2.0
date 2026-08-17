import type { CategoryRecord } from "@/services/CategoryService";

// Travel and Car Rental were previously filtered out here as a "retired but
// still in the table" workaround (see the now-superseded
// 20260810130000_retire_travel_and_car_rental_categories.sql migration).
// 20260817140000_delete_retired_travel_car_rental_categories.sql permanently
// removed both rows from public.categories after confirming no vendor,
// application, clip, or hero slide referenced them, so this filter has
// nothing left to do and is removed rather than kept as dead code.
export const MarketplaceConfig = {
  defaultCategorySort: "sort_order" as const,
  visible(categories: CategoryRecord[]) {
    return categories
      .filter((category) => category.isActive)
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
