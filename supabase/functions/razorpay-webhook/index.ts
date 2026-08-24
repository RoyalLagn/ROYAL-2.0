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
  let eventRowId: string | null = null;
  let eventType = "unknown";
  let providerEventId = "unknown";
  try {
    const receivedSignature = (request.headers.get("x-razorpay-signature") ?? "").toLowerCase();
    const expectedSignature = await hmacHex(requireEnv("RAZORPAY_WEBHOOK_SECRET"), rawBody);
    if (!receivedSignature || !constantTimeEqual(receivedSignature, expectedSignature)) {
      return json({ error: "Invalid webhook signature" }, 401);
    }
    const payload = JSON.parse(rawBody);
    eventType = String(payload.event ?? "unknown");
    const paymentEntity = payload?.payload?.payment?.entity;
    const refundEntity = payload?.payload?.refund?.entity;
    const orderEntity = payload?.payload?.order?.entity;
    const orderId = paymentEntity?.order_id ?? orderEntity?.id;
    providerEventId = request.headers.get("x-razorpay-event-id")
      ?? `${eventType}:${refundEntity?.id ?? paymentEntity?.id ?? orderId ?? await hmacHex("royallagn-event", rawBody)}`;
    const admin = serviceClient();
    const { data: eventRow, error: eventError } = await admin.from("subscription_webhook_events").insert({
      provider: "razorpay",
      provider_event_id: providerEventId,
      event_type: eventType,
      safe_payload: safeProviderPayload(payload),
    }).select("id").single();
    if (eventError?.code === "23505") {
      const { data: existingEvent, error: existingEventError } = await admin
        .from("subscription_webhook_events")
        .select("id,processing_status,received_at")
        .eq("provider", "razorpay")
        .eq("provider_event_id", providerEventId)
        .single();
      if (existingEventError) throw existingEventError;
      if (["processed", "ignored"].includes(existingEvent.processing_status)) {
        return json({ received: true, idempotent: true });
      }
      const receivedRecently = existingEvent.processing_status === "received"
        && Date.now() - new Date(existingEvent.received_at).getTime() < 5 * 60 * 1000;
      if (receivedRecently) {
        return json({ error: "Webhook event is already being processed" }, 409);
      }
      const { data: retryEvent, error: retryError } = await admin
        .from("subscription_webhook_events")
        .update({ processing_status: "received", error_message: null, processed_at: null })
        .eq("id", existingEvent.id)
        .in("processing_status", ["failed", "received"])
        .select("id")
        .maybeSingle();
      if (retryError) throw retryError;
      if (!retryEvent) return json({ error: "Webhook event retry could not be claimed" }, 409);
      eventRowId = retryEvent.id;
    } else if (eventError) {
      throw eventError;
    } else {
      eventRowId = eventRow.id;
    }

    const paymentLookup = admin.from("subscription_payments").select("id,vendor_id,amount,amount_minor,currency,payment_status,razorpay_order_id,razorpay_payment_id,metadata");
    const { data: payment } = orderId
      ? await paymentLookup.eq("razorpay_order_id", orderId).maybeSingle()
      : refundEntity?.payment_id
        ? await paymentLookup.eq("razorpay_payment_id", refundEntity.payment_id).maybeSingle()
        : { data: null };
    if (!payment) {
      await admin.from("subscription_webhook_events").update({ processing_status: "ignored", processed_at: new Date().toISOString() }).eq("id", eventRowId);
      return json({ received: true, ignored: true });
    }

    if (["payment.captured", "order.paid"].includes(eventType) && paymentEntity?.id) {
      if (paymentEntity.order_id !== payment.razorpay_order_id
        || Number(paymentEntity.amount) !== Number(payment.amount_minor)
        || String(paymentEntity.currency) !== String(payment.currency)
        || paymentEntity.status !== "captured") {
        throw new Error("Webhook payment details do not match the server order");
      }
      if (payment.payment_status === "verified" && payment.razorpay_payment_id !== paymentEntity.id) {
        throw new Error("Payment was already verified with a different Razorpay payment ID");
      }
      // Razorpay's payment entity carries its own actual gateway fee/tax
      // (in paise) once captured. Only store what Razorpay actually reports —
      // never default a missing value to 0, so the finance dashboard can
      // show "Unavailable" instead of a fabricated figure.
      const gatewayFeeMinor = typeof paymentEntity.fee === "number" ? paymentEntity.fee : null;
      const gatewayTaxMinor = typeof paymentEntity.tax === "number" ? paymentEntity.tax : null;
      if (payment.payment_status !== "verified") {
        const paidAt = paymentEntity.created_at
          ? new Date(Number(paymentEntity.created_at) * 1000).toISOString()
          : new Date().toISOString();
        await admin.from("subscription_payments").update({
          payment_status: "captured",
          razorpay_payment_id: paymentEntity.id,
          payment_method: paymentEntity.method ?? null,
          paid_at: paidAt,
          failure_code: null,
          failure_reason: null,
          ...(gatewayFeeMinor !== null ? { gateway_fee_minor: gatewayFeeMinor } : {}),
          ...(gatewayTaxMinor !== null ? { gateway_tax_minor: gatewayTaxMinor } : {}),
        }).eq("id", payment.id).in("payment_status", ["created", "pending", "authorized", "captured", "failed"]);
      }
      const { error: activationError } = await admin.rpc("activate_verified_subscription_payment", {
        target_payment_id: payment.id,
        verified_payment_id: paymentEntity.id,
        verified_payment_method: paymentEntity.method ?? null,
        verification_metadata: { verified_via: "razorpay_webhook", provider_event_id: providerEventId },
      });
      if (activationError) throw activationError;
    } else if (eventType === "payment.authorized" && paymentEntity?.id) {
      if (paymentEntity.order_id !== payment.razorpay_order_id
        || Number(paymentEntity.amount) !== Number(payment.amount_minor)
        || String(paymentEntity.currency) !== String(payment.currency)) {
        throw new Error("Authorized payment details do not match the server order");
      }
      await admin.from("subscription_payments").update({
        payment_status: "authorized",
        razorpay_payment_id: paymentEntity.id,
        payment_method: paymentEntity.method ?? null,
        failure_code: null,
        failure_reason: null,
      }).eq("id", payment.id).in("payment_status", ["created", "pending", "failed"]);
    } else if (eventType === "payment.failed") {
      await admin.from("subscription_payments").update({
        payment_status: "failed",
        razorpay_payment_id: paymentEntity?.id ?? null,
        failure_code: paymentEntity?.error_code ?? "payment_failed",
        failure_reason: paymentEntity?.error_description ?? "Payment failed",
      }).eq("id", payment.id).in("payment_status", ["created", "pending", "authorized"]);
    } else if (eventType === "refund.processed") {
      if (!refundEntity?.id || refundEntity.payment_id !== payment.razorpay_payment_id) {
        throw new Error("Refund does not match the verified Razorpay payment");
      }
      const previousRefundMinor = Number(payment.metadata?.refunded_amount_minor ?? 0);
      const eventRefundMinor = Number(refundEntity.amount);
      if (!Number.isSafeInteger(eventRefundMinor) || eventRefundMinor <= 0) throw new Error("Invalid refund amount");
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
    }).eq("id", eventRowId);
    return json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    if (eventRowId) {
      try {
        await serviceClient().from("subscription_webhook_events").update({
          processing_status: "failed",
          error_message: message.slice(0, 500),
          processed_at: new Date().toISOString(),
        }).eq("id", eventRowId);
      } catch {
        // The safe structured log below remains available if persistence fails.
      }
    }
    console.error("[razorpay-webhook]", { eventType, providerEventId, message });
    return json({ error: "Webhook processing failed" }, 500);
  }
});
