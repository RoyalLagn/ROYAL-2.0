import { supabase } from "@/services/supabase";

export type ClipAnalyticsMetric = "views" | "watchTime";
export type ClipAnalyticsAggregation = "day" | "month";

export type ClipAnalyticsFilters = {
  startDate: string;
  endDate: string;
  aggregation: ClipAnalyticsAggregation;
  vendorId?: string | null;
  clipId?: string | null;
  categoryId?: string | null;
  cityId?: string | null;
  areaId?: string | null;
};

export type ClipAnalyticsTrendPoint = {
  date: string;
  views: number;
  watchTimeHours: number;
  clipsViewed: number;
  uniqueViewers: number;
  topClip: string | null;
};

export type ClipAnalyticsDetailRow = {
  clipId: string;
  clipTitle: string;
  vendorName: string;
  views: number;
  watchTimeHours: number;
  publishedAt: string | null;
};

export type ClipAnalyticsResult = {
  period: { start: string; end: string; aggregation: ClipAnalyticsAggregation };
  summary: {
    views: number;
    previousViews: number;
    viewsChangePercent: number;
    watchTimeHours: number;
    previousWatchTimeHours: number;
    watchTimeChangePercent: number;
  };
  trend: ClipAnalyticsTrendPoint[];
  comparison: { currentViews: number; previousViews: number; difference: number; changePercent: number };
};

export type AnalyticsVendorOption = { id: string; name: string };
export type AnalyticsClipOption = {
  id: string;
  title: string;
  thumbnailUrl: string;
  vendorName: string;
  publishedAt: string | null;
};

function number(value: unknown) {
  return Number(value ?? 0);
}

function nameOf(value: unknown, key: string, fallback: string) {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation && typeof relation === "object"
    ? String((relation as Record<string, unknown>)[key] || fallback)
    : fallback;
}

// supabase-js does not throw a real `Error`/`PostgrestError` instance for
// query/RPC failures by default — `{ data, error }` returns `error` as a
// plain object parsed straight from the response body (see
// PostgrestBuilder.processResponse in @supabase/postgrest-js). Callers that
// do `if (error) throw error;` and later check `cause instanceof Error`
// therefore always miss, silently swallowing the real Postgres/PostgREST
// message, code, and hint behind a generic fallback string. Wrap it in a
// real Error here so the actual failure reaches the UI, and log the raw
// object in development so the full detail (hint/details/code) isn't lost.
function toAnalyticsError(error: unknown): Error {
  if (error instanceof Error) return error;
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
  const message = typeof record?.message === "string" && record.message.trim()
    ? record.message.trim()
    : "Unable to load clip views.";
  const hint = [record?.hint, record?.details]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" — ");
  if (__DEV__) {
    console.error("[AdminClipAnalyticsService] admin_clip_analytics failed:", error);
  }
  const normalized = new Error(hint ? `${message} (${hint})` : message);
  if (typeof record?.code === "string") (normalized as Error & { code?: string }).code = record.code;
  return normalized;
}

export const AdminClipAnalyticsService = {
  async load(filters: ClipAnalyticsFilters): Promise<ClipAnalyticsResult> {
    const { data, error } = await supabase.rpc("admin_clip_analytics", {
      p_start_date: filters.startDate,
      p_end_date: filters.endDate,
      p_aggregation: filters.aggregation,
      p_vendor_id: filters.vendorId || null,
      p_clip_id: filters.clipId || null,
      p_category_id: filters.categoryId || null,
      p_city_id: filters.cityId || null,
      p_area_id: filters.areaId || null,
    });
    if (error) throw toAnalyticsError(error);
    const value = (data ?? {}) as Record<string, any>;
    const summary = value.summary ?? {};
    return {
      period: {
        start: String(value.period?.start ?? filters.startDate),
        end: String(value.period?.end ?? filters.endDate),
        aggregation: value.period?.aggregation === "month" ? "month" : "day",
      },
      summary: {
        views: number(summary.views), previousViews: number(summary.previousViews),
        viewsChangePercent: number(summary.viewsChangePercent),
        watchTimeHours: number(summary.watchTimeHours),
        previousWatchTimeHours: number(summary.previousWatchTimeHours),
        watchTimeChangePercent: number(summary.watchTimeChangePercent),
      },
      trend: (Array.isArray(value.trend) ? value.trend : []).map((point: Record<string, unknown>) => ({
        date: String(point.date), views: number(point.views),
        watchTimeHours: number(point.watchTimeHours), clipsViewed: number(point.clipsViewed),
        uniqueViewers: number(point.uniqueViewers), topClip: point.topClip ? String(point.topClip) : null,
      })),
      comparison: {
        currentViews: number(value.comparison?.currentViews),
        previousViews: number(value.comparison?.previousViews),
        difference: number(value.comparison?.difference),
        changePercent: number(value.comparison?.changePercent),
      },
    };
  },

  async dailyDetails(date: string, filters: Omit<ClipAnalyticsFilters, "startDate" | "endDate" | "aggregation">) {
    const { data, error } = await supabase.rpc("admin_clip_analytics_daily_details", {
      p_date: date, p_vendor_id: filters.vendorId || null, p_clip_id: filters.clipId || null,
      p_category_id: filters.categoryId || null, p_city_id: filters.cityId || null,
      p_area_id: filters.areaId || null,
    });
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((row): ClipAnalyticsDetailRow => ({
      clipId: String(row.clip_id), clipTitle: String(row.clip_title),
      vendorName: String(row.vendor_name), views: number(row.views),
      watchTimeHours: number(row.watch_time_hours),
      publishedAt: row.published_at ? String(row.published_at) : null,
    }));
  },

  async searchVendors(query: string): Promise<AnalyticsVendorOption[]> {
    let request = supabase.from("vendors").select("id,business_name").order("business_name").limit(20);
    if (query.trim()) request = request.ilike("business_name", `%${query.trim()}%`);
    const { data, error } = await request;
    if (error) throw error;
    return (data ?? []).map((row) => ({ id: String(row.id), name: String(row.business_name) }));
  },

  async searchClips(query: string): Promise<AnalyticsClipOption[]> {
    let request = supabase.from("clips")
      .select("id,title,caption,thumbnail_url,published_at,vendors(business_name)")
      .neq("status", "deleted").order("created_at", { ascending: false }).limit(20);
    const needle = query.trim().replace(/[,%()]/g, " ");
    if (needle) request = request.or(`title.ilike.%${needle}%,caption.ilike.%${needle}%,id.eq.${/^[0-9a-f-]{36}$/i.test(needle) ? needle : "00000000-0000-0000-0000-000000000000"}`);
    const { data, error } = await request;
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id), title: String(row.title), thumbnailUrl: String(row.thumbnail_url),
      vendorName: nameOf(row.vendors, "business_name", "Unknown vendor"),
      publishedAt: row.published_at ? String(row.published_at) : null,
    }));
  },
};
