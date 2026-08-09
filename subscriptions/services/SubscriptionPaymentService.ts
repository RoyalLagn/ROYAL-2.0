import { supabase } from "@/services/supabase";
import { openRazorpayCheckout } from "@/subscriptions/payments/RazorpayCheckout";
import type { RazorpayOrder } from "@/subscriptions/payments/types";

async function functionErrorMessage(error: unknown, fallback: string) {
  const context = (error as { context?: unknown } | null)?.context;
  if (typeof Response !== "undefined" && context instanceof Response) {
    try {
      const payload = await context.clone().json();
      if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
        return payload.error;
      }
    } catch {
      try {
        const message = await context.clone().text();
        if (message.trim()) return message.trim();
      } catch {
        // Fall through to the original error message.
      }
    }
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function idempotencyKey(vendorId: string, planId: string) {
  return `${vendorId}:${planId}:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
}

export class SubscriptionPaymentService {
  static async subscribe(input: {
    vendorId: string;
    planId: string;
    billingOptionId?: string | null;
    offerId?: string | null;
    vendorName?: string;
    email?: string;
    phone?: string;
    deferActivation?: boolean;
    quoteId?: string;
  }) {
    const { data: order, error: orderError } = await supabase.functions.invoke<RazorpayOrder>("create-razorpay-order", {
      body: {
        planId: input.planId,
        billingOptionId: input.billingOptionId ?? null,
        offerId: input.offerId ?? null,
        deferActivation: input.deferActivation ?? false,
        quoteId: input.quoteId,
        idempotencyKey: idempotencyKey(input.vendorId, input.planId),
      },
    });
    if (orderError) throw new Error(await functionErrorMessage(orderError, "Unable to start payment"));
    if (!order) throw new Error("Unable to start payment");
    if ((order as any).error) throw new Error((order as any).error);
    if (order.freeActivation) return { success: true, freeActivation: true };

    const checkout = await openRazorpayCheckout({
      ...order,
      vendorName: input.vendorName,
      email: input.email,
      phone: input.phone,
    });
    const { data: verification, error: verificationError } = await supabase.functions.invoke("verify-razorpay-payment", {
      body: {
        razorpayOrderId: checkout.razorpay_order_id,
        razorpayPaymentId: checkout.razorpay_payment_id,
        razorpaySignature: checkout.razorpay_signature,
      },
    });
    if (verificationError) {
      throw new Error(await functionErrorMessage(verificationError, "Payment verification failed"));
    }
    if (!(verification as any)?.subscriptionActive) {
      throw new Error((verification as any)?.error ?? "Payment verification did not activate the subscription");
    }
    return { success: true, freeActivation: false, verification };
  }

  static async startTrial(planId: string, billingOptionId?: string | null) {
    const { data, error } = await supabase.rpc("claim_my_subscription_trial", {
      target_plan_id: planId,
      target_billing_option_id: billingOptionId ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  /**
   * Schedules a plan/billing-option change for the vendor's current
   * subscription. Upgrades (a higher payable amount) are rejected by the
   * RPC and must go through `subscribe()` instead, which activates
   * immediately. Downgrades only record the intent; the vendor keeps their
   * current plan/limits until `process_subscription_lifecycle` applies the
   * change at `effectiveAt` (defaults to the current period's end).
   */
  static async scheduleChange(input: {
    vendorId: string;
    planId: string;
    billingOptionId?: string | null;
    effectiveAt?: string | null;
  }) {
    const { data, error } = await supabase.rpc("schedule_subscription_change", {
      target_vendor_id: input.vendorId,
      target_plan_id: input.planId,
      target_billing_option_id: input.billingOptionId ?? null,
      effective_at: input.effectiveAt ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  /** Cancels the vendor's own subscription; access is retained until the
   * already-paid period ends, then the vendor falls back to Free. */
  static async cancel(reason?: string) {
    const { data, error } = await supabase.rpc("cancel_my_subscription", { reason: reason ?? null });
    if (error) throw error;
    return data as string;
  }
}
