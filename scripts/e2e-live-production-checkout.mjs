import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { curlFetch } from "./lib/curl-fetch.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

// Read .env if not loaded
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const envContent = fs.readFileSync(path.join(projectRoot, ".env"), "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const supabaseUrl = process.env.SUPABASE_URL || "https://fymdrjcinqvmjthdwrtd.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!serviceRoleKey || !anonKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const serviceHeaders = {
  "Content-Type": "application/json",
  "apikey": serviceRoleKey,
  "Authorization": `Bearer ${serviceRoleKey}`,
};

const anonHeaders = {
  "Content-Type": "application/json",
  "apikey": anonKey,
  "Authorization": `Bearer ${anonKey}`,
};

console.log("================================================================================");
console.log("ROYALLAGN E2E LIVE TEST — REAL RAZORPAY TEST GATEWAY INTEGRATION");
console.log(`Connected Project: ${supabaseUrl}`);
console.log("================================================================================\n");

let passed = 0;
let total = 0;
let createdBookingIds = [];

async function step(name, fn) {
  total++;
  process.stdout.write(`Step ${total}: ${name}... `);
  try {
    await fn();
    console.log("SUCCESS");
    passed++;
  } catch (err) {
    console.log("FAILED");
    console.error(err);
    await cleanup();
    process.exit(1);
  }
}

async function cleanup() {
  if (createdBookingIds.length > 0) {
    console.log(`\nCleaning up ${createdBookingIds.length} test booking record(s)...`);
    for (const bId of createdBookingIds) {
      curlFetch(`${supabaseUrl}/rest/v1/vendor_bookings?id=eq.${bId}`, {
        method: "DELETE",
        headers: serviceHeaders,
      });
    }
    console.log("Cleanup complete.");
  }
}

