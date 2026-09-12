import { supabase } from "@/services/supabase";
import type {
  AdminDashboardSnapshot,
  DashboardActivity,
  DashboardHealth,
  DashboardSection,
  DashboardStatistics,
  RecentPublicUser,
  RecentVendorApplication,
} from "@/types/adminDashboard";

const CACHE_TTL = 30_000;
let cache: AdminDashboardSnapshot | null = null;
let request: Promise<AdminDashboardSnapshot> | null = null;
let realtimeSubscriptionSequence = 0;

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

const message = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to load this dashboard section.";

async function count(
  table: string,
  filters: (query: any) => any = (query) => query,
) {
  const result = await filters(
    supabase.from(table).select("id", { count: "exact", head: true }),
  );
  if (result.error) throw result.error;
  return result.count ?? 0;
}

async function loadStatistics(): Promise<DashboardStatistics> {
  const today = startOfToday();
  const [
    publicUsers,
    totalVendors,
    pendingApplications,
    pendingVendorDeletionRequests,
    approvedVendors,
    rejectedApplications,
    categories,
    reviews,
    ratings,
    todayPublicRegistrations,
    todayVendorRegistrations,
    todayApplications,
    todayApprovals,
    todayRejections,
    todayReviews,
    incompleteVendorProfiles,
    expiredSubscriptions,
  ] = await Promise.all([
    count("profiles", (q) => q.eq("role", "public_user")),
    count("vendors"),
    count("vendor_applications", (q) => q.eq("status", "pending")),
    count("account_deletion_requests", (q) =>
      q.eq("account_type", "vendor").in("status", ["pending", "verified", "processing"]),
    ),
    count("vendors", (q) => q.eq("is_verified", true)),
    count("vendor_applications", (q) => q.eq("status", "rejected")),
    count("categories"),
    count("reviews"),
    supabase.from("reviews").select("rating"),
    count("profiles", (q) => q.eq("role", "public_user").gte("created_at", today)),
    count("profiles", (q) => q.eq("role", "vendor").gte("created_at", today)),
    count("vendor_applications", (q) => q.gte("submitted_at", today)),
    count("vendor_applications", (q) => q.eq("status", "approved").gte("reviewed_at", today)),
    count("vendor_applications", (q) => q.eq("status", "rejected").gte("reviewed_at", today)),
    count("reviews", (q) => q.gte("created_at", today)),
    count("vendors", (q) => q.or("description.is.null,logo_url.is.null")),
    count("subscriptions", (q) => q.eq("status", "expired")),
  ]);
  if (ratings.error) throw ratings.error;
  const values = (ratings.data ?? []).map((item) => Number(item.rating));
  const averageRating = values.length
    ? values.reduce((sum, rating) => sum + rating, 0) / values.length
    : 0;
  return {
    publicUsers,
    totalVendors,
    pendingApplications,
    pendingVendorDeletionRequests,
    approvedVendors,
    rejectedApplications,
    categories,
    reviews,
    averageRating,
    todayPublicRegistrations,
    todayVendorRegistrations,
    todayApplications,
    todayApprovals,
    todayRejections,
    todayReviews,
    incompleteVendorProfiles,
    expiredSubscriptions,
  };
}

async function loadApplications(): Promise<RecentVendorApplication[]> {
  const { data, error } = await supabase
    .from("vendor_applications")
    .select("id,business_name,full_name,status,submitted_at,reviewed_at,categories(name)")
    .order("submitted_at", { ascending: false })
    .limit(5);
  if (error) throw error;
  return (data ?? []).map((item: any) => ({
    id: item.id,
    businessName: item.business_name,
    ownerName: item.full_name,
    category: Array.isArray(item.categories)
      ? item.categories[0]?.name ?? "Uncategorized"
      : item.categories?.name ?? "Uncategorized",
    submittedAt: item.submitted_at,
    reviewedAt: item.reviewed_at,
    status: item.status,
  }));
}

