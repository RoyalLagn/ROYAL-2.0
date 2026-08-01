import type { SubscriptionAccess, SubscriptionPlan, SubscriptionStatus } from "@/subscriptions/types";

export type SubscriptionPlanAction = {
  disabled: boolean;
  label: string;
};

const sourceLabels: Record<string, string> = {
  paid_subscription: "Paid plan",
  free_trial: "Free trial",
  launch_offer: "Launch access",
  admin_grant: "Complimentary access",
  promotional_offer: "Promotional access",
  manual_extension: "Extended access",
};

function statusLabel(status?: SubscriptionStatus | null) {
  if (!status) return "Subscription required";
  return status.split("_").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");
}

export function subscriptionAccessSourceLabel(source?: string | null) {
  return source ? sourceLabels[source] ?? source.replaceAll("_", " ") : "Plan required";
}

export function subscriptionRenewalWindowDays(settings: Record<string, unknown>) {
  const configured = Number(settings.subscription_renewal_window_days ?? 7);
  return Number.isFinite(configured) ? Math.min(30, Math.max(1, Math.round(configured))) : 7;
}

export function isSubscriptionRenewalWindow(access: SubscriptionAccess | null, settings: Record<string, unknown>) {
  return Boolean(
    access?.has_access
    && access.days_remaining != null
    && access.days_remaining <= subscriptionRenewalWindowDays(settings),
  );
}

export function subscriptionDateCopy(access: SubscriptionAccess | null) {
  if (!access) return { label: "Access", value: "Not configured" };
  if (!access.expiry_date && access.has_access) return { label: "Access", value: "Ongoing" };
  if (!access.expiry_date) return { label: "Access", value: "Not active" };
  const value = new Date(access.expiry_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const label = access.status === "trial" ? "Trial ends" : access.status === "launch_offer" ? "Included until" : access.status === "grace_period" ? "Grace period ends" : "Access until";
  return { label, value };
}

export function subscriptionStateCopy(access: SubscriptionAccess | null, settings: Record<string, unknown>) {
  const renewalWindow = isSubscriptionRenewalWindow(access, settings);
  const windowDays = subscriptionRenewalWindowDays(settings);
  const status = access?.status;

  if (!access) return { title: "Choose a Vendor plan", message: "Select a plan to activate RoyalLagn Vendor tools.", actionLabel: "View plans" };
  if (status === "suspended") return { title: "Subscription suspended", message: "Your account requires administrator review. A new payment cannot reactivate a suspended account.", actionLabel: "View account status" };
  if (status === "deactivated") return { title: "Subscription deactivated", message: "Contact RoyalLagn support to restore this Vendor account.", actionLabel: "View account status" };
  if (status === "pending") return { title: "Payment not completed", message: "Complete the payment to activate your Vendor plan.", actionLabel: "Complete payment" };
  if (status === "past_due") return { title: "Payment overdue", message: "Restore billing to keep your Vendor tools available.", actionLabel: "Restore access" };
  if (status === "grace_period") return { title: "Grace period active", message: "Renew now to prevent your Vendor tools from being paused.", actionLabel: "Restore access" };
  if (status === "expired") return { title: "Subscription expired", message: "Choose a plan to reactivate your Vendor tools.", actionLabel: "Reactivate plan" };
  if (status === "cancelled") return { title: "Subscription cancelled", message: "Choose a plan when you are ready to reactivate access.", actionLabel: "Reactivate plan" };
  if (status === "trial") {
    return renewalWindow
      ? { title: "Your trial ends soon", message: "Subscribe now to continue without interruption.", actionLabel: "Subscribe to continue" }
      : { title: "Your free trial is active", message: "No payment is needed today. Subscription options open near the end of your trial.", actionLabel: "View trial details" };
  }
  if (status === "launch_offer") {
    return renewalWindow
      ? { title: "Your launch access ends soon", message: "Subscribe now to continue using Vendor tools.", actionLabel: "Subscribe to continue" }
      : { title: "Launch access is included", message: "No payment is needed today. We will show subscription options near the end date.", actionLabel: "View access details" };
  }
  if (status === "active" && access.has_access) {
    return renewalWindow
      ? { title: "Your plan ends soon", message: "Renew now to add the next billing period without losing remaining days.", actionLabel: "Renew plan" }
      : { title: "Your plan is active", message: access.expiry_date ? `No action is required. Renewal becomes available ${windowDays} days before expiry.` : "No action is required.", actionLabel: "View plan details" };
  }
  return { title: statusLabel(status), message: "Review your plan and account status.", actionLabel: "View plan details" };
}

export function subscriptionPlanAction(
  access: SubscriptionAccess | null,
  plan: Pick<SubscriptionPlan, "id" | "name">,
  settings: Record<string, unknown>,
): SubscriptionPlanAction {
  const status = access?.status;
  const current = Boolean(access?.plan_id && access.plan_id === plan.id);
  const renewalWindow = isSubscriptionRenewalWindow(access, settings);

  if (status === "suspended" || status === "deactivated") return { disabled: true, label: "Unavailable during review" };
  if (access?.has_access && !renewalWindow) {
    return current
      ? { disabled: true, label: status === "trial" ? "Trial active" : status === "launch_offer" ? "Included now" : "Current plan" }
      : { disabled: true, label: "Available at renewal" };
  }
  if (current && access?.has_access) {
    if (status === "trial" || status === "launch_offer") return { disabled: false, label: "Subscribe to continue" };
    if (status === "grace_period" || status === "past_due") return { disabled: false, label: "Restore access" };
    return { disabled: false, label: "Renew plan" };
  }
  if (current && status === "pending") return { disabled: false, label: "Retry payment" };
  if (current && (status === "expired" || status === "cancelled")) return { disabled: false, label: "Reactivate plan" };
  if (access?.has_access) return { disabled: false, label: `Switch to ${plan.name}` };
  return { disabled: false, label: `Choose ${plan.name}` };
}

export function visibleSubscriptionPlans(access: SubscriptionAccess | null, plans: SubscriptionPlan[], settings: Record<string, unknown>) {
  if (!access?.has_access || isSubscriptionRenewalWindow(access, settings) || !access.plan_id) return plans;
  const current = plans.find((plan) => plan.id === access.plan_id);
  return current ? [current] : plans;
}

export function isPurchasableSubscriptionStatus(status?: SubscriptionStatus | null) {
  return status !== "suspended" && status !== "deactivated";
}
