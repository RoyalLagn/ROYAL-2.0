import { Platform, Share } from "react-native";
import { supabase } from "@/services/supabase";
import { CategoryService } from "@/services/CategoryService";
import type {
  AdminVendorRecord,
  VendorAction,
  VendorDetails,
  VendorFilters,
  VendorHealthMetrics,
  VendorStatistics,
} from "@/types/adminVendors";

const listCache = new Map<string, { at: number; rows: AdminVendorRecord[]; total: number }>();
const inFlight = new Map<string, Promise<{ rows: AdminVendorRecord[]; total: number }>>();
const CACHE_MS = 20_000;
const healthCache = new Map<string, { at: number; data: Record<string, VendorHealthMetrics> }>();
let channelSequence = 0;

const cacheKey = (filters: VendorFilters) => JSON.stringify(filters);
const today = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

async function count(table: string, apply: (query: any) => any = (query) => query) {
  const result = await apply(supabase.from(table).select("id", { count: "exact", head: true }));
  if (result.error) throw result.error;
  return result.count ?? 0;
}

export const AdminVendorService = {
  invalidate() {
    listCache.clear();
    healthCache.clear();
  },

  async list(filters: VendorFilters, force = false) {
    const key = cacheKey(filters);
    const cached = listCache.get(key);
    if (!force && cached && Date.now() - cached.at < CACHE_MS) {
      return { rows: cached.rows, total: cached.total };
    }
    const existing = inFlight.get(key);
    if (existing) return existing;
    const request = Promise.resolve(supabase.rpc("admin_list_vendor_records", {
      search_text: filters.query.trim() || null,
      status_filter: filters.status,
      verification_filter: filters.verification,
      plan_filter: filters.plan,
      category_filter: filters.categoryId,
      city_filter: filters.city,
      state_filter: filters.state,
      sort_by: filters.sort,
      page_size: filters.pageSize,
      page_offset: (filters.page - 1) * filters.pageSize,
    })).then(({ data, error }) => {
      if (error) throw error;
      const rows = (data ?? []) as AdminVendorRecord[];
      const result = { rows, total: Number(rows[0]?.total_count ?? 0) };
      listCache.set(key, { ...result, at: Date.now() });
      return result;
    }).finally(() => inFlight.delete(key));
    inFlight.set(key, request);
    return request;
  },

  async statistics(): Promise<VendorStatistics> {
    const [total, approved, pending, rejected, suspended, verified, premium, free, activeToday] =
      await Promise.all([
        count("vendors"),
        count("vendor_applications", (q) => q.eq("status", "approved")),
        count("vendor_applications", (q) => q.eq("status", "pending")),
        count("vendor_applications", (q) => q.eq("status", "rejected")),
        count("vendors", (q) => q.eq("management_status", "suspended")),
        count("vendors", (q) => q.eq("is_verified", true)),
        count("subscriptions", (q) => q.neq("plan_name", "Free").eq("status", "active")),
        count("vendors", (q) => q.eq("subscription_status", "pending")),
        count("vendors", (q) => q.gte("updated_at", today()).eq("management_status", "active")),
      ]);
    return { total, approved, pending, rejected, suspended, verified, premium, free, activeToday };
  },

  async getRecord(recordId: string) {
    const result = await this.list({
      query: recordId,
      status: "all",
      verification: "all",
      plan: "all",
      categoryId: null,
      city: null,
      state: null,
      sort: "newest",
      page: 1,
      pageSize: 20,
    }, true);
    const record = result.rows.find((row) =>
      row.record_id === recordId || row.vendor_id === recordId || row.application_id === recordId);
    if (!record) throw new Error("Vendor not found.");
    return record;
  },

  async categories() {
    return (await CategoryService.list()).map(({ id, name }) => ({ id, name }));
  },

  async healthMetrics(rows: AdminVendorRecord[]) {
    const vendorRows = rows.filter((row) => row.vendor_id);
    const ids = vendorRows.map((row) => row.vendor_id!) ;
    if (!ids.length) return {} as Record<string, VendorHealthMetrics>;
    const key = ids.slice().sort().join(",");
    const cached = healthCache.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;
    const [services, media, reviews, availability, vendors] = await Promise.all([
      supabase.from("vendor_services").select("vendor_id").in("vendor_id", ids),
      supabase.from("vendor_portfolio_media").select("vendor_id").in("vendor_id", ids),
      supabase.from("reviews").select("vendor_id,rating").in("vendor_id", ids),
      supabase.from("vendor_availability").select("vendor_id").in("vendor_id", ids),
      supabase.from("vendors").select("id,description,logo_url,contact_email,contact_phone,website,is_verified,subscription_status").in("id", ids),
    ]);
    const failure = [services, media, reviews, availability, vendors].find((result) => result.error);
    if (failure?.error) throw failure.error;
    const counts = (items: { vendor_id: string | null }[] | null) => {
      const result: Record<string, number> = {};
      for (const item of items ?? []) if (item.vendor_id) result[item.vendor_id] = (result[item.vendor_id] ?? 0) + 1;
      return result;
    };
    const serviceCounts = counts(services.data);
    const mediaCounts = counts(media.data);
    const reviewCounts = counts(reviews.data);
    const availabilityCounts = counts(availability.data);
    const result: Record<string, VendorHealthMetrics> = {};
    for (const row of vendorRows) {
      const id = row.vendor_id!;
      const vendor = vendors.data?.find((item) => item.id === id);
      const missing = [
        !row.logo_url && "Logo",
        !vendor?.description && "Description",
        !row.email && "Email",
        !row.phone && "Phone",
        !row.category_id && "Category",
        !row.city && "City",
        !row.state && "State",
        !serviceCounts[id] && "Services",
        !mediaCounts[id] && "Gallery",
        !availabilityCounts[id] && "Availability",
      ].filter(Boolean) as string[];
      const completeness = Math.round(((10 - missing.length) / 10) * 100);
      const ratings = (reviews.data ?? []).filter((review) => review.vendor_id === id).map((review) => Number(review.rating));
      const rating = ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0;
      const healthScore = Math.round(
        completeness * 0.35
        + (row.is_verified ? 15 : 0)
        + Math.min(mediaCounts[id] ?? 0, 5) * 3
        + Math.min(serviceCounts[id] ?? 0, 5) * 3
        + Math.min(reviewCounts[id] ?? 0, 10)
        + (availabilityCounts[id] ? 5 : 0)
        + (row.plan_name.toLowerCase() !== "free" ? 5 : 0)
        + (Date.now() - Date.parse(row.updated_at) <= 30 * 86_400_000 ? 5 : 0),
      );
      result[id] = {
        vendorId: id,
        gallery: mediaCounts[id] ?? 0,
        services: serviceCounts[id] ?? 0,
        reviews: reviewCounts[id] ?? 0,
        rating,
        availability: availabilityCounts[id] ?? 0,
        completeness,
        healthScore: Math.min(100, healthScore),
        healthLabel: healthScore >= 85 ? "Excellent" : healthScore >= 70 ? "Good" : healthScore >= 50 ? "Average" : "Needs Attention",
        missing,
      };
    }
    healthCache.set(key, { at: Date.now(), data: result });
    return result;
  },

  async details(record: AdminVendorRecord): Promise<VendorDetails> {
    const vendorId = record.vendor_id;
    const applicationId = record.application_id;
    const [
      vendor, application, applicationHistory, services, media, availability,
      subscriptions, reviews, activity,
    ] = await Promise.all([
      vendorId ? supabase.from("vendors").select("*,categories(name),profiles(full_name,email,phone,is_active)").eq("id", vendorId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      applicationId ? supabase.from("vendor_applications").select("*,categories(name)").eq("id", applicationId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      supabase.from("vendor_applications")
        .select("id,status,submitted_at,reviewed_at,rejection_reason,business_name")
        .or(`profile_id.eq.${record.profile_id ?? "00000000-0000-0000-0000-000000000000"},email.eq.${record.email ?? "none@invalid.local"}`)
        .order("submitted_at", { ascending: false }),
      vendorId ? supabase.from("vendor_services").select("*").eq("vendor_id", vendorId).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      vendorId ? supabase.from("vendor_portfolio_media").select("*").eq("vendor_id", vendorId).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      vendorId ? supabase.from("vendor_availability").select("*").eq("vendor_id", vendorId).order("available_date") : Promise.resolve({ data: [], error: null }),
      vendorId ? supabase.from("subscriptions").select("*").eq("vendor_id", vendorId).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      vendorId ? supabase.from("reviews").select("*").eq("vendor_id", vendorId).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      supabase.from("admin_vendor_activity").select("*,profiles!admin_vendor_activity_administrator_id_fkey(full_name,email)")
        .or(`vendor_id.eq.${vendorId ?? "00000000-0000-0000-0000-000000000000"},application_id.eq.${applicationId ?? "00000000-0000-0000-0000-000000000000"}`)
        .order("created_at", { ascending: false }),
    ]);
    const failed = [vendor, application, applicationHistory, services, media, availability, subscriptions, reviews, activity].find((result) => result.error);
    if (failed?.error) throw failed.error;
    return {
      record,
      vendor: vendor.data,
      application: application.data,
      applications: applicationHistory.data ?? [],
      services: services.data ?? [],
      media: media.data ?? [],
      availability: availability.data ?? [],
      subscriptions: subscriptions.data ?? [],
      reviews: reviews.data ?? [],
      activity: activity.data ?? [],
    };
  },

  async action(record: AdminVendorRecord, action: VendorAction, reason?: string) {
    if (!record.vendor_id) throw new Error("This action requires an approved vendor profile.");
    const { error } = await supabase.rpc("admin_manage_vendor", {
      target_vendor_id: record.vendor_id,
      requested_action: action,
    });
    if (error) throw error;
    this.invalidate();
    void reason;
  },

  async review(record: AdminVendorRecord, decision: "approved" | "rejected", reason?: string) {
    if (!record.application_id) throw new Error("Vendor application not found.");
    const { error } = await supabase.rpc("admin_review_vendor_application", {
      target_application_id: record.application_id,
      decision,
      reason: decision === "rejected" ? reason?.trim() || null : null,
    });
    if (error) throw error;
    this.invalidate();
  },

  async update(vendorId: string, changes: Record<string, string>) {
    const { error } = await supabase.rpc("admin_update_vendor", {
      target_vendor_id: vendorId,
      changes,
    });
    if (error) throw error;
    this.invalidate();
  },

  subscribe(onChange: () => void) {
    channelSequence += 1;
    const channel = supabase.channel(`admin-vendors-${channelSequence}`);
    for (const table of [
      "vendors", "vendor_applications", "vendor_services",
      "vendor_portfolio_media", "vendor_availability",
      "subscriptions", "reviews", "admin_vendor_activity",
    ]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
    }
    channel.subscribe();
    return () => {
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  },

  async exportCsv(rows: AdminVendorRecord[]) {
    const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const headers = [
      "Vendor ID", "Business", "Owner", "Email", "Phone", "Category",
      "City", "State", "Verified", "Application", "Plan", "Status", "Registered",
    ];
    const csv = [
      headers.map(quote).join(","),
      ...rows.map((row) => [
        row.vendor_id ?? row.record_id, row.business_name, row.owner_name,
        row.email, row.phone, row.category_name, row.city, row.state,
        row.is_verified, row.application_status, row.plan_name,
        row.management_status, row.registered_at,
      ].map(quote).join(",")),
    ].join("\n");
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `royallagn-vendors-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }
    await Share.share({ title: "RoyalLagn Vendors CSV", message: csv });
  },

  async exportFiltered(filters: VendorFilters) {
    const rows: AdminVendorRecord[] = [];
    let page = 1;
    let total = 0;
    do {
      const result = await this.list({ ...filters, page, pageSize: 100 }, true);
      rows.push(...result.rows);
      total = result.total;
      page += 1;
    } while (rows.length < total);
    await this.exportCsv(rows);
  },
};
