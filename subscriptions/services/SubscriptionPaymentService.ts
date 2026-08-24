import { supabase } from "@/services/supabase";
import { openRazorpayCheckout } from "@/subscriptions/payments/RazorpayCheckout";
import type { RazorpayOrder } from "@/subscriptions/payments/types";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

async function invokePaymentFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase payment configuration is missing");
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.access_token) throw new Error("Your session expired. Sign in again and retry payment.");

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let payload: unknown = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    if (!response.ok) throw new Error(raw.trim() || `Payment service failed (${response.status})`);
  }
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? String(payload.error)
      : `Payment service failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

function idempotencyKey(quoteId: string) {
  return `subscription-checkout:${quoteId}`;
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
    if (!input.quoteId) throw new Error("Pricing is not ready. Refresh the plans and try again.");
    const order = await invokePaymentFunction<RazorpayOrder>("create-razorpay-order", {
      planId: input.planId,
      billingOptionId: input.billingOptionId ?? null,
      offerId: input.offerId ?? null,
      deferActivation: input.deferActivation ?? false,
      quoteId: input.quoteId,
      idempotencyKey: idempotencyKey(input.quoteId),
    });
    if (!order) throw new Error("Unable to start payment");
    if ((order as any).error) throw new Error((order as any).error);
    if (order.freeActivation) return { success: true, freeActivation: true };

    let checkout;
    try {
      checkout = await openRazorpayCheckout({
        ...order,
        vendorName: input.vendorName,
        email: input.email,
        phone: input.phone,
      });
    } catch (checkoutError) {
      const message = checkoutError instanceof Error ? checkoutError.message : "Payment checkout did not complete";
      const outcome = /cancel|dismiss|closed/i.test(message) ? "cancelled" : "failed";
      try {
        await supabase.functions.invoke("record-razorpay-checkout-outcome", {
          body: { razorpayOrderId: order.orderId, outcome },
        });
      } catch {
        // Razorpay webhooks remain the source of truth if this best-effort UX update cannot be recorded.
      }
      throw checkoutError;
    }
    const verification = await invokePaymentFunction<Record<string, unknown>>("verify-razorpay-payment", {
      razorpayOrderId: checkout.razorpay_order_id,
      razorpayPaymentId: checkout.razorpay_payment_id,
      razorpaySignature: checkout.razorpay_signature,
    });
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
