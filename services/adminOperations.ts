import { supabase } from "@/services/supabase";

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
  category_name: string;
};

export type AdminEnquiryStatus = "new" | "contacted" | "in_discussion" | "quotation_sent" | "follow_up" | "booked" | "not_interested" | "invalid_lead" | "no_response" | "closed";
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
      .select("id,vendor_id,title,caption,thumbnail_url,video_url,status,visibility,moderation_reason,views_count,likes_count,saves_count,created_at,published_at,vendors(business_name),categories(name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id), vendor_id: String(row.vendor_id), title: String(row.title),
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

  async enquiries(): Promise<AdminEnquiry[]> {
    const { data, error } = await supabase
      .from("vendor_enquiries")
      .select("id,vendor_id,customer_id,customer_name,customer_email,customer_phone,event_date,event_type,package_id,package_name,message,status,reference_code,enquiry_channel,source_type,customer_confirmation,vendor_notes,follow_up_date,created_at,updated_at,vendors(business_name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id), vendor_id: String(row.vendor_id),
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
      message: String(row.message), status: String(row.status) as AdminEnquiryStatus,
      created_at: String(row.created_at), updated_at: String(row.updated_at),
      vendor_name: relationBusinessName(row.vendors, "Unknown vendor"),
    }));
  },

  async updateEnquiryStatus(id: string, status: AdminEnquiryStatus) {
    const { data: existing, error: readError } = await supabase.from("vendor_enquiries").select("vendor_notes,follow_up_date").eq("id", id).single();
    if (readError) throw readError;
    const { error } = await supabase.rpc("update_vendor_enquiry", { target_enquiry_id: id, next_status: status, notes: existing.vendor_notes, follow_up_on: existing.follow_up_date });
    if (error) throw error;
  },

  async reviews(): Promise<AdminReview[]> {
    const { data, error } = await supabase
      .from("reviews")
      .select("id,vendor_key,vendor_id,profile_id,rating,title,review,status,helpful_count,is_verified_customer,created_at,updated_at,profiles(full_name),vendors(business_name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id), vendor_key: String(row.vendor_key),
      vendor_id: row.vendor_id ? String(row.vendor_id) : null,
      profile_id: String(row.profile_id), rating: Number(row.rating),
      title: String(row.title ?? ""), review: String(row.review ?? ""),
      status: String(row.status) as AdminReview["status"],
      helpful_count: Number(row.helpful_count ?? 0),
      is_verified_customer: Boolean(row.is_verified_customer),
      created_at: String(row.created_at), updated_at: String(row.updated_at),
      customer_name: relationFullName(row.profiles, "RoyalLagn customer"),
      vendor_name: relationBusinessName(row.vendors, String(row.vendor_key)),
    }));
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
