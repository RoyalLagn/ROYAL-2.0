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
console.log("ROYALLAGN REFERRAL WITHDRAWALS PHASE 1 — AUTOMATED VERIFICATION SUITE");
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

  // Fetch existing public customer (excluding active tester account)
  const { data: publicProfiles, error: pubErr } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("role", "public_user")
    .not("email", "ilike", "%hrushikesh%")
    .limit(1);

  assert(!pubErr && publicProfiles?.length, "Need at least 1 public customer in database to run tests");
  const testCustomerId = publicProfiles[0].id;

  // Fetch existing admin profile
  const { data: adminProfiles } = await supabase
    .from("profiles")
    .select("id")
    .in("role", ["admin", "super_admin"])
    .limit(1);

  const testAdminId = adminProfiles?.[0]?.id || testCustomerId;
  const uniqueUtr = `UTR_PHASE1_${Date.now()}`;

  // Preserve existing user's state to restore after testing
  const { data: origDest } = await supabase
    .from("customer_payment_destinations")
    .select("*")
    .eq("customer_id", testCustomerId);

  const { data: origReqs } = await supabase
    .from("referral_payout_requests")
    .select("*")
    .eq("customer_id", testCustomerId);

  // Clean test tables for this customer
  async function cleanupTestData() {
    await supabase.from("referral_payout_requests").delete().eq("customer_id", testCustomerId);
    await supabase.from("customer_payment_destinations").delete().eq("customer_id", testCustomerId);
    await supabase.from("referral_commissions").delete().eq("referrer_id", testCustomerId);
    await supabase.from("vendor_bookings").delete().eq("customer_id", testCustomerId).like("booking_id", "BK_PHASE1_%");
  }

  await cleanupTestData();

  // Ensure customer referral profile exists
  const { data: refProf, error: refErr } = await supabase.rpc("ensure_customer_referral_profile", {
    p_customer_id: testCustomerId,
  });
  assert(!refErr, `ensure_customer_referral_profile error: ${refErr?.message}`);
  assert.equal(refProf.customer_id, testCustomerId);

  try {
    // --------------------------------------------------------------------------
    // TEST 1: Submit Customer Payment Destination (v1, pending)
    // --------------------------------------------------------------------------
    let destinationId = "";
    await runTestCase("1. Submit customer payment destination (v1 pending)", async () => {
      const { data, error } = await supabase.rpc("submit_customer_payment_destination", {
        p_customer_id: testCustomerId,
        p_beneficiary_name: "Test Beneficiary",
        p_upi_id: "testbeneficiary@okaxis",
        p_qr_code_url: "https://example.com/test-qr.png",
        p_mobile: "9876543299",
        p_ownership_confirmed: true,
      });

      assert(!error, `RPC error: ${error?.message}`);
      assert.equal(data.customer_id, testCustomerId);
      assert.equal(data.version, 1);
      assert.equal(data.status, "pending");
      assert.equal(data.is_active, true);
      assert.equal(data.upi_id, "testbeneficiary@okaxis");
      destinationId = data.id;
    });

    // --------------------------------------------------------------------------
    // TEST 2: Admin Reviews and Approves Destination
    // --------------------------------------------------------------------------
    await runTestCase("2. Admin reviews and approves destination with observed name", async () => {
      const { data, error } = await supabase.rpc("review_customer_payment_destination", {
        p_destination_id: destinationId,
        p_decision: "approved",
        p_observed_name: "Test Beneficiary (Verified Bank Name)",
        p_notes: "Verified against NPCI test directory",
        p_admin_id: testAdminId,
      });

      assert(!error, `RPC error: ${error?.message}`);
      assert.equal(data.status, "approved");
      assert.equal(data.observed_recipient_name, "Test Beneficiary (Verified Bank Name)");
      assert.equal(data.reviewed_by, testAdminId);
      assert(data.reviewed_at, "reviewed_at must be populated");
    });

    // --------------------------------------------------------------------------
    // TEST 3: Editing Destination Creates New Version and Resets to Pending
    // --------------------------------------------------------------------------
    await runTestCase("3. Editing destination creates v2 and resets status to pending", async () => {
      const { data, error } = await supabase.rpc("submit_customer_payment_destination", {
        p_customer_id: testCustomerId,
        p_beneficiary_name: "Test Beneficiary Updated",
        p_upi_id: "updatedbeneficiary@icici",
        p_qr_code_url: null,
        p_mobile: "9876543299",
        p_ownership_confirmed: true,
      });

      assert(!error, `RPC error: ${error?.message}`);
      assert.equal(data.version, 2);
      assert.equal(data.status, "pending");
      assert.equal(data.upi_id, "updatedbeneficiary@icici");
      assert.notEqual(data.id, destinationId, "New version must be an immutable new row");
      destinationId = data.id;

      // Re-approve v2 for subsequent withdrawal tests
      await supabase.rpc("review_customer_payment_destination", {
        p_destination_id: destinationId,
        p_decision: "approved",
        p_observed_name: "Test Beneficiary Updated",
        p_admin_id: testAdminId,
      });
    });

    // --------------------------------------------------------------------------
    // TEST 4: Ledger Balance Verification & Seed Commission
    // --------------------------------------------------------------------------
    let testBookingRecordId = null;
    await runTestCase("4. Seed earned referral commission and reconcile wallet balances", async () => {
      const { data: vendors } = await supabase.from("vendors").select("id").limit(1);
      assert.ok(vendors && vendors.length > 0, "Need at least 1 vendor in DB");
      const testVendorId = vendors[0].id;
      const testBookingId = `BK_PHASE1_${Date.now()}`;

      const { data: newBooking, error: insErr } = await supabase
        .from("vendor_bookings")
        .insert({
          vendor_id: testVendorId,
          customer_id: testCustomerId,
          customer_name: "Phase1 Test Customer",
          customer_phone: "919876543299",
          customer_email: "phase1_test_customer@royallagn.test",
          booking_id: testBookingId,
          ticket_id: "TCK-P1-999",
          event_date: "2026-11-20",
          start_date: "2026-11-20",
          end_date: "2026-11-20",
          total_days: 1,
          event_type: "Wedding",
          package_title: "Test Photography",
          package_price: 25000,
          total_amount: 25000,
          advance_amount: 7500,
          due_amount: 17500,
          booking_status: "confirmed",
          payment_status: "paid_advance",
          referral_code: refProf.referral_code,
          source: "online",
        })
        .select("id")
        .single();

      assert(!insErr, `Booking insert error: ${insErr?.message}`);
      testBookingRecordId = newBooking.id;

      // Insert a mock earned referral commission of ₹1,000
      const { error: commErr } = await supabase.from("referral_commissions").insert({
        booking_id: testBookingId,
        booking_record_id: testBookingRecordId,
        ticket_id: "TCK-P1-999",
        referrer_id: testCustomerId,
        referral_code: refProf.referral_code,
        booking_total: 25000,
        advance_paid: 7500,
        remaining_due: 17500,
        commission_slab: "10,000 - 29,999",
        referrer_reward: 1000,
        royallagn_commission: 1000,
        total_commission: 2000,
        status: "earned",
        payout_status: "unpaid",
      });
      assert(!commErr, `Commission insert error: ${commErr?.message}`);

      // Reconcile balances
      const { data: bal, error: balErr } = await supabase.rpc("reconcile_referral_profile_balances", {
        p_customer_id: testCustomerId,
      });
      assert(!balErr, `Reconcile error: ${balErr?.message}`);
      assert.equal(Number(bal.earned_balance), 1000);
      assert.equal(Number(bal.reserved_balance), 0);
      assert.equal(Number(bal.total_paid_out), 0);
    });

    // --------------------------------------------------------------------------
    // TEST 5: Withdrawal Request & Atomic Balance Reservation
    // --------------------------------------------------------------------------
    let withdrawalRequestId = "";
    await runTestCase("5. Withdrawal request reserves balance atomically (₹700 reserved, ₹300 available)", async () => {
      const { data, error } = await supabase.rpc("request_referral_withdrawal", {
        p_customer_id: testCustomerId,
        p_amount: 700,
      });

      assert(!error, `Withdrawal request error: ${error?.message}`);
      assert.equal(Number(data.request.amount), 700);
      assert.equal(data.request.status, "requested");
      assert.equal(Number(data.balances.reserved_balance), 700);
      assert.equal(Number(data.balances.earned_balance), 300); // 1000 - 700
      assert(data.request.destination_snapshot, "Destination snapshot must be captured");
      assert.equal(data.request.destination_snapshot.upi_id, "updatedbeneficiary@icici");
      withdrawalRequestId = data.request.id;
    });

    // --------------------------------------------------------------------------
    // TEST 6: Enforce Single Active Withdrawal Invariant
    // --------------------------------------------------------------------------
    await runTestCase("6. Reject second withdrawal while active withdrawal is in progress", async () => {
      const { data, error } = await supabase.rpc("request_referral_withdrawal", {
        p_customer_id: testCustomerId,
        p_amount: 500,
      });

      assert(error, "Must reject second active withdrawal");
      assert(
        error.message.includes("active withdrawal") || error.message.includes("in progress") || error.message.includes("Only one request"),
        `Unexpected error message: ${error.message}`
      );
    });

    // --------------------------------------------------------------------------
    // TEST 7: Enforce Destination Edit Lock During Active Withdrawal
    // --------------------------------------------------------------------------
    await runTestCase("7. Reject destination modification while withdrawal is in progress", async () => {
      const { data, error } = await supabase.rpc("submit_customer_payment_destination", {
        p_customer_id: testCustomerId,
        p_beneficiary_name: "Illegal Edit",
        p_upi_id: "illegal@upi",
        p_ownership_confirmed: true,
      });

      assert(error, "Must reject edit while withdrawal is in progress");
      assert(
        error.message.includes("currently active") || error.message.includes("active") || error.message.includes("in progress"),
        `Unexpected error message: ${error.message}`
      );
    });

    // --------------------------------------------------------------------------
    // TEST 8: Customer Cancellation Releases Reserved Balance
    // --------------------------------------------------------------------------
    await runTestCase("8. Customer cancels withdrawal and reserved balance is restored (₹1000 available)", async () => {
      const { data, error } = await supabase.rpc("cancel_customer_referral_withdrawal", {
        p_request_id: withdrawalRequestId,
        p_customer_id: testCustomerId,
      });

      assert(!error, `Cancel error: ${error?.message}`);
      assert.equal(Number(data.released_amount), 700);
      assert.equal(Number(data.balances.reserved_balance), 0);
      assert.equal(Number(data.balances.earned_balance), 1000); // restored back to full 1000!
    });

    // --------------------------------------------------------------------------
    // TEST 9: Admin Claim Workflow and Payout Processing
    // --------------------------------------------------------------------------
    await runTestCase("9. Re-request withdrawal & admin atomic claim / release", async () => {
      // Re-request ₹500
      const { data: reqRes, error: reqErr } = await supabase.rpc("request_referral_withdrawal", {
        p_customer_id: testCustomerId,
        p_amount: 500,
      });
      assert(!reqErr, `Re-request error: ${reqErr?.message}`);
      withdrawalRequestId = reqRes.request.id;

      // Operator 1 claims the request
      const { data: claimData, error: claimErr } = await supabase.rpc("claim_withdrawal_payout", {
        p_request_id: withdrawalRequestId,
        p_admin_id: testAdminId,
      });
      assert(!claimErr, `Claim error: ${claimErr?.message}`);
      assert.equal(claimData.status, "processing");
      assert.equal(claimData.claimed_by, testAdminId);

      // Release claim
      const { data: relData, error: relErr } = await supabase.rpc("release_withdrawal_claim", {
        p_request_id: withdrawalRequestId,
        p_admin_id: testAdminId,
      });
      assert(!relErr, `Release error: ${relErr?.message}`);
      assert.equal(relData.claimed_by, null);

      // Re-claim for payout
      await supabase.rpc("claim_withdrawal_payout", {
        p_request_id: withdrawalRequestId,
        p_admin_id: testAdminId,
      });
    });

    // --------------------------------------------------------------------------
    // TEST 10: Admin Marks Withdrawal Paid with UTR
    // --------------------------------------------------------------------------
    await runTestCase("10. Admin marks withdrawal paid with unique UTR reference", async () => {
      const { data, error } = await supabase.rpc("mark_withdrawal_payout_paid", {
        p_request_id: withdrawalRequestId,
        p_transaction_ref: uniqueUtr,
        p_source_account: "RoyalLagn Business HDFC Current A/C",
        p_admin_id: testAdminId,
        p_notes: "Transferred via business netbanking UPI",
      });

      assert(!error, `Mark paid error: ${error?.message}`);
      assert.equal(data.status, "paid");
      assert.equal(data.transaction_ref, uniqueUtr);
      assert(data.paid_at, "paid_at must be populated");

      // Verify wallet balances post-payout
      const { data: bal } = await supabase.rpc("reconcile_referral_profile_balances", {
        p_customer_id: testCustomerId,
      });
      assert.equal(Number(bal.total_paid_out), 500);
      assert.equal(Number(bal.reserved_balance), 0);
      assert.equal(Number(bal.earned_balance), 500); // 1000 - 500 = 500 remaining!
    });

    // --------------------------------------------------------------------------
    // TEST 11: Enforce Unique UTR Constraint on Paid Requests
    // --------------------------------------------------------------------------
    await runTestCase("11. Enforce unique UTR constraint across payouts", async () => {
      // Request remaining ₹500
      const { data: reqRes, error: reqErr } = await supabase.rpc("request_referral_withdrawal", {
        p_customer_id: testCustomerId,
        p_amount: 500,
      });
      assert(!reqErr, `Request error: ${reqErr?.message}`);

      // Claim it so it enters 'processing' status
      const { error: claimErr } = await supabase.rpc("claim_withdrawal_payout", {
        p_request_id: reqRes.request.id,
        p_admin_id: testAdminId,
      });
      assert(!claimErr, `Claim error: ${claimErr?.message}`);

      // Try marking paid with the SAME UTR
      const { data, error } = await supabase.rpc("mark_withdrawal_payout_paid", {
        p_request_id: reqRes.request.id,
        p_transaction_ref: uniqueUtr, // duplicate!
        p_admin_id: testAdminId,
      });

      assert(error, "Must reject duplicate UTR on paid request");
      assert(
        error.message.includes("unique") || error.message.includes("duplicate") || error.message.includes("already been used") || error.message.includes("23505"),
        `Unexpected error: ${error.message}`
      );

      // Cancel second request so funds return to wallet
      await supabase.rpc("reject_withdrawal_payout", {
        p_request_id: reqRes.request.id,
        p_reason: "Test cleanup for duplicate UTR test",
        p_admin_id: testAdminId,
      });
    });

    // --------------------------------------------------------------------------
    // TEST 12: Admin Rejection Releases Reserved Balance
    // --------------------------------------------------------------------------
    await runTestCase("12. Admin rejection releases reserved balance back to customer wallet", async () => {
      // Request remaining ₹500
      const { data: reqRes, error: reqErr } = await supabase.rpc("request_referral_withdrawal", {
        p_customer_id: testCustomerId,
        p_amount: 500,
      });
      assert(!reqErr, `Request error: ${reqErr?.message}`);

      // Admin rejects request with reason
      const { data: rejData, error: rejErr } = await supabase.rpc("reject_withdrawal_payout", {
        p_request_id: reqRes.request.id,
        p_reason: "Customer beneficiary name mismatch with bank record",
        p_admin_id: testAdminId,
      });

      assert(!rejErr, `Reject error: ${rejErr?.message}`);
      assert.equal(rejData.status, "rejected");

      // Verify wallet balance restored
      const { data: bal } = await supabase.rpc("reconcile_referral_profile_balances", {
        p_customer_id: testCustomerId,
      });
      assert.equal(Number(bal.reserved_balance), 0);
      assert.equal(Number(bal.earned_balance), 500); // 500 still available!
    });

  } finally {
    // Teardown
    await cleanupTestData();
  }

  console.log("\n================================================================================");
  console.log(`TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Unhandled test suite error:", err);
  process.exit(1);
});
