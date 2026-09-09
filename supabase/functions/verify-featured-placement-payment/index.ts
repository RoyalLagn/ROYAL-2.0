import { constantTimeEqual, corsHeaders, hmacHex, json, razorpayAuthorization, requireOwnedVendor, serviceClient, userClient } from "../_shared/subscriptions.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const { vendor } = await requireOwnedVendor(userClient(request.headers.get("Authorization") ?? ""));
    const admin = serviceClient();
    if (!(await checkRateLimit(admin, `featured-verify:${vendor.id}`, 20, 600))) return json({ error: "Too many verification attempts" }, 429);
    const body = await request.json();
    const orderId = String(body.razorpayOrderId ?? "");
    const providerPaymentId = String(body.razorpayPaymentId ?? "");
    const signature = String(body.razorpaySignature ?? "").toLowerCase();
    if (!orderId || !providerPaymentId || !/^[a-f0-9]{64}$/.test(signature)) return json({ error: "Invalid payment verification data" }, 400);

    const { data: payment, error } = await admin.from("featured_vendor_payments").select("*")
      .eq("razorpay_order_id", orderId).eq("vendor_id", vendor.id).maybeSingle();
    if (error || !payment) throw error ?? new Error("Featured payment not found");
    if (payment.payment_status === "verified" && payment.razorpay_payment_id === providerPaymentId) {
      return json({ success: true, placementActive: true, placementId: payment.placement_id, idempotent: true });
    }
    const razorpay = razorpayAuthorization();
    const expected = await hmacHex(razorpay.keySecret, `${orderId}|${providerPaymentId}`);
    if (!constantTimeEqual(signature, expected)) return json({ error: "Payment signature verification failed" }, 401);

    let providerResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(providerPaymentId)}`, { headers: { Authorization: razorpay.header } });
    let providerPayment = await providerResponse.json();
    if (!providerResponse.ok) throw new Error(providerPayment?.error?.description ?? "Unable to confirm payment");
    if (providerPayment.order_id !== orderId || Number(providerPayment.amount) !== Number(payment.amount_minor) || providerPayment.currency !== payment.currency) {
      throw new Error("Razorpay payment details do not match the featured order");
    }
    if (providerPayment.status === "authorized") {
      providerResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(providerPaymentId)}/capture`, {
        method: "POST", headers: { Authorization: razorpay.header, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(payment.amount_minor), currency: payment.currency }),
      });
      providerPayment = await providerResponse.json();
      if (!providerResponse.ok) throw new Error(providerPayment?.error?.description ?? "Unable to capture payment");
    }
    if (providerPayment.status !== "captured") throw new Error(`Payment is ${providerPayment.status ?? "not captured"}`);
    await admin.from("featured_vendor_payments").update({ payment_status: "captured", razorpay_payment_id: providerPaymentId,
      payment_method: providerPayment.method ?? null, paid_at: providerPayment.created_at ? new Date(Number(providerPayment.created_at) * 1000).toISOString() : new Date().toISOString() })
      .eq("id", payment.id).in("payment_status", ["created", "pending", "authorized", "captured", "failed"]);
    const { data: placementId, error: activationError } = await admin.rpc("activate_verified_featured_payment", {
      target_payment_id: payment.id, verified_payment_id: providerPaymentId, verified_method: providerPayment.method ?? null,
    });
    if (activationError) throw activationError;
    return json({ success: true, placementActive: true, placementId });
  } catch (error) {
    console.error("[verify-featured-placement-payment]", { message: error instanceof Error ? error.message : "Verification failed" });
    return json({ error: error instanceof Error ? error.message : "Verification failed" }, 400);
  }
});
