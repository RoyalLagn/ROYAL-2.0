import { supabase } from "@/services/supabase";
import { openRazorpayCheckout } from "@/subscriptions/payments/RazorpayCheckout";
import type { RazorpayOrder } from "@/subscriptions/payments/types";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase payment configuration is missing");
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.access_token) throw new Error("Your session expired. Sign in again and retry payment.");
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: supabaseAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? `Payment service failed (${response.status})`);
  return payload as T;
}

export async function buyFeaturedPlacement(input: { pincode: string; vendorName?: string; email?: string; phone?: string }) {
  const checkoutKey = `featured:${input.pincode}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const order = await invoke<RazorpayOrder>("create-featured-placement-order", { pincode: input.pincode, idempotencyKey: checkoutKey });
  let checkout;
  try {
    checkout = await openRazorpayCheckout({ ...order, vendorName: input.vendorName, email: input.email, phone: input.phone });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment checkout did not complete";
    await supabase.functions.invoke("record-razorpay-checkout-outcome", {
      body: { razorpayOrderId: order.orderId, outcome: /cancel|dismiss|closed/i.test(message) ? "cancelled" : "failed" },
    }).catch(() => undefined);
    throw error;
  }
  const verification = await invoke<{ placementActive?: boolean; error?: string }>("verify-featured-placement-payment", {
    razorpayOrderId: checkout.razorpay_order_id,
    razorpayPaymentId: checkout.razorpay_payment_id,
    razorpaySignature: checkout.razorpay_signature,
  });
  if (!verification.placementActive) throw new Error(verification.error ?? "Payment was verified but placement was not activated");
  return verification;
}
