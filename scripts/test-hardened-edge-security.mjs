import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
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

const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

console.log("================================================================================");
console.log("ROYALLAGN POST-DEPLOYMENT EDGE SECURITY VERIFICATION SUITE");
console.log(`Target: ${supabaseUrl}`);
console.log("================================================================================\n");

let passed = 0;
let total = 0;

let testUserA = null;
let testUserB = null;
let tokenA = null;
let tokenB = null;
let createdBookingIds = [];

async function test(name, fn) {
  total++;
  process.stdout.write(`Test ${total}: ${name}... `);
  try {
    await fn();
    console.log("PASSED");
    passed++;
  } catch (err) {
    console.log("FAILED");
    console.error(err);
    await cleanup();
    process.exit(1);
  }
}

async function cleanup() {
  console.log("\n--- Cleaning up test artifacts ---");
  for (const id of createdBookingIds) {
    curlFetch(`${supabaseUrl}/rest/v1/vendor_bookings?id=eq.${id}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
  }
  if (testUserA) {
    await adminClient.auth.admin.deleteUser(testUserA.id);
  }
  if (testUserB) {
    await adminClient.auth.admin.deleteUser(testUserB.id);
  }
  console.log("Cleanup finished.");
}

async function run() {
  // Setup: Provision two temporary isolated test users
  const emailA = `sec_a_${Date.now()}@royallagn.test`;
  const emailB = `sec_b_${Date.now()}@royallagn.test`;
  const password = "TestPassword123!";

  const { data: uA, error: errA } = await adminClient.auth.admin.createUser({ email: emailA, password, email_confirm: true });
  assert.ifError(errA);
  testUserA = uA.user;

  const { data: uB, error: errB } = await adminClient.auth.admin.createUser({ email: emailB, password, email_confirm: true });
  assert.ifError(errB);
  testUserB = uB.user;

  const { data: sA, error: sErrA } = await adminClient.auth.signInWithPassword({ email: emailA, password });
  assert.ifError(sErrA);
  tokenA = sA.session.access_token;

  const { data: sB, error: sErrB } = await adminClient.auth.signInWithPassword({ email: emailB, password });
  assert.ifError(sErrB);
  tokenB = sB.session.access_token;

  // Fetch an active service and its verified vendor
  const pRes = curlFetch(`${supabaseUrl}/rest/v1/vendor_services?status=eq.active&is_active=eq.true&price=gt.0&select=id,vendor_id&limit=1`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  const pkgs = await pRes.json();
  const pkgId = pkgs[0].id;
  const vendorId = pkgs[0].vendor_id;

  const basePayload = {
    vendorId,
    startDate: "2026-12-30",
    endDate: "2026-12-31",
    customerName: "Security Test User",
    customerPhone: "9123456789",
    customerEmail: emailA,
    eventType: "Wedding",
    selectedPackageIds: pkgId ? [pkgId] : [],
    customerContactNumber: "9123456789",
  };

  // Test 1: Completely missing authentication on create-booking-order returns 401
  await test("create-booking-order rejects missing Authorization header with 401", async () => {
    const res = curlFetch(`${supabaseUrl}/functions/v1/create-booking-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: basePayload,
    });
    const body = await res.json();
    assert.equal(res.status, 401, `Expected 401, got ${res.status}: ${JSON.stringify(body)}`);
    assert.ok(body.error.includes("Authentication required"), `Expected 'Authentication required', got: ${body.error}`);
  });

  // Test 1b: Anon key provided without user session returns 401
  await test("create-booking-order rejects anon key without user session with 401", async () => {
    const res = curlFetch(`${supabaseUrl}/functions/v1/create-booking-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${anonKey}`,
      },
      body: basePayload,
    });
    const body = await res.json();
    assert.equal(res.status, 401, `Expected 401, got ${res.status}: ${JSON.stringify(body)}`);
  });

  // Test 2: Invalid JWT token on create-booking-order returns 401
  await test("create-booking-order rejects invalid JWT token with 401", async () => {
    const res = curlFetch(`${supabaseUrl}/functions/v1/create-booking-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": anonKey,
        "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidtoken.signature",
      },
      body: basePayload,
    });
    const body = await res.json();
    assert.equal(res.status, 401, `Expected 401, got ${res.status}: ${JSON.stringify(body)}`);
    assert.ok(body.error.includes("Invalid authentication session token") || body.error.includes("token"), `Expected invalid token message, got: ${body.error}`);
  });

  // Test 3: Customer A attempting to spoof Customer B's customerId returns 403
  await test("create-booking-order rejects spoofed customerId with 403", async () => {
    const res = curlFetch(`${supabaseUrl}/functions/v1/create-booking-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": anonKey,
        "Authorization": `Bearer ${tokenA}`,
      },
      body: {
        ...basePayload,
        customerId: testUserB.id, // User A claims to be User B
      },
    });
    const body = await res.json();
    assert.equal(res.status, 403, `Expected 403, got ${res.status}: ${JSON.stringify(body)}`);
    assert.ok(body.error.includes("Security violation: customerId does not match authenticated user session"), `Expected mismatch error, got: ${body.error}`);
  });

  // Test 4: Authenticated Customer A creates legitimate booking order
  let createdBookingRecordId = null;
  let createdOrderId = null;
  await test("Authenticated Customer A creates order with verified customer_id", async () => {
    const res = curlFetch(`${supabaseUrl}/functions/v1/create-booking-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": anonKey,
        "Authorization": `Bearer ${tokenA}`,
      },
      body: {
        ...basePayload,
        customerId: testUserA.id, // Matches authenticated user session
      },
    });
    const body = await res.json();
    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
    assert.ok(body.success, "Must return success: true");
    assert.ok(body.orderId.startsWith("order_"), "Must return Razorpay order ID");
    createdBookingRecordId = body.bookingRecordId;
    createdOrderId = body.orderId;
    createdBookingIds.push(createdBookingRecordId);

    // Verify in database: customer_id must equal testUserA.id
    const bRes = curlFetch(`${supabaseUrl}/rest/v1/vendor_bookings?id=eq.${createdBookingRecordId}&select=customer_id,booking_status,payment_status`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
    const rows = await bRes.json();
    assert.equal(rows[0].customer_id, testUserA.id, "customer_id in database must match testUserA.id");
  });

  // Test 5: Missing authentication on verify-booking-payment returns 401
  await test("verify-booking-payment rejects unauthenticated requests with 401", async () => {
    const res = curlFetch(`${supabaseUrl}/functions/v1/verify-booking-payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        bookingId: createdBookingRecordId,
        razorpayOrderId: createdOrderId,
        razorpayPaymentId: "pay_test_dummy",
        razorpaySignature: "dummy_sig",
      },
    });
    const body = await res.json();
    assert.equal(res.status, 401, `Expected 401, got ${res.status}: ${JSON.stringify(body)}`);
    assert.ok(body.error.includes("Authentication required"), `Expected 'Authentication required', got: ${body.error}`);
  });

  // Test 6: Cross-customer protection: Customer B cannot verify Customer A's booking (returns 403)
  await test("Customer B attempting to verify Customer A's booking is rejected with 403", async () => {
    const res = curlFetch(`${supabaseUrl}/functions/v1/verify-booking-payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": anonKey,
        "Authorization": `Bearer ${tokenB}`, // Customer B calling for Customer A's booking
      },
      body: {
        bookingId: createdBookingRecordId,
        razorpayOrderId: createdOrderId,
        razorpayPaymentId: "pay_test_dummy",
        razorpaySignature: "dummy_sig",
      },
    });
    const body = await res.json();
    assert.equal(res.status, 403, `Expected 403, got ${res.status}: ${JSON.stringify(body)}`);
    assert.ok(body.error.includes("You do not own this booking reservation"), `Expected ownership error, got: ${body.error}`);
  });

  // Test 7: Invalid Razorpay cryptographic signature is rejected with 400
  await test("Customer A with invalid Razorpay signature is rejected with 400", async () => {
    const res = curlFetch(`${supabaseUrl}/functions/v1/verify-booking-payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": anonKey,
        "Authorization": `Bearer ${tokenA}`,
      },
      body: {
        bookingId: createdBookingRecordId,
        razorpayOrderId: createdOrderId,
        razorpayPaymentId: "pay_fake_payment_12345",
        razorpaySignature: "0000000000000000000000000000000000000000000000000000000000000000",
      },
    });
    const body = await res.json();
    assert.equal(res.status, 400, `Expected 400, got ${res.status}: ${JSON.stringify(body)}`);
    assert.ok(body.error.includes("Cryptographic signature mismatch"), `Expected signature mismatch error, got: ${body.error}`);
  });

  // Test 8: Fabricated payment ID is rejected (cannot become paid_advance)
  await test("Fabricated payment ID cannot finalize booking or transition status to paid_advance", async () => {
    // Verify booking status remains pending_payment and payment_status remains pending
    const bRes = curlFetch(`${supabaseUrl}/rest/v1/vendor_bookings?id=eq.${createdBookingRecordId}&select=booking_status,payment_status`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
    const rows = await bRes.json();
    assert.equal(rows[0].booking_status, "pending_payment");
    assert.equal(rows[0].payment_status, "pending");
  });

  await cleanup();

  console.log("\n================================================================================");
  console.log(`ALL ${passed}/${total} POST-DEPLOYMENT SECURITY TESTS PASSED SUCCESSFULLY!`);
  console.log("================================================================================\n");
}

run().catch(async (err) => {
  console.error("Fatal error during security test:", err);
  await cleanup();
  process.exit(1);
});
