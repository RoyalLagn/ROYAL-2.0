import { supabase } from "@/services/supabase";

export type AdminVendorSubscriptionRow = {
  vendor_id: string;
  business_name: string;
  owner_name: string | null;
  email: string | null;
  phone: string | null;
  subscription_id: string | null;
  plan_id: string | null;
  plan_name: string | null;
  status: string;
  access_source: string | null;
  start_date: string | null;
  expiry_date: string | null;
  days_remaining: number | null;
  last_payment_status: string | null;
  last_payment_amount: number | null;
  /** Vendor's marketplace category (public.categories, same table Vendors/Enquiries already use) — null for a vendor with no category assigned. */
  category_id: string | null;
  category_name: string | null;
  total_count: number;
  clip_total: number;
  clip_active: number;
  clip_locked: number;
  photo_total: number;
  photo_active: number;
  photo_locked: number;
};

/** One row per marketplace category (plus a synthetic "Uncategorized" row when applicable), counting every vendor the Subscribers list also counts as a "subscriber" — same source of truth as admin_list_vendor_subscriptions. */
export type AdminSubscriberCategoryCount = {
  category_id: string | null;
  category_name: string;
  subscriber_count: number;
};

export type AdminPlanStatus = "active" | "coming_soon" | "hidden" | "archived";

export type AdminPlanInput = {
  id?: string;
  name: string;
  slug: string;
  description?: string;
  price: number;
  discounted_price?: number | null;
  currency?: string;
  billing_interval: "day" | "month" | "year" | "custom";
  billing_interval_count: number;
  duration_days?: number | null;
  trial_enabled?: boolean;
  trial_days?: number;
  grace_period_days?: number;
  is_active?: boolean;
  is_featured?: boolean;
  status?: AdminPlanStatus;
  is_permanent?: boolean;
  display_order?: number;
  max_image_upload_mb?: number;
  stored_image_target_mb?: number;
  max_clip_upload_mb?: number | null;
  stored_clip_target_mb?: number | null;
  clip_delivery_target_mb?: number | null;
};

export type AdminBillingOptionInput = {
  id?: string;
  plan_id: string;
  billing_interval: "month" | "year";
  interval_count?: number;
  price: number;
  discounted_price?: number | null;
  discount_percentage?: number;
  currency?: string;
  trial_enabled?: boolean;
  trial_days?: number;
  grace_period_days?: number;
  is_active?: boolean;
  display_order?: number;
};

export class SubscriptionAdminService {
  static async metrics() {
    const { data, error } = await supabase.rpc("admin_subscription_metrics");
    if (error) throw error;
    return data as Record<string, number>;
  }

  static async listPlans() {
    const { data, error } = await supabase
      .from("subscription_plans")
      .select(`
        *,
        subscription_plan_billing_options(id,billing_interval,price,discounted_price,discount_percentage,currency,is_active,display_order),
        subscription_plan_features(is_enabled,limit_value,subscription_feature_definitions(feature_key,name))
      `)
      .is("archived_at", null)
      .order("display_order")
      .order("created_at");
    if (error) throw error;
    return data ?? [];
  }

  static async savePlan(input: AdminPlanInput) {
    const slug = input.slug.trim().toLowerCase();
    const isFreePlan = slug === "free";
    const sharedPayload = {
      name: input.name.trim(), slug, description: input.description?.trim() || null,
      price: input.price, discounted_price: input.discounted_price ?? null, currency: input.currency || "INR",
      grace_period_days: input.grace_period_days ?? 0,
      max_image_upload_mb: input.max_image_upload_mb ?? 5,
      stored_image_target_mb: input.stored_image_target_mb ?? 4,
      max_clip_upload_mb: input.max_clip_upload_mb ?? null,
      stored_clip_target_mb: input.stored_clip_target_mb ?? null,
      clip_delivery_target_mb: input.clip_delivery_target_mb ?? null,
      status: isFreePlan ? "active" as const : input.status ?? (input.is_active === false ? "hidden" : "active"),
    };
    if (input.id) {
      const { data, error } = await supabase.from("subscription_plans").update(sharedPayload).eq("id", input.id).select().single();
      if (error) throw error; return data;
    }
    const { data, error } = await supabase.from("subscription_plans").insert({
      ...sharedPayload,
      billing_interval: input.billing_interval,
      billing_interval_count: 1,
      duration_days: input.billing_interval === "custom" ? input.duration_days : null,
      trial_enabled: false,
      trial_days: 0,
      is_featured: false,
      is_permanent: isFreePlan || Boolean(input.is_permanent),
    }).select().single();
    if (error) throw error; return data;
  }