async function loadUsers(): Promise<RecentPublicUser[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,full_name,email,profile_image,created_at,is_active")
    .eq("role", "public_user")
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw error;
  return (data ?? []).map((item) => ({
    id: item.id,
    fullName: item.full_name,
    email: item.email,
    profileImage: item.profile_image,
    createdAt: item.created_at,
    isActive: item.is_active,
  }));
}

async function loadActivity(
  applications: RecentVendorApplication[],
  users: RecentPublicUser[],
): Promise<DashboardActivity[]> {
  const { data: reviews, error } = await supabase
    .from("reviews")
    .select("id,created_at,profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw error;
  const events: DashboardActivity[] = [
    ...users.map((user) => ({
      id: `user-${user.id}`,
      kind: "user" as const,
      action: "Public user registered",
      actor: user.fullName,
      target: user.email,
      createdAt: user.createdAt,
    })),
    ...applications.map((application) => ({
      id: `application-${application.id}`,
      kind: application.status === "approved"
        ? "approved" as const
        : application.status === "rejected"
          ? "rejected" as const
          : "application" as const,
      action: application.status === "approved"
        ? "Vendor Approved"
        : application.status === "rejected"
          ? "Vendor Rejected"
          : "Vendor Submitted Application",
      actor: application.status === "pending" ? application.ownerName : "Administrator",
      target: application.businessName,
      createdAt: application.status === "pending"
        ? application.submittedAt
        : application.reviewedAt ?? application.submittedAt,
    })),
    ...(reviews ?? []).map((review: any) => ({
      id: `review-${review.id}`,
      kind: "review" as const,
      action: "Review submitted",
      actor: Array.isArray(review.profiles)
        ? review.profiles[0]?.full_name ?? "Public user"
        : review.profiles?.full_name ?? "Public user",
      target: "Vendor review",
      createdAt: review.created_at,
    })),
  ];
  return events
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 8);
}

async function loadHealth(): Promise<DashboardHealth> {
  const [database, auth] = await Promise.all([
    supabase.from("categories").select("id", { head: true, count: "exact" }),
    supabase.auth.getSession(),
  ]);
  return {
    supabase: database.error ? "unavailable" : "online",
    database: database.error ? "unavailable" : "online",
    authentication: auth.error ? "unavailable" : "online",
    realtime: "unavailable",
    bunnyMedia:
      process.env.EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID
        ? "configured"
        : "unavailable",
    smtp: "unavailable",
    lastCheckedAt: new Date().toISOString(),
  };
}

async function section<T>(loader: () => Promise<T>): Promise<DashboardSection<T>> {
  try {
    return { data: await loader(), error: null };
  } catch (error) {
    return { data: null, error: message(error) };
  }
}

async function fetchSnapshot(): Promise<AdminDashboardSnapshot> {
  const [statistics, applications, users, health] = await Promise.all([
    section(loadStatistics),
    section(loadApplications),
    section(loadUsers),
    section(loadHealth),
  ]);
  const activity = applications.data && users.data
    ? await section(() => loadActivity(applications.data!, users.data!))
    : {
        data: null,
        error: applications.error || users.error || "Activity dependencies failed.",
      };
  return { statistics, applications, users, activity, health, loadedAt: Date.now() };
}

export const AdminDashboardService = {
  async load(force = false) {
    if (!force && cache && Date.now() - cache.loadedAt < CACHE_TTL) return cache;
    if (request) return request;
    request = fetchSnapshot()
      .then((snapshot) => {
        cache = snapshot;
        return snapshot;
      })
      .finally(() => { request = null; });
    return request;
  },
  invalidate() {
    cache = null;
  },
  subscribe(onChange: () => void, onStatus: (online: boolean) => void) {
    realtimeSubscriptionSequence += 1;
    const channel = supabase.channel(
      `admin-dashboard-live-${realtimeSubscriptionSequence}`,
    );
    for (const table of [
      "vendor_applications",
      "profiles",
      "reviews",
      "vendors",
      "categories",
      "account_deletion_requests",
    ]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        onChange,
      );
    }
    channel.subscribe((status) => onStatus(status === "SUBSCRIBED"));
    return () => {
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  },
};
