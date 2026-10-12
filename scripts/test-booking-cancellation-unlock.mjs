import assert from "node:assert/strict";
import {
  CANCELLATION_WINDOW_HOURS,
  CANCELLATION_WINDOW_MS,
  STANDARD_TIME_SLOTS,
  buildEventStartTimestamp,
  calculateCancellationCutoff,
  formatCutoffDisplayIST,
  getTimeRemainingToCutoff,
  isCancellationLocked,
  isContactUnlocked,
  validateBookingDescription,
  validateGoogleMapsUrl,
  validateIndianPhone,
} from "../lib/bookingCancellationPolicy.ts";

console.log("================================================================================");
console.log("ROYALLAGN 5-DAY CANCELLATION LOCK & CONTACT UNLOCK — POLICY VERIFICATION SUITE");
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
// Test 1: Cancellation Window Constant and Exact 120-Hour Math
// -----------------------------------------------------------------------------
runTest("Window Constant is strictly 120 hours (5 full days)", () => {
  assert.equal(CANCELLATION_WINDOW_HOURS, 120);
  const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
  assert.equal(CANCELLATION_WINDOW_MS, fiveDaysMs, "120 hours must equal exactly 5 days in milliseconds");

  const eventStartIso = "2026-11-20T10:00:00.000Z";
  const cutoffIso = calculateCancellationCutoff(eventStartIso);
  const expectedCutoffIso = "2026-11-15T10:00:00.000Z";
  assert.equal(cutoffIso, expectedCutoffIso, "Cutoff must be exactly 5 days (120h) prior");
});

// -----------------------------------------------------------------------------
// Test 2: Event Start Timestamp Builder & Standard Slots
// -----------------------------------------------------------------------------
runTest("buildEventStartTimestamp correctly parses dates and slots with IST (+05:30) offset", () => {
  assert.ok(STANDARD_TIME_SLOTS.length >= 7, "Standard time slots must cover ceremonial milestones");

  // 10:00 AM IST on 2026-11-20 -> 10:00:00 +05:30 -> 04:30:00 UTC
  const ts10am = buildEventStartTimestamp("2026-11-20", "10:00");
  const d1 = new Date(ts10am);
  assert.equal(d1.toISOString(), "2026-11-20T04:30:00.000Z");

  // 18:00 (06:00 PM) IST on 2026-11-20 -> 18:00:00 +05:30 -> 12:30:00 UTC
  const ts6pm = buildEventStartTimestamp("2026-11-20", "18:00");
  const d2 = new Date(ts6pm);
  assert.equal(d2.toISOString(), "2026-11-20T12:30:00.000Z");

  // When time slot is provided as standard ID or default fallback
  const tsDefault = buildEventStartTimestamp("2026-11-20");
  assert.ok(tsDefault.endsWith("Z"));
});

// -----------------------------------------------------------------------------
// Test 3: Cancellation Lock Status Based on 120-Hour Window
// -----------------------------------------------------------------------------
runTest("isCancellationLocked: Free to cancel > 5 days; Locked <= 5 days", () => {
  const now = Date.now();

  // Future event 30 days away -> cutoff is 25 days in future -> NOT locked
  const futureEventStart = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
  const futureCutoff = calculateCancellationCutoff(futureEventStart);
  assert.equal(isCancellationLocked(futureCutoff), false, "Event 30 days out must NOT be locked");

  // Event 6 days away -> cutoff is 1 day in future -> NOT locked
  const sixDaysEventStart = new Date(now + 6 * 24 * 60 * 60 * 1000).toISOString();
  const sixDaysCutoff = calculateCancellationCutoff(sixDaysEventStart);
  assert.equal(isCancellationLocked(sixDaysCutoff), false, "Event 6 days out must NOT be locked");

  // Event 4 days away -> cutoff was 1 day ago -> LOCKED
  const fourDaysEventStart = new Date(now + 4 * 24 * 60 * 60 * 1000).toISOString();
  const fourDaysCutoff = calculateCancellationCutoff(fourDaysEventStart);
  assert.equal(isCancellationLocked(fourDaysCutoff), true, "Event 4 days out MUST be locked");

  // Event 1 hour away -> LOCKED
  const oneHourEventStart = new Date(now + 1 * 60 * 60 * 1000).toISOString();
  const oneHourCutoff = calculateCancellationCutoff(oneHourEventStart);
  assert.equal(isCancellationLocked(oneHourCutoff), true, "Event 1 hour out MUST be locked");

  // Past event -> LOCKED
  const pastEventStart = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  const pastCutoff = calculateCancellationCutoff(pastEventStart);
  assert.equal(isCancellationLocked(pastCutoff), true, "Past event MUST be locked");
});

