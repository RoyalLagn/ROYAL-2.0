import type { SubscriptionBillingInterval, SubscriptionOffer, SubscriptionPlanBillingOption } from "@/subscriptions/types";

export type SubscriptionPriceBreakdown = {
  originalAmount: number;
  intervalDiscountPercentage: number;
  intervalDiscountAmount: number;
  promotionalDiscountPercentage: number;
  promotionalDiscountAmount: number;
  totalSavings: number;
  payableAmount: number;
  amountMinor: number;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function isSubscriptionOfferEligible(
  offer: SubscriptionOffer,
  planId: string,
  interval: SubscriptionBillingInterval,
  evaluatedAt = new Date(),
) {
  const starts = offer.start_date ? new Date(offer.start_date) : null;
  const ends = offer.end_date ? new Date(offer.end_date) : null;
  return (!starts || starts <= evaluatedAt)
    && (!ends || ends > evaluatedAt)
    && (!offer.applicable_plan_ids.length || offer.applicable_plan_ids.includes(planId))
    && (!offer.applicable_billing_intervals.length || offer.applicable_billing_intervals.includes(interval));
}

export function subscriptionPriceBreakdown(
  option: Pick<SubscriptionPlanBillingOption, "price" | "discounted_price" | "discount_percentage">,
  offer?: Pick<SubscriptionOffer, "discount_type" | "discount_value"> | null,
): SubscriptionPriceBreakdown {
  const originalAmount = money(Math.max(0, Number(option.price) || 0));
  const afterIntervalDiscount = money(Math.max(0, Number(option.discounted_price ?? originalAmount)));
  const intervalDiscountAmount = money(originalAmount - afterIntervalDiscount);
  const promotionalDiscountAmount = money(offer
    ? offer.discount_type === "percentage"
      ? afterIntervalDiscount * Number(offer.discount_value || 0) / 100
      : offer.discount_type === "fixed"
        ? Math.min(afterIntervalDiscount, Number(offer.discount_value || 0))
        : afterIntervalDiscount
    : 0);
  const payableAmount = money(Math.max(0, afterIntervalDiscount - promotionalDiscountAmount));
  return {
    originalAmount,
    intervalDiscountPercentage: Number(option.discount_percentage || 0),
    intervalDiscountAmount,
    promotionalDiscountPercentage: offer?.discount_type === "percentage" ? Number(offer.discount_value || 0) : 0,
    promotionalDiscountAmount,
    totalSavings: money(originalAmount - payableAmount),
    payableAmount,
    amountMinor: Math.round(payableAmount * 100),
  };
}
