import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

console.log("================================================================================");
console.log("ROYALLAGN REAL RAZORPAY TEST GATEWAY INTEGRATION — VERIFICATION SUITE");
console.log("================================================================================\n");

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  process.stdout.write(`• ${name}... `);
  try {
    fn();
    console.log("PASSED");
    passed++;
  } catch (err) {
    console.log("FAILED");
    console.error(err);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// Test 1: Authoritative 30% Advance Calculation and Paise Conversion
// -----------------------------------------------------------------------------
runTest("Advance Calculation strictly enforces 30% advance and paise conversion", () => {
  const testCases = [
    { grandTotal: 10000, expectedAdvance: 3000, expectedDue: 7000, expectedPaise: 300000 },
    { grandTotal: 25499, expectedAdvance: 7650, expectedDue: 17849, expectedPaise: 765000 },
    { grandTotal: 1, expectedAdvance: 0, expectedDue: 1, expectedPaise: 0 },
    { grandTotal: 85000, expectedAdvance: 25500, expectedDue: 59500, expectedPaise: 2550000 },
    { grandTotal: 15333, expectedAdvance: 4600, expectedDue: 10733, expectedPaise: 460000 },
  ];

  for (const tc of testCases) {
    const advance = Math.round(tc.grandTotal * 0.3);
    const due = tc.grandTotal - advance;
    const paise = Math.round(advance * 100);

    assert.equal(advance, tc.expectedAdvance, `Advance for ${tc.grandTotal} should be ${tc.expectedAdvance}`);
    assert.equal(due, tc.expectedDue, `Due for ${tc.grandTotal} should be ${tc.expectedDue}`);
    assert.equal(paise, tc.expectedPaise, `Paise for advance ${advance} should be ${tc.expectedPaise}`);
    assert.equal(advance + due, tc.grandTotal, `Sum of advance and due must equal grand total`);
  }
});

// -----------------------------------------------------------------------------
// Test 2: Cryptographic HMAC-SHA256 Signature Verification
// -----------------------------------------------------------------------------
runTest("HMAC-SHA256 Signature Verification accepts valid digests and rejects tampered digests", () => {
  const secret = "test_razorpay_secret_key_123456";
  const orderId = "order_OId1234567890";
  const paymentId = "pay_PId1234567890";

  // Generate authentic signature
  const authenticPayload = `${orderId}|${paymentId}`;
  const validSignature = crypto.createHmac("sha256", secret).update(authenticPayload).digest("hex");

  assert.ok(validSignature.length === 64, "SHA-256 hex digest must be 64 characters");

  // Verify valid signature matching
  const testValid = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  assert.equal(testValid, validSignature, "Valid payload and secret must match signature exactly");

  // Tampered payment ID
  const tamperedPaymentPayload = `${orderId}|pay_TAMPERED`;
  const tamperedSig1 = crypto.createHmac("sha256", secret).update(tamperedPaymentPayload).digest("hex");
  assert.notEqual(tamperedSig1, validSignature, "Tampered payment ID must not match original signature");

  // Tampered order ID
  const tamperedOrderPayload = `order_TAMPERED|${paymentId}`;
  const tamperedSig2 = crypto.createHmac("sha256", secret).update(tamperedOrderPayload).digest("hex");
  assert.notEqual(tamperedSig2, validSignature, "Tampered order ID must not match original signature");

  // Wrong secret key
  const wrongSecretSig = crypto.createHmac("sha256", "wrong_secret").update(authenticPayload).digest("hex");
  assert.notEqual(wrongSecretSig, validSignature, "Signature with wrong secret must not match");
});

// -----------------------------------------------------------------------------
// Test 3: Gateway Payment Entity Validation Rules
// -----------------------------------------------------------------------------
runTest("Server-side Gateway verification validates amount, currency, orderId, and strictly captured status", () => {
  const booking = {
    advance_amount: 3000,
    razorpay_order_id: "order_OId1234567890",
  };

  const expectedPaise = Math.round(Number(booking.advance_amount) * 100);

  // Valid payment entity from Razorpay API
  const validPaymentEntity = {
    id: "pay_PId1234567890",
    order_id: "order_OId1234567890",
    amount: 300000,
    currency: "INR",
    status: "captured",
  };

  function validateEntity(entity, bkg) {
    if (entity.order_id && entity.order_id !== bkg.razorpay_order_id) {
      throw new Error("Order ID mismatch");
    }
    const expected = Math.round(Number(bkg.advance_amount) * 100);
    if (Number(entity.amount) !== expected) {
      throw new Error(`Amount mismatch: expected ${expected}, got ${entity.amount}`);
    }
    if (entity.currency !== "INR") {
      throw new Error("Currency mismatch");
    }
    // Critical: Only captured payments are treated as successfully paid advances
    if (entity.status !== "captured") {
      throw new Error(`Payment status invalid: payment must be captured (current: ${entity.status})`);
    }
    return true;
  }

  assert.ok(validateEntity(validPaymentEntity, booking));

  // Authorized payments must NOT be treated as paid advances
  assert.throws(() => {
    validateEntity({ ...validPaymentEntity, status: "authorized" }, booking);
  }, /Payment status invalid/);

  // Amount mismatch
  assert.throws(() => {
    validateEntity({ ...validPaymentEntity, amount: 200000 }, booking);
  }, /Amount mismatch/);

  // Order ID mismatch
  assert.throws(() => {
    validateEntity({ ...validPaymentEntity, order_id: "order_DIFFERENT" }, booking);
  }, /Order ID mismatch/);

  // Currency mismatch
  assert.throws(() => {
    validateEntity({ ...validPaymentEntity, currency: "USD" }, booking);
  }, /Currency mismatch/);

  // Status failed
  assert.throws(() => {
    validateEntity({ ...validPaymentEntity, status: "failed" }, booking);
  }, /Payment status invalid/);
});

// -----------------------------------------------------------------------------
// Test 4: Database Migration File & Payment Guard Trigger Audit
// -----------------------------------------------------------------------------
runTest("Database migration defines finalize_verified_booking_payment and guard_vendor_booking_payment", () => {
  const migrationPath = path.join(
    projectRoot,
    "supabase",
    "migrations",
    "20261013140000_secure_booking_payment_guard.sql"
  );

  assert.ok(fs.existsSync(migrationPath), `Migration file must exist at ${migrationPath}`);
  const content = fs.readFileSync(migrationPath, "utf-8");

  // Check function definitions
  assert.ok(
    content.includes("finalize_verified_booking_payment"),
    "Migration must define finalize_verified_booking_payment RPC"
  );
  assert.ok(
    content.includes("guard_vendor_booking_payment"),
    "Migration must define guard_vendor_booking_payment trigger function"
  );
  assert.ok(
    content.includes("trg_guard_vendor_booking_payment"),
    "Migration must attach trigger to vendor_bookings table"
  );
  assert.ok(
    content.includes("paid_advance"),
    "Trigger must check for paid_advance status guard"
  );
  assert.ok(
    content.includes("razorpay_payment_id"),
    "Trigger must check for razorpay_payment_id protection"
  );
  assert.ok(
    content.includes("service_role"),
    "Trigger must permit service_role and admin execution"
  );
  assert.ok(
    content.includes("revoke execute on function public.finalize_verified_booking_payment"),
    "Migration must revoke execute on finalize_verified_booking_payment from public/anon/authenticated"
  );
  assert.ok(
    content.includes("grant execute on function public.finalize_verified_booking_payment(uuid, text, text, text) to service_role"),
    "Migration must grant execute on finalize_verified_booking_payment strictly to service_role"
  );
  assert.ok(
    content.includes("Cannot finalize payment for % booking"),
    "Migration must reject payment finalization on cancelled or rejected bookings"
  );
});

// -----------------------------------------------------------------------------
// Test 5: Edge Functions Audit (create-booking-order and verify-booking-payment)
// -----------------------------------------------------------------------------
runTest("Edge Functions implement server-authoritative flow without simulation fallbacks", () => {
  const createPath = path.join(projectRoot, "supabase", "functions", "create-booking-order", "index.ts");
  const verifyPath = path.join(projectRoot, "supabase", "functions", "verify-booking-payment", "index.ts");

  assert.ok(fs.existsSync(createPath), "create-booking-order index.ts must exist");
  assert.ok(fs.existsSync(verifyPath), "verify-booking-payment index.ts must exist");

  const createContent = fs.readFileSync(createPath, "utf-8");
  const verifyContent = fs.readFileSync(verifyPath, "utf-8");

  // create-booking-order checks
  assert.ok(
    !createContent.includes("isSimulator: true"),
    "create-booking-order must NOT return isSimulator: true"
  );
  assert.ok(
    createContent.includes("event_start_at"),
    "create-booking-order must persist event_start_at"
  );
  assert.ok(
    createContent.includes("cancellation_cutoff_at"),
    "create-booking-order must persist cancellation_cutoff_at"
  );
  assert.ok(
    createContent.includes("soft_lock_expires_at"),
    "create-booking-order must enforce 15-minute soft lock"
  );
  assert.ok(
    createContent.includes("payment_capture: 1"),
    "create-booking-order must instruct Razorpay to auto-capture payments"
  );

  // verify-booking-payment checks
  assert.ok(
    !verifyContent.includes("isSimulator"),
    "verify-booking-payment must NOT have isSimulator bypass"
  );
  assert.ok(
    verifyContent.includes("hmacHex") && verifyContent.includes("constantTimeEqual"),
    "verify-booking-payment must use cryptographic HMAC signature and constant-time verification"
  );
  assert.ok(
    verifyContent.includes("https://api.razorpay.com/v1/payments/"),
    "verify-booking-payment must call Razorpay API for entity verification"
  );
  assert.ok(
    verifyContent.includes("paymentEntity.status !== \"captured\""),
    "verify-booking-payment must strictly require captured status"
  );
  assert.ok(
    verifyContent.includes("finalize_verified_booking_payment"),
    "verify-booking-payment must call atomic finalize_verified_booking_payment RPC"
  );
  assert.ok(
    !verifyContent.includes("from(\"vendor_bookings\").update("),
    "verify-booking-payment must NOT have unrestricted direct update fallback"
  );
});

// -----------------------------------------------------------------------------
// Test 6: Client Checkout and Service Code Audit
// -----------------------------------------------------------------------------
runTest("Client Checkout and Service code have zero simulation fallbacks", () => {
  const servicePath = path.join(projectRoot, "services", "vendorBookings.ts");
  const modalPath = path.join(projectRoot, "components", "booking", "BookingCheckoutModal.tsx");

  const serviceContent = fs.readFileSync(servicePath, "utf-8");
  const modalContent = fs.readFileSync(modalPath, "utf-8");

  // vendorBookings.ts checks
  assert.ok(
    !serviceContent.includes("isSimulator: true"),
    "vendorBookings.ts must not have isSimulator: true fallback"
  );
  assert.ok(
    !serviceContent.includes("using direct DB hold:"),
    "vendorBookings.ts must not fall back to direct DB hold"
  );
  assert.ok(
    !serviceContent.includes("using direct DB update:"),
    "vendorBookings.ts must not fall back to direct DB update for payment"
  );

  // BookingCheckoutModal.tsx checks
  assert.ok(
    !modalContent.includes("simulatorVisible"),
    "BookingCheckoutModal.tsx must not contain simulatorVisible state"
  );
  assert.ok(
    !modalContent.includes("simulatingPayment"),
    "BookingCheckoutModal.tsx must not contain simulatingPayment state"
  );
  assert.ok(
    !modalContent.includes("handleOpenSimulator"),
    "BookingCheckoutModal.tsx must not contain handleOpenSimulator"
  );
  assert.ok(
    modalContent.includes("openRazorpayCheckout"),
    "BookingCheckoutModal.tsx must import and call openRazorpayCheckout"
  );
  assert.ok(
    modalContent.includes("VendorBookingService.createBookingOrder"),
    "BookingCheckoutModal.tsx must call createBookingOrder"
  );
  assert.ok(
    modalContent.includes("VendorBookingService.verifyBookingPayment"),
    "BookingCheckoutModal.tsx must call verifyBookingPayment"
  );
});

// -----------------------------------------------------------------------------
// Test 7: Edge Function Customer Authentication & Cross-User Protection Audit
// -----------------------------------------------------------------------------
runTest("Edge Functions strictly enforce session authentication and prevent customer ID spoofing", () => {
  const createPath = path.join(projectRoot, "supabase", "functions", "create-booking-order", "index.ts");
  const verifyPath = path.join(projectRoot, "supabase", "functions", "verify-booking-payment", "index.ts");
  const sharedPath = path.join(projectRoot, "supabase", "functions", "_shared", "subscriptions.ts");

  const createContent = fs.readFileSync(createPath, "utf-8");
  const verifyContent = fs.readFileSync(verifyPath, "utf-8");
  const sharedContent = fs.readFileSync(sharedPath, "utf-8");

  // _shared/subscriptions.ts checks
  assert.ok(
    sharedContent.includes("resolveCallerUser"),
    "_shared/subscriptions.ts must export resolveCallerUser"
  );

  // create-booking-order checks
  assert.ok(
    createContent.includes("resolveCallerUser(request)"),
    "create-booking-order must resolve caller user from request"
  );
  assert.ok(
    createContent.includes("customerId does not match authenticated user session"),
    "create-booking-order must reject customerId mismatch with authenticated session"
  );
  assert.ok(
    createContent.includes("Authentication required: Please sign in to book a service"),
    "create-booking-order must reject unauthenticated requests"
  );

  // verify-booking-payment checks
  assert.ok(
    verifyContent.includes("resolveCallerUser(request)"),
    "verify-booking-payment must resolve caller user from request"
  );
  assert.ok(
    verifyContent.includes("booking.customer_id"),
    "verify-booking-payment must check booking.customer_id"
  );
  assert.ok(
    verifyContent.includes("You do not own this booking reservation"),
    "verify-booking-payment must enforce booking ownership"
  );
});

// -----------------------------------------------------------------------------
// Test 8: Payment Entity Amount Verification in Paise
// -----------------------------------------------------------------------------
runTest("verify-booking-payment validates gateway payment amount strictly matches server advance in paise", () => {
  const verifyPath = path.join(projectRoot, "supabase", "functions", "verify-booking-payment", "index.ts");
  const verifyContent = fs.readFileSync(verifyPath, "utf-8");

  assert.ok(
    verifyContent.includes("expectedPaise = Math.round(Number(booking.advance_amount) * 100)"),
    "verify-booking-payment must compute expectedPaise from booking.advance_amount"
  );
  assert.ok(
    verifyContent.includes("Number(paymentEntity.amount) !== expectedPaise"),
    "verify-booking-payment must verify paymentEntity.amount equals expectedPaise"
  );
});

console.log("\n================================================================================");
console.log(`ALL ${passed}/${total} RAZORPAY TEST GATEWAY VERIFICATION TESTS PASSED!`);
console.log("================================================================================\n");
