import {
  corsHeaders,
  json,
  razorpayAuthorization,
  requireOwnedVendor,
  serviceClient,
  userClient,
} from "../_shared/subscriptions.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authorization = request.headers.get("Authorization") ?? "";
    const { vendor } = await requireOwnedVendor(userClient(authorization));
    const body = await request.json();
    const planId = String(body.planId ?? "");
    const offerId = body.offerId ? String(body.offerId) : null;
    const idempotencyKey = String(body.idempotencyKey ?? "").trim();
    if (!planId || idempotencyKey.length < 16 || idempotencyKey.length > 120) {
      return json({ error: "A valid plan and idempotency key are required" }, 400);
    }

    const admin = serviceClient();
    const { data: resolvedRows, error: resolveError } = await admin.rpc("resolve_subscription_checkout", {
      target_vendor_id: vendor.id,
      target_plan_id: planId,
      target_offer_id: offerId,
    });
    if (resolveError) throw resolveError;
    const resolved = resolvedRows?.[0];
    if (!resolved) throw new Error("Unable to resolve this checkout");

    const { data: existing } = await admin
      .from("subscription_payments")
      .select("id,plan_id,offer_id,razorpay_order_id,amount_minor,currency,payment_status")
      .eq("idempotency_key", idempotencyKey)
      .eq("vendor_id", vendor.id)
      .maybeSingle();
    if (existing?.razorpay_order_id && ["created", "pending", "authorized"].includes(existing.payment_status)) {
      const razorpay = razorpayAuthorization();
      return json({
        paymentRecordId: existing.id,
        orderId: existing.razorpay_order_id,
        amount: existing.amount_minor,
        currency: existing.currency,
        keyId: razorpay.keyId,
        planName: resolved.plan_name,
        reused: true,
      });
    }
    if (existing && (existing.payment_status !== "created" || existing.plan_id !== planId || (existing.offer_id ?? null) !== offerId)) {
      return json({ error: "This checkout request has already been completed" }, 409);
    }

    const paymentId = existing?.id ?? crypto.randomUUID();
    if (!existing) {
      const { error: insertError } = await admin.from("subscription_payments").insert({
        id: paymentId,
        vendor_id: vendor.id,
        plan_id: planId,
        offer_id: offerId,
        amount: resolved.payable_amount,
        amount_minor: resolved.amount_minor,
        original_amount: resolved.original_amount,
        discount_amount: resolved.discount_amount,
        currency: resolved.currency,
        payment_status: "created",
        idempotency_key: idempotencyKey,
        metadata: { checkout_source: "royallagn_client" },
      });
      if (insertError) throw insertError;
    }

    if (Number(resolved.amount_minor) === 0) {
      await admin.from("subscription_payments").update({ payment_status: "captured" }).eq("id", paymentId);
      const providerPaymentId = `offer_${paymentId.replaceAll("-", "")}`;
      const { error: activationError } = await admin.rpc("activate_verified_subscription_payment", {
        target_payment_id: paymentId,
        verified_payment_id: providerPaymentId,
        verified_payment_method: "promotional_offer",
        verification_metadata: { free_offer: true },
      });
      if (activationError) throw activationError;
      return json({ paymentRecordId: paymentId, freeActivation: true, planName: resolved.plan_name });
    }

    const razorpay = razorpayAuthorization();
    const orderResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: razorpay.header, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(resolved.amount_minor),
        currency: resolved.currency,
        receipt: `rl_${paymentId.replaceAll("-", "").slice(0, 30)}`,
        notes: { payment_record_id: paymentId, vendor_id: vendor.id, plan_id: planId },
      }),
    });
    const order = await orderResponse.json();
    if (!orderResponse.ok || !order?.id) {
      await admin.from("subscription_payments").update({
        payment_status: "failed",
        failure_code: "order_creation_failed",
        failure_reason: order?.error?.description ?? "Razorpay order creation failed",
      }).eq("id", paymentId);
      throw new Error(order?.error?.description ?? "Unable to create Razorpay order");
    }
    const { error: updateError } = await admin.from("subscription_payments").update({
      razorpay_order_id: order.id,
      payment_status: "pending",
      metadata: { checkout_source: "royallagn_client", razorpay_order_status: order.status },
    }).eq("id", paymentId);
    if (updateError) throw updateError;

    return json({
      paymentRecordId: paymentId,
      orderId: order.id,
      amount: Number(resolved.amount_minor),
      currency: resolved.currency,
      keyId: razorpay.keyId,
      planName: resolved.plan_name,
    });
  } catch (error) {
    console.error("[create-razorpay-order]", error);
    return json({ error: error instanceof Error ? error.message : "Unable to start payment" }, 400);
  }
});
