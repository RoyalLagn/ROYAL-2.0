import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log("================================================================================");
console.log("ROYALLAGN REFERRAL + COMMISSION SYSTEM — END-TO-END VERIFICATION SUITE");
console.log("================================================================================\n");

async function runTests() {
  let passed = 0;
  let failed = 0;

  async function runTestCase(name, fn) {
    process.stdout.write(`• ${name}... `);
    try {
      await fn();
      console.log("PASSED ✓");
      passed++;
    } catch (err) {
      console.log("FAILED ✗");
      console.error("  Error:", err.message || err);
      failed++;
    }
  }

  // TEST 1: All 9 Fixed Slabs Calculation Boundary Verification
  await runTestCase("1. Verify all 9 commission slabs match official fixed rupee table strictly on Total Booking", async () => {
    const testCases = [
      { amount: 0, slab: "0 - 2,998", referrer: 0, royal: 0, total: 0 },
      { amount: 1500, slab: "0 - 2,998", referrer: 0, royal: 0, total: 0 },
      { amount: 2998, slab: "0 - 2,998", referrer: 0, royal: 0, total: 0 },
      { amount: 2999, slab: "2,999 - 9,999", referrer: 250, royal: 250, total: 500 },
      { amount: 5000, slab: "2,999 - 9,999", referrer: 250, royal: 250, total: 500 },
      { amount: 9999, slab: "2,999 - 9,999", referrer: 250, royal: 250, total: 500 },
      { amount: 10000, slab: "10,000 - 29,999", referrer: 500, royal: 500, total: 1000 },
      { amount: 20000, slab: "10,000 - 29,999", referrer: 500, royal: 500, total: 1000 },
      { amount: 29999, slab: "10,000 - 29,999", referrer: 500, royal: 500, total: 1000 },
      { amount: 30000, slab: "30,000 - 49,999", referrer: 1000, royal: 1000, total: 2000 },
      { amount: 45000, slab: "30,000 - 49,999", referrer: 1000, royal: 1000, total: 2000 },
      { amount: 49999, slab: "30,000 - 49,999", referrer: 1000, royal: 1000, total: 2000 },
      { amount: 50000, slab: "50,000 - 69,999", referrer: 2000, royal: 2000, total: 4000 },
      { amount: 65000, slab: "50,000 - 69,999", referrer: 2000, royal: 2000, total: 4000 },
      { amount: 69999, slab: "50,000 - 69,999", referrer: 2000, royal: 2000, total: 4000 },
      { amount: 70000, slab: "70,000 - 99,999", referrer: 3000, royal: 3000, total: 6000 },
      { amount: 80000, slab: "70,000 - 99,999", referrer: 3000, royal: 3000, total: 6000 },
      { amount: 99999, slab: "70,000 - 99,999", referrer: 3000, royal: 3000, total: 6000 },
      { amount: 100000, slab: "1,00,000 - 1,29,999", referrer: 4000, royal: 4000, total: 8000 },
      { amount: 120000, slab: "1,00,000 - 1,29,999", referrer: 4000, royal: 4000, total: 8000 },
      { amount: 129999, slab: "1,00,000 - 1,29,999", referrer: 4000, royal: 4000, total: 8000 },
      { amount: 130000, slab: "1,30,000 - 1,49,999", referrer: 5000, royal: 5000, total: 10000 },
      { amount: 145000, slab: "1,30,000 - 1,49,999", referrer: 5000, royal: 5000, total: 10000 },
      { amount: 149999, slab: "1,30,000 - 1,49,999", referrer: 5000, royal: 5000, total: 10000 },
      { amount: 150000, slab: "1,50,000 and above", referrer: 6000, royal: 6000, total: 12000 },
      { amount: 200000, slab: "1,50,000 and above", referrer: 6000, royal: 6000, total: 12000 },
      { amount: 1000000, slab: "1,50,000 and above", referrer: 6000, royal: 6000, total: 12000 },
    ];

    for (const tc of testCases) {
      const { data, error } = await supabase.rpc("calculate_referral_commission", {
        p_booking_total: tc.amount,
      });
      assert.ifError(error);
      assert.equal(data.slab, tc.slab, `Slab mismatch for ₹${tc.amount}`);
      assert.equal(Number(data.referrer_reward), tc.referrer, `Referrer mismatch for ₹${tc.amount}`);
      assert.equal(Number(data.royallagn_commission), tc.royal, `RoyalLagn mismatch for ₹${tc.amount}`);
      assert.equal(Number(data.total_commission), tc.total, `Total mismatch for ₹${tc.amount}`);
    }
  });

  // TEST 2: Customer Referral Profile Provisioning & Structure
  let testReferrer = null;
  let testCustomer = null;
  let testVendor = null;

  await runTestCase("2. Auto-provisioning & structure of customer referral accounts", async () => {
    const { data: publicProfiles, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, referral_code")
      .eq("role", "public_user")
      .order("created_at", { ascending: true })
      .limit(5);

    assert.ifError(error);
    assert.ok(publicProfiles.length >= 2, "Need at least 2 public customer profiles in database");

    testReferrer = publicProfiles[0];
    testCustomer = publicProfiles[1];

    // Ensure referral profile exists for referrer
    const { data: refProfile, error: pErr } = await supabase.rpc("ensure_customer_referral_profile", {
      p_customer_id: testReferrer.id,
    });
    assert.ifError(pErr);
    assert.ok(refProfile.referral_code.startsWith("RL"), "Referral code must start with RL");
    assert.equal(refProfile.referral_url, `https://royallagn.com/?ref=${refProfile.referral_code}`);

    // Fetch vendor for booking tests
    const { data: vendors } = await supabase.from("vendors").select("id, business_name").limit(1);
    assert.ok(vendors && vendors.length > 0, "Need at least 1 vendor in database");
    testVendor = vendors[0];
  });

  // TEST 3: Server-side Self-Referral Prevention
  await runTestCase("3. Server-side self-referral prevention (cannot use own code)", async () => {
    const { data, error } = await supabase.rpc("attribute_customer_referral", {
      p_referred_id: testReferrer.id,
      p_referral_code: testReferrer.referral_code,
      p_source: "link",
    });
    assert.ifError(error);
    assert.equal(data.success, false, "Self-referral must be rejected");
    assert.equal(data.reason, "self_referral_blocked", "Reason must be self_referral_blocked");
  });

  // TEST 4: First-Touch Attribution & Immutability
  await runTestCase("4. First-Touch Attribution and protection against re-attribution", async () => {
    // Save original attribution state for testCustomer to restore after test
    const { data: existingAttr } = await supabase
      .from("referral_attributions")
      .select("*")
      .eq("referred_customer_id", testCustomer.id);

    await supabase.from("referral_attributions").delete().eq("referred_customer_id", testCustomer.id);

    try {
      // First attribution -> should succeed
      const { data: firstAttr, error: err1 } = await supabase.rpc("attribute_customer_referral", {
        p_referred_id: testCustomer.id,
        p_referral_code: testReferrer.referral_code,
        p_source: "link",
      });
      assert.ifError(err1);
      assert.equal(firstAttr.success, true, "First attribution must succeed");
      assert.equal(firstAttr.referrer_id, testReferrer.id);

      // Second attribution attempt with different or same code -> should be rejected
      const { data: secondAttr, error: err2 } = await supabase.rpc("attribute_customer_referral", {
        p_referred_id: testCustomer.id,
        p_referral_code: testReferrer.referral_code,
        p_source: "link",
      });
      assert.ifError(err2);
      assert.equal(secondAttr.success, false, "Second attribution must be rejected");
      assert.equal(secondAttr.reason, "already_attributed");
    } finally {
      // Clean up and restore original attribution
      await supabase.from("referral_attributions").delete().eq("referred_customer_id", testCustomer.id);
      if (existingAttr && existingAttr.length > 0) {
        await supabase.from("referral_attributions").insert(existingAttr);
      }
    }
  });

  // TEST 5: Full Booking Lifecycle Hook (₹80,000 Booking: Pending -> Earned -> Cancelled Reversal)
  await runTestCase("5. Full Booking Lifecycle Hook (Pending -> Earned -> Cancelled Reversal)", async () => {
    // Read initial referrer balances
    const { data: initProfile } = await supabase
      .from("referral_profiles")
      .select("pending_earnings, earned_balance, successful_referrals")
      .eq("customer_id", testReferrer.id)
      .single();

    const initPending = Number(initProfile.pending_earnings || 0);
    const initEarned = Number(initProfile.earned_balance || 0);
    const initSuccessCount = Number(initProfile.successful_referrals || 0);

    const bookingTotal = 80000;
    const advancePaid = 24000; // 30% strictly
    const expectedCommission = 3000; // Slab ₹70,000 - ₹99,999 gives ₹3,000 to referrer

    // Create direct booking with 30% advance verified
    const testBookingId = `bkg_e2e_${Date.now()}`;
    const testTicketId = `RL-${Math.floor(10000 + Math.random() * 90000)}`;

    const { data: newBooking, error: insErr } = await supabase
      .from("vendor_bookings")
      .insert({
        booking_id: testBookingId,
        ticket_id: testTicketId,
        vendor_id: testVendor.id,
        customer_id: testCustomer.id,
        customer_name: "E2E Test Customer",
        customer_phone: "+919999900000",
        event_date: "2026-11-20",
        start_date: "2026-11-20",
        end_date: "2026-11-20",
        total_days: 1,
        event_type: "Wedding",
        package_title: "Full Day Photography",
        package_price: bookingTotal,
        total_amount: bookingTotal,
        advance_amount: advancePaid,
        due_amount: bookingTotal - advancePaid,
        booking_status: "pending_vendor_confirmation",
        payment_status: "paid_advance",
        referral_code: testReferrer.referral_code,
        source: "online",
      })
      .select("id")
      .single();

    assert.ifError(insErr);
    const bookingRecordId = newBooking.id;

    try {
      // 5A: Record pending commission on booking creation / payment verification
      const { data: recData, error: recErr } = await supabase.rpc("record_booking_referral_commission", {
        p_booking_id: bookingRecordId,
      });
      assert.ifError(recErr);
      assert.equal(recData.success, true);
      assert.equal(Number(recData.referrer_reward), expectedCommission);

      // Verify row in referral_commissions
      const { data: commRow } = await supabase
        .from("referral_commissions")
        .select("*")
        .eq("booking_id", testBookingId)
        .single();

      assert.ok(commRow, "Commission record must exist");
      assert.equal(commRow.status, "pending", "Commission must be pending");
      assert.equal(Number(commRow.booking_total), bookingTotal, "Calculated on Total Booking Value");
      assert.equal(Number(commRow.advance_paid), advancePaid);
      assert.equal(Number(commRow.referrer_reward), expectedCommission);
      assert.equal(Number(commRow.royallagn_commission), expectedCommission);

      // Check referrer profile pending balance incremented
      const { data: postPendingProfile } = await supabase
        .from("referral_profiles")
        .select("pending_earnings, earned_balance, successful_referrals")
        .eq("customer_id", testReferrer.id)
        .single();

      assert.equal(Number(postPendingProfile.pending_earnings), initPending + expectedCommission);
      assert.equal(Number(postPendingProfile.earned_balance), initEarned);
      assert.equal(Number(postPendingProfile.successful_referrals), initSuccessCount);

      // 5B: Vendor Confirms Booking -> Commission transitions to EARNED
      const { data: confData, error: confErr } = await supabase.rpc("confirm_vendor_booking", {
        target_booking_id: bookingRecordId,
      });
      assert.ifError(confErr);
      assert.equal(confData.success, true);

      // Verify commission row status is earned
      const { data: earnedCommRow } = await supabase
        .from("referral_commissions")
        .select("status")
        .eq("booking_id", testBookingId)
        .single();
      assert.equal(earnedCommRow.status, "earned");

      // Verify referrer profile balances updated (pending decremented, earned incremented, success count +1)
      const { data: postEarnedProfile } = await supabase
        .from("referral_profiles")
        .select("pending_earnings, earned_balance, successful_referrals")
        .eq("customer_id", testReferrer.id)
        .single();

      assert.equal(Number(postEarnedProfile.pending_earnings), initPending);
      assert.equal(Number(postEarnedProfile.earned_balance), initEarned + expectedCommission);
      assert.equal(Number(postEarnedProfile.successful_referrals), initSuccessCount + 1);

      // 5C: Vendor Cancels Booking -> Commission reverted (status = CANCELLED)
      const { data: cancelData, error: cancelErr } = await supabase.rpc("cancel_vendor_booking", {
        target_booking_id: bookingRecordId,
        cancel_reason: "Vendor schedule clash",
      });
      assert.ifError(cancelErr);
      assert.equal(cancelData.success, true);

      // Verify commission row status is cancelled
      const { data: cancelledCommRow } = await supabase
        .from("referral_commissions")
        .select("status")
        .eq("booking_id", testBookingId)
        .single();
      assert.equal(cancelledCommRow.status, "cancelled");

      // Verify referrer profile balances cleanly decremented back to initial state
      const { data: postRevertedProfile } = await supabase
        .from("referral_profiles")
        .select("pending_earnings, earned_balance, successful_referrals")
        .eq("customer_id", testReferrer.id)
        .single();

      assert.equal(Number(postRevertedProfile.pending_earnings), initPending);
      assert.equal(Number(postRevertedProfile.earned_balance), initEarned);
      assert.equal(Number(postRevertedProfile.successful_referrals), initSuccessCount);

    } finally {
      // Clean up test booking and commission row
      await supabase.from("referral_commissions").delete().eq("booking_id", testBookingId);
      await supabase.from("vendor_bookings").delete().eq("id", bookingRecordId);
    }
  });

  // TEST 6: Non-referral Booking Protection
  await runTestCase("6. Non-referral bookings do not trigger commission", async () => {
    const testBookingId = `bkg_noref_${Date.now()}`;
    const { data: noRefBooking, error: insErr } = await supabase
      .from("vendor_bookings")
      .insert({
        booking_id: testBookingId,
        ticket_id: `RL-${Math.floor(10000 + Math.random() * 90000)}`,
        vendor_id: testVendor.id,
        customer_name: "Direct Walk-in",
        customer_phone: "+919999911111",
        event_date: "2026-11-21",
        total_days: 1,
        event_type: "Wedding",
        package_title: "Basic Pack",
        package_price: 50000,
        total_amount: 50000,
        advance_amount: 15000,
        due_amount: 35000,
        booking_status: "pending_vendor_confirmation",
        payment_status: "paid_advance",
        referral_code: null, // No referral
        source: "online",
      })
      .select("id")
      .single();

    assert.ifError(insErr);

    try {
      const { data: recData } = await supabase.rpc("record_booking_referral_commission", {
        p_booking_id: noRefBooking.id,
      });
      assert.equal(recData.success, false);
      assert.equal(recData.reason, "no_referrer");

      const { data: commRows } = await supabase
        .from("referral_commissions")
        .select("id")
        .eq("booking_id", testBookingId);

      assert.equal(commRows.length, 0, "No commission row should be created for non-referral booking");
    } finally {
      await supabase.from("vendor_bookings").delete().eq("id", noRefBooking.id);
    }
  });

  // TEST 7: Idempotency & Duplicate Commission Protection
  await runTestCase("7. Idempotency & duplicate commission prevention on same booking", async () => {
    const testBookingId = `bkg_dup_${Date.now()}`;
    const { data: dupBooking, error: insErr } = await supabase
      .from("vendor_bookings")
      .insert({
        booking_id: testBookingId,
        ticket_id: `RL-${Math.floor(10000 + Math.random() * 90000)}`,
        vendor_id: testVendor.id,
        customer_name: "Dup Test Customer",
        customer_phone: "+919999922222",
        event_date: "2026-11-22",
        total_days: 1,
        event_type: "Wedding",
        package_title: "Premium Pack",
        package_price: 35000,
        total_amount: 35000,
        advance_amount: 10500,
        due_amount: 24500,
        booking_status: "pending_vendor_confirmation",
        payment_status: "paid_advance",
        referral_code: testReferrer.referral_code,
        source: "online",
      })
      .select("id")
      .single();

    assert.ifError(insErr);

    try {
      // First call -> success
      const { data: call1 } = await supabase.rpc("record_booking_referral_commission", {
        p_booking_id: dupBooking.id,
      });
      assert.equal(call1.success, true);

      // Second call -> returns already_exists: true (idempotent, never duplicates)
      const { data: call2 } = await supabase.rpc("record_booking_referral_commission", {
        p_booking_id: dupBooking.id,
      });
      assert.equal(call2.success, true);
      assert.equal(call2.already_exists, true, "Must return already_exists: true");

      const { data: rows } = await supabase
        .from("referral_commissions")
        .select("id")
        .eq("booking_id", testBookingId);

      assert.equal(rows.length, 1, "Exactly 1 commission record must exist, no duplicates");
    } finally {
      await supabase.from("referral_commissions").delete().eq("booking_id", testBookingId);
      await supabase.from("vendor_bookings").delete().eq("id", dupBooking.id);
    }
  });

  console.log("\n================================================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("FATAL SUITE ERROR:", err);
  process.exit(1);
});
