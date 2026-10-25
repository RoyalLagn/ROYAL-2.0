import { supabase } from "@/services/supabase";
import { verifyAdminSession } from "@/services/adminAuth";

export type AdminClipStatus = "draft" | "pending" | "approved" | "hidden" | "rejected" | "deleted";
export type AdminClip = {
  id: string;
  vendor_id: string;
  title: string;
  caption: string | null;
  thumbnail_url: string;
  video_url: string;
  status: AdminClipStatus;
  visibility: "public" | "unlisted" | "private";
  moderation_reason: string | null;
  views_count: number;
  likes_count: number;
  saves_count: number;
  created_at: string;
  published_at: string | null;
  vendor_name: string;
  category_id: string | null;
  category_name: string;
};

export type AdminEnquiryStatus =
  | "new"
  | "in_progress"
  | "customer_contacted"
  | "vendor_contacted"
  | "awaiting_confirmation"
  | "confirmed"
  | "closed"
  | "cancelled"
  | "booked"
  | "contacted"
  | "in_discussion"
  | "quotation_sent"
  | "follow_up"
  | "not_interested"
  | "invalid_lead"
  | "no_response";

export type AdminEnquiry = {
  id: string;
  vendor_id: string;
  customer_id: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  event_date: string | null;
  event_type: string | null;
  package_id: string | null;
  package_name: string | null;
  reference_code: string;
  enquiry_channel: "call" | "whatsapp" | "form";
  source_type: string;
  customer_confirmation: string;
  vendor_notes: string | null;
  follow_up_date: string | null;
  message: string;
  status: AdminEnquiryStatus;
  created_at: string;
  updated_at: string;
  vendor_name: string;
  vendor_logo: string | null;
  vendor_phone: string | null;
  category_id: string | null;
  category_name: string;
  customer_profile_image: string | null;
  total_count: number;
  call_count: number;
  whatsapp_count: number;
  form_count: number;
  new_count: number;
  in_progress_count: number;
  confirmed_count: number;
};

export type AdminReview = {
  id: string;
  vendor_key: string;
  vendor_id: string | null;
  profile_id: string;
  rating: number;
  title: string;
  review: string;
  status: "published" | "pending" | "rejected";
  helpful_count: number;
  is_verified_customer: boolean;
  created_at: string;
  updated_at: string;
  customer_name: string;
  vendor_name: string;
  category_id: string | null;
  category_name: string;
};

function relationName(value: unknown, fallback: string) {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation && typeof relation === "object" && "name" in relation
    ? String((relation as { name?: unknown }).name || fallback)
    : fallback;
}

function relationBusinessName(value: unknown, fallback: string) {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation && typeof relation === "object" && "business_name" in relation
    ? String((relation as { business_name?: unknown }).business_name || fallback)
    : fallback;
}

function enquiryVendor(value: unknown) {
  const relation = Array.isArray(value) ? value[0] : value;
  if (!relation || typeof relation !== "object") {
    return { name: "Unknown vendor", categoryId: null, categoryName: "Uncategorized" };
  }
  const vendor = relation as Record<string, unknown>;
  return {
    name: String(vendor.business_name || "Unknown vendor"),
    categoryId: vendor.category_id ? String(vendor.category_id) : null,
    categoryName: relationName(vendor.categories, "Uncategorized"),
  };
}

function relationFullName(value: unknown, fallback: string) {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation && typeof relation === "object" && "full_name" in relation
    ? String((relation as { full_name?: unknown }).full_name || fallback)
    : fallback;
}

