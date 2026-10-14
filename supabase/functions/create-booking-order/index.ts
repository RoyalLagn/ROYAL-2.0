import {
  corsHeaders,
  errorMessage,
  json,
  requireEnv,
  serviceClient,
  razorpayAuthorization,
  resolveCallerUser,
} from "../_shared/subscriptions.ts";

function calculateEventDays(startDateStr: string, endDateStr: string): number {
  const cleanStart = startDateStr.slice(0, 10);
  const cleanEnd = (endDateStr || startDateStr).slice(0, 10);
  if (cleanStart === cleanEnd) return 1;

  const [startY, startM, startD] = cleanStart.split("-").map(Number);
  const [endY, endM, endD] = cleanEnd.split("-").map(Number);
  if (!startY || !startM || !startD || !endY || !endM || !endD) return 1;

  const startUtc = Date.UTC(startY, startM - 1, startD);
  const endUtc = Date.UTC(endY, endM - 1, endD);
  const diffMs = endUtc - startUtc;
  if (diffMs < 0) return 1;

  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays + 1);
}

function calculateCommissionSlab(totalAmount: number) {
  const rounded = Math.round(Number(totalAmount || 0));
  if (rounded < 2999) return { refReward: 0, rlComm: 0, fee: 0, slab: "0 – 2,998" };
  if (rounded < 10000) return { refReward: 250, rlComm: 250, fee: 500, slab: "2,999 – 9,999" };
  if (rounded < 30000) return { refReward: 500, rlComm: 500, fee: 1000, slab: "10,000 – 29,999" };
  if (rounded < 50000) return { refReward: 1000, rlComm: 1000, fee: 2000, slab: "30,000 – 49,999" };
  if (rounded < 70000) return { refReward: 2000, rlComm: 2000, fee: 4000, slab: "50,000 – 69,999" };
  if (rounded < 100000) return { refReward: 3000, rlComm: 3000, fee: 6000, slab: "70,000 – 99,999" };
  if (rounded < 130000) return { refReward: 4000, rlComm: 4000, fee: 8000, slab: "1,00,000 – 1,29,999" };
  if (rounded < 150000) return { refReward: 5000, rlComm: 5000, fee: 10000, slab: "1,30,000 – 1,49,999" };
  return { refReward: 6000, rlComm: 6000, fee: 12000, slab: "1,50,000 and above" };
}

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

    const vendorId = String(body.vendorId ?? "").trim();
    const startDate = String(body.startDate ?? "").slice(0, 10);
    const endDate = String(body.endDate ?? startDate).slice(0, 10);
    const customerName = String(body.customerName ?? "").trim();
    const customerPhone = String(body.customerPhone ?? "").replace(/\D/g, "");
    const customerEmail = body.customerEmail ? String(body.customerEmail).trim() : null;
    // Authenticate caller: require a valid authenticated customer session
    let authenticatedUser: any = null;
    let isServiceRole = false;
    try {
      const caller = await resolveCallerUser(request);
      authenticatedUser = caller.user;
      isServiceRole = caller.isServiceRole;
    } catch (authErr) {
      return json({ error: errorMessage(authErr, "Invalid authentication session token") }, 401);
    }

    if (!isServiceRole && !authenticatedUser) {
      return json({ error: "Authentication required: Please sign in to book a service." }, 401);
    }

    let customerId: string | null = null;
    if (authenticatedUser) {
      customerId = authenticatedUser.id;
      // If client provided a customerId, it MUST match authenticated user session
      if (body.customerId && String(body.customerId).trim() !== authenticatedUser.id) {
        return json({ error: "Security violation: customerId does not match authenticated user session." }, 403);
      }
    } else if (isServiceRole) {
      customerId = body.customerId ? String(body.customerId).trim() : null;
    }

    const eventType = String(body.eventType ?? "Wedding").trim();
    const specialNotes = body.specialNotes ? String(body.specialNotes).trim() : null;
    const referralCode = body.referralCode ? String(body.referralCode).trim() : null;
    const selectedPackageIds = Array.isArray(body.selectedPackageIds) ? body.selectedPackageIds : [];
    const addOns = Array.isArray(body.addOns) ? body.addOns : [];

    // 5-Day Cancellation Lock & Contact Details
    const rawStartAt = body.eventStartAt ? String(body.eventStartAt).trim() : `${startDate}T10:00:00+05:30`;
    const eventStartAt = rawStartAt.includes("T") ? rawStartAt : `${rawStartAt}T10:00:00+05:30`;
    const cancellationCutoffAt = new Date(new Date(eventStartAt).getTime() - 120 * 60 * 60 * 1000).toISOString();
    const customerContactNumber = body.customerContactNumber ? String(body.customerContactNumber).trim() : customerPhone;
    const customerWhatsappNumber = body.customerWhatsappNumber ? String(body.customerWhatsappNumber).trim() : customerContactNumber;
    const serviceMapUrl = body.serviceMapUrl ? String(body.serviceMapUrl).trim() : null;
    const bookingDescription = body.bookingDescription ? String(body.bookingDescription).trim() : specialNotes;

    // 1. Validation
    if (!vendorId) {
      return json({ error: "Vendor ID is required" }, 400);
    }
    if (!customerName || customerPhone.length < 10) {
      return json({ error: "Valid customer name and 10-digit phone number are required" }, 400);
    }
    if (!startDate || startDate < new Date().toISOString().slice(0, 10)) {
      return json({ error: "Event start date must be in the future" }, 400);
    }
    if (endDate < startDate) {
      return json({ error: "Event end date cannot be earlier than start date" }, 400);
    }

    // 2. Validate Vendor exists and is active
    const { data: vendor, error: vendorErr } = await admin
      .from("vendors")
      .select("id, business_name, contact_phone, is_verified, management_status")
      .eq("id", vendorId)
      .maybeSingle();

    if (vendorErr || !vendor) {
      return json({ error: "Vendor not found" }, 404);
    }
    if (vendor.management_status && vendor.management_status !== "active") {
      return json({ error: "Vendor is not active" }, 400);
    }

    // 3. Deduplication / Double-click guard:
    // If THIS exact customer already has an active, unexpired soft lock with a Razorpay order, return it immediately
    const razorpay = razorpayAuthorization();
    const nowIso = new Date().toISOString();

    const { data: existingActive } = await admin
      .from("vendor_bookings")
      .select("id, booking_id, ticket_id, razorpay_order_id, booking_fee_amount, advance_amount, due_amount, total_amount, total_days, soft_lock_expires_at")
      .eq("vendor_id", vendorId)
      .eq("customer_phone", customerPhone)
      .eq("start_date", startDate)
      .eq("end_date", endDate)
      .eq("booking_status", "pending_payment")
      .gt("soft_lock_expires_at", nowIso)
      .not("razorpay_order_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingActive && existingActive.razorpay_order_id && !existingActive.razorpay_order_id.startsWith("order_bkg_")) {
      const activeFee = Number(existingActive.booking_fee_amount ?? existingActive.advance_amount ?? 0);
      return json({
        success: true,
        bookingRecordId: existingActive.id,
        bookingId: existingActive.booking_id,
        ticketId: existingActive.ticket_id,
        orderId: existingActive.razorpay_order_id,
        keyId: razorpay.keyId,
        currency: "INR",
        amountMinor: Math.round(activeFee * 100),
        bookingFeeAmount: activeFee,
        advanceAmount: activeFee,
        dueAmount: Number(existingActive.due_amount),
        grandTotal: Number(existingActive.total_amount),
        totalDays: existingActive.total_days,
        softLockExpiresAt: existingActive.soft_lock_expires_at,
      });
    }

    // 4. ATOMIC AVAILABILITY CHECK:
    // Check if any date in [startDate, endDate] is manually blocked OR has an active booking OR an active soft lock
    const { data: calCheck, error: calErr } = await admin.rpc("get_vendor_availability_calendar", {
      target_vendor_id: vendorId,
      start_date: startDate,
      end_date: endDate,
    });

    if (calErr) {
      throw calErr;
    }

    // Filter out conflicts
    const conflictingDays = (calCheck ?? []).filter((day: any) => {
      if (day.booking_blocked || day.status === "blocked") return true;
      return false;
    });

    if (conflictingDays.length > 0) {
      const datesStr = conflictingDays.map((d: any) => d.date).join(", ");
      return json({
        error: `Selected date(s) are already booked or unavailable: ${datesStr}`,
        conflictingDates: conflictingDays.map((d: any) => d.date),
      }, 409);
    }

    // 4. Fetch authoritative packages from database
    let packagesData: any[] = [];
    if (selectedPackageIds.length > 0) {
      const { data: pkgs, error: pkgsErr } = await admin
        .from("vendor_services")
        .select("id, title, price, discounted_price, price_type, duration_label, service_category, is_active, status")
        .eq("vendor_id", vendorId)
        .in("id", selectedPackageIds);

      if (pkgsErr) throw pkgsErr;
      packagesData = pkgs ?? [];
    }

    // Fallback: if no package selected, fetch first active package for vendor or base rate
    if (packagesData.length === 0) {
      const { data: defaultPkgs } = await admin
        .from("vendor_services")
        .select("id, title, price, discounted_price, price_type, duration_label, service_category")
        .eq("vendor_id", vendorId)
        .eq("status", "active")
        .eq("is_active", true)
        .limit(1);

      if (defaultPkgs && defaultPkgs.length > 0) {
        packagesData = defaultPkgs;
      }
    }

    // 5. Server-side price calculation
    const totalDays = calculateEventDays(startDate, endDate);

    const snapshotItems = packagesData.map((pkg) => {
      const unitPrice = Number(pkg.discounted_price ?? pkg.price ?? 0);
      const duration = (pkg.duration_label || "").toLowerCase();
      const priceType = (pkg.price_type || "").toLowerCase();
      const isPerDay = duration.includes("day") || duration.includes("daily") || priceType === "starting" || !priceType;
      const daysApplied = isPerDay ? totalDays : 1;
      const subtotal = Math.round(unitPrice * daysApplied);

      return {
        id: pkg.id,
        title: pkg.title,
        unit_price: unitPrice,
        is_per_day: isPerDay,
        days_applied: daysApplied,
        subtotal,
        duration_label: pkg.duration_label || null,
        service_category: pkg.service_category || null,
      };
    });

    const packagesTotal = snapshotItems.reduce((sum, item) => sum + item.subtotal, 0);
    const addOnsTotal = addOns.reduce((sum: number, item: any) => sum + (Number(item.price) || 0), 0);
    const grandTotal = Math.max(0, Math.round(packagesTotal + addOnsTotal));

    // 5b. Authoritative Commission Slab Calculation
    const slab = calculateCommissionSlab(grandTotal);

    // Verify referral attribution if code provided
    let referralAllocation = 0;
    let royallagnAllocation = slab.fee;
    let hasValidReferral = false;

    if (referralCode) {
      const cleanRef = referralCode.toUpperCase();
      const { data: refCheck } = await admin
        .from("referral_profiles")
        .select("customer_id")
        .eq("referral_code", cleanRef)
        .maybeSingle();

      if (refCheck && refCheck.customer_id !== customerId) {
        hasValidReferral = true;
      } else {
        const { data: profCheck } = await admin
          .from("profiles")
          .select("id")
          .eq("referral_code", cleanRef)
          .maybeSingle();
        if (profCheck && profCheck.id !== customerId) {
          hasValidReferral = true;
        }
      }
    }

    if (hasValidReferral) {
      referralAllocation = slab.refReward;
      royallagnAllocation = slab.rlComm;
    }

    const bookingFee = slab.fee;
    const vendorDue = Math.max(0, grandTotal - bookingFee);
    const bookingFeePaise = bookingFee * 100;
    const primaryTitle = snapshotItems.map((p) => p.title).join(" + ") || "Wedding Service";

    // 6. Zero-Fee Checkout Path (₹0 - ₹2,998)
    if (bookingFee === 0) {
      const { data: zeroRes, error: zeroErr } = await admin.rpc("create_zero_fee_booking", {
        p_vendor_id: vendorId,
        p_customer_name: customerName,
        p_customer_phone: customerPhone,
        p_customer_email: customerEmail,
        p_event_date: startDate,
        p_start_date: startDate,
        p_end_date: endDate,
        p_total_days: totalDays,
        p_event_type: eventType,
        p_package_id: snapshotItems[0]?.id || null,
        p_package_title: primaryTitle,
        p_total_amount: grandTotal,
        p_selected_packages: snapshotItems,
        p_add_ons: addOns,
        p_special_notes: specialNotes,
        p_referral_code: referralCode,
        p_customer_contact_number: customerContactNumber,
        p_customer_whatsapp_number: customerWhatsappNumber,
        p_service_map_url: serviceMapUrl,
        p_booking_description: bookingDescription,
      });

      if (zeroErr) {
        throw zeroErr;
      }

      return json({
        success: true,
        isZeroFee: true,
        bookingRecordId: zeroRes.booking_record_id,
        bookingId: zeroRes.booking_id,
        ticketId: zeroRes.ticket_id,
        bookingStatus: "ADMIN_PENDING",
        bookingFeeAmount: 0,
        advanceAmount: 0,
        dueAmount: grandTotal,
        grandTotal,
        totalDays,
      });
    }

    // 7. Generate IDs and 15-minute soft lock for Paid Booking Fee
    const bookingId = `bkg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const ticketId = `RL-${Math.floor(10000 + Math.random() * 90000)}`;
    const softLockExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Insert pending_payment booking with 15-minute soft lock
    const { data: newBooking, error: insertErr } = await admin
      .from("vendor_bookings")
      .insert({
        booking_id: bookingId,
        ticket_id: ticketId,
        vendor_id: vendorId,
        customer_id: customerId || null,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        event_date: startDate,
        start_date: startDate,
        end_date: endDate,
        total_days: totalDays,
        event_type: eventType,
        package_id: snapshotItems[0]?.id || null,
        package_title: primaryTitle,
        package_price: packagesTotal,
        selected_packages: snapshotItems,
        add_ons: addOns,
        special_notes: specialNotes,
        total_amount: grandTotal,
        booking_fee_amount: bookingFee,
        referral_commission_amount: referralAllocation,
        royallagn_commission_amount: royallagnAllocation,
        advance_amount: bookingFee,
        due_amount: vendorDue,
        booking_status: "pending_payment",
        payment_status: "pending",
        soft_lock_expires_at: softLockExpiresAt,
        referral_code: referralCode,
        source: "online",
        event_start_at: eventStartAt,
        cancellation_cutoff_at: cancellationCutoffAt,
        customer_contact_number: customerContactNumber,
        customer_whatsapp_number: customerWhatsappNumber,
        service_map_url: serviceMapUrl,
        booking_description: bookingDescription,
      })
      .select("id")
      .single();

    if (insertErr) {
      throw insertErr;
    }

    // 8. Create Genuine Razorpay Test Order for Booking Fee
    let razorpayOrderId = "";
    try {
      const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Authorization": razorpay.header,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: bookingFeePaise,
          currency: "INR",
          receipt: newBooking.id,
          payment_capture: 1,
          notes: {
            booking_record_id: newBooking.id,
            booking_id: bookingId,
            ticket_id: ticketId,
            vendor_id: vendorId,
            customer_name: customerName,
            customer_phone: customerPhone,
            event_date: startDate,
            booking_fee: bookingFee,
            grand_total: grandTotal,
          },
        }),
      });

      if (!rzpRes.ok) {
        const errBody = await rzpRes.text();
        console.error("Razorpay order creation failed:", errBody);
        await admin.from("vendor_bookings").delete().eq("id", newBooking.id);
        return json({ error: `Razorpay order creation failed (${rzpRes.status}): ${errBody}` }, 400);
      }

      const orderData = await rzpRes.json();
      if (!orderData?.id) {
        await admin.from("vendor_bookings").delete().eq("id", newBooking.id);
        return json({ error: "Razorpay order creation returned an invalid order ID" }, 400);
      }
      razorpayOrderId = orderData.id;
    } catch (rzpErr) {
      await admin.from("vendor_bookings").delete().eq("id", newBooking.id);
      throw rzpErr;
    }

    // Update razorpay_order_id on booking
    await admin
      .from("vendor_bookings")
      .update({ razorpay_order_id: razorpayOrderId })
      .eq("id", newBooking.id);

    // Return safe checkout payload to client
    return json({
      success: true,
      bookingRecordId: newBooking.id,
      bookingId,
      ticketId,
      orderId: razorpayOrderId,
      keyId: razorpay.keyId,
      currency: "INR",
      amountMinor: bookingFeePaise,
      bookingFeeAmount: bookingFee,
      advanceAmount: bookingFee,
      dueAmount: vendorDue,
      grandTotal,
      totalDays,
      softLockExpiresAt,
    });
  } catch (err) {
    console.error("Error creating booking order:", err);
    return json({ error: errorMessage(err, "Failed to create booking order") }, 500);
  }
});