  /** Sets the plan lifecycle status directly: 'active' (visible and
   * purchasable), 'coming_soon' (visible, purchase disabled), 'hidden'
   * (not shown to vendors), or 'archived' (unavailable for new purchases;
   * existing/historical subscriptions are never affected by this). */
  static async setPlanStatus(id: string, status: AdminPlanStatus) {
    const { error } = await supabase.from("subscription_plans").update({ status }).eq("id", id);
    if (error) throw error;
  }

  /** @deprecated use setPlanStatus('active' | 'hidden') */
  static async setPlanActive(id: string, active: boolean) {
    await this.setPlanStatus(id, active ? "active" : "hidden");
  }

  static async archivePlan(id: string) {
    const { error } = await supabase.from("subscription_plans").update({ status: "archived" }).eq("id", id);
    if (error) throw error;
  }

  /** Number of vendor_subscriptions rows currently 'active' on this plan — used to block deletion with a specific, useful count before even attempting it. */
  static async activePlanSubscriberCount(planId: string): Promise<number> {
    const { count, error } = await supabase
      .from("vendor_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", planId)
      .eq("status", "active");
    if (error) throw error;
    return count ?? 0;
  }

  /**
   * Permanently deletes a subscription plan. Deliberately a hard DELETE, not
   * another status flag — Delete is a separate, permanent action from the
   * existing Active/Coming soon/Inactive availability states and from
   * archivePlan() above (soft, reversible).
   *
   * Safety is enforced by the existing schema, not invented here:
   *   - vendor_subscriptions.plan_id and subscription_payments.plan_id are
   *     both `references subscription_plans(id) on delete restrict` — the
   *     database itself refuses this delete if ANY subscription or payment
   *     (active or historical) still references the plan, so historical
   *     financial/subscription data can never be cascade-deleted by this
   *     call. subscription_plan_features/billing_options cascade (existing,
   *     intentional — they're plan configuration, not history).
   *   - private.enforce_free_subscription_plan_invariant (an existing
   *     trigger) unconditionally rejects deleting the 'free' plan.
   * Both surface as a normal thrown PostgrestError for the caller to show.
   */
  static async deletePlan(id: string) {
    const { error } = await supabase.from("subscription_plans").delete().eq("id", id);
    if (error) throw error;
  }

  static async listBillingOptions(planId: string) {
    const { data, error } = await supabase
      .from("subscription_plan_billing_options")
      .select("*")
      .eq("plan_id", planId)
      .order("display_order")
      .order("billing_interval");
    if (error) throw error; return data ?? [];
  }

  static async saveBillingOption(input: AdminBillingOptionInput) {
    const payload = {
      plan_id: input.plan_id, billing_interval: input.billing_interval,
      interval_count: input.interval_count ?? 1, price: input.price,
      discounted_price: input.discounted_price ?? null, currency: input.currency || "INR",
      discount_percentage: input.discount_percentage ?? 0,
      trial_enabled: Boolean(input.trial_enabled), trial_days: input.trial_days ?? 0,
      grace_period_days: input.grace_period_days ?? 0, is_active: input.is_active ?? true,
      display_order: input.display_order ?? 0,
    };
    if (input.id) {
      const { data, error } = await supabase.from("subscription_plan_billing_options").update(payload).eq("id", input.id).select().single();
      if (error) throw error; return data;
    }
    const { data, error } = await supabase.from("subscription_plan_billing_options").insert(payload).select().single();
    if (error) throw error; return data;
  }

  static async setBillingOptionActive(id: string, active: boolean) {
    const { error } = await supabase.from("subscription_plan_billing_options").update({ is_active: active }).eq("id", id);
    if (error) throw error;
  }

  static async deleteBillingOption(id: string) {
    const { error } = await supabase.from("subscription_plan_billing_options").delete().eq("id", id);
    if (error) throw error;
  }

  static async listFeatures() {
    const { data, error } = await supabase.from("subscription_feature_definitions").select("*").order("name");
    if (error) throw error; return data ?? [];
  }

  static async listPlanFeatures(planId: string) {
    const { data, error } = await supabase.from("subscription_plan_features").select("*,subscription_feature_definitions(*)").eq("plan_id", planId);
    if (error) throw error; return data ?? [];
  }