// -----------------------------------------------------------------------------
// Test 4: Contact Details Unlock: Strictly Confirmed Bookings at/after Cutoff
// -----------------------------------------------------------------------------
runTest("isContactUnlocked: Unlocked ONLY at/after cutoff AND when genuinely confirmed", () => {
  const now = Date.now();

  // Scenario A: Event is 10 days away (Cutoff is 5 days away).
  // Neither customer nor vendor should see contacts, regardless of confirmation status!
  const futureCutoff = new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(
    isContactUnlocked("confirmed", futureCutoff),
    false,
    "Confirmed booking BEFORE cutoff must keep contacts locked"
  );
  assert.equal(
    isContactUnlocked("pending_vendor_confirmation", futureCutoff),
    false,
    "Pending booking BEFORE cutoff must keep contacts locked"
  );

  // Scenario B: Event is 2 days away (Cutoff passed 3 days ago).
  const pastCutoff = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();

  // Genuinely confirmed booking -> CONTACTS UNLOCKED
  assert.equal(
    isContactUnlocked("confirmed", pastCutoff),
    true,
    "Confirmed booking AFTER cutoff must unlock contacts"
  );

  // Unconfirmed, pending, cancelled, or rejected bookings -> MUST REMAIN STRICTLY LOCKED
  const nonConfirmedStatuses = [
    "pending",
    "pending_vendor_confirmation",
    "pending_payment",
    "cancelled",
    "cancelled_by_vendor",
    "cancelled_by_customer",
    "rejected",
  ];

  for (const status of nonConfirmedStatuses) {
    assert.equal(
      isContactUnlocked(status, pastCutoff),
      false,
      `Status '${status}' after cutoff must NEVER expose contact details`
    );
  }
});

// -----------------------------------------------------------------------------
// Test 5: Immediate Lock & Unlock for Last-Minute Bookings (within 5 days)
// -----------------------------------------------------------------------------
runTest("Immediate lock and contact unlock for bookings confirmed within final 5 days", () => {
  const now = Date.now();
  // Customer books an event for 2 days from now
  const eventStartIso = new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString();
  const cutoffIso = calculateCancellationCutoff(eventStartIso);

  // Since cutoff is in the past, cancellation is locked immediately
  assert.equal(isCancellationLocked(cutoffIso), true, "Last minute booking must lock cancellation immediately");

  // Confirmed last-minute booking -> Contacts unlock immediately
  assert.equal(
    isContactUnlocked("confirmed", cutoffIso),
    true,
    "Confirmed last minute booking must unlock contacts immediately"
  );

  // While pending vendor acceptance -> Contacts remain strictly locked
  assert.equal(
    isContactUnlocked("pending_vendor_confirmation", cutoffIso),
    false,
    "Pending last minute booking must NOT expose contacts until confirmed"
  );
});

// -----------------------------------------------------------------------------
// Test 6: Indian Phone Number Validation
// -----------------------------------------------------------------------------
runTest("validateIndianPhone: Validates standard Indian mobile numbers and strips country code", () => {
  // Valid numbers starting with 6, 7, 8, 9
  assert.equal(validateIndianPhone("9876543210").valid, true);
  assert.equal(validateIndianPhone("9876543210").cleaned, "9876543210");

  assert.equal(validateIndianPhone("+91 8123456789").valid, true);
  assert.equal(validateIndianPhone("+91 8123456789").cleaned, "8123456789");

  assert.equal(validateIndianPhone("09123456789").valid, true);
  assert.equal(validateIndianPhone("09123456789").cleaned, "9123456789");

  assert.equal(validateIndianPhone("91 7000000000").valid, true);
  assert.equal(validateIndianPhone("91 7000000000").cleaned, "7000000000");

  assert.equal(validateIndianPhone("6999999999").valid, true);

  // Invalid numbers
  assert.equal(validateIndianPhone("5123456789").valid, false, "Must reject number not starting with 6-9");
  assert.equal(validateIndianPhone("1234567890").valid, false, "Must reject number starting with 1");
  assert.equal(validateIndianPhone("98765").valid, false, "Must reject short number");
  assert.equal(validateIndianPhone("987654321000").valid, false, "Must reject overly long number");
  assert.equal(validateIndianPhone("").valid, false, "Must reject empty phone");
  assert.equal(validateIndianPhone("abcdefghij").valid, false, "Must reject non-numeric");
});

