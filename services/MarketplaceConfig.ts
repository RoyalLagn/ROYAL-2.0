import type { CategoryRecord } from "@/services/CategoryService";

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
