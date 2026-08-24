import { supabase } from "@/services/supabase";
import type {
  PublicSubscriptionSetting,
  SubscriptionAccess,
  SubscriptionCheckoutPreview,
  SubscriptionFeatureKey,
  SubscriptionOffer,
  SubscriptionPayment,
  SubscriptionPlan,
  SubscriptionPlanFeature,
} from "@/subscriptions/types";
import { isSubscriptionSchemaMissing } from "@/subscriptions/error";

let schemaState: "unknown" | "available" | "missing" = "unknown";

const PLAN_SELECT = `
  id,name,slug,description,price,discounted_price,currency,billing_interval,
  billing_interval_count,duration_days,trial_enabled,trial_days,grace_period_days,
  is_active,is_featured,display_order,status,is_permanent,
  subscription_plan_features(
    is_enabled,limit_value,
    subscription_feature_definitions(feature_key,name,description)
  ),
  subscription_plan_billing_options(
    id,plan_id,billing_interval,interval_count,price,discounted_price,discount_percentage,currency,
    trial_enabled,trial_days,grace_period_days,is_active,display_order
  )
`;

function mapPlan(row: any): SubscriptionPlan {
  return {
    ...row,
    price: Number(row.price),
    discounted_price: row.discounted_price == null ? null : Number(row.discounted_price),
    status: row.status ?? (row.is_active ? "active" : "hidden"),
    is_permanent: Boolean(row.is_permanent),
    features: (row.subscription_plan_features ?? []).map((entry: any): SubscriptionPlanFeature => ({
      feature_key: entry.subscription_feature_definitions.feature_key,
      name: entry.subscription_feature_definitions.name,
      description: entry.subscription_feature_definitions.description,
      is_enabled: Boolean(entry.is_enabled),
      limit_value: entry.limit_value,
    })),
    billing_options: (row.subscription_plan_billing_options ?? [])
      .filter((option: any) => option.is_active)
      .map((option: any) => ({
        ...option,
        price: Number(option.price),
        discounted_price: option.discounted_price == null ? null : Number(option.discounted_price),
        discount_percentage: Number(option.discount_percentage ?? 0),
      }))
      .sort((a: any, b: any) => a.display_order - b.display_order || a.billing_interval.localeCompare(b.billing_interval)),
  };
}

export class SubscriptionAccessService {
  static async previewCheckout(
    planId: string,
    billingOptionId: string | null,
    offerId: string | null,
  ): Promise<SubscriptionCheckoutPreview> {
    const { data, error } = await supabase.rpc("create_my_subscription_quote", {
      target_plan_id: planId,
      target_billing_option_id: billingOptionId,
      target_offer_id: offerId,
    });
    if (error) throw error;
    const row = data as Record<string, unknown> | null;
    if (!row) throw new Error("Unable to calculate subscription pricing");
    const number = (key: string) => Number(row[key] ?? 0);
    return {
      ...(row as unknown as SubscriptionCheckoutPreview),
      base_amount: number("base_amount"),
      interval_discount_percentage: number("interval_discount_percentage"),
      interval_discount_amount: number("interval_discount_amount"),
      promotional_discount_percentage: number("promotional_discount_percentage"),
      promotional_discount_amount: number("promotional_discount_amount"),
      current_plan_credit: number("current_plan_credit"),
      proration_ratio: number("proration_ratio"),
      full_cycle_payable: number("full_cycle_payable"),
      original_amount: number("original_amount"),
      discount_amount: number("discount_amount"),
      total_savings: number("total_savings"),
      payable_amount: number("payable_amount"),
      amount_minor: number("amount_minor"),
      is_prorated_upgrade: row.is_prorated_upgrade === true,
    };
  }

  static async getCurrentAccess(): Promise<SubscriptionAccess | null> {
    // Guard against calling the RPC without a session: it's revoked from
    // `anon` and always 401s for a signed-out/not-yet-restored caller. Avoid
    // the round trip entirely rather than surface a spurious auth error.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    // Public/customer accounts also have authenticated sessions, but the
    // refresh RPC is intentionally vendor-only and returns 403 for them.
    // The read RPC safely returns no rows for non-vendors, so use it as the
    // role-neutral guard before invoking any vendor-only operation.
    const { data: initialData, error: initialError } = await supabase.rpc("get_my_subscription_access");
    if (initialError) {
      if (/does not exist|schema cache|PGRST202/i.test(initialError.message)) return null;
      if (/PGRST301|JWT|401/i.test(initialError.message ?? "") || (initialError as { status?: number }).status === 401) {
        return null;
      }
      throw initialError;
    }
    const initialAccess = (Array.isArray(initialData) ? initialData[0] : initialData) as SubscriptionAccess | null;
    if (!initialAccess) return null;

    const { data: mediaUsage, error: refreshError } = await supabase.rpc("refresh_my_subscription_access");
    if (refreshError && !/does not exist|schema cache|PGRST202/i.test(refreshError.message)) throw refreshError;
    const [{ data, error }, { data: entitlementData, error: entitlementError }] = await Promise.all([
      supabase.rpc("get_my_subscription_access"),
      supabase.rpc("get_my_subscription_entitlements"),
    ]);
    if (error) {
      if (/does not exist|schema cache|PGRST202/i.test(error.message)) return null;
      // A 401/expired-JWT here means the session lapsed between the check
      // above and the request landing; treat it as "no access" rather than
      // throwing, since retrying is handled by the caller's own refresh.
      if (/PGRST301|JWT|401/i.test(error.message ?? "") || (error as { status?: number }).status === 401) {
        return null;
      }
      throw error;
    }
    if (entitlementError && !/does not exist|schema cache|PGRST202/i.test(entitlementError.message)) {
      throw entitlementError;
    }
    const access = (Array.isArray(data) ? data[0] : data) as Omit<SubscriptionAccess, "features" | "renewal_date"> | null;
    return access ? {
      ...access,
      renewal_date: access.expiry_date,
      clip_active: Number((mediaUsage as any)?.clip_active ?? access.clip_usage ?? 0),
      clip_locked: Number((mediaUsage as any)?.clip_locked ?? 0),
      photo_active: Number((mediaUsage as any)?.photo_active ?? access.photo_usage ?? 0),
      photo_locked: Number((mediaUsage as any)?.photo_locked ?? 0),
      features: (entitlementData ?? {}) as SubscriptionAccess["features"],
    } : null;
  }