// -----------------------------------------------------------------------------
// Test 7: Google Maps URL Validation
// -----------------------------------------------------------------------------
runTest("validateGoogleMapsUrl: Validates trusted Google Maps URLs", () => {
  // Valid URLs
  assert.equal(validateGoogleMapsUrl("https://maps.google.com/?q=Taj+Mahal").valid, true);
  assert.equal(validateGoogleMapsUrl("https://www.google.com/maps/search/?api=1&query=Mumbai").valid, true);
  assert.equal(validateGoogleMapsUrl("https://goo.gl/maps/abc123xyz").valid, true);
  assert.equal(validateGoogleMapsUrl("https://maps.app.goo.gl/AbCdEfGh").valid, true);

  // Invalid URLs
  assert.equal(validateGoogleMapsUrl("https://facebook.com/events/123").valid, false, "Must reject non-google maps domain");
  assert.equal(validateGoogleMapsUrl("https://example.com/maps").valid, false, "Must reject external domain");
  assert.equal(validateGoogleMapsUrl("random text string").valid, false, "Must reject non-URL");
  assert.equal(validateGoogleMapsUrl("").valid, false, "Must reject empty URL");
});

// -----------------------------------------------------------------------------
// Test 8: Booking Description Validation
// -----------------------------------------------------------------------------
runTest("validateBookingDescription: Enforces non-empty and 2000 character maximum limit", () => {
  // Valid
  assert.equal(validateBookingDescription("Sangeet evening coverage from 6 PM to 11 PM with 250 guests.").valid, true);

  // Empty or whitespace
  assert.equal(validateBookingDescription("").valid, false, "Must reject empty description");
  assert.equal(validateBookingDescription("   \n\t   ").valid, false, "Must reject whitespace description");

  // Character boundary: exactly 2000 chars is valid
  const exact2000 = "a".repeat(2000);
  assert.equal(validateBookingDescription(exact2000).valid, true);

  // Over limit: 2001 chars is invalid
  const over2000 = "a".repeat(2001);
  assert.equal(validateBookingDescription(over2000).valid, false);
});

// -----------------------------------------------------------------------------
// Test 9: Time Remaining Countdown and IST Formatting
// -----------------------------------------------------------------------------
runTest("getTimeRemainingToCutoff and formatCutoffDisplayIST", () => {
  const now = Date.now();

  // Cutoff 2 days in future
  const twoDaysFutureCutoff = new Date(now + 2 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString();
  const remainingFuture = getTimeRemainingToCutoff(twoDaysFutureCutoff);
  assert.equal(remainingFuture.locked, false);
  assert.ok(remainingFuture.label.includes("left to cancel"));

  // Cutoff in past
  const pastCutoff = new Date(now - 1 * 60 * 60 * 1000).toISOString();
  const remainingPast = getTimeRemainingToCutoff(pastCutoff);
  assert.equal(remainingPast.locked, true);
  assert.equal(remainingPast.remainingMs, 0);

  // IST Date String formatting
  const formattedIST = formatCutoffDisplayIST("2026-11-15T10:00:00.000Z");
  assert.ok(formattedIST.includes("IST"), "Formatted cutoff must include IST time zone");
  assert.ok(formattedIST.includes("Nov"), "Formatted cutoff must format month name");
});

console.log("\n================================================================================");
console.log(`ALL ${passed}/${total} CANCELLATION LOCK & CONTACT UNLOCK TESTS PASSED SUCCESSFULLY!`);
console.log("================================================================================\n");
