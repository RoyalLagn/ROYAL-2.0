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
  | "manual_extension"
  | "free_fallback";

export type SubscriptionPlanStatus = "active" | "coming_soon" | "hidden" | "archived";
export type SubscriptionBillingInterval = "month" | "year";

export type SubscriptionFeatureKey =
  | "vendor_dashboard_actions"
  | "edit_vendor_profile"
  | "upload_gallery"
  | "manage_albums"
  | "view_analytics"
  | "receive_enquiries"
  | "manage_reviews"
  | "featured_listing"
  | "priority_support"
  | "upload_clips";

export type SubscriptionAccess = {
  vendor_id: string;
  subscription_id: string | null;
  plan_id: string | null;
  plan_name: string | null;
  status: SubscriptionStatus;
  access_source: SubscriptionAccessSource | null;
  billing_interval: SubscriptionBillingInterval | string | null;
  price: number | null;
  currency: string | null;
  start_date: string | null;
  expiry_date: string | null;
  renewal_date: string | null;
  grace_period_end_date: string | null;
  trial_end_date: string | null;
  days_remaining: number | null;
  has_access: boolean;
  access_reason: string;
  clip_limit?: number | null;
  clip_usage?: number | null;
  clip_remaining?: number | null;
  clip_active?: number;
  clip_locked?: number;
  photo_limit: number | null;
  photo_usage: number | null;
  photo_remaining: number | null;
  photo_active: number;
  photo_locked: number;
  scheduled_plan_id: string | null;
  scheduled_plan_name: string | null;
  scheduled_billing_option_id: string | null;
  scheduled_change_at: string | null;
  features: Partial<Record<SubscriptionFeatureKey, { enabled: boolean; limit: number | null }>>;
};

export type SubscriptionPlanFeature = {
  feature_key: SubscriptionFeatureKey;
  name: string;
  description: string | null;
  is_enabled: boolean;
  limit_value: number | null;
};

export type SubscriptionPlanBillingOption = {
  id: string;
  plan_id: string;
  billing_interval: SubscriptionBillingInterval;
  interval_count: number;
  price: number;
  discounted_price: number | null;
  discount_percentage: number;
  currency: string;
  trial_enabled: boolean;
  trial_days: number;
  grace_period_days: number;
  is_active: boolean;
  display_order: number;
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
  status: SubscriptionPlanStatus;
  is_permanent: boolean;
  max_image_upload_mb: number;
  stored_image_target_mb: number;
  max_clip_upload_mb?: number | null;
  stored_clip_target_mb?: number | null;
  clip_delivery_target_mb?: number | null;
  billing_options: SubscriptionPlanBillingOption[];
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
  applicable_billing_intervals: SubscriptionBillingInterval[];
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
  metadata?: Record<string, any> | null;
  subscription_plans?: { name: string } | null;
};

export type SubscriptionCheckoutPreview = {
  quote_id: string;
  quote_expires_at: string;
  plan_id: string;
  billing_option_id: string | null;
  offer_id: string | null;
  plan_name: string;
  billing_interval: SubscriptionBillingInterval;
  currency: string;
  base_amount: number;
  interval_discount_percentage: number;
  interval_discount_amount: number;
  promotional_discount_percentage: number;
  promotional_discount_amount: number;
  current_plan_credit: number;
  proration_ratio: number;
  is_prorated_upgrade: boolean;
  proration_period_end: string | null;
  proration_evaluated_at: string;
  full_cycle_payable: number;
  original_amount: number;
  discount_amount: number;
  total_savings: number;
  payable_amount: number;
  amount_minor: number;
  subscription_start_at: string;
  subscription_end_at: string | null;
};

export type PublicSubscriptionSetting = {
  key: string;
  value: unknown;
  value_type: string;
  description: string | null;
};
