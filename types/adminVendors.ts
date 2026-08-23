export type VendorManagementStatus = "active" | "suspended" | "archived";
export type VendorApplicationStatus = "pending" | "approved" | "rejected";
export type VendorSort =
  | "newest" | "oldest" | "business_az" | "business_za"
  | "category" | "registration_date" | "recently_updated";

export type AdminVendorRecord = {
  record_id: string;
  vendor_id: string | null;
  application_id: string | null;
  profile_id: string | null;
  business_name: string;
  owner_name: string;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  category_id: string | null;
  category_name: string | null;
  city: string;
  state: string;
  is_verified: boolean;
  application_status: VendorApplicationStatus;
  plan_name: string;
  subscription_status: string;
  management_status: VendorManagementStatus;
  registered_at: string;
  updated_at: string;
  total_count: number;
};

export type VendorFilters = {
  query: string;
  status: "all" | VendorApplicationStatus | VendorManagementStatus;
  verification: "all" | "verified" | "unverified";
  plan: "all" | "premium" | "free";
  categoryId: string | null;
  stateId: string | null;
  districtId: string | null;
  talukaId: string | null;
  updatedToday: boolean;
  sort: VendorSort;
  page: number;
  pageSize: number;
};

export type AdminVendorLocationFacet = {
  state_id: string;
  state_name: string;
  district_id: string | null;
  district_name: string | null;
  taluka_id: string | null;
  taluka_name: string | null;
};

export type VendorStatistics = {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  suspended: number;
  verified: number;
  premium: number;
  free: number;
  activeToday: number;
};

export type VendorHealthMetrics = {
  vendorId: string;
  gallery: number;
  services: number;
  reviews: number;
  rating: number;
  availability: number;
  completeness: number;
  healthScore: number;
  healthLabel: "Excellent" | "Good" | "Average" | "Needs Attention";
  missing: string[];
};

export type VendorAction =
  | "suspend" | "activate" | "archive" | "restore"
  | "soft_delete" | "verify" | "unverify";

export type VendorDetails = {
  record: AdminVendorRecord;
  vendor: Record<string, any> | null;
  application: Record<string, any> | null;
  applications: Record<string, any>[];
  services: Record<string, any>[];
  media: Record<string, any>[];
  availability: Record<string, any>[];
  subscriptions: Record<string, any>[];
  reviews: Record<string, any>[];
  activity: Record<string, any>[];
};