async function run() {
  let testVendor = null;
  let testService = null;
  let testOrderData = null;

  // Step 1: Discover Active Verified Vendor and Package
  await step("Fetch active verified vendor and service from production database", async () => {
    const sRes = curlFetch(
      `${supabaseUrl}/rest/v1/vendor_services?status=eq.active&is_active=eq.true&price=gt.0&select=id,vendor_id,title,price,discounted_price,price_type,duration_label&limit=1`,
      { headers: serviceHeaders }
    );
    assert.ok(sRes.ok, `Failed to query vendor_services: status ${sRes.status}`);
    const services = await sRes.json();
    assert.ok(Array.isArray(services) && services.length > 0, "No active service with price > 0 found");
    testService = services[0];

    const vRes = curlFetch(
      `${supabaseUrl}/rest/v1/vendors?id=eq.${testService.vendor_id}&select=id,business_name,contact_phone,is_verified,management_status&limit=1`,
      { headers: serviceHeaders }
    );
    assert.ok(vRes.ok, `Failed to query vendors: status ${vRes.status}`);
    const vendors = await vRes.json();
    assert.ok(Array.isArray(vendors) && vendors.length > 0, "Vendor for service must exist");
    testVendor = vendors[0];

    console.log(`[Vendor: ${testVendor.business_name} (${testVendor.id}), Package: ${testService.title} (₹${testService.discounted_price || testService.price})]`);
  });

  // Step 2: Invoke deployed create-booking-order Edge Function
  await step("Invoke deployed create-booking-order Edge Function with test customer", async () => {
    const payload = {
      vendorId: testVendor.id,
      startDate: "2026-12-28",
      endDate: "2026-12-29",
      customerName: "Automated E2E Test",
      customerPhone: "9988776655",
      customerEmail: "e2etest@royallagn.test",
      eventType: "Wedding",
      specialNotes: "Automated E2E Razorpay test booking",
      selectedPackageIds: [testService.id],
      customerContactNumber: "9988776655",
    };

    const res = curlFetch(`${supabaseUrl}/functions/v1/create-booking-order`, {
      method: "POST",
      headers: anonHeaders,
      body: payload,
    });

    const body = await res.json();
    assert.equal(res.status, 200, `create-booking-order failed: ${JSON.stringify(body)}`);
    assert.ok(body.success, "Response should have success: true");
    assert.ok(body.orderId.startsWith("order_"), `Order ID should start with order_, got: ${body.orderId}`);
    assert.ok(body.keyId.startsWith("rzp_test_"), `Key ID should be Razorpay test key, got: ${body.keyId}`);
    assert.ok(body.bookingRecordId, "Should return bookingRecordId");
    assert.ok(body.amountMinor > 0, "Should return non-zero amountMinor");
    assert.equal(body.currency, "INR", "Currency should be INR");

    // Track for cleanup
    createdBookingIds.push(body.bookingRecordId);
    testOrderData = body;
    console.log(`[Razorpay Order Created: ${body.orderId}, Advance: ₹${body.advanceAmount} (${body.amountMinor} paise)]`);
  });

  // Step 3: Verify soft-locked booking in database
  await step("Verify soft-locked booking row exists in vendor_bookings with pending status", async () => {
    const res = curlFetch(`${supabaseUrl}/rest/v1/vendor_bookings?id=eq.${testOrderData.bookingRecordId}&select=*`, {
      headers: serviceHeaders,
    });
    assert.ok(res.ok, "Failed to query booking row");
    const rows = await res.json();
    assert.ok(Array.isArray(rows) && rows.length > 0, "Booking record must exist");
    const booking = rows[0];

    assert.equal(booking.booking_status, "pending_payment");
    assert.equal(booking.payment_status, "pending");
    assert.equal(booking.razorpay_order_id, testOrderData.orderId);
    assert.ok(booking.soft_lock_expires_at, "soft_lock_expires_at must be populated");
    assert.equal(booking.vendor_id, testVendor.id);
  });

  // Step 4: Deduplication / Re-submission returns existing order
  await step("Re-submitting same booking within soft-lock window returns existing order without creating duplicate", async () => {
    const payload = {
      vendorId: testVendor.id,
      startDate: "2026-12-28",
      endDate: "2026-12-29",
      customerName: "Automated E2E Test",
      customerPhone: "9988776655",
      customerEmail: "e2etest@royallagn.test",
      eventType: "Wedding",
      specialNotes: "Automated E2E Razorpay test booking re-submit",
      selectedPackageIds: [testService.id],
      customerContactNumber: "9988776655",
    };

    const res = curlFetch(`${supabaseUrl}/functions/v1/create-booking-order`, {
      method: "POST",
      headers: anonHeaders,
      body: payload,
    });

    const body = await res.json();
    assert.equal(res.status, 200, `Re-submission failed: ${JSON.stringify(body)}`);
    assert.equal(body.orderId, testOrderData.orderId, "Must return existing order ID");
    assert.equal(body.bookingRecordId, testOrderData.bookingRecordId, "Must return existing booking record ID");

    // Verify row count did not increase
    const countRes = curlFetch(
      `${supabaseUrl}/rest/v1/vendor_bookings?vendor_id=eq.${testVendor.id}&customer_phone=eq.9988776655&start_date=eq.2026-12-28&select=id`,
      { headers: serviceHeaders }
    );
    const rows = await countRes.json();
    assert.equal(rows.length, 1, "Exactly one booking row must exist for this attempt");
  });

  // Step 5: Verify verify-booking-payment rejects fake signatures and fake payment IDs
  await step("Deployed verify-booking-payment rejects fake signature and invalid payment", async () => {
    const payload = {
      bookingId: testOrderData.bookingRecordId,
      razorpayOrderId: testOrderData.orderId,
      razorpayPaymentId: "pay_fake_test_99999",
      razorpaySignature: "0000000000000000000000000000000000000000000000000000000000000000",
    };

    const res = curlFetch(`${supabaseUrl}/functions/v1/verify-booking-payment`, {
      method: "POST",
      headers: anonHeaders,
      body: payload,
    });

    const body = await res.json();
    assert.equal(res.status, 400, "Should reject fake signature with 400 Bad Request");
    assert.ok(body.error.includes("Cryptographic signature mismatch"), `Expected signature mismatch error, got: ${body.error}`);

    // Verify booking status was NOT modified
    const bRes = curlFetch(`${supabaseUrl}/rest/v1/vendor_bookings?id=eq.${testOrderData.bookingRecordId}&select=booking_status,payment_status`, {
      headers: serviceHeaders,
    });
    const rows = await bRes.json();
    assert.equal(rows[0].booking_status, "pending_payment");
    assert.equal(rows[0].payment_status, "pending");
  });

  // Step 6: Verify client-side database update guard trigger prevents tampering
  await step("Database trigger blocks direct client update to paid_advance", async () => {
    const res = curlFetch(`${supabaseUrl}/rest/v1/vendor_bookings?id=eq.${testOrderData.bookingRecordId}`, {
      method: "PATCH",
      headers: anonHeaders,
      body: {
        booking_status: "confirmed",
        payment_status: "paid_advance",
        razorpay_payment_id: "pay_tampered_direct_update",
      },
    });

    // Anon should either be blocked by RLS (0 rows updated or 401/403) or trigger exception
    if (res.ok) {
      // Check database row to verify value was NOT modified
      const bRes = curlFetch(`${supabaseUrl}/rest/v1/vendor_bookings?id=eq.${testOrderData.bookingRecordId}&select=payment_status`, {
        headers: serviceHeaders,
      });
      const rows = await bRes.json();
      assert.equal(rows[0].payment_status, "pending", "Payment status must not be modified by client patch");
      console.log("[Client patch silently suppressed by RLS as expected]");
    } else {
      console.log(`[Blocked as expected with status ${res.status}]`);
    }
  });

  // Step 7: Finalize verified booking via authoritative RPC
  await step("Authoritative finalize_verified_booking_payment RPC transitions status to paid_advance", async () => {
    const mockPaymentId = `pay_rzptest_${Date.now()}`;
    const res = curlFetch(`${supabaseUrl}/rest/v1/rpc/finalize_verified_booking_payment`, {
      method: "POST",
      headers: serviceHeaders,
      body: {
        p_booking_id: testOrderData.bookingRecordId,
        p_payment_id: mockPaymentId,
        p_order_id: testOrderData.orderId,
        p_method: "upi",
      },
    });

    assert.ok(res.ok, `RPC failed: status ${res.status}`);
    const data = await res.json();
    assert.ok(data.success, "RPC should return success: true");

    // Inspect database row
    const bRes = curlFetch(`${supabaseUrl}/rest/v1/vendor_bookings?id=eq.${testOrderData.bookingRecordId}&select=*`, {
      headers: serviceHeaders,
    });
    const rows = await bRes.json();
    const booking = rows[0];

    assert.equal(booking.booking_status, "pending_vendor_confirmation");
    assert.equal(booking.payment_status, "paid_advance");
    assert.equal(booking.razorpay_payment_id, mockPaymentId);
    assert.equal(booking.soft_lock_expires_at, null);
    console.log(`[Status: ${booking.booking_status}, Payment: ${booking.payment_status}]`);
  });

  // Step 8: Test Idempotency of finalize_verified_booking_payment
  await step("finalize_verified_booking_payment is strictly idempotent on repeated calls", async () => {
    const res = curlFetch(`${supabaseUrl}/rest/v1/rpc/finalize_verified_booking_payment`, {
      method: "POST",
      headers: serviceHeaders,
      body: {
        p_booking_id: testOrderData.bookingRecordId,
        p_payment_id: "pay_duplicate_attempt",
        p_order_id: testOrderData.orderId,
      },
    });

    assert.ok(res.ok, `Idempotent RPC call failed with status ${res.status}`);
    const data = await res.json();
    assert.ok(data.success, "Should return success: true");
    assert.ok(data.already_finalized, "Should flag already_finalized: true");
  });

  // Step 9: Verify 5-Day Cancellation Lock & Contact Unlock View Logic
  await step("Verify 5-Day Cancellation Lock and Contact Unlock logic on test booking", async () => {
    // 1. Secure booking details RPC
    const sRes = curlFetch(`${supabaseUrl}/rest/v1/rpc/get_secure_booking_details`, {
      method: "POST",
      headers: serviceHeaders,
      body: { p_booking_ref: testOrderData.bookingRecordId },
    });
    assert.ok(sRes.ok, `get_secure_booking_details failed with status ${sRes.status}`);
    const details = await sRes.json();
    assert.ok(details.id, "ID must exist in secure details");
    assert.equal(details.can_cancel, true, "Booking > 120h away must be cancellable");
    assert.equal(details.is_cutoff_passed, false, "Cutoff must not have passed for future booking");
    assert.equal(details.contacts_unlocked, false, "Contacts must be locked before cutoff");

    // 2. Contact details check
    const bRes = curlFetch(
      `${supabaseUrl}/rest/v1/vendor_bookings?id=eq.${testOrderData.bookingRecordId}&select=customer_contact_number,customer_phone,cancellation_cutoff_at,event_start_at`,
      { headers: serviceHeaders }
    );
    const rows = await bRes.json();
    const booking = rows[0];

    assert.ok(booking.cancellation_cutoff_at, "cancellation_cutoff_at must be populated");
    assert.ok(booking.customer_contact_number, "customer_contact_number must be populated");
    console.log(`[Cutoff: ${booking.cancellation_cutoff_at}, Can Cancel: ${details.can_cancel}]`);
  });

  // Step 10: Clean up
  await step("Clean up test booking records from production database", async () => {
    await cleanup();
    createdBookingIds = [];

    // Verify no test bookings remain
    const rRes = curlFetch(
      `${supabaseUrl}/rest/v1/vendor_bookings?customer_phone=eq.9988776655&select=id`,
      { headers: serviceHeaders }
    );
    const remaining = await rRes.json();
    assert.equal(remaining.length, 0, "All test records must be deleted");
  });

  console.log("\n================================================================================");
  console.log(`ALL ${passed}/${total} E2E PRODUCTION VERIFICATION STEPS PASSED SUCCESSFULLY!`);
  console.log("================================================================================\n");
}

run().catch(async (err) => {
  console.error("Fatal error during E2E test:", err);
  await cleanup();
  process.exit(1);
});
