import { supabase } from "@/services/supabase";
import type {
  PublicSubscriptionSetting,
  SubscriptionAccess,
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
  is_active,is_featured,display_order,
  subscription_plan_features(
    is_enabled,limit_value,
    subscription_feature_definitions(feature_key,name,description)
  )
`;

function mapPlan(row: any): SubscriptionPlan {
  return {
    ...row,
    price: Number(row.price),
    discounted_price: row.discounted_price == null ? null : Number(row.discounted_price),
    features: (row.subscription_plan_features ?? []).map((entry: any): SubscriptionPlanFeature => ({
      feature_key: entry.subscription_feature_definitions.feature_key,
      name: entry.subscription_feature_definitions.name,
      description: entry.subscription_feature_definitions.description,
      is_enabled: Boolean(entry.is_enabled),
      limit_value: entry.limit_value,
    })),
  };
}

export class SubscriptionAccessService {
  static async getCurrentAccess(): Promise<SubscriptionAccess | null> {
    // Guard against calling the RPC without a session: it's revoked from
    // `anon` and always 401s for a signed-out/not-yet-restored caller. Avoid
    // the round trip entirely rather than surface a spurious auth error.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const { data, error } = await supabase.rpc("get_my_subscription_access");
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
    return (Array.isArray(data) ? data[0] : data) as SubscriptionAccess | null;
  }

  static async listPlans(): Promise<SubscriptionPlan[]> {
    const { data, error } = await supabase
      .from("subscription_plans")
      .select(PLAN_SELECT)
      .eq("is_active", true)
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
      .select("id,name,code,description,discount_type,discount_value,start_date,end_date,applicable_plan_ids,is_global")
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
      .select("id,plan_id,amount,original_amount,discount_amount,currency,payment_status,payment_method,razorpay_order_id,razorpay_payment_id,failure_reason,period_start,period_end,paid_at,created_at,subscription_plans(name)")
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

  static hasFeature(access: SubscriptionAccess | null, plans: SubscriptionPlan[], feature: SubscriptionFeatureKey) {
    if (!access?.has_access || !access.plan_id) return false;
    const plan = plans.find((candidate) => candidate.id === access.plan_id);
    return Boolean(plan?.features.find((candidate) => candidate.feature_key === feature)?.is_enabled);
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
