import {
  constantTimeEqual,
  corsHeaders,
  hmacHex,
  json,
  requireEnv,
  safeProviderPayload,
  serviceClient,
} from "../_shared/subscriptions.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const rawBody = await request.text();
  try {
    const receivedSignature = (request.headers.get("x-razorpay-signature") ?? "").toLowerCase();
    const expectedSignature = await hmacHex(requireEnv("RAZORPAY_TEST_WEBHOOK_SECRET"), rawBody);
    if (!receivedSignature || !constantTimeEqual(receivedSignature, expectedSignature)) {
      return json({ error: "Invalid webhook signature" }, 401);
    }
    const payload = JSON.parse(rawBody);
    const eventType = String(payload.event ?? "unknown");
    const paymentEntity = payload?.payload?.payment?.entity;
    const refundEntity = payload?.payload?.refund?.entity;
    const orderEntity = payload?.payload?.order?.entity;
    const orderId = paymentEntity?.order_id ?? orderEntity?.id;
    const providerEventId = request.headers.get("x-razorpay-event-id")
      ?? `${eventType}:${refundEntity?.id ?? paymentEntity?.id ?? orderId ?? await hmacHex("royallagn-event", rawBody)}`;
    const admin = serviceClient();
    const { data: eventRow, error: eventError } = await admin.from("subscription_webhook_events").insert({
      provider: "razorpay",
      provider_event_id: providerEventId,
      event_type: eventType,
      safe_payload: safeProviderPayload(payload),
    }).select("id").single();
    if (eventError?.code === "23505") return json({ received: true, idempotent: true });
    if (eventError) throw eventError;

    const paymentLookup = admin.from("subscription_payments").select("id,vendor_id,amount,amount_minor,metadata");
    const { data: payment } = orderId
      ? await paymentLookup.eq("razorpay_order_id", orderId).maybeSingle()
      : refundEntity?.payment_id
        ? await paymentLookup.eq("razorpay_payment_id", refundEntity.payment_id).maybeSingle()
        : { data: null };
    if (!payment) {
      await admin.from("subscription_webhook_events").update({ processing_status: "ignored", processed_at: new Date().toISOString() }).eq("id", eventRow.id);
      return json({ received: true, ignored: true });
    }

    if (["payment.captured", "order.paid"].includes(eventType) && paymentEntity?.id) {
      // Razorpay's payment entity carries its own actual gateway fee/tax
      // (in paise) once captured. Only store what Razorpay actually reports —
      // never default a missing value to 0, so the finance dashboard can
      // show "Unavailable" instead of a fabricated figure.
      const gatewayFeeMinor = typeof paymentEntity.fee === "number" ? paymentEntity.fee : null;
      const gatewayTaxMinor = typeof paymentEntity.tax === "number" ? paymentEntity.tax : null;
      await admin.from("subscription_payments").update({
        payment_status: "captured",
        razorpay_payment_id: paymentEntity.id,
        payment_method: paymentEntity.method ?? null,
        paid_at: new Date().toISOString(),
        ...(gatewayFeeMinor !== null ? { gateway_fee_minor: gatewayFeeMinor } : {}),
        ...(gatewayTaxMinor !== null ? { gateway_tax_minor: gatewayTaxMinor } : {}),
      }).eq("id", payment.id);
      const { error: activationError } = await admin.rpc("activate_verified_subscription_payment", {
        target_payment_id: payment.id,
        verified_payment_id: paymentEntity.id,
        verified_payment_method: paymentEntity.method ?? null,
        verification_metadata: { verified_via: "razorpay_webhook", provider_event_id: providerEventId },
      });
      if (activationError) throw activationError;
    } else if (eventType === "payment.failed") {
      await admin.from("subscription_payments").update({
        payment_status: "failed",
        razorpay_payment_id: paymentEntity?.id ?? null,
        failure_code: paymentEntity?.error_code ?? "payment_failed",
        failure_reason: paymentEntity?.error_description ?? "Payment failed",
      }).eq("id", payment.id);
      await admin.from("vendor_notifications").insert({
        vendor_id: payment.vendor_id,
        title: "Payment failed",
        body: "Your subscription payment could not be completed. You can safely try again.",
        kind: "subscription",
      });
    } else if (eventType === "refund.processed") {
      const previousRefundMinor = Number(payment.metadata?.refunded_amount_minor ?? 0);
      const eventRefundMinor = Number(refundEntity?.amount ?? payment.amount_minor);
      const refundedAmountMinor = Math.min(payment.amount_minor, previousRefundMinor + eventRefundMinor);
      const fullyRefunded = refundedAmountMinor >= payment.amount_minor;
      await admin.from("subscription_payments").update({
        payment_status: fullyRefunded ? "refunded" : "partially_refunded",
        refunded_at: refundEntity?.created_at ? new Date(Number(refundEntity.created_at) * 1000).toISOString() : new Date().toISOString(),
        metadata: {
          ...(payment.metadata ?? {}),
          refunded_amount_minor: refundedAmountMinor,
          refunded_amount: refundedAmountMinor / 100,
          latest_refund_id: refundEntity?.id ?? null,
        },
      }).eq("id", payment.id);
    }
    await admin.from("subscription_webhook_events").update({
      payment_id: payment.id,
      processing_status: "processed",
      processed_at: new Date().toISOString(),
    }).eq("id", eventRow.id);
    return json({ received: true });
  } catch (error) {
    console.error("[razorpay-webhook]", error);
    return json({ error: error instanceof Error ? error.message : "Webhook processing failed" }, 400);
  }
});
