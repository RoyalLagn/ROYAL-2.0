import assert from "node:assert/strict";
import {
  formatSubscriptionPrice,
  isRenewableSubscription,
  isSubscriptionRequiredError,
  subscriptionDurationLabel,
  subscriptionPrice,
  subscriptionStatusLabel,
} from "../subscriptions/utils.ts";
import {
  isSubscriptionRenewalWindow,
  subscriptionPlanAction,
  subscriptionStateCopy,
  visibleSubscriptionPlans,
} from "../subscriptions/presentation.ts";

assert.equal(subscriptionDurationLabel({ billing_interval: "month", billing_interval_count: 3, duration_days: null }), "3 months");
assert.equal(subscriptionDurationLabel({ billing_interval: "custom", billing_interval_count: 1, duration_days: 45 }), "45 days");
assert.equal(subscriptionPrice({ price: 999, discounted_price: 799 }), 799);
assert.equal(subscriptionPrice({ price: 999, discounted_price: null }), 999);
assert.equal(subscriptionStatusLabel("launch_offer"), "Launch Offer");
assert.equal(isRenewableSubscription("expired"), true);
assert.equal(isRenewableSubscription("suspended"), false);
assert.equal(isSubscriptionRequiredError({ code: "42501", hint: "SUBSCRIPTION_REQUIRED" }), true);
assert.match(formatSubscriptionPrice(999), /999/);

const plan = { id: "standard", name: "RoyalLagn Standard" };
const secondPlan = { id: "premium", name: "RoyalLagn Premium" };
const access = {
  vendor_id: "vendor",
  subscription_id: "subscription",
  plan_id: "standard",
  plan_name: "RoyalLagn Standard",
  status: "active",
  access_source: "paid_subscription",
  start_date: "2026-08-01T00:00:00.000Z",
  expiry_date: "2026-09-01T00:00:00.000Z",
  grace_period_end_date: null,
  days_remaining: 21,
  has_access: true,
  access_reason: "paid_subscription",
};
const settings = { subscription_renewal_window_days: 7 };

assert.equal(isSubscriptionRenewalWindow(access, settings), false);
assert.deepEqual(subscriptionPlanAction(access, plan, settings), { disabled: true, label: "Current plan" });
assert.deepEqual(subscriptionPlanAction(access, secondPlan, settings), { disabled: true, label: "Available at renewal" });
assert.equal(subscriptionStateCopy(access, settings).actionLabel, "View plan details");
assert.deepEqual(visibleSubscriptionPlans(access, [plan, secondPlan], settings), [plan]);

const expiring = { ...access, days_remaining: 7 };
assert.equal(isSubscriptionRenewalWindow(expiring, settings), true);
assert.deepEqual(subscriptionPlanAction(expiring, plan, settings), { disabled: false, label: "Renew plan" });
assert.equal(subscriptionStateCopy(expiring, settings).actionLabel, "Renew plan");
assert.deepEqual(visibleSubscriptionPlans(expiring, [plan, secondPlan], settings), [plan, secondPlan]);

const trial = { ...access, status: "trial", access_source: "free_trial", days_remaining: 14 };
assert.deepEqual(subscriptionPlanAction(trial, plan, settings), { disabled: true, label: "Trial active" });
assert.equal(subscriptionStateCopy(trial, settings).actionLabel, "View trial details");

const launch = { ...access, status: "launch_offer", access_source: "launch_offer", days_remaining: 4 };
assert.deepEqual(subscriptionPlanAction(launch, plan, settings), { disabled: false, label: "Subscribe to continue" });

const grace = { ...access, status: "grace_period", days_remaining: 2 };
assert.deepEqual(subscriptionPlanAction(grace, plan, settings), { disabled: false, label: "Restore access" });

const expired = { ...access, status: "expired", has_access: false, days_remaining: 0 };
assert.deepEqual(subscriptionPlanAction(expired, plan, settings), { disabled: false, label: "Reactivate plan" });

const suspended = { ...access, status: "suspended", has_access: false, days_remaining: 0 };
assert.equal(subscriptionPlanAction(suspended, plan, settings).disabled, true);
assert.equal(subscriptionStateCopy(suspended, settings).actionLabel, "View account status");

console.log("subscription domain tests passed");
