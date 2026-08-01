export type SubscriptionStatus =
  | "pending"
  | "trial"
  | "launch_offer"
  | "active"
  | "past_due"
  | "grace_period"
  | "expired"
  | "cancelled"
  | "suspended"
  | "deactivated";

export type SubscriptionAccessSource =
  | "paid_subscription"
  | "free_trial"
  | "launch_offer"
  | "admin_grant"
  | "promotional_offer"
  | "manual_extension";

export type SubscriptionFeatureKey =
  | "vendor_dashboard_actions"
  | "upload_clips"
  | "edit_vendor_profile"
  | "upload_gallery"
  | "manage_albums"
  | "view_analytics"
  | "receive_enquiries"
  | "manage_reviews"
  | "featured_listing"
  | "priority_support";

export type SubscriptionAccess = {
  vendor_id: string;
  subscription_id: string | null;
  plan_id: string | null;
  plan_name: string | null;
  status: SubscriptionStatus;
  access_source: SubscriptionAccessSource | null;
  start_date: string | null;
  expiry_date: string | null;
  grace_period_end_date: string | null;
  days_remaining: number | null;
  has_access: boolean;
  access_reason: string;
};

export type SubscriptionPlanFeature = {
  feature_key: SubscriptionFeatureKey;
  name: string;
  description: string | null;
  is_enabled: boolean;
  limit_value: number | null;
};

export type SubscriptionPlan = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  discounted_price: number | null;
  currency: string;
  billing_interval: "day" | "month" | "year" | "custom";
  billing_interval_count: number;
  duration_days: number | null;
  trial_enabled: boolean;
  trial_days: number;
  grace_period_days: number;
  is_active: boolean;
  is_featured: boolean;
  display_order: number;
  features: SubscriptionPlanFeature[];
};

export type SubscriptionOffer = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  discount_type: "percentage" | "fixed" | "free";
  discount_value: number;
  start_date: string | null;
  end_date: string | null;
  applicable_plan_ids: string[];
  is_global: boolean;
};

export type SubscriptionPayment = {
  id: string;
  plan_id: string;
  amount: number;
  original_amount: number;
  discount_amount: number;
  currency: string;
  payment_status: string;
  payment_method: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  failure_reason: string | null;
  period_start: string | null;
  period_end: string | null;
  paid_at: string | null;
  created_at: string;
  subscription_plans?: { name: string } | null;
};

export type PublicSubscriptionSetting = {
  key: string;
  value: unknown;
  value_type: string;
  description: string | null;
};

