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
  total_count: number;
};

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
};

export class SubscriptionAdminService {
  static async metrics() {
    const { data, error } = await supabase.rpc("admin_subscription_metrics");
    if (error) throw error;
    return data as Record<string, number>;
  }

  static async listPlans() {
    const { data, error } = await supabase.from("subscription_plans").select("*").is("archived_at", null).order("display_order").order("created_at");
    if (error) throw error;
    return data ?? [];
  }

  static async savePlan(input: AdminPlanInput) {
    const payload = {
      name: input.name.trim(), slug: input.slug.trim().toLowerCase(), description: input.description?.trim() || null,
      price: input.price, discounted_price: input.discounted_price ?? null, currency: input.currency || "INR",
      billing_interval: input.billing_interval, billing_interval_count: input.billing_interval_count,
      duration_days: input.billing_interval === "custom" ? input.duration_days : null,
      trial_enabled: Boolean(input.trial_enabled), trial_days: input.trial_days ?? 0,
      grace_period_days: input.grace_period_days ?? 0, is_active: input.is_active ?? true,
      is_featured: input.is_featured ?? false,
    };
    if (input.id) {
      const { data, error } = await supabase.from("subscription_plans").update(payload).eq("id", input.id).select().single();
      if (error) throw error; return data;
    }
    const { data, error } = await supabase.from("subscription_plans").insert(payload).select().single();
    if (error) throw error; return data;
  }

  static async setPlanActive(id: string, active: boolean) {
    const { error } = await supabase.from("subscription_plans").update({ is_active: active }).eq("id", id);
    if (error) throw error;
  }

  static async archivePlan(id: string) {
    const { error } = await supabase.from("subscription_plans").update({ is_active: false, archived_at: new Date().toISOString() }).eq("id", id);
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

  static async listVendors(search = "", status = "all") {
    const { data, error } = await supabase.rpc("admin_list_vendor_subscriptions", { search_text: search || null, status_filter: status, page_size: 100, page_offset: 0 });
    if (error) throw error;
    return (data ?? []) as AdminVendorSubscriptionRow[];
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
    const { data, error } = await supabase.from("subscription_payments").select("*,vendors(business_name,owner_name),subscription_plans(name)").order("created_at", { ascending: false }).limit(500);
    if (error) throw error; return data ?? [];
  }

  static async listEvents(vendorId?: string) {
    let query = supabase.from("subscription_events").select("*,vendors(business_name)").order("created_at", { ascending: false }).limit(500);
    if (vendorId) query = query.eq("vendor_id", vendorId);
    const { data, error } = await query;
    if (error) throw error; return data ?? [];
  }
}
