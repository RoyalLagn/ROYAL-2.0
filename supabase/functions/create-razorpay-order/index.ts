import {
  corsHeaders,
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
    const authorization = request.headers.get("Authorization") ?? "";
    const { vendor } = await requireOwnedVendor(userClient(authorization));
    // Generous ceiling -- a real checkout retries at most a handful of
    // times; this only stops scripted order-creation spam.
    if (!(await checkRateLimit(serviceClient(), `create-razorpay-order:${vendor.id}`, 10, 600))) {
      return json({ error: "Too many payment attempts. Please wait a few minutes and try again." }, 429);
    }
    const body = await request.json();
    const planId = String(body.planId ?? "");
    const billingOptionId = body.billingOptionId ? String(body.billingOptionId) : null;
    const offerId = body.offerId ? String(body.offerId) : null;
    const deferActivation = body.deferActivation === true;
    const idempotencyKey = String(body.idempotencyKey ?? "").trim();
    const quoteId = String(body.quoteId ?? "");
    if (!quoteId || idempotencyKey.length < 16 || idempotencyKey.length > 120) {
      return json({ error: "A valid server quote and idempotency key are required" }, 400);
    }

    const admin = serviceClient();
    const { data: quote, error: quoteError } = await admin
      .from("subscription_checkout_quotes")
      .select("*")
      .eq("id", quoteId)
      .eq("vendor_id", vendor.id)
      .maybeSingle();
    if (quoteError || !quote) throw quoteError ?? new Error("Subscription quote not found");
    if (quote.used_at || new Date(quote.quote_expires_at).getTime() <= Date.now()) {
      return json({ error: "Pricing expired. Refresh the plans before paying." }, 409);
    }
    if (quote.plan_id !== planId || (quote.billing_option_id ?? null) !== billingOptionId || (quote.offer_id ?? null) !== offerId) {
      return json({ error: "The selected plan does not match this quote." }, 409);
    }
    const { data: quotedPlan } = await admin.from("subscription_plans").select("name").eq("id", quote.plan_id).single();
    const snapshot = quote.calculation_snapshot ?? {};
    const resolved = {
      plan_name: quotedPlan?.name ?? "Subscription",
      original_amount: Number(quote.original_amount_minor) / 100,
      interval_discount_percentage: Number(snapshot?.discounts_applied?.yearly_percentage ?? 0),
      interval_discount_amount: Number(quote.yearly_discount_minor) / 100,
      promotional_discount_percentage: Number(snapshot?.discounts_applied?.promotional_percentage ?? 0),
      promotional_discount_amount: Number(quote.promotional_discount_minor) / 100,
      current_plan_credit: Number(quote.current_plan_credit_minor) / 100,
      is_prorated_upgrade: snapshot?.is_prorated_upgrade === true,
      proration_ratio: Number(snapshot?.proration_ratio ?? 1),
      proration_period_end: snapshot?.is_prorated_upgrade ? quote.subscription_end_at : null,
      proration_evaluated_at: snapshot?.upgrade_requested_at,
      full_cycle_payable: Number(snapshot?.full_cycle_payable_minor ?? quote.final_payable_minor) / 100,
      discount_amount: (Number(quote.yearly_discount_minor) + Number(quote.promotional_discount_minor) + Number(quote.current_plan_credit_minor)) / 100,
      payable_amount: Number(quote.final_payable_minor) / 100,
      amount_minor: Number(quote.final_payable_minor),
      currency: quote.currency,
    };
    const pricing = {
      originalAmount: Number(resolved.original_amount),
      intervalDiscountPercentage: Number(resolved.interval_discount_percentage),
      intervalDiscountAmount: Number(resolved.interval_discount_amount),
      promotionalDiscountPercentage: Number(resolved.promotional_discount_percentage),
      promotionalDiscountAmount: Number(resolved.promotional_discount_amount),
      currentPlanCredit: Number(resolved.current_plan_credit),
      prorationRatio: Number(resolved.proration_ratio),
      isProratedUpgrade: resolved.is_prorated_upgrade === true,
      prorationPeriodEnd: resolved.proration_period_end,
      prorationEvaluatedAt: resolved.proration_evaluated_at,
      fullCyclePayable: Number(resolved.full_cycle_payable),
      totalSavings: Number(resolved.discount_amount),
      payableAmount: Number(resolved.payable_amount),
    };

    const { data: existing } = await admin
      .from("subscription_payments")
      .select("id,plan_id,billing_option_id,offer_id,razorpay_order_id,amount_minor,currency,payment_status")
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
        pricing,
        reused: true,
      });
    }
    if (existing && (
      existing.payment_status !== "created"
      || existing.plan_id !== planId
      || (existing.billing_option_id ?? null) !== billingOptionId
      || (existing.offer_id ?? null) !== offerId
    )) {
      return json({ error: "This checkout request has already been completed" }, 409);
    }

    const paymentId = existing?.id ?? crypto.randomUUID();
    const { data: claimedQuote, error: claimError } = await admin
      .from("subscription_checkout_quotes")
      .update({ payment_id: paymentId })
      .eq("id", quoteId)
      .is("used_at", null)
      .or(`payment_id.is.null,payment_id.eq.${paymentId}`)
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimedQuote) {
      return json({ error: "This pricing quote is already being used by another checkout." }, 409);
    }
    if (!existing) {
      const { error: insertError } = await admin.from("subscription_payments").insert({
        id: paymentId,
        vendor_id: vendor.id,
        plan_id: planId,
        billing_option_id: billingOptionId,
        offer_id: offerId,
        amount: resolved.payable_amount,
        amount_minor: resolved.amount_minor,
        original_amount: resolved.original_amount,
        discount_amount: resolved.discount_amount,
        currency: resolved.currency,
        payment_status: "created",
        idempotency_key: idempotencyKey,
        metadata: {
          checkout_source: "royallagn_client",
          activate_at_period_end: deferActivation,
          is_prorated_upgrade: resolved.is_prorated_upgrade === true,
          proration_period_end: resolved.proration_period_end,
          proration_evaluated_at: resolved.proration_evaluated_at,
          quote_id: quoteId,
          quote_expires_at: quote.quote_expires_at,
          quote_calculation: snapshot,
          pricing,
        },
      });
      if (insertError) {
        await admin.from("subscription_checkout_quotes")
          .update({ payment_id: null })
          .eq("id", quoteId)
          .eq("payment_id", paymentId)
          .is("used_at", null);
        throw insertError;
      }
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
      await admin.from("subscription_checkout_quotes").update({ used_at: new Date().toISOString(), payment_id: paymentId }).eq("id", quoteId).is("used_at", null);
      return json({ paymentRecordId: paymentId, freeActivation: true, planName: resolved.plan_name, pricing });
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
      metadata: {
        checkout_source: "royallagn_client",
        razorpay_order_status: order.status,
        activate_at_period_end: deferActivation,
        is_prorated_upgrade: resolved.is_prorated_upgrade === true,
        proration_period_end: resolved.proration_period_end,
        proration_evaluated_at: resolved.proration_evaluated_at,
        quote_id: quoteId,
        quote_expires_at: quote.quote_expires_at,
        quote_calculation: snapshot,
        pricing,
      },
    }).eq("id", paymentId);
    if (updateError) throw updateError;
    return json({
      paymentRecordId: paymentId,
      orderId: order.id,
      amount: Number(resolved.amount_minor),
      currency: resolved.currency,
      keyId: razorpay.keyId,
      planName: resolved.plan_name,
      pricing,
    });
  } catch (error) {
    console.error("[create-razorpay-order]", error);
    return json({ error: error instanceof Error ? error.message : "Unable to start payment" }, 400);
  }
});
