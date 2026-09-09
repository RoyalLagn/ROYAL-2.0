import {
  corsHeaders,
  json,
  requireOwnedVendor,
  serviceClient,
  userClient,
} from "../_shared/subscriptions.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const { vendor } = await requireOwnedVendor(userClient(request.headers.get("Authorization") ?? ""));
    const admin = serviceClient();
    if (!(await checkRateLimit(admin, `record-razorpay-checkout-outcome:${vendor.id}`, 30, 600))) {
      return json({ error: "Too many payment updates. Please try again later." }, 429);
    }
    const body = await request.json();
    const orderId = String(body.razorpayOrderId ?? "");
    const outcome = String(body.outcome ?? "");
    if (!orderId || !["cancelled", "failed"].includes(outcome)) {
      return json({ error: "Invalid checkout outcome" }, 400);
    }

    const failureCode = outcome === "cancelled" ? "checkout_cancelled" : "checkout_failed";
    const failureReason = outcome === "cancelled" ? "Checkout cancelled by user" : "Checkout did not complete";
    const { data: payment, error } = await admin.from("subscription_payments").update({
      payment_status: "failed",
      failure_code: failureCode,
      failure_reason: failureReason,
    }).eq("vendor_id", vendor.id)
      .eq("razorpay_order_id", orderId)
      .in("payment_status", ["created", "pending", "authorized"])
      .select("id,payment_status")
      .maybeSingle();
    if (error) throw error;
    if (payment) return json({ recorded: true, status: payment.payment_status });
    const { data: featuredPayment, error: featuredError } = await admin.from("featured_vendor_payments").update({
      payment_status: outcome,
      failure_code: failureCode,
      failure_reason: failureReason,
    }).eq("vendor_id", vendor.id).eq("razorpay_order_id", orderId)
      .in("payment_status", ["created", "pending", "authorized"])
      .select("id,placement_id,payment_status").maybeSingle();
    if (featuredError) throw featuredError;
    if (featuredPayment) {
      await admin.from("featured_vendor_placements").update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", featuredPayment.placement_id).eq("status", "reserved");
    }
    return json({ recorded: Boolean(featuredPayment), status: featuredPayment?.payment_status ?? "unchanged" });
  } catch (error) {
    console.error("[record-razorpay-checkout-outcome]", {
      message: error instanceof Error ? error.message : "Unable to record checkout outcome",
    });
    return json({ error: error instanceof Error ? error.message : "Unable to record checkout outcome" }, 400);
  }
});
