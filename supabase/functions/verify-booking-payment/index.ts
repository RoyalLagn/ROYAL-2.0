import {
  corsHeaders,
  errorMessage,
  json,
  requireEnv,
  serviceClient,
  hmacHex,
  constantTimeEqual,
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
    const isSimulator = body.isSimulator === true;

    if (!bookingId || !razorpayOrderId || !razorpayPaymentId) {
      return json({ error: "Booking ID, Order ID, and Payment ID are required" }, 400);
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

    // Idempotency: if already verified or confirmed, return safe success immediately
    if (["pending_vendor_confirmation", "confirmed"].includes(booking.booking_status)) {
      return json({
        success: true,
        alreadyProcessed: true,
        bookingId: booking.booking_id,
        ticketId: booking.ticket_id,
        bookingStatus: booking.booking_status,
      });
    }

    // 2. Cryptographic signature verification (unless running in explicit dev simulator mode)
    if (!isSimulator) {
      const keySecret = Deno.env.get("RAZORPAY_TEST_KEY_SECRET");
      if (keySecret && razorpaySignature) {
        const expected = await hmacHex(keySecret, `${razorpayOrderId}|${razorpayPaymentId}`);
        if (!constantTimeEqual(expected, razorpaySignature)) {
          return json({ error: "Invalid payment signature. Verification failed." }, 400);
        }
      }
    }

    // 3. Update booking status to pending_vendor_confirmation
    const { data: updatedBooking, error: updateErr } = await admin
      .from("vendor_bookings")
      .update({
        booking_status: "pending_vendor_confirmation",
        payment_status: "paid_advance",
        razorpay_payment_id: razorpayPaymentId,
        razorpay_order_id: razorpayOrderId,
        soft_lock_expires_at: null, // Clear soft lock, date is now reserved by pending_vendor_confirmation
        updated_at: new Date().toISOString(),
      })
      .eq("id", booking.id)
      .select("*")
      .single();

    if (updateErr) {
      throw updateErr;
    }

    // 4. Create Vendor Notification
    try {
      await admin.from("vendor_notifications").insert({
        vendor_id: booking.vendor_id,
        title: "New Wedding Booking Request Received!",
        body: `New booking request from ${booking.customer_name} for ${booking.event_type} on ${booking.event_date}. Advance of ₹${booking.advance_amount.toLocaleString("en-IN")} paid. Please confirm within 24 hours.`,
        kind: "booking_request",
        is_read: false,
      });
    } catch (notifErr) {
      console.warn("Could not insert vendor notification:", notifErr);
    }

    // 5. Create Customer Notification
    if (booking.customer_id) {
      try {
        await admin.from("customer_notifications").insert({
          customer_id: booking.customer_id,
          type: "booking_pending_confirmation",
          title: "Booking Request Sent to Vendor",
          message: `Your 30% advance of ₹${booking.advance_amount.toLocaleString("en-IN")} has been received. Your booking is awaiting vendor confirmation.`,
          target_path: `/ticket?ticket_id=${booking.ticket_id}&booking_id=${booking.booking_id}`,
          metadata: {
            booking_id: booking.booking_id,
            ticket_id: booking.ticket_id,
            booking_status: "pending_vendor_confirmation",
          },
        });
      } catch (custNotifErr) {
        console.warn("Could not insert customer notification:", custNotifErr);
      }
    }

    // 6. Record Referral Commission (strictly after 30% advance payment is verified)
    try {
      await admin.rpc("record_booking_referral_commission", {
        p_booking_id: updatedBooking.id,
      });
    } catch (refErr) {
      console.warn("Could not record referral commission in verify-booking-payment:", refErr);
    }

    return json({
      success: true,
      bookingId: updatedBooking.booking_id,
      ticketId: updatedBooking.ticket_id,
      bookingStatus: "pending_vendor_confirmation",
      advanceAmount: updatedBooking.advance_amount,
      dueAmount: updatedBooking.due_amount,
    });
  } catch (err) {
    console.error("Error verifying payment:", err);
    return json({ error: errorMessage(err, "Failed to verify booking payment") }, 500);
  }
});