  static async setPlanFeature(planId: string, featureId: string, enabled: boolean, limitValue?: number | null) {
    const { error } = await supabase.from("subscription_plan_features").upsert({ plan_id: planId, feature_id: featureId, is_enabled: enabled, limit_value: limitValue ?? null });
    if (error) throw error;
  }

  static async listOffers() {
    const { data, error } = await supabase.from("subscription_offers").select("*").is("archived_at", null).order("created_at", { ascending: false });
    if (error) throw error; return data ?? [];
  }

  static async saveOffer(input: any) {
    const payload = { ...input, name: input.name.trim(), code: input.code?.trim().toUpperCase() || null, discount_value: Number(input.discount_value || 0) };
    delete payload.id;
    if (input.id) {
      const { data, error } = await supabase.from("subscription_offers").update(payload).eq("id", input.id).select().single();
      if (error) throw error; return data;
    }
    const { data, error } = await supabase.from("subscription_offers").insert(payload).select().single();
    if (error) throw error; return data;
  }

  static async archiveOffer(id: string) {
    const { error } = await supabase.from("subscription_offers").update({ is_active: false, archived_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  }

  static async listVendors(search = "", status = "all", categoryId: string | null = null, planId: string | null = null, page = 1, pageSize = 30) {
    const [{ data, error }, { data: usage, error: usageError }] = await Promise.all([
      supabase.rpc("admin_list_vendor_subscriptions", { search_text: search || null, status_filter: status, plan_filter: planId || null, page_size: pageSize, page_offset: Math.max(0, page - 1) * pageSize, category_filter: categoryId || null }),
      supabase.rpc("admin_subscription_media_usage"),
    ]);
    if (error) throw error;
    if (usageError) throw usageError;
    const usageByVendor = new Map<string, any>((usage ?? []).map((row: any) => [row.vendor_id, row]));
    return (data ?? []).map((row: any) => ({
      ...row,
      clip_total: Number(usageByVendor.get(row.vendor_id)?.clip_total ?? 0),
      clip_active: Number(usageByVendor.get(row.vendor_id)?.clip_active ?? 0),
      clip_locked: Number(usageByVendor.get(row.vendor_id)?.clip_locked ?? 0),
      photo_total: Number(usageByVendor.get(row.vendor_id)?.photo_total ?? 0),
      photo_active: Number(usageByVendor.get(row.vendor_id)?.photo_active ?? 0),
      photo_locked: Number(usageByVendor.get(row.vendor_id)?.photo_locked ?? 0),
    })) as AdminVendorSubscriptionRow[];
  }

  /** One aggregate query — never one query per category — powering the category filter chips' counts. Same vendor/category source of truth as listVendors above. */
  static async listSubscriberCategoryCounts(): Promise<AdminSubscriberCategoryCount[]> {
    const { data, error } = await supabase.rpc("admin_subscriber_category_counts");
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      category_id: row.category_id ?? null,
      category_name: row.category_name,
      subscriber_count: Number(row.subscriber_count ?? 0),
    }));
  }

  static async manageVendor(vendorId: string, action: string, payload: Record<string, unknown> = {}) {
    const { data, error } = await supabase.rpc("admin_manage_vendor_subscription", { target_vendor_id: vendorId, requested_action: action, payload });
    if (error) throw error; return data as string;
  }

  static async listSettings() {
    const { data, error } = await supabase.from("application_settings").select("*").like("key", "subscription_%").order("key");
    if (error) throw error; return data ?? [];
  }

  static async updateSetting(key: string, value: unknown) {
    const { error } = await supabase.from("application_settings").update({ value }).eq("key", key);
    if (error) throw error;
  }

  static async listPayments() {
    const { data, error } = await supabase.from("subscription_payments").select("*,vendors(business_name,owner_name,category_id,categories(name)),subscription_plans(name)").order("created_at", { ascending: false }).limit(500);
    if (error) throw error; return data ?? [];
  }

  static async listEvents(vendorId?: string) {
    let query = supabase.from("subscription_events").select("*,vendors(business_name)").order("created_at", { ascending: false }).limit(500);
    if (vendorId) query = query.eq("vendor_id", vendorId);
    const { data, error } = await query;
    if (error) throw error; return data ?? [];
  }

  static subscribe(onChange: () => void) {
    const channel = supabase.channel(`subscription-admin-${Date.now()}`);
    for (const table of ["vendor_subscriptions", "subscription_plans", "subscription_payments", "vendors"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
    }
    channel.subscribe();
    return () => { void channel.unsubscribe(); void supabase.removeChannel(channel); };
  }
}
