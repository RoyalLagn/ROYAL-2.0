import type { SubscriptionPlan, SubscriptionPlanBillingOption, SubscriptionStatus } from "@/subscriptions/types";

export function subscriptionDurationLabel(
  plan: Pick<SubscriptionPlan, "billing_interval" | "billing_interval_count" | "duration_days">,
  billingOption?: Pick<SubscriptionPlanBillingOption, "billing_interval" | "interval_count"> | null,
) {
  if (billingOption) {
    const count = billingOption.interval_count || 1;
    return `${count} ${billingOption.billing_interval}${count === 1 ? "" : "s"}`;
  }
  if (plan.duration_days) return `${plan.duration_days} day${plan.duration_days === 1 ? "" : "s"}`;
  const count = plan.billing_interval_count || 1;
  const unit = plan.billing_interval;
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

export function subscriptionPrice(
  plan: Pick<SubscriptionPlan, "price" | "discounted_price">,
  billingOption?: Pick<SubscriptionPlanBillingOption, "price" | "discounted_price"> | null,
) {
  if (billingOption) return billingOption.discounted_price ?? billingOption.price;
  return plan.discounted_price ?? plan.price;
}

export function formatSubscriptionPrice(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

export function subscriptionStatusLabel(status?: SubscriptionStatus | null) {
  if (!status) return "Subscription required";
  return status.split("_").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");
}

export function isRenewableSubscription(status?: SubscriptionStatus | null) {
  return status === "active" || status === "trial" || status === "launch_offer"
    || status === "grace_period" || status === "expired" || status === "cancelled";
}

export function isSubscriptionRequiredError(error: unknown) {
  const source = error as { code?: string; message?: string; hint?: string } | null;
  const text = `${source?.message ?? ""} ${source?.hint ?? ""}`;
  return source?.code === "42501" && /subscription/i.test(text)
    || /SUBSCRIPTION_REQUIRED|active subscription/i.test(text);
}

