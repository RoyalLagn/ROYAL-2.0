import {
  corsHeaders,
  errorMessage,
  json,
  requireEnv,
  serviceClient,
  razorpayAuthorization,
  hmacHex,
  constantTimeEqual,
  resolveCallerUser,
} from "../_shared/subscriptions.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const admin = serviceClient();
    const body = await request.json();

    const bookingId = String(body.bookingId ?? body.bookingRecordId ?? "").trim();
    const razorpayOrderId = String(body.razorpayOrderId ?? body.razorpay_order_id ?? "").trim();
    const razorpayPaymentId = String(body.razorpayPaymentId ?? body.razorpay_payment_id ?? "").trim();
    const razorpaySignature = String(body.razorpaySignature ?? body.razorpay_signature ?? "").trim();

    if (!bookingId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return json({ error: "Booking ID, Order ID, Payment ID, and Cryptographic Signature are required." }, 400);
    }

    // 1. Fetch booking record
    const { data: booking, error: fetchErr } = await admin
      .from("vendor_bookings")
      .select("*")
      .or(`id.eq.${bookingId},booking_id.eq.${bookingId}`)
      .maybeSingle();

    if (fetchErr || !booking) {
      return json({ error: "Booking record not found" }, 404);
    }

    // 2. Caller Authorization & Ownership Verification:
    // If booking is associated with a registered customer account, enforce caller ownership
    let callerUser: any = null;
    let isServiceRole = false;
    try {
      const caller = await resolveCallerUser(request);
      callerUser = caller.user;
      isServiceRole = caller.isServiceRole;
    } catch (authErr) {
      return json({ error: errorMessage(authErr, "Invalid authentication session token") }, 401);
    }

    if (!isServiceRole) {
      if (!callerUser) {
        return json({ error: "Authentication required: Please sign in to verify booking payment." }, 401);
      }
      if (booking.customer_id && callerUser.id !== booking.customer_id) {
        return json({ error: "Security violation: You do not own this booking reservation." }, 403);
      }
    }

    // 3. Idempotency: if already verified or confirmed, return safe success immediately
    if (["pending_vendor_confirmation", "confirmed"].includes(booking.booking_status) && booking.payment_status === "paid_advance") {
      return json({
        success: true,
        alreadyProcessed: true,
        bookingId: booking.booking_id,
        ticketId: booking.ticket_id,
        bookingStatus: booking.booking_status,
      });
    }

    // 3. Cryptographic HMAC-SHA256 signature verification (Mandatory)
    const razorpay = razorpayAuthorization();
    const expectedSignature = await hmacHex(razorpay.keySecret, `${razorpayOrderId}|${razorpayPaymentId}`);
    if (!constantTimeEqual(expectedSignature, razorpaySignature)) {
      return json({ error: "Cryptographic signature mismatch. Payment verification rejected." }, 400);
    }

    // 4. Server-Side Gateway API Verification:
    // Fetch payment entity directly from Razorpay to guarantee payment exists, is captured, and matches server amount
    const rzpRes = await fetch(`https://api.razorpay.com/v1/payments/${razorpayPaymentId}`, {
      method: "GET",
      headers: {
        "Authorization": razorpay.header,
      },
    });

    if (!rzpRes.ok) {
      const errText = await rzpRes.text();
      console.error("Razorpay payment lookup failed:", errText);
      return json({ error: "Payment verification failed: Transaction not found on Razorpay gateway." }, 400);
    }

    const paymentEntity = await rzpRes.json();

    // Verify Payment Entity belongs to the expected order
    if (paymentEntity.order_id !== razorpayOrderId) {
      return json({ error: "Security violation: Payment order does not match booking order." }, 400);
    }

    if (booking.razorpay_order_id && booking.razorpay_order_id !== razorpayOrderId) {
      return json({ error: "Security violation: Order ID mismatch with booked reservation." }, 400);
    }

    // Verify Currency
    if (String(paymentEntity.currency).toUpperCase() !== "INR") {
      return json({ error: `Unsupported payment currency: ${paymentEntity.currency}` }, 400);
    }

    // Verify Payment Amount matches server-calculated 30% advance in paise
    const expectedPaise = Math.round(Number(booking.advance_amount) * 100);
    if (expectedPaise <= 0) {
      return json({ error: "Invalid booking advance amount in database record." }, 400);
    }

    if (Number(paymentEntity.amount) !== expectedPaise) {
      return json({
        error: `Security violation: Gateway payment amount (${paymentEntity.amount} paise) does not match expected booking advance (${expectedPaise} paise).`,
      }, 400);
    }

    // 5. Verify Payment Status & Reconcile Capture:
    // Only 'captured' payments can be treated as successfully paid advances.
    // If the payment is only 'authorized', attempt to reconcile capture with Razorpay.
    if (paymentEntity.status === "authorized") {
      try {
        const captureRes = await fetch(`https://api.razorpay.com/v1/payments/${razorpayPaymentId}/capture`, {
          method: "POST",
          headers: {
            "Authorization": razorpay.header,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: expectedPaise,
            currency: "INR",
          }),
        });

        if (captureRes.ok) {
          const captureData = await captureRes.json();
          if (captureData?.status) {
            paymentEntity.status = captureData.status;
          }
        } else {
          const captureErr = await captureRes.text();
          console.warn("Razorpay server-side capture response:", captureErr);
        }
      } catch (capErr) {
        console.warn("Error reconciling payment capture with Razorpay:", capErr);
      }
    }

    if (paymentEntity.status !== "captured") {
      return json({
        error: `Payment cannot be finalized. Gateway payment status is '${paymentEntity.status}'. Payment must be captured by Razorpay before advance is confirmed.`,
        gatewayStatus: paymentEntity.status,
      }, 400);
    }

    // 5. Authoritative Atomic Database Payment Finalization
    // finalize_verified_booking_payment is the single authoritative database path.
    // It enforces row-locking, ownership, status, idempotency, notifications, and referral commission.
    // No direct service-role update fallback is permitted.
    const { data: finalizeData, error: finalizeError } = await admin.rpc("finalize_verified_booking_payment", {
      p_booking_id: booking.id,
      p_payment_id: razorpayPaymentId,
      p_order_id: razorpayOrderId,
      p_method: paymentEntity.method ?? null,
    });

    if (finalizeError) {
      console.error("Payment finalization RPC error:", finalizeError);
      return json({ error: `Payment finalization failed: ${finalizeError.message}` }, 500);
    }

    if (!finalizeData || !finalizeData.success) {
      return json({ error: "Payment finalization failed: unexpected database result" }, 500);
    }

    return json({
      success: true,
      bookingId: finalizeData.booking_id || booking.booking_id,
      ticketId: finalizeData.ticket_id || booking.ticket_id,
      bookingStatus: finalizeData.booking_status || "pending_vendor_confirmation",
      advanceAmount: booking.advance_amount,
      dueAmount: booking.due_amount,
    });
  } catch (err) {
    console.error("Error verifying payment:", err);
    return json({ error: errorMessage(err, "Failed to verify booking payment") }, 500);
  }
});
