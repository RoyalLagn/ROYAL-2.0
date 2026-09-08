export type DashboardStatistics = {
  publicUsers: number;
  totalVendors: number;
  pendingApplications: number;
  pendingVendorDeletionRequests: number;
  approvedVendors: number;
  rejectedApplications: number;
  categories: number;
  reviews: number;
  averageRating: number;
  todayPublicRegistrations: number;
  todayVendorRegistrations: number;
  todayApplications: number;
  todayApprovals: number;
  todayRejections: number;
  todayReviews: number;
  incompleteVendorProfiles: number;
  expiredSubscriptions: number;
};

export type RecentVendorApplication = {
  id: string;
  businessName: string;
  ownerName: string;
  category: string;
  submittedAt: string;
  reviewedAt: string | null;
  status: "pending" | "approved" | "rejected";
};

export type RecentPublicUser = {
  id: string;
  fullName: string;
  email: string;
  profileImage: string | null;
  createdAt: string;
  isActive: boolean;
};

export type DashboardActivity = {
  id: string;
  kind: "user" | "application" | "approved" | "rejected" | "review";
  action: string;
  actor: string;
  target: string;
  createdAt: string;
};

export type HealthState = "online" | "configured" | "unavailable";
export type DashboardHealth = {
  supabase: HealthState;
  database: HealthState;
  authentication: HealthState;
  realtime: HealthState;
  cloudinary: HealthState;
  smtp: HealthState;
  lastCheckedAt: string;
};

export type DashboardSection<T> = {
  data: T | null;
  error: string | null;
};

export type AdminDashboardSnapshot = {
  statistics: DashboardSection<DashboardStatistics>;
  applications: DashboardSection<RecentVendorApplication[]>;
  users: DashboardSection<RecentPublicUser[]>;
  activity: DashboardSection<DashboardActivity[]>;
  health: DashboardSection<DashboardHealth>;
  loadedAt: number;
};
