import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "https://fymdrjcinqvmjthdwrtd.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY in environment");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runRpcTests() {
  console.log("Fetching a vendor for test...");
  const { data: vList, error: vErr } = await supabase.from("vendors").select("id, profile_id").limit(1);
  if (vErr || !vList || vList.length === 0) {
    throw new Error("No vendor found for testing");
  }
  const vendor = vList[0];
  console.log("Using vendor ID:", vendor.id);

  // 1. Insert a test booking in 'pending_vendor_confirmation' status
  const testBookingId = `test_bkg_${Date.now()}`;
  const { data: insertData, error: insertErr } = await supabase.from("vendor_bookings").insert({
    booking_id: testBookingId,
    ticket_id: `RL${Math.floor(10000 + Math.random() * 90000)}`,
    vendor_id: vendor.id,
    customer_name: "Test Customer",
    customer_phone: "9876543210",
    event_date: "2026-12-25",
    start_date: "2026-12-25",
    end_date: "2026-12-26",
    total_days: 2,
    event_type: "Wedding",
    package_title: "Full Day Photography",
    package_price: 50000,
    total_amount: 50000,
    advance_amount: 15000,
    due_amount: 35000,
    booking_status: "pending_vendor_confirmation",
    payment_status: "paid_advance",
    razorpay_order_id: "order_test_123",
    razorpay_payment_id: "pay_test_456"
  }).select("id").single();

  if (insertErr) {
    throw new Error("Failed to insert test booking: " + insertErr.message);
  }
  console.log("Inserted test booking ID:", insertData.id);

  // 2. Test get_vendor_availability_calendar: 2026-12-25 and 2026-12-26 MUST be booking_blocked = true!
  const { data: calCheck, error: calErr } = await supabase.rpc("get_vendor_availability_calendar", {
    target_vendor_id: vendor.id,
    start_date: "2026-12-24",
    end_date: "2026-12-27"
  });
  if (calErr) throw calErr;
  console.log("Calendar check during pending_vendor_confirmation:");
  calCheck.forEach(day => console.log(`  ${day.date}: blocked=${day.booking_blocked}`));

  const day25 = calCheck.find(d => d.date === "2026-12-25");
  const day26 = calCheck.find(d => d.date === "2026-12-26");
  const day24 = calCheck.find(d => d.date === "2026-12-24");
  if (!day25?.booking_blocked || !day26?.booking_blocked || day24?.booking_blocked) {
    throw new Error("Availability logic failed: pending_vendor_confirmation MUST block 25th & 26th, but NOT 24th!");
  }
  console.log("✅ CORRECTION 2 VERIFIED: pending_vendor_confirmation reserves the dates without manual blocked rows!");

  // 3. Test cancel_vendor_booking RPC
  console.log("Testing cancel_vendor_booking RPC...");
  const { data: cancelResult, error: cancelErr } = await supabase.rpc("cancel_vendor_booking", {
    target_booking_id: insertData.id,
    cancel_reason: "Vendor fully booked offline"
  });
  if (cancelErr) throw cancelErr;
  console.log("cancel_vendor_booking result:", cancelResult);

  // Verify refund request was created
  const { data: refundReq, error: refErr } = await supabase
    .from("booking_refund_requests")
    .select("*")
    .eq("booking_id", insertData.id)
    .single();
  if (refErr || !refundReq) {
    throw new Error("Refund request was not created in booking_refund_requests!");
  }
  console.log("✅ CORRECTION 3 VERIFIED: booking_refund_requests row created atomically:", refundReq);

  // Verify availability is released
  const { data: calAfterCancel } = await supabase.rpc("get_vendor_availability_calendar", {
    target_vendor_id: vendor.id,
    start_date: "2026-12-25",
    end_date: "2026-12-26"
  });
  const day25After = calAfterCancel.find(d => d.date === "2026-12-25");
  if (day25After?.booking_blocked) {
    throw new Error("Date should be unblocked after cancellation!");
  }
  console.log("✅ Dates immediately released on cancellation!");

  // 4. Test confirm_vendor_booking RPC
  console.log("Testing confirm_vendor_booking RPC...");
  const confirmBookingId = `test_confirm_${Date.now()}`;
  const { data: confirmInsert } = await supabase.from("vendor_bookings").insert({
    booking_id: confirmBookingId,
    ticket_id: "",
    vendor_id: vendor.id,
    customer_name: "Confirm Customer",
    customer_phone: "9876543210",
    event_date: "2026-12-30",
    start_date: "2026-12-30",
    end_date: "2026-12-30",
    total_days: 1,
    event_type: "Wedding",
    package_title: "Bridal Makeup",
    package_price: 25000,
    total_amount: 25000,
    advance_amount: 7500,
    due_amount: 17500,
    booking_status: "pending_vendor_confirmation",
    payment_status: "paid_advance",
    razorpay_order_id: "order_test_789",
    razorpay_payment_id: "pay_test_789"
  }).select("id").single();

  const { data: confirmResult, error: confirmErr } = await supabase.rpc("confirm_vendor_booking", {
    target_booking_id: confirmInsert.id
  });
  if (confirmErr) throw confirmErr;
  console.log("confirm_vendor_booking result:", confirmResult);

  if (!confirmResult.ticket_id || !confirmResult.ticket_id.startsWith("RL-")) {
    throw new Error("Invalid ticket ID generated by confirm_vendor_booking: " + confirmResult.ticket_id);
  }

  // Check that NO manual blocked row was inserted into vendor_availability (CORRECTION 1)
  const { data: manualAvail } = await supabase.from("vendor_availability").select("*")
    .eq("vendor_id", vendor.id)
    .eq("date", "2026-12-30");
  if (manualAvail && manualAvail.length > 0) {
    throw new Error("CORRECTION 1 VIOLATION: Manual vendor_availability row was created for confirmed booking!");
  }
  console.log("✅ CORRECTION 1 VERIFIED: Confirmed booking did NOT insert a manual blocked row into vendor_availability!");

  // Check calendar still marks 2026-12-30 as booking_blocked = true
  const { data: calConfirm } = await supabase.rpc("get_vendor_availability_calendar", {
    target_vendor_id: vendor.id,
    start_date: "2026-12-30",
    end_date: "2026-12-30"
  });
  if (!calConfirm[0]?.booking_blocked) {
    throw new Error("2026-12-30 should be booking_blocked because active confirmed booking exists!");
  }
  console.log("✅ Confirmed booking reserves the date in effective availability!");

  await supabase.from("vendor_bookings").delete().eq("id", confirmInsert.id);

  // 5. Test process_admin_refund RPC
  console.log("Testing process_admin_refund RPC...");
  const { data: adminRefResult, error: adminRefErr } = await supabase.rpc("process_admin_refund", {
    target_booking_id: insertData.id,
    ref_notes: "Refund processed via Razorpay API",
    txn_ref: "rfnd_test_999"
  });
  if (adminRefErr) throw adminRefErr;
  console.log("process_admin_refund result:", adminRefResult);

  // Clean up test booking
  await supabase.from("vendor_bookings").delete().eq("id", insertData.id);
  console.log("Cleaned up test booking.");
  console.log("🎉 ALL RPC TESTS PASSED 100%!");
}

runRpcTests().catch(console.error);