  static async listPlans(): Promise<SubscriptionPlan[]> {
    const { data, error } = await supabase
      .from("subscription_plans")
      .select(PLAN_SELECT)
      .in("status", ["active", "coming_soon"])
      .is("archived_at", null)
      .order("display_order")
      .order("created_at");
    if (error) {
      if (isSubscriptionSchemaMissing(error)) {
        schemaState = "missing";
        return [];
      }
      throw error;
    }
    schemaState = "available";
    return (data ?? []).map(mapPlan);
  }

  static isPlatformSchemaAvailable() {
    return schemaState === "available";
  }

  static async listOffers(): Promise<SubscriptionOffer[]> {
    const { data, error } = await supabase
      .from("subscription_offers")
      .select("id,name,code,description,discount_type,discount_value,start_date,end_date,applicable_plan_ids,applicable_billing_intervals,is_global")
      .eq("is_active", true)
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((offer: any) => ({ ...offer, discount_value: Number(offer.discount_value) }));
  }

  static async listPublicSettings(): Promise<Record<string, unknown>> {
    const { data, error } = await supabase
      .from("application_settings")
      .select("key,value,value_type,description")
      .eq("is_public", true);
    if (error) throw error;
    return Object.fromEntries((data as PublicSubscriptionSetting[] ?? []).map((setting) => [setting.key, setting.value]));
  }

  static async listPayments(vendorId: string): Promise<SubscriptionPayment[]> {
    const { data, error } = await supabase
      .from("subscription_payments")
      .select("id,plan_id,amount,original_amount,discount_amount,currency,payment_status,payment_method,razorpay_order_id,razorpay_payment_id,failure_reason,period_start,period_end,paid_at,created_at,metadata,subscription_plans(name)")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((payment: any) => ({
      ...payment,
      amount: Number(payment.amount),
      original_amount: Number(payment.original_amount),
      discount_amount: Number(payment.discount_amount),
    }));
  }

  static subscribeToPayments(vendorId: string, onChange: () => void) {
    const channel = supabase
      .channel(`vendor-payments-${vendorId}-${Date.now()}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "subscription_payments",
        filter: `vendor_id=eq.${vendorId}`,
      }, onChange)
      .subscribe();
    return () => {
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }

  static hasFeature(access: SubscriptionAccess | null, plans: SubscriptionPlan[], feature: SubscriptionFeatureKey) {
    if (!access?.has_access || !access.plan_id) return false;
    if (access.features?.[feature]) return access.features[feature]?.enabled === true;
    const plan = plans.find((candidate) => candidate.id === access.plan_id);
    return Boolean(plan?.features.find((candidate) => candidate.feature_key === feature)?.is_enabled);
  }

  static canUploadClip(access: SubscriptionAccess | null) {
    return Boolean(access?.has_access && access.features?.upload_clips?.enabled && (access.clip_remaining ?? 0) > 0);
  }

  static canUploadPhoto(access: SubscriptionAccess | null) {
    return Boolean(access?.has_access && access.features?.upload_gallery?.enabled && (access.photo_remaining ?? 0) > 0);
  }

  static canUseAnalytics(access: SubscriptionAccess | null) {
    return Boolean(access?.has_access && access.features?.view_analytics?.enabled);
  }

  static canReceiveEnquiries(access: SubscriptionAccess | null) {
    return Boolean(access?.has_access && access.features?.receive_enquiries?.enabled);
  }

  static async requireFeature(vendorId: string, feature: SubscriptionFeatureKey) {
    const { data, error } = await supabase.rpc("require_vendor_feature_access", {
      target_vendor_id: vendorId,
      requested_feature_key: feature,
    });
    if (error) throw error;
    return data === true;
  }
}
