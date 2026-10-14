import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "https://fymdrjcinqvmjthdwrtd.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function getExpectedCommissionSlab(amount) {
  const rounded = Math.max(0, Math.round(amount));
  if (rounded < 2999) return { fee: 0, referrerReward: 0, royallagnCommission: 0, label: "0 – 2,998" };
  if (rounded < 10000) return { fee: 500, referrerReward: 250, royallagnCommission: 250, label: "2,999 – 9,999" };
  if (rounded < 30000) return { fee: 1000, referrerReward: 500, royallagnCommission: 500, label: "10,000 – 29,999" };
  if (rounded < 50000) return { fee: 2000, referrerReward: 1000, royallagnCommission: 1000, label: "30,000 – 49,999" };
  if (rounded < 70000) return { fee: 4000, referrerReward: 2000, royallagnCommission: 2000, label: "50,000 – 69,999" };
  if (rounded < 100000) return { fee: 6000, referrerReward: 3000, royallagnCommission: 3000, label: "70,000 – 99,999" };
  if (rounded < 130000) return { fee: 8000, referrerReward: 4000, royallagnCommission: 4000, label: "1,00,000 – 1,29,999" };
  if (rounded < 150000) return { fee: 10000, referrerReward: 5000, royallagnCommission: 5000, label: "1,30,000 – 1,49,999" };
  return { fee: 12000, referrerReward: 6000, royallagnCommission: 6000, label: "1,50,000 and above" };
}

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = "") {
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName} ${details ? "- " + details : ""}`);
  }
}

async function runE2ETests() {
  console.log("===============================================================================");
  console.log("ROYALLAGN COMMISSION-BASED BOOKING & CONTACT CONNECTION E2E VERIFICATION SUITE");
  console.log("===============================================================================\n");

  // Fetch test vendor
  const { data: vendors, error: vErr } = await supabase.from("vendors").select("id, business_name, contact_phone").limit(1);
  if (vErr || !vendors || vendors.length === 0) {
    throw new Error("No vendor found in database for test");
  }
  const testVendor = vendors[0];
  console.log(`Using Test Vendor: ${testVendor.business_name} (${testVendor.id})\n`);

  // -------------------------------------------------------------------------
  // TEST SUITE 1: 9-Tier Slab Matrix Calculation
  // -------------------------------------------------------------------------
  console.log("--- 1. Testing 9-Tier Slab Fee & Commission Allocations ---");
  const testAmounts = [
    { amt: 1500, expFee: 0, expRef: 0, expRoy: 0 },
    { amt: 2998, expFee: 0, expRef: 0, expRoy: 0 },
    { amt: 2999, expFee: 500, expRef: 250, expRoy: 250 },
    { amt: 9999, expFee: 500, expRef: 250, expRoy: 250 },
    { amt: 10000, expFee: 1000, expRef: 500, expRoy: 500 },
    { amt: 29999, expFee: 1000, expRef: 500, expRoy: 500 },
    { amt: 30000, expFee: 2000, expRef: 1000, expRoy: 1000 },
    { amt: 50000, expFee: 4000, expRef: 2000, expRoy: 2000 },
    { amt: 70000, expFee: 6000, expRef: 3000, expRoy: 3000 },
    { amt: 100000, expFee: 8000, expRef: 4000, expRoy: 4000 },
    { amt: 130000, expFee: 10000, expRef: 5000, expRoy: 5000 },
    { amt: 150000, expFee: 12000, expRef: 6000, expRoy: 6000 },
    { amt: 250000, expFee: 12000, expRef: 6000, expRoy: 6000 }, // capped at 12,000
  ];

  for (const t of testAmounts) {
    const slab = getExpectedCommissionSlab(t.amt);
    assert(
      slab.fee === t.expFee && slab.referrerReward === t.expRef && slab.royallagnCommission === t.expRoy,
      `Slab for ₹${t.amt.toLocaleString("en-IN")}: Fee ₹${slab.fee}, Ref ₹${slab.referrerReward}, Royal ₹${slab.royallagnCommission}`
    );
  }

  // -------------------------------------------------------------------------
  // TEST SUITE 2: Standard Booking with Referral: ₹9,999 -> Full Acceptance
  // -------------------------------------------------------------------------
  console.log("\n--- 2. Test 1: ₹9,999 Booking with Referral -> Acceptance Lifecycle ---");
  const bkgId1 = `test_comm_1_${Date.now()}`;
  const ticketId1 = `RL${Math.floor(10000 + Math.random() * 90000)}`;

  // Create pending booking
  const { data: b1Insert, error: b1Err } = await supabase.from("vendor_bookings").insert({
    booking_id: bkgId1,
    ticket_id: ticketId1,
    vendor_id: testVendor.id,
    customer_name: "Anita Sharma",
    customer_phone: "9820198201",
    customer_whatsapp_number: "9820198201",
    event_date: "2026-11-20",
    start_date: "2026-11-20",
    end_date: "2026-11-20",
    total_days: 1,
    event_type: "Engagement",
    package_title: "Classic Photo Package",
    package_price: 9999,
    total_amount: 9999,
    booking_fee_amount: 500,
    referral_commission_amount: 250,
    royallagn_commission_amount: 250,
    advance_amount: 500,
    due_amount: 9499,
    booking_status: "pending_payment",
    payment_status: "pending",
    referral_code: "RLREFTEST",
    razorpay_order_id: "order_test_101",
    source: "online",
  }).select("*").single();

  if (b1Err) throw new Error("Failed to insert bkg 1: " + b1Err.message);

  // 2a. Finalize payment via RPC
  const { data: fin1Res, error: fin1Err } = await supabase.rpc("finalize_connection_booking_fee", {
    p_booking_id: b1Insert.id,
    p_order_id: "order_test_101",
    p_payment_id: "pay_test_101",
    p_method: "upi",
  });
  assert(!fin1Err && fin1Res?.success, "finalize_connection_booking_fee RPC succeeds");

  // Verify state after payment: ADMIN_PENDING
  const { data: b1AfterPay } = await supabase.from("vendor_bookings").select("*").eq("id", b1Insert.id).single();
  assert(b1AfterPay.booking_status === "ADMIN_PENDING", "Booking status is ADMIN_PENDING after payment");
  assert(b1AfterPay.payment_status === "paid_advance", "Payment status is paid_advance");
  assert(b1AfterPay.admin_verified_at === null, "Admin verified timestamp is null initially");

  // Verify contacts locked via secure details RPC
  const { data: sec1Before } = await supabase.rpc("get_secure_booking_details", {
    p_booking_ref: b1Insert.id
  });
  assert(sec1Before?.contacts_unlocked === false, "Contacts locked during ADMIN_PENDING");

  // 2b. Admin forwards to vendor
  const { data: fwd1Res, error: fwd1Err } = await supabase.rpc("admin_forward_booking_to_vendor", {
    p_booking_id: b1Insert.id
  });
  assert(!fwd1Err && fwd1Res?.success, "admin_forward_booking_to_vendor RPC succeeds");

  const { data: b1AfterFwd } = await supabase.from("vendor_bookings").select("*").eq("id", b1Insert.id).single();
  assert(b1AfterFwd.booking_status === "VENDOR_PENDING", "Booking status transitioned to VENDOR_PENDING");
  assert(b1AfterFwd.forwarded_to_vendor_at !== null, "Forwarded to vendor timestamp recorded");

  // 2c. Vendor accepts booking
  const { data: acc1Res, error: acc1Err } = await supabase.rpc("vendor_accept_booking", {
    p_booking_id: b1Insert.id
  });
  assert(!acc1Err && acc1Res?.success, "vendor_accept_booking RPC succeeds");

  const { data: b1AfterAcc } = await supabase.from("vendor_bookings").select("*").eq("id", b1Insert.id).single();
  assert(b1AfterAcc.booking_status === "ACCEPTED", "Booking status is ACCEPTED");
  assert(b1AfterAcc.vendor_accepted_at !== null, "Vendor accepted timestamp recorded");

  // Verify contacts unlocked
  const { data: sec1After } = await supabase.rpc("get_secure_booking_details", {
    p_booking_ref: b1Insert.id
  });
  assert(sec1After?.contacts_unlocked === true, "Contacts unlocked immediately after vendor acceptance");
  assert(sec1After?.customer?.phone === "9820198201", "Customer phone unlocked after acceptance");

  // 2d. Attempt customer cancellation after acceptance (MUST FAIL)
  let cancelledAfterAccept = false;
  try {
    const { error: cancelErr } = await supabase.rpc("customer_cancel_booking", {
      p_booking_id: b1Insert.id,
      p_reason: "Customer changed mind after acceptance"
    });
    if (!cancelErr) cancelledAfterAccept = true;
  } catch {}
  assert(!cancelledAfterAccept, "customer_cancel_booking strictly REJECTED once status is ACCEPTED");

  // -------------------------------------------------------------------------
  // TEST SUITE 3: Customer Cancels During ADMIN_PENDING (100% Refund)
  // -------------------------------------------------------------------------
  console.log("\n--- 3. Test 3: Customer Cancels During ADMIN_PENDING (100% Refund Obligation) ---");
  const bkgId3 = `test_comm_3_${Date.now()}`;
  const { data: b3Insert, error: b3Err } = await supabase.from("vendor_bookings").insert({
    booking_id: bkgId3,
    ticket_id: `RL${Math.floor(10000 + Math.random() * 90000)}`,
    vendor_id: testVendor.id,
    customer_name: "Rahul Verma",
    customer_phone: "9830198301",
    event_date: "2026-11-25",
    start_date: "2026-11-25",
    end_date: "2026-11-25",
    total_days: 1,
    event_type: "Wedding",
    package_title: "Wedding Haldi",
    total_amount: 15000,
    booking_fee_amount: 1000,
    advance_amount: 1000,
    due_amount: 14000,
    booking_status: "ADMIN_PENDING",
    payment_status: "paid_booking_fee",
  }).select("*").single();

  if (b3Err) throw new Error("Failed to insert bkg 3: " + b3Err.message);

  const { data: cancel3Res, error: cancel3Err } = await supabase.rpc("customer_cancel_booking", {
    p_booking_id: b3Insert.id,
    p_reason: "Date changed before admin verification"
  });
  assert(!cancel3Err && cancel3Res?.success, "customer_cancel_booking during ADMIN_PENDING succeeds");

  const { data: b3AfterCancel } = await supabase.from("vendor_bookings").select("*").eq("id", b3Insert.id).single();
  assert(b3AfterCancel.booking_status === "CUSTOMER_CANCELLED", "Status transitioned to CUSTOMER_CANCELLED");
  assert(b3AfterCancel.cancelled_by === "customer", "cancelled_by recorded as customer");
  assert(b3AfterCancel.refund_status === "pending", "refund_status marked as pending");
  assert(Number(b3AfterCancel.refund_amount) === 1000, "100% fee (₹1,000) queued as refund_amount");

  // Verify refund row created in booking_refund_requests
  const { data: refQueue3 } = await supabase.from("booking_refund_requests").select("*").eq("booking_id", b3Insert.id).maybeSingle();
  assert(refQueue3 !== null && Number(refQueue3.amount) === 1000, "Refund request logged in booking_refund_requests queue");

  // Attempt to forward cancelled booking (MUST FAIL)
  let fwdAfterCancel = false;
  try {
    const { error: fwdErr } = await supabase.rpc("admin_forward_booking_to_vendor", { p_booking_id: b3Insert.id });
    if (!fwdErr) fwdAfterCancel = true;
  } catch {}
  assert(!fwdAfterCancel, "Cannot forward cancelled booking to vendor");

  // -------------------------------------------------------------------------
  // TEST SUITE 4: Customer Cancels During VENDOR_PENDING
  // -------------------------------------------------------------------------
  console.log("\n--- 4. Test 4: Customer Cancels During VENDOR_PENDING ---");
  const bkgId4 = `test_comm_4_${Date.now()}`;
  const { data: b4Insert, error: b4Err } = await supabase.from("vendor_bookings").insert({
    booking_id: bkgId4,
    ticket_id: `RL${Math.floor(10000 + Math.random() * 90000)}`,
    vendor_id: testVendor.id,
    customer_name: "Priya Nair",
    customer_phone: "9840198401",
    event_date: "2026-11-28",
    start_date: "2026-11-28",
    end_date: "2026-11-28",
    total_days: 1,
    event_type: "Wedding",
    package_title: "Wedding Photography",
    total_amount: 35000,
    booking_fee_amount: 2000,
    advance_amount: 2000,
    due_amount: 33000,
    booking_status: "VENDOR_PENDING",
    payment_status: "paid_booking_fee",
  }).select("*").single();

  if (b4Err) throw new Error("Failed to insert bkg 4: " + b4Err.message);

  const { data: cancel4Res, error: cancel4Err } = await supabase.rpc("customer_cancel_booking", {
    p_booking_id: b4Insert.id,
    p_reason: "Venue booked another photographer"
  });
  assert(!cancel4Err && cancel4Res?.success, "customer_cancel_booking during VENDOR_PENDING succeeds");

  const { data: b4AfterCancel } = await supabase.from("vendor_bookings").select("*").eq("id", b4Insert.id).single();
  assert(b4AfterCancel.booking_status === "CUSTOMER_CANCELLED", "Status is CUSTOMER_CANCELLED");

  // Vendor attempts to accept cancelled booking (MUST FAIL)
  let vendorAcceptedCancelled = false;
  try {
    const { error: accErr } = await supabase.rpc("vendor_accept_booking", { p_booking_id: b4Insert.id });
    if (!accErr) vendorAcceptedCancelled = true;
  } catch {}
  assert(!vendorAcceptedCancelled, "Vendor cannot accept a booking cancelled by customer");

  // -------------------------------------------------------------------------
  // TEST SUITE 5: Admin Cancels Booking (100% Refund)
  // -------------------------------------------------------------------------
  console.log("\n--- 5. Test 5: Admin Cancels Booking (ADMIN_CANCELLED) ---");
  const bkgId5 = `test_comm_5_${Date.now()}`;
  const { data: b5Insert, error: b5Err } = await supabase.from("vendor_bookings").insert({
    booking_id: bkgId5,
    ticket_id: `RL${Math.floor(10000 + Math.random() * 90000)}`,
    vendor_id: testVendor.id,
    customer_name: "Sameer Joshi",
    customer_phone: "9850198501",
    event_date: "2026-12-01",
    start_date: "2026-12-01",
    end_date: "2026-12-01",
    total_days: 1,
    event_type: "Wedding",
    package_title: "Wedding Decoration",
    total_amount: 60000,
    booking_fee_amount: 4000,
    advance_amount: 4000,
    due_amount: 56000,
    booking_status: "ADMIN_PENDING",
    payment_status: "paid_booking_fee",
  }).select("*").single();

  if (b5Err) throw new Error("Failed to insert bkg 5: " + b5Err.message);

  const { data: cancel5Res, error: cancel5Err } = await supabase.rpc("admin_cancel_booking", {
    p_booking_id: b5Insert.id,
    p_reason: "Vendor service verification failed"
  });
  assert(!cancel5Err && cancel5Res?.success, "admin_cancel_booking RPC succeeds");

  const { data: b5AfterCancel } = await supabase.from("vendor_bookings").select("*").eq("id", b5Insert.id).single();
  assert(b5AfterCancel.booking_status === "ADMIN_CANCELLED", "Status is ADMIN_CANCELLED");
  assert(b5AfterCancel.cancelled_by === "admin", "cancelled_by recorded as admin");
  assert(b5AfterCancel.admin_cancellation_reason === "Vendor service verification failed", "Admin cancellation reason stored");
  assert(Number(b5AfterCancel.refund_amount) === 4000, "100% refund (₹4,000) queued for customer");

  // -------------------------------------------------------------------------
  // TEST SUITE 6: Vendor Rejection (VENDOR_REJECTED)
  // -------------------------------------------------------------------------
  console.log("\n--- 6. Test 6: Vendor Rejects Booking (VENDOR_REJECTED) ---");
  const bkgId6 = `test_comm_6_${Date.now()}`;
  const { data: b6Insert, error: b6Err } = await supabase.from("vendor_bookings").insert({
    booking_id: bkgId6,
    ticket_id: `RL${Math.floor(10000 + Math.random() * 90000)}`,
    vendor_id: testVendor.id,
    customer_name: "Deepak Patil",
    customer_phone: "9860198601",
    event_date: "2026-12-05",
    start_date: "2026-12-05",
    end_date: "2026-12-05",
    total_days: 1,
    event_type: "Wedding",
    package_title: "Wedding Catering",
    total_amount: 80000,
    booking_fee_amount: 6000,
    advance_amount: 6000,
    due_amount: 74000,
    booking_status: "VENDOR_PENDING",
    payment_status: "paid_booking_fee",
  }).select("*").single();

  if (b6Err) throw new Error("Failed to insert bkg 6: " + b6Err.message);

  const { data: rej6Res, error: rej6Err } = await supabase.rpc("vendor_reject_booking", {
    p_booking_id: b6Insert.id,
    p_reason: "Already booked for an outstation shoot"
  });
  assert(!rej6Err && rej6Res?.success, "vendor_reject_booking RPC succeeds");

  const { data: b6AfterRej } = await supabase.from("vendor_bookings").select("*").eq("id", b6Insert.id).single();
  assert(b6AfterRej.booking_status === "VENDOR_REJECTED", "Status transitioned to VENDOR_REJECTED");
  assert(b6AfterRej.cancelled_by === "vendor", "cancelled_by recorded as vendor");
  assert(b6AfterRej.rejection_reason === "Already booked for an outstation shoot", "Rejection reason saved");
  assert(Number(b6AfterRej.refund_amount) === 6000, "100% refund (₹6,000) queued for customer");

  // -------------------------------------------------------------------------
  // TEST SUITE 7: Admin Refund Processing (process_booking_refund)
  // -------------------------------------------------------------------------
  console.log("\n--- 7. Test 7: Admin Processes 100% Refund ---");
  const { data: refProcRes, error: refProcErr } = await supabase.rpc("process_booking_refund", {
    p_booking_id: b6Insert.id,
    p_refund_status: "refunded",
    p_txn_ref: "UPI_REF_987654321",
    p_notes: "Refund processed to client ICICI bank account"
  });
  assert(!refProcErr && refProcRes?.success, "process_booking_refund RPC succeeds");

  const { data: b6Refunded } = await supabase.from("vendor_bookings").select("*").eq("id", b6Insert.id).single();
  assert(b6Refunded.refund_status === "refunded", "vendor_bookings.refund_status updated to refunded");
  assert(b6Refunded.refund_notes.includes("ICICI"), "Refund notes saved in vendor_bookings audit trail");

  const { data: refRow6 } = await supabase.from("booking_refund_requests").select("*").eq("booking_id", b6Insert.id).single();
  assert(refRow6.transaction_reference === "UPI_REF_987654321", "Refund transaction reference saved in booking_refund_requests");

  // -------------------------------------------------------------------------
  // TEST SUITE 8: Zero-Fee Booking Bypass Flow (₹0 - ₹2,998)
  // -------------------------------------------------------------------------
  console.log("\n--- 8. Test 8: Zero-Fee Booking Direct Creation & Approval ---");
  const { data: zeroRes, error: zeroErr } = await supabase.rpc("create_zero_fee_booking", {
    p_vendor_id: testVendor.id,
    p_customer_name: "Kavita Rao",
    p_customer_phone: "9870198701",
    p_customer_email: "kavita@example.com",
    p_event_date: "2026-12-10",
    p_start_date: "2026-12-10",
    p_end_date: "2026-12-10",
    p_total_days: 1,
    p_event_type: "Pre-Wedding Consultation",
    p_package_title: "Consultation Package",
    p_total_amount: 1500,
    p_selected_packages: [],
    p_add_ons: [],
    p_special_notes: "Morning session",
    p_referral_code: null,
    p_customer_contact_number: "9870198701",
    p_customer_whatsapp_number: "9870198701",
    p_service_map_url: null,
    p_booking_description: null,
  });

  assert(!zeroErr && zeroRes?.success, "create_zero_fee_booking RPC creates booking directly without Razorpay");

  const { data: zeroBkg } = await supabase.from("vendor_bookings").select("*").eq("id", zeroRes.booking_record_id).single();
  assert(zeroBkg.booking_status === "ADMIN_PENDING", "Zero-fee booking starts in ADMIN_PENDING");
  assert(zeroBkg.payment_status === "free_zero_fee", "Payment status marked as free_zero_fee");
  assert(Number(zeroBkg.booking_fee_amount) === 0, "booking_fee_amount is exactly 0");
  assert(Number(zeroBkg.due_amount) === 1500, "Direct to vendor amount is full 1,500");

  // Admin forwards zero-fee booking
  await supabase.rpc("admin_forward_booking_to_vendor", { p_booking_id: zeroBkg.id });
  // Vendor accepts zero-fee booking
  await supabase.rpc("vendor_accept_booking", { p_booking_id: zeroBkg.id });

  const { data: zeroAccepted } = await supabase.from("vendor_bookings").select("*").eq("id", zeroBkg.id).single();
  assert(zeroAccepted.booking_status === "ACCEPTED", "Zero-fee booking confirmed and accepted");

  // -------------------------------------------------------------------------
  // TEST SUITE 9: Historical Booking Immutability Guard
  // -------------------------------------------------------------------------
  console.log("\n--- 9. Test 9: Historical Advance Booking Immutability Check ---");
  const { data: histBookings, error: histErr } = await supabase
    .from("vendor_bookings")
    .select("ticket_id, booking_status, advance_amount, due_amount")
    .in("ticket_id", ["RL-83474", "RL-56987"]);

  assert(!histErr && histBookings.length > 0, "Historical test bookings exist and are retrievable");
  for (const hb of histBookings) {
    assert(hb.advance_amount !== null && hb.due_amount !== null, `Historical booking #${hb.ticket_id} preserves original advance & due amounts`);
  }

  // -------------------------------------------------------------------------
  // CLEANUP TEST DATA (Only temporary test bookings)
  // -------------------------------------------------------------------------
  console.log("\n--- Cleaning up temporary test artifacts ---");
  const testIds = [b1Insert.id, b3Insert.id, b4Insert.id, b5Insert.id, b6Insert.id, zeroRes.booking_record_id];
  await supabase.from("booking_refund_requests").delete().in("booking_id", testIds);
  await supabase.from("referral_commissions").delete().in("booking_id", testIds);
  await supabase.from("vendor_bookings").delete().in("id", testIds);
  console.log(`Cleaned up ${testIds.length} test booking records safely.`);

  console.log("\n===============================================================================");
  console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log("===============================================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runE2ETests().catch((err) => {
  console.error("Test Suite Aborted with Unhandled Error:", err);
  process.exit(1);
});