export const AdminOperationsService = {
  async clips(): Promise<AdminClip[]> {
    const { data, error } = await supabase
      .from("clips")
      .select("id,vendor_id,category_id,title,caption,thumbnail_url,video_url,status,visibility,moderation_reason,views_count,likes_count,saves_count,created_at,published_at,vendors(business_name),categories(name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id), vendor_id: String(row.vendor_id),
      category_id: row.category_id ? String(row.category_id) : null,
      title: String(row.title),
      caption: row.caption ? String(row.caption) : null,
      thumbnail_url: String(row.thumbnail_url), video_url: String(row.video_url),
      status: String(row.status) as AdminClipStatus,
      visibility: String(row.visibility) as AdminClip["visibility"],
      moderation_reason: row.moderation_reason ? String(row.moderation_reason) : null,
      views_count: Number(row.views_count ?? 0), likes_count: Number(row.likes_count ?? 0),
      saves_count: Number(row.saves_count ?? 0), created_at: String(row.created_at),
      published_at: row.published_at ? String(row.published_at) : null,
      vendor_name: relationBusinessName(row.vendors, "Unknown vendor"),
      category_name: relationName(row.categories, "Uncategorized"),
    }));
  },

  /** @deprecated Superseded by deleteClip() — the moderation workflow (Hide/Reject/Approve) is no longer exposed in the Admin UI. Left in place only because moderate_clip() still exists server-side; nothing calls this anymore. */
  async moderateClip(id: string, decision: "approved" | "hidden" | "rejected", reason?: string) {
    if ((decision === "hidden" || decision === "rejected") && !reason?.trim()) {
      throw new Error("A moderation reason is required.");
    }
    const { error } = await supabase.rpc("moderate_clip", {
      target_clip_id: id,
      decision,
      reason: decision === "approved" ? null : reason?.trim(),
    });
    if (error) throw error;
  },

  /**
   * Permanently deletes a clip: notifies the owning vendor with the given
   * reason, deletes its Cloudinary video/thumbnail, then hard-deletes the
   * clip row (engagement/analytics rows cascade automatically). All of this
   * happens server-side in the admin-delete-clip Edge Function — the client
   * never determines the vendor or touches Cloudinary/the database directly.
   * Throws with a `.stage` on the error ("notification" | "media" |
   * "database" | ...) so the UI can show the precise, accurate failure.
   */
  async deleteClip(clipId: string, reason: string): Promise<void> {
    const identity = await verifyAdminSession(undefined, false);
    const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string; stage?: string }>(
      "admin-delete-clip",
      { body: { clipId, reason }, headers: { Authorization: `Bearer ${identity.session.access_token}` } },
    );
    if (error) {
      const context = typeof error === "object" && error && "context" in error ? (error as { context?: Response }).context : null;
      let detail: { error?: string; stage?: string } | null = null;
      if (context) {
        try { detail = await context.clone().json(); } catch { /* no JSON body */ }
      }
      const message = detail?.error || error.message || "Unable to delete this clip. Try again.";
      const wrapped = new Error(message) as Error & { stage?: string };
      wrapped.stage = detail?.stage;
      throw wrapped;
    }
    if (!data?.success) {
      const wrapped = new Error(data?.error || "Unable to delete this clip. Try again.") as Error & { stage?: string };
      wrapped.stage = data?.stage;
      throw wrapped;
    }
  },

  async enquiries({
    page,
    pageSize,
    query,
    categoryId,
    date,
    period,
    statusFilter,
  }: {
    page: number;
    pageSize: number;
    query: string;
    categoryId: string | null;
    date: string | null;
    period: "all" | "day" | "month" | "year";
    statusFilter?: string | null;
  }): Promise<{
    rows: AdminEnquiry[];
    total: number;
    calls: number;
    whatsapp: number;
    form: number;
    newCount: number;
    inProgressCount: number;
    confirmedCount: number;
  }> {
    try {
      let baseQuery = supabase
        .from("vendor_enquiries")
        .select(
          `
          id,
          vendor_id,
          customer_id,
          customer_name,
          customer_email,
          customer_phone,
          event_date,
          event_type,
          package_id,
          package_name,
          reference_code,
          enquiry_channel,
          source_type,
          customer_confirmation,
          vendor_notes,
          follow_up_date,
          message,
          status,
          created_at,
          updated_at,
          vendors (
            id,
            business_name,
            logo_url,
            contact_phone,
            category_id,
            categories (
              id,
              name
            )
          ),
          profiles:customer_id (
            id,
            full_name,
            email,
            phone,
            profile_image
          )
        `,
          { count: "exact" }
        );

      if (categoryId) {
        baseQuery = baseQuery.eq("vendors.category_id", categoryId);
      }

      if (statusFilter && statusFilter !== "all") {
        baseQuery = baseQuery.eq("status", statusFilter);
      }

      const q = query.trim();
      if (q) {
        baseQuery = baseQuery.or(
          `reference_code.ilike.%${q}%,customer_name.ilike.%${q}%,customer_email.ilike.%${q}%,customer_phone.ilike.%${q}%,message.ilike.%${q}%`
        );
      }

      if (date && period !== "all") {
        const d = new Date(date);
        if (!isNaN(d.getTime())) {
          if (period === "day") {
            const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
            const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();
            baseQuery = baseQuery.gte("created_at", start).lt("created_at", end);
          } else if (period === "month") {
            const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
            const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString();
            baseQuery = baseQuery.gte("created_at", start).lt("created_at", end);
          } else if (period === "year") {
            const start = new Date(d.getFullYear(), 0, 1).toISOString();
            const end = new Date(d.getFullYear() + 1, 0, 1).toISOString();
            baseQuery = baseQuery.gte("created_at", start).lt("created_at", end);
          }
        }
      }

      const [pageResult, allResult] = await Promise.all([
        baseQuery
          .order("created_at", { ascending: false })
          .range((page - 1) * pageSize, page * pageSize - 1),
        supabase.from("vendor_enquiries").select("id, enquiry_channel, status"),
      ]);

      if (pageResult.error) {
        throw pageResult.error;
      }

      const allRows = allResult.data ?? [];
      const calls = allRows.filter((r) => r.enquiry_channel === "call").length;
      const whatsapp = allRows.filter((r) => r.enquiry_channel === "whatsapp").length;
      const form = allRows.filter((r) => r.enquiry_channel === "form").length;
      const newCount = allRows.filter((r) => r.status === "new").length;
      const inProgressCount = allRows.filter((r) => r.status === "in_progress" || r.status === "customer_contacted" || r.status === "vendor_contacted").length;
      const confirmedCount = allRows.filter((r) => r.status === "confirmed" || r.status === "booked").length;

      const rows: AdminEnquiry[] = (pageResult.data ?? []).map((row: any) => {
        const v = Array.isArray(row.vendors) ? row.vendors[0] : row.vendors;
        const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        const cat = v?.categories ? (Array.isArray(v.categories) ? v.categories[0] : v.categories) : null;
        return {
          id: String(row.id),
          vendor_id: String(row.vendor_id),
          customer_id: row.customer_id ? String(row.customer_id) : null,
          customer_name: String(row.customer_name || p?.full_name || "Guest customer"),
          customer_email: row.customer_email || p?.email || null,
          customer_phone: row.customer_phone || p?.phone || null,
          event_date: row.event_date ? String(row.event_date) : null,
          event_type: row.event_type ? String(row.event_type) : null,
          package_id: row.package_id ? String(row.package_id) : null,
          package_name: row.package_name ? String(row.package_name) : null,
          reference_code: String(row.reference_code || ""),
          enquiry_channel: String(row.enquiry_channel || "form") as AdminEnquiry["enquiry_channel"],
          source_type: String(row.source_type || "vendor_profile"),
          customer_confirmation: String(row.customer_confirmation || "pending"),
          vendor_notes: row.vendor_notes ? String(row.vendor_notes) : null,
          follow_up_date: row.follow_up_date ? String(row.follow_up_date) : null,
          message: String(row.message || ""),
          status: String(row.status || "new") as AdminEnquiryStatus,
          created_at: String(row.created_at),
          updated_at: String(row.updated_at),
          vendor_name: String(v?.business_name || "Unknown vendor"),
          vendor_logo: v?.logo_url || null,
          vendor_phone: v?.contact_phone || null,
          category_id: v?.category_id || null,
          category_name: String(cat?.name || "Uncategorized"),
          customer_profile_image: p?.profile_image || null,
          total_count: pageResult.count ?? allRows.length,
          call_count: calls,
          whatsapp_count: whatsapp,
          form_count: form,
          new_count: newCount,
          in_progress_count: inProgressCount,
          confirmed_count: confirmedCount,
        };
      });

      return {
        rows,
        total: pageResult.count ?? allRows.length,
        calls,
        whatsapp,
        form,
        newCount,
        inProgressCount,
        confirmedCount,
      };
    } catch {
      const { data, error } = await supabase.rpc("admin_list_contact_enquiries_v4", {
        search_text: query.trim() || null,
        category_filter: categoryId,
        date_filter: date,
        period_filter: period,
        page_size: pageSize,
        page_offset: (page - 1) * pageSize,
      });
      if (error) throw error;
      const rows = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        vendor_id: String(row.vendor_id),
        customer_id: row.customer_id ? String(row.customer_id) : null,
        customer_name: String(row.customer_name),
        customer_email: row.customer_email ? String(row.customer_email) : null,
        customer_phone: row.customer_phone ? String(row.customer_phone) : null,
        event_date: row.event_date ? String(row.event_date) : null,
        event_type: row.event_type ? String(row.event_type) : null,
        package_id: row.package_id ? String(row.package_id) : null,
        package_name: row.package_name ? String(row.package_name) : null,
        reference_code: String(row.reference_code),
        enquiry_channel: String(row.enquiry_channel) as AdminEnquiry["enquiry_channel"],
        source_type: String(row.source_type),
        customer_confirmation: String(row.customer_confirmation),
        vendor_notes: row.vendor_notes ? String(row.vendor_notes) : null,
        follow_up_date: row.follow_up_date ? String(row.follow_up_date) : null,
        message: String(row.message),
        status: String(row.status) as AdminEnquiryStatus,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
        vendor_name: String(row.vendor_name || "Unknown vendor"),
        vendor_logo: row.vendor_logo ? String(row.vendor_logo) : null,
        vendor_phone: row.vendor_phone ? String(row.vendor_phone) : null,
        category_id: row.category_id ? String(row.category_id) : null,
        category_name: String(row.category_name || "Uncategorized"),
        customer_profile_image: row.customer_profile_image ? String(row.customer_profile_image) : null,
        total_count: Number(row.total_count ?? 0),
        call_count: Number(row.call_count ?? 0),
        whatsapp_count: Number(row.whatsapp_count ?? 0),
        form_count: Number(row.form_count ?? 0),
        new_count: Number(row.new_count ?? 0),
        in_progress_count: Number(row.in_progress_count ?? 0),
        confirmed_count: Number(row.confirmed_count ?? 0),
      }));
      return {
        rows,
        total: rows[0]?.total_count ?? 0,
        calls: rows[0]?.call_count ?? 0,
        whatsapp: rows[0]?.whatsapp_count ?? 0,
        form: rows[0]?.form_count ?? 0,
        newCount: rows[0]?.new_count ?? 0,
        inProgressCount: rows[0]?.in_progress_count ?? 0,
        confirmedCount: rows[0]?.confirmed_count ?? 0,
      };
    }
  },

  async updateEnquiryStatus(id: string, status: AdminEnquiryStatus, notes?: string | null, followUpOn?: string | null) {
    const { error } = await supabase.rpc("admin_update_enquiry_status", {
      target_enquiry_id: id,
      next_status: status,
      notes: notes !== undefined ? notes : null,
      follow_up_on: followUpOn !== undefined ? followUpOn : null,
    });
    if (error) {
      const { error: fallbackError } = await supabase.rpc("update_vendor_enquiry", {
        target_enquiry_id: id,
        next_status: status,
        notes: notes !== undefined ? notes : null,
        follow_up_on: followUpOn !== undefined ? followUpOn : null,
      });
      if (fallbackError) throw error;
    }
  },

  async reviews(): Promise<AdminReview[]> {
    const { data, error } = await supabase
      .from("reviews")
      .select("id,vendor_key,vendor_id,profile_id,rating,title,review,status,helpful_count,is_verified_customer,created_at,updated_at,profiles!reviews_profile_id_fkey(full_name),vendors(business_name,category_id,categories(name))")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((row) => {
      const vendor = enquiryVendor(row.vendors);
      return ({
      id: String(row.id), vendor_key: String(row.vendor_key),
      vendor_id: row.vendor_id ? String(row.vendor_id) : null,
      profile_id: String(row.profile_id), rating: Number(row.rating),
      title: String(row.title ?? ""), review: String(row.review ?? ""),
      status: String(row.status) as AdminReview["status"],
      helpful_count: Number(row.helpful_count ?? 0),
      is_verified_customer: Boolean(row.is_verified_customer),
      created_at: String(row.created_at), updated_at: String(row.updated_at),
      customer_name: relationFullName(row.profiles, "RoyalLagn customer"),
      vendor_name: vendor.name,
      category_id: vendor.categoryId,
      category_name: vendor.categoryName,
    });
    });
  },

  subscribe(table: "clips" | "vendor_enquiries" | "reviews", onChange: () => void) {
    const channel = supabase.channel(`admin-${table}-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, onChange)
      .subscribe();
    return () => {
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  },
};
