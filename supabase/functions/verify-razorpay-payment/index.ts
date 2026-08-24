import {
  constantTimeEqual,
  corsHeaders,
  hmacHex,
  json,
  razorpayAuthorization,
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
    // Generous ceiling -- legitimate verification can retry a few times on
    // a flaky connection; this only stops scripted verification spam.
    if (!(await checkRateLimit(serviceClient(), `verify-razorpay-payment:${vendor.id}`, 20, 600))) {
      return json({ error: "Too many verification attempts. Please wait a few minutes and try again." }, 429);
    }
    const body = await request.json();
    const orderId = String(body.razorpayOrderId ?? "");
    const providerPaymentId = String(body.razorpayPaymentId ?? "");
    const signature = String(body.razorpaySignature ?? "").toLowerCase();
    if (!orderId || !providerPaymentId || !/^[a-f0-9]{64}$/.test(signature)) {
      return json({ error: "Incomplete or invalid payment verification data" }, 400);
    }

    const admin = serviceClient();
    const { data: payment, error: paymentError } = await admin
      .from("subscription_payments")
      .select("id,vendor_id,amount_minor,currency,payment_status,razorpay_payment_id,metadata")
      .eq("razorpay_order_id", orderId)
      .eq("vendor_id", vendor.id)
      .maybeSingle();
    if (paymentError || !payment) throw paymentError ?? new Error("Payment record not found");
    if (payment.payment_status === "verified") {
      if (payment.razorpay_payment_id === providerPaymentId) {
        return json({ success: true, subscriptionActive: true, idempotent: true });
      }
      return json({ error: "Payment was already verified with a different transaction" }, 409);
    }

    const razorpay = razorpayAuthorization();
    const expected = await hmacHex(razorpay.keySecret, `${orderId}|${providerPaymentId}`);
    if (!constantTimeEqual(signature, expected)) return json({ error: "Payment signature verification failed" }, 401);

    let providerResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(providerPaymentId)}`, {
      headers: { Authorization: razorpay.header },
    });
    let providerPayment = await providerResponse.json();
    if (!providerResponse.ok) throw new Error(providerPayment?.error?.description ?? "Unable to confirm payment with Razorpay");
    if (providerPayment.order_id !== orderId
      || Number(providerPayment.amount) !== Number(payment.amount_minor)
      || providerPayment.currency !== payment.currency) {
      throw new Error("Razorpay payment details do not match the server order");
    }
    if (providerPayment.status === "authorized") {
      providerResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(providerPaymentId)}/capture`, {
        method: "POST",
        headers: { Authorization: razorpay.header, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(payment.amount_minor), currency: payment.currency }),
      });
      providerPayment = await providerResponse.json();
      if (!providerResponse.ok) throw new Error(providerPayment?.error?.description ?? "Unable to capture payment");
    }
    if (providerPayment.status !== "captured") throw new Error(`Payment is ${providerPayment.status ?? "not captured"}`);

    // Same real fee/tax capture as the webhook path (belt-and-suspenders):
    // only store what Razorpay's own payment record actually reports.
    const gatewayFeeMinor = typeof providerPayment.fee === "number" ? providerPayment.fee : null;
    const gatewayTaxMinor = typeof providerPayment.tax === "number" ? providerPayment.tax : null;
    const paidAt = providerPayment.created_at
      ? new Date(Number(providerPayment.created_at) * 1000).toISOString()
      : new Date().toISOString();
    const { data: capturedPayment, error: captureUpdateError } = await admin.from("subscription_payments").update({
      payment_status: "captured",
      razorpay_payment_id: providerPaymentId,
      payment_method: providerPayment.method ?? null,
      paid_at: paidAt,
      failure_code: null,
      failure_reason: null,
      ...(gatewayFeeMinor !== null ? { gateway_fee_minor: gatewayFeeMinor } : {}),
      ...(gatewayTaxMinor !== null ? { gateway_tax_minor: gatewayTaxMinor } : {}),
    }).eq("id", payment.id)
      .in("payment_status", ["created", "pending", "authorized", "captured", "failed"])
      .select("id")
      .maybeSingle();
    if (captureUpdateError) throw captureUpdateError;
    if (!capturedPayment) {
      const { data: current } = await admin.from("subscription_payments")
        .select("payment_status,razorpay_payment_id")
        .eq("id", payment.id)
        .single();
      if (current?.payment_status === "verified" && current.razorpay_payment_id === providerPaymentId) {
        return json({ success: true, subscriptionActive: true, idempotent: true });
      }
      throw new Error("Payment state changed before verification completed");
    }
    const { data: subscriptionId, error: activationError } = await admin.rpc("activate_verified_subscription_payment", {
      target_payment_id: payment.id,
      verified_payment_id: providerPaymentId,
      verified_payment_method: providerPayment.method ?? null,
      verification_metadata: { verified_via: "checkout_callback" },
    });
    if (activationError) throw activationError;
    const quoteId = payment.metadata?.quote_id;
    if (quoteId) {
      await admin.from("subscription_checkout_quotes").update({
        used_at: new Date().toISOString(),
        payment_id: payment.id,
      }).eq("id", quoteId).eq("vendor_id", vendor.id).is("used_at", null);
    }
    return json({ success: true, subscriptionActive: true, subscriptionId });
  } catch (error) {
    console.error("[verify-razorpay-payment]", {
      message: error instanceof Error ? error.message : "Unable to verify payment",
    });
    return json({ error: error instanceof Error ? error.message : "Unable to verify payment" }, 400);
  }
});
