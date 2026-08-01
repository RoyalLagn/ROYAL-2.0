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
    offerId?: string | null;
    vendorName?: string;
    email?: string;
    phone?: string;
  }) {
    const { data: order, error: orderError } = await supabase.functions.invoke<RazorpayOrder>("create-razorpay-order", {
      body: {
        planId: input.planId,
        offerId: input.offerId ?? null,
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

  static async startTrial(planId: string) {
    const { data, error } = await supabase.rpc("claim_my_subscription_trial", { target_plan_id: planId });
    if (error) throw error;
    return data as string;
  }
}
