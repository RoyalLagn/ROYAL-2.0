import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log("================================================================================");
console.log("ROYALLAGN TEAM PORTAL PHASE 2 — AUTOMATED VERIFICATION SUITE");
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

  // 1. Setup Test Actors
  // Fetch existing admin profile
  const { data: adminProfiles } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name")
    .eq("role", "admin")
    .limit(1);

  assert(adminProfiles?.length, "Need at least 1 admin profile in database");
  const adminActorId = adminProfiles[0].id;

  // Fetch test users for teammate roles (excluding admin)
  const { data: testUsers } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name")
    .neq("id", adminActorId)
    .limit(5);

  assert(testUsers?.length >= 3, "Need at least 3 non-admin profiles to test team operations");
  const verifierUserId = testUsers[0].id;
  const financeUserId = testUsers[1].id;
  const marketingUserId = testUsers[2].id;

  // Clean test team memberships for these users before testing
  await supabaseAdmin.from("team_memberships").delete().in("user_id", [verifierUserId, financeUserId, marketingUserId]);

  let testDestId = null;
  let testWithdrawalId = null;
  let testVendorAppId = null;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Team Membership Creation & Permissions Management
    // -------------------------------------------------------------------------
    await runTestCase("Team membership creation, permissions update & active state toggle", async () => {
      // Create verifier membership
      const { data: m1, error: e1 } = await supabaseAdmin.rpc("team_manage_member", {
        p_user_id: verifierUserId,
        p_email: "verifier.test@royallagn.com",
        p_full_name: "Test Payment Verifier",
        p_phone: "9876543210",
        p_permissions: ["payment_verifier"],
        p_is_active: true,
        p_actor_id: adminActorId,
      });
      assert(!e1, `team_manage_member failed: ${e1?.message}`);
      assert.equal(m1.user_id, verifierUserId);
      assert.deepEqual(m1.permissions, ["payment_verifier"]);

      // Update permissions
      const { data: m2, error: e2 } = await supabaseAdmin.rpc("team_manage_member", {
        p_user_id: verifierUserId,
        p_email: "verifier.test@royallagn.com",
        p_full_name: "Test Payment Verifier",
        p_phone: "9876543210",
        p_permissions: ["payment_verifier", "vendor_verifier"],
        p_is_active: true,
        p_actor_id: adminActorId,
      });
      assert(!e2, `team_manage_member update failed: ${e2?.message}`);
      assert.deepEqual(m2.permissions, ["payment_verifier", "vendor_verifier"]);

      // Setup finance user
      const { error: e3 } = await supabaseAdmin.rpc("team_manage_member", {
        p_user_id: financeUserId,
        p_email: "finance.test@royallagn.com",
        p_full_name: "Test Finance Operator",
        p_phone: "9876543211",
        p_permissions: ["finance_operator", "team_manager"],
        p_is_active: true,
        p_actor_id: adminActorId,
      });
      assert(!e3, `Setup finance user failed: ${e3?.message}`);
    });

    // -------------------------------------------------------------------------
    // TEST 2: Atomic Claim and Conflict Prevention on Payment Destination Queue
    // -------------------------------------------------------------------------
    await runTestCase("Atomic task claim and concurrent claim conflict prevention", async () => {
      // Create fresh payment destination to claim
      const { data: dest, error: dErr } = await supabaseAdmin
        .from("customer_payment_destinations")
        .insert({
          customer_id: verifierUserId,
          beneficiary_name: "Queue Claim Test User",
          upi_id: "queueclaim@okhdfcbank",
          mobile: "9988776655",
          ownership_confirmed: true,
          status: "pending",
          is_active: true,
        })
        .select()
        .single();

      assert(!dErr && dest, `Insert destination failed: ${dErr?.message}`);
      testDestId = dest.id;

      // Verifier claims task
      const { data: claimRes, error: claimErr } = await supabaseAdmin.rpc("claim_team_request", {
        p_queue_type: "payment_destination",
        p_request_id: testDestId,
        p_actor_id: verifierUserId,
      });
      assert(!claimErr && claimRes?.success, `Claim failed: ${claimErr?.message}`);

      // Verify DB record
      const { data: claimedRow } = await supabaseAdmin
        .from("customer_payment_destinations")
        .select("assigned_to, assigned_at")
        .eq("id", testDestId)
        .single();
      assert.equal(claimedRow.assigned_to, verifierUserId);

      // Finance user attempts to claim the same request -> MUST FAIL with conflict error
      const { error: conflictErr } = await supabaseAdmin.rpc("claim_team_request", {
        p_queue_type: "payment_destination",
        p_request_id: testDestId,
        p_actor_id: financeUserId,
      });
      assert(conflictErr, "Concurrent claim should have been rejected");
      assert(conflictErr.message.includes("already claimed"), `Unexpected error: ${conflictErr.message}`);

      // Verifier releases claim
      const { data: relRes, error: relErr } = await supabaseAdmin.rpc("release_team_request", {
        p_queue_type: "payment_destination",
        p_request_id: testDestId,
        p_actor_id: verifierUserId,
      });
      assert(!relErr && relRes?.success, `Release failed: ${relErr?.message}`);

      const { data: releasedRow } = await supabaseAdmin
        .from("customer_payment_destinations")
        .select("assigned_to")
        .eq("id", testDestId)
        .single();
      assert.equal(releasedRow.assigned_to, null);
    });

    // -------------------------------------------------------------------------
    // TEST 3: Payment Verifier Review & Observed Recipient Name
    // -------------------------------------------------------------------------
    await runTestCase("Payment verifier review workflow (observed recipient name required)", async () => {
      // 1. Approval without observed name MUST fail
      const { error: noObsErr } = await supabaseAdmin.rpc("team_review_customer_payment_destination", {
        p_destination_id: testDestId,
        p_decision: "approved",
        p_observed_name: null,
        p_actor_id: verifierUserId,
      });
      assert(noObsErr, "Approval without observed name must be rejected");

      // 2. Successful approval with observed recipient name
      const { data: apprRes, error: apprErr } = await supabaseAdmin.rpc("team_review_customer_payment_destination", {
        p_destination_id: testDestId,
        p_decision: "approved",
        p_observed_name: "QUEUE CLAIM TEST BANK RECIPIENT",
        p_notes: "Checked in GPay UPI interface",
        p_actor_id: verifierUserId,
      });
      assert(!apprErr, `team_review_customer_payment_destination failed: ${apprErr?.message}`);

      // Verify status in DB
      const { data: verifiedRow } = await supabaseAdmin
        .from("customer_payment_destinations")
        .select("status, observed_recipient_name")
        .eq("id", testDestId)
        .single();
      assert.equal(verifiedRow.status, "approved");
      assert.equal(verifiedRow.observed_recipient_name, "QUEUE CLAIM TEST BANK RECIPIENT");

      // Verify audit log
      const { data: logEntry } = await supabaseAdmin
        .from("team_activity_log")
        .select("*")
        .eq("entity_id", testDestId)
        .eq("action", "approved")
        .single();
      assert(logEntry, "Team activity log must contain approval record");
    });

    // -------------------------------------------------------------------------
    // TEST 4: Reassignment & Escalation Workflows
    // -------------------------------------------------------------------------
    await runTestCase("Manager reassignment and task escalation with reason", async () => {
      // Escalate task
      const { data: escRes, error: escErr } = await supabaseAdmin.rpc("escalate_team_request", {
        p_queue_type: "payment_destination",
        p_request_id: testDestId,
        p_reason: "Observed name has minor surname difference. Please review.",
        p_actor_id: verifierUserId,
      });
      assert(!escErr && escRes?.success, `Escalation failed: ${escErr?.message}`);

      const { data: escRow } = await supabaseAdmin
        .from("customer_payment_destinations")
        .select("escalated, escalation_reason")
        .eq("id", testDestId)
        .single();
      assert.equal(escRow.escalated, true);
      assert.equal(escRow.escalation_reason, "Observed name has minor surname difference. Please review.");

      // Reassign to finance operator (by manager)
      const { data: reassignRes, error: reassignErr } = await supabaseAdmin.rpc("assign_team_request", {
        p_queue_type: "payment_destination",
        p_request_id: testDestId,
        p_target_user_id: financeUserId,
        p_actor_id: adminActorId,
      });
      assert(!reassignErr && reassignRes?.success, `Reassign failed: ${reassignErr?.message}`);

      const { data: reassignedRow } = await supabaseAdmin
        .from("customer_payment_destinations")
        .select("assigned_to")
        .eq("id", testDestId)
        .single();
      assert.equal(reassignedRow.assigned_to, financeUserId);
    });

    // -------------------------------------------------------------------------
    // TEST 5: Tiered Approvals on High-Value Withdrawals (>= ₹5,000)
    // -------------------------------------------------------------------------
    await runTestCase("Tiered approvals for withdrawals >= ₹5,000 (segregation of duties)", async () => {
      // Ensure referral profile has balance
      await supabaseAdmin
        .from("referral_profiles")
        .upsert({
          customer_id: verifierUserId,
          referral_code: "PHASE2_TIER",
          referral_url: "https://royallagn.com/ref/PHASE2_TIER",
          earned_balance: 10000,
          pending_earnings: 0,
          reserved_balance: 0,
          total_paid_out: 0,
        });

      // Insert high-value withdrawal request (₹6,000)
      const { data: req, error: rErr } = await supabaseAdmin
        .from("referral_payout_requests")
        .insert({
          customer_id: verifierUserId,
          destination_id: testDestId,
          amount: 6000,
          mobile: "9988776655",
          beneficiary_name: "Queue Claim Test User",
          status: "approved",
          second_approval_required: true,
          destination_snapshot: {
            upi_id: "queueclaim@okhdfcbank",
            beneficiary_name: "Queue Claim Test User",
            observed_recipient_name: "QUEUE CLAIM TEST BANK RECIPIENT",
          },
        })
        .select()
        .single();

      assert(!rErr && req, `Insert withdrawal failed: ${rErr?.message}`);
      testWithdrawalId = req.id;

      // Attempting to execute payout directly WITHOUT second approval MUST fail
      const { error: directPayErr } = await supabaseAdmin.rpc("team_execute_withdrawal_payout", {
        p_request_id: testWithdrawalId,
        p_transaction_ref: "UTR_NO_2ND_APPROVAL",
        p_actor_id: financeUserId,
      });
      assert(directPayErr, "Direct payout execution without second approval must be blocked");
      assert(directPayErr.message.includes("Tiered approval required"), `Unexpected error: ${directPayErr.message}`);

      // Record second approval by manager
      const { data: secondApprRes, error: secondApprErr } = await supabaseAdmin.rpc("team_second_approve_payout", {
        p_request_id: testWithdrawalId,
        p_notes: "Reviewed transaction history and approved for execution.",
        p_actor_id: adminActorId,
      });
      assert(!secondApprErr && secondApprRes?.success, `Second approval failed: ${secondApprErr?.message}`);

      const { data: approvedRow } = await supabaseAdmin
        .from("referral_payout_requests")
        .select("second_approved_by, second_approval_notes")
        .eq("id", testWithdrawalId)
        .single();
      assert.equal(approvedRow.second_approved_by, adminActorId);
    });

    // -------------------------------------------------------------------------
    // TEST 6: Finance Operator Payout Execution with UTR & Balance Settlement
    // -------------------------------------------------------------------------
    await runTestCase("Finance operator payout execution with UTR reference and balance settlement", async () => {
      const uniqueUtr = `UTR_PHASE2_${Date.now()}`;

      // Now execution with UTR should succeed
      const { data: payRes, error: payErr } = await supabaseAdmin.rpc("team_execute_withdrawal_payout", {
        p_request_id: testWithdrawalId,
        p_transaction_ref: uniqueUtr,
        p_source_account: "RoyalLagn HDFC Business Current",
        p_notes: "Transferred via RTGS",
        p_actor_id: financeUserId,
      });
      assert(!payErr, `Payout execution failed: ${payErr?.message}`);

      // Verify row status
      const { data: paidRow } = await supabaseAdmin
        .from("referral_payout_requests")
        .select("status, transaction_ref, paid_at")
        .eq("id", testWithdrawalId)
        .single();
      assert.equal(paidRow.status, "paid");
      assert.equal(paidRow.transaction_ref, uniqueUtr);
      assert(paidRow.paid_at, "paid_at timestamp must be set");

      // Verify audit log contains execute_payout
      const { data: payAudit } = await supabaseAdmin
        .from("team_activity_log")
        .select("*")
        .eq("entity_id", testWithdrawalId)
        .eq("action", "execute_payout")
        .single();
      assert(payAudit, "Audit log must contain execute_payout action");
    });

    // -------------------------------------------------------------------------
    // TEST 7: Vendor Application Review & Verifier Recommendation
    // -------------------------------------------------------------------------
    await runTestCase("Vendor verifier recommendation & manager final decision", async () => {
      // Find category
      const { data: cats } = await supabaseAdmin.from("categories").select("id").limit(1);
      const catId = cats?.[0]?.id;

      // Insert test vendor application
      const { data: vApp, error: vErr } = await supabaseAdmin
        .from("vendor_applications")
        .insert({
          full_name: "Phase 2 Test Vendor Owner",
          email: "vendor.test.phase2@royallagn.com",
          phone: "9123456789",
          business_name: "Phase 2 Grand Decorators",
          category_id: catId,
          description: "Premium wedding decoration and florals",
          experience: 8,
          address: "101 Royal Street",
          city: "Pune",
          city_id: "0a404718-900f-4bc0-87e0-bb9d1565634c",
          state: "Maharashtra",
          country: "India",
          pincode: "411001",
          logo_url: "https://example.com/logo.png",
          terms_accepted_at: new Date().toISOString(),
          status: "pending",
        })
        .select()
        .single();

      assert(!vErr && vApp, `Insert vendor application failed: ${vErr?.message}`);
      testVendorAppId = vApp.id;

      // Verifier submits recommendation
      const { data: recRes, error: recErr } = await supabaseAdmin.rpc("team_recommend_vendor_application", {
        p_application_id: testVendorAppId,
        p_recommendation: "recommended_approval",
        p_notes: "Portfolio and physical studio address verified.",
        p_checklist: {
          identityVerified: true,
          locationCoverageVerified: true,
          portfolioAuthentic: true,
          categoryMatched: true,
        },
        p_actor_id: verifierUserId,
      });
      assert(!recErr && recRes?.success, `Vendor recommendation failed: ${recErr?.message}`);

      // Manager/Admin makes final approval
      const { data: decRes, error: decErr } = await supabaseAdmin.rpc("team_decide_vendor_application", {
        p_application_id: testVendorAppId,
        p_decision: "approved",
        p_actor_id: adminActorId,
      });
      assert(!decErr && decRes?.success, `Vendor final decision failed: ${decErr?.message}`);

      const { data: approvedVendorApp } = await supabaseAdmin
        .from("vendor_applications")
        .select("status, verifier_recommendation")
        .eq("id", testVendorAppId)
        .single();
      assert.equal(approvedVendorApp.status, "approved");
      assert.equal(approvedVendorApp.verifier_recommendation, "recommended_approval");
    });

    // -------------------------------------------------------------------------
    // TEST 8: Critical Security Test: Marketing Teammate DB-Level Isolation
    // -------------------------------------------------------------------------
    await runTestCase("CRITICAL: Marketing teammate strictly denied financial data & queues at DB level", async () => {
      // Setup marketing teammate membership
      await supabaseAdmin.rpc("team_manage_member", {
        p_user_id: marketingUserId,
        p_email: "marketing.only@royallagn.com",
        p_full_name: "Marketing Only User",
        p_phone: "9998887776",
        p_permissions: ["marketing_teammate"],
        p_is_active: true,
        p_actor_id: adminActorId,
      });

      // 1. Helper function checks
      const { data: canVerify } = await supabaseAdmin.rpc("has_team_permission", {
        p_user_id: marketingUserId,
        p_permission: "payment_verifier",
      });
      assert.equal(canVerify, false, "Marketing teammate must NOT have payment_verifier permission");

      const { data: canFinance } = await supabaseAdmin.rpc("has_team_permission", {
        p_user_id: marketingUserId,
        p_permission: "finance_operator",
      });
      assert.equal(canFinance, false, "Marketing teammate must NOT have finance_operator permission");

      // 2. Direct RPC invocation attempts by marketing user MUST fail
      const { error: mReviewErr } = await supabaseAdmin.rpc("team_review_customer_payment_destination", {
        p_destination_id: testDestId,
        p_decision: "approved",
        p_observed_name: "HACK",
        p_actor_id: marketingUserId,
      });
      assert(mReviewErr, "Marketing user calling payment review must be rejected");

      const { error: mPayoutErr } = await supabaseAdmin.rpc("team_execute_withdrawal_payout", {
        p_request_id: testWithdrawalId,
        p_transaction_ref: "HACK_UTR",
        p_actor_id: marketingUserId,
      });
      assert(mPayoutErr, "Marketing user calling payout execution must be rejected");
    });

    // -------------------------------------------------------------------------
    // TEST 9: Team Portal Overview Metrics RPC
    // -------------------------------------------------------------------------
    await runTestCase("Team portal overview live metrics RPC", async () => {
      const { data: ov, error: ovErr } = await supabaseAdmin.rpc("get_team_portal_overview");
      assert(!ovErr && ov, `get_team_portal_overview failed: ${ovErr?.message}`);

      assert(typeof ov.destinations.pending === "number");
      assert(typeof ov.withdrawals.pending === "number");
      assert(typeof ov.withdrawals.pending_amount === "number");
      assert(typeof ov.vendors.pending === "number");
      assert(typeof ov.overdue_count === "number");
      assert(typeof ov.active_members_count === "number");
    });

  } finally {
    // Cleanup test records
    if (testWithdrawalId) await supabaseAdmin.from("referral_payout_requests").delete().eq("id", testWithdrawalId);
    if (testDestId) await supabaseAdmin.from("customer_payment_destinations").delete().eq("id", testDestId);
    if (testVendorAppId) await supabaseAdmin.from("vendor_applications").delete().eq("id", testVendorAppId);
    await supabaseAdmin.from("team_memberships").delete().in("user_id", [verifierUserId, financeUserId, marketingUserId]);
  }

  console.log("\n================================================================================");
  console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================");

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error("Test runner error:", e);
  process.exit(1);
});
