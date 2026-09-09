import { corsHeaders, errorMessage, json, razorpayAuthorization, requireOwnedVendor, serviceClient, userClient } from "../_shared/subscriptions.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";

const AMOUNT_MINOR = 99900;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authorization = request.headers.get("Authorization") ?? "";
    const client = userClient(authorization);
    const { vendor } = await requireOwnedVendor(client);
    if (!(await checkRateLimit(serviceClient(), `featured-order:${vendor.id}`, 10, 600))) {
      return json({ error: "Too many payment attempts. Please wait a few minutes and try again." }, 429);
    }
    const body = await request.json();
    const pincode = String(body.pincode ?? "").trim();
    const idempotencyKey = String(body.idempotencyKey ?? "").trim();
    if (!/^[1-9][0-9]{5}$/.test(pincode) || idempotencyKey.length < 16 || idempotencyKey.length > 120) {
      return json({ error: "A valid PIN code and checkout key are required" }, 400);
    }

    const admin = serviceClient();
    const { data: existing } = await admin.from("featured_vendor_payments").select("*")
      .eq("vendor_id", vendor.id).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing?.razorpay_order_id && ["created", "pending", "authorized"].includes(existing.payment_status)) {
      const razorpay = razorpayAuthorization();
      return json({ paymentRecordId: existing.id, orderId: existing.razorpay_order_id, amount: AMOUNT_MINOR,
        currency: "INR", keyId: razorpay.keyId, planName: `Featured in ${pincode} for 30 days`, reused: true });
    }
    if (existing) return json({ error: "This checkout request has already been completed" }, 409);

    const { data: placement, error: reservationError } = await client.rpc("reserve_my_featured_vendor_slot", { target_pincode: pincode });
    if (reservationError) throw reservationError;
    const paymentId = crypto.randomUUID();
    const { error: insertError } = await admin.from("featured_vendor_payments").insert({
      id: paymentId, placement_id: placement.id, vendor_id: vendor.id, amount: 999, amount_minor: AMOUNT_MINOR,
      currency: "INR", payment_status: "created", idempotency_key: idempotencyKey,
      metadata: { product: "featured_pincode_30_days", pincode, slot_number: placement.slot_number },
    });
    if (insertError) throw insertError;

    const razorpay = razorpayAuthorization();
    const providerResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: razorpay.header, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: AMOUNT_MINOR, currency: "INR", receipt: `fp_${paymentId.replaceAll("-", "").slice(0, 30)}`,
        notes: { featured_payment_id: paymentId, placement_id: placement.id, vendor_id: vendor.id, pincode } }),
    });
    const order = await providerResponse.json();
    if (!providerResponse.ok || !order?.id) {
      await admin.from("featured_vendor_payments").update({ payment_status: "failed", failure_code: "order_creation_failed",
        failure_reason: order?.error?.description ?? "Razorpay order creation failed" }).eq("id", paymentId);
      await admin.from("featured_vendor_placements").update({ status: "cancelled" }).eq("id", placement.id).eq("status", "reserved");
      throw new Error(order?.error?.description ?? "Unable to create Razorpay order");
    }
    await admin.from("featured_vendor_payments").update({ razorpay_order_id: order.id, payment_status: "pending" }).eq("id", paymentId);
    return json({ paymentRecordId: paymentId, orderId: order.id, amount: AMOUNT_MINOR, currency: "INR",
      keyId: razorpay.keyId, planName: `Featured in ${pincode} for 30 days` });
  } catch (error) {
    console.error("[create-featured-placement-order]", { message: errorMessage(error, "Unable to start featured placement payment") });
    return json({ error: errorMessage(error, "Unable to start featured placement payment") }, 400);
  }
});
