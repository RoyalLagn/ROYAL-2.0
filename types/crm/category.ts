export type CrmVendorCategory = {
  id: string;
  name: string;
  slug: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CrmVendorCategoryInput = {
  name: string;
  slug: string;
  displayOrder?: number;
  isActive?: boolean;
};
