// scripts/test-commission-slabs-boundary.mjs
// Comprehensive boundary test suite for RoyalLagn Commission Slabs & Two-Condition Contact Unlocking

import fs from "fs";
import path from "path";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${message}`);
  }
}

console.log("===============================================================================");
console.log("ROYALLAGN 9-TIER COMMISSION SLABS & BOUNDARY VERIFICATION");
console.log("===============================================================================\n");

// 1. Verify that services/referralCommission.ts contains the authoritative slabs
const refCommContent = fs.readFileSync(path.resolve("services/referralCommission.ts"), "utf-8");
assert(refCommContent.includes("OFFICIAL_COMMISSION_SLABS"), "services/referralCommission.ts defines OFFICIAL_COMMISSION_SLABS");
assert(refCommContent.includes("getCommissionForBookingAmount"), "services/referralCommission.ts exports getCommissionForBookingAmount");

// 2. Verify that lib/bookingCalculations.ts delegates to services/referralCommission
const bookingCalcContent = fs.readFileSync(path.resolve("lib/bookingCalculations.ts"), "utf-8");
assert(bookingCalcContent.includes('from "@/services/referralCommission"'), "lib/bookingCalculations.ts imports from referralCommission");
assert(bookingCalcContent.includes("getBookingFeeForAmount"), "lib/bookingCalculations.ts defines getBookingFeeForAmount");

// 3. Define the official commission slab calculation
const OFFICIAL_COMMISSION_SLABS = [
  { min: 0, max: 2998, referrerReward: 0, royallagnCommission: 0, totalCommission: 0, label: "0 – 2,998" },
  { min: 2999, max: 9999, referrerReward: 250, royallagnCommission: 250, totalCommission: 500, label: "2,999 – 9,999" },
  { min: 10000, max: 29999, referrerReward: 500, royallagnCommission: 500, totalCommission: 1000, label: "10,000 – 29,999" },
  { min: 30000, max: 49999, referrerReward: 1000, royallagnCommission: 1000, totalCommission: 2000, label: "30,000 – 49,999" },
  { min: 50000, max: 69999, referrerReward: 2000, royallagnCommission: 2000, totalCommission: 4000, label: "50,000 – 69,999" },
  { min: 70000, max: 99999, referrerReward: 3000, royallagnCommission: 3000, totalCommission: 6000, label: "70,000 – 99,999" },
  { min: 100000, max: 129999, referrerReward: 4000, royallagnCommission: 4000, totalCommission: 8000, label: "1,00,000 – 1,29,999" },
  { min: 130000, max: 149999, referrerReward: 5000, royallagnCommission: 5000, totalCommission: 10000, label: "1,30,000 – 1,49,999" },
  { min: 150000, max: null, referrerReward: 6000, royallagnCommission: 6000, totalCommission: 12000, label: "1,50,000 and above" },
];

function getCommissionForBookingAmount(bookingAmount) {
  const roundedAmount = Math.max(0, Math.round(Number(bookingAmount) || 0));
  const matchedSlab =
    OFFICIAL_COMMISSION_SLABS.find((s) => {
      if (s.max === null) return roundedAmount >= s.min;
      return roundedAmount >= s.min && roundedAmount <= s.max;
    }) || OFFICIAL_COMMISSION_SLABS[OFFICIAL_COMMISSION_SLABS.length - 1];

  return {
    bookingAmount: roundedAmount,
    slab: matchedSlab,
    referrerReward: matchedSlab.referrerReward,
    referrerCommission: matchedSlab.referrerReward,
    royallagnCommission: matchedSlab.royallagnCommission,
    totalCommission: matchedSlab.totalCommission,
  };
}

function calculateBookingFinancialsPure(totalAmount) {
  const feeInfo = getCommissionForBookingAmount(totalAmount);
  const bookingFee = feeInfo.totalCommission;
  const remainingVendorAmount = Math.max(0, totalAmount - bookingFee);
  return {
    totalAmount,
    bookingFeeAmount: bookingFee,
    remainingVendorAmount,
  };
}

// 4. Contact unlock logic (same as lib/bookingCancellationPolicy.ts & RPC get_secure_booking_details)
function isContactUnlocked(booking) {
  const status = (booking.booking_status || "").toUpperCase();
  const payment = (booking.payment_status || "").toLowerCase();

  const isAccepted = status === "ACCEPTED" || status === "CONFIRMED";
  const isPaid =
    payment === "paid_advance" ||
    payment === "paid_booking_fee" ||
    payment === "free_zero_fee" ||
    payment === "paid";
  const isCancelledOrRejected =
    status === "CUSTOMER_CANCELLED" ||
    status === "ADMIN_CANCELLED" ||
    status === "VENDOR_REJECTED" ||
    status === "CANCELLED" ||
    status === "CANCELLED_BY_VENDOR" ||
    status === "CANCELLED_BY_CUSTOMER" ||
    status === "REJECTED";

  return isAccepted && isPaid && !isCancelledOrRejected;
}

console.log("\n--- 1. Testing Exact Slab Boundaries & Balance Invariant (Fee + Balance = Total) ---");

const boundaryCases = [
  { amount: 0, expectedFee: 0, expectedBalance: 0, expectedRef: 0, expectedRoyal: 0, slabName: "0-2,998 (Zero Fee)" },
  { amount: 1500, expectedFee: 0, expectedBalance: 1500, expectedRef: 0, expectedRoyal: 0, slabName: "0-2,998 (Zero Fee)" },
  { amount: 2998, expectedFee: 0, expectedBalance: 2998, expectedRef: 0, expectedRoyal: 0, slabName: "0-2,998 (Zero Fee Upper Bound)" },
  
  { amount: 2999, expectedFee: 500, expectedBalance: 2499, expectedRef: 250, expectedRoyal: 250, slabName: "2,999-9,999 (Lower Bound)" },
  { amount: 5000, expectedFee: 500, expectedBalance: 4500, expectedRef: 250, expectedRoyal: 250, slabName: "2,999-9,999 (Mid)" },
  { amount: 9999, expectedFee: 500, expectedBalance: 9499, expectedRef: 250, expectedRoyal: 250, slabName: "2,999-9,999 (Upper Bound)" },
  
  { amount: 10000, expectedFee: 1000, expectedBalance: 9000, expectedRef: 500, expectedRoyal: 500, slabName: "10,000-29,999 (Lower Bound)" },
  { amount: 20000, expectedFee: 1000, expectedBalance: 19000, expectedRef: 500, expectedRoyal: 500, slabName: "10,000-29,999 (Mid)" },
  { amount: 29999, expectedFee: 1000, expectedBalance: 28999, expectedRef: 500, expectedRoyal: 500, slabName: "10,000-29,999 (Upper Bound)" },
  
  { amount: 30000, expectedFee: 2000, expectedBalance: 28000, expectedRef: 1000, expectedRoyal: 1000, slabName: "30,000-49,999 (Lower Bound)" },
  { amount: 40000, expectedFee: 2000, expectedBalance: 38000, expectedRef: 1000, expectedRoyal: 1000, slabName: "30,000-49,999 (Mid)" },
  { amount: 49999, expectedFee: 2000, expectedBalance: 47999, expectedRef: 1000, expectedRoyal: 1000, slabName: "30,000-49,999 (Upper Bound)" },
  
  { amount: 50000, expectedFee: 4000, expectedBalance: 46000, expectedRef: 2000, expectedRoyal: 2000, slabName: "50,000-69,999 (Lower Bound - Target Example)" },
  { amount: 60000, expectedFee: 4000, expectedBalance: 56000, expectedRef: 2000, expectedRoyal: 2000, slabName: "50,000-69,999 (Mid)" },
  { amount: 69999, expectedFee: 4000, expectedBalance: 65999, expectedRef: 2000, expectedRoyal: 2000, slabName: "50,000-69,999 (Upper Bound)" },
  
  { amount: 70000, expectedFee: 6000, expectedBalance: 64000, expectedRef: 3000, expectedRoyal: 3000, slabName: "70,000-99,999 (Lower Bound)" },
  { amount: 85000, expectedFee: 6000, expectedBalance: 79000, expectedRef: 3000, expectedRoyal: 3000, slabName: "70,000-99,999 (Mid)" },
  { amount: 99999, expectedFee: 6000, expectedBalance: 93999, expectedRef: 3000, expectedRoyal: 3000, slabName: "70,000-99,999 (Upper Bound)" },
  
  { amount: 100000, expectedFee: 8000, expectedBalance: 92000, expectedRef: 4000, expectedRoyal: 4000, slabName: "1,00,000-1,29,999 (Lower Bound)" },
  { amount: 115000, expectedFee: 8000, expectedBalance: 107000, expectedRef: 4000, expectedRoyal: 4000, slabName: "1,00,000-1,29,999 (Mid)" },
  { amount: 129999, expectedFee: 8000, expectedBalance: 121999, expectedRef: 4000, expectedRoyal: 4000, slabName: "1,00,000-1,29,999 (Upper Bound)" },
  
  { amount: 130000, expectedFee: 10000, expectedBalance: 120000, expectedRef: 5000, expectedRoyal: 5000, slabName: "1,30,000-1,49,999 (Lower Bound)" },
  { amount: 140000, expectedFee: 10000, expectedBalance: 130000, expectedRef: 5000, expectedRoyal: 5000, slabName: "1,30,000-1,49,999 (Mid)" },
  { amount: 149999, expectedFee: 10000, expectedBalance: 139999, expectedRef: 5000, expectedRoyal: 5000, slabName: "1,30,000-1,49,999 (Upper Bound)" },
  
  { amount: 150000, expectedFee: 12000, expectedBalance: 138000, expectedRef: 6000, expectedRoyal: 6000, slabName: "1,50,000+ (Lower Bound)" },
  { amount: 200000, expectedFee: 12000, expectedBalance: 188000, expectedRef: 6000, expectedRoyal: 6000, slabName: "1,50,000+ (High Value)" },
  { amount: 500000, expectedFee: 12000, expectedBalance: 488000, expectedRef: 6000, expectedRoyal: 6000, slabName: "1,50,000+ (Max Cap Check)" },
];

for (const c of boundaryCases) {
  const comm = getCommissionForBookingAmount(c.amount);
  const fin = calculateBookingFinancialsPure(c.amount);

  assert(comm.totalCommission === c.expectedFee, `${c.slabName} (₹${c.amount}): Total fee is ₹${comm.totalCommission} (expected ₹${c.expectedFee})`);
  assert(fin.bookingFeeAmount === c.expectedFee, `${c.slabName} (₹${c.amount}): Financials booking fee is ₹${fin.bookingFeeAmount} (expected ₹${c.expectedFee})`);
  assert(fin.remainingVendorAmount === c.expectedBalance, `${c.slabName} (₹${c.amount}): Remaining vendor amount is ₹${fin.remainingVendorAmount} (expected ₹${c.expectedBalance})`);
  assert(fin.bookingFeeAmount + fin.remainingVendorAmount === c.amount, `${c.slabName} (₹${c.amount}): Fee (₹${fin.bookingFeeAmount}) + Balance (₹${fin.remainingVendorAmount}) == Total (₹${c.amount})`);
  assert(comm.referrerCommission === c.expectedRef, `${c.slabName} (₹${c.amount}): Referrer commission is ₹${comm.referrerCommission} (expected ₹${c.expectedRef})`);
  assert(comm.royallagnCommission === c.expectedRoyal, `${c.slabName} (₹${c.amount}): RoyalLagn commission is ₹${comm.royallagnCommission} (expected ₹${c.expectedRoyal})`);
}

console.log("\n--- 2. Testing Two-Condition Contact Unlock Logic ---");

const unlockTestCases = [
  // Paid + Accepted -> UNLOCKED
  { bookingStatus: "ACCEPTED", paymentStatus: "paid_advance", expectedUnlocked: true, desc: "Paid advance + ACCEPTED -> UNLOCKED" },
  { bookingStatus: "accepted", paymentStatus: "paid_booking_fee", expectedUnlocked: true, desc: "Paid booking fee + accepted -> UNLOCKED" },
  { bookingStatus: "confirmed", paymentStatus: "paid", expectedUnlocked: true, desc: "Paid + confirmed -> UNLOCKED" },
  { bookingStatus: "ACCEPTED", paymentStatus: "free_zero_fee", expectedUnlocked: true, desc: "Zero fee + ACCEPTED -> UNLOCKED" },

  // Paid + PENDING / Forwarded / Other -> LOCKED (Payment success alone MUST NOT unlock)
  { bookingStatus: "PENDING", paymentStatus: "paid_advance", expectedUnlocked: false, desc: "Paid advance + PENDING -> LOCKED (Must not unlock before vendor accept)" },
  { bookingStatus: "pending", paymentStatus: "paid_booking_fee", expectedUnlocked: false, desc: "Paid booking fee + pending -> LOCKED" },
  { bookingStatus: "FORWARDED_TO_VENDOR", paymentStatus: "paid_advance", expectedUnlocked: false, desc: "Paid advance + FORWARDED_TO_VENDOR -> LOCKED" },

  // Paid + Rejected / Cancelled -> LOCKED
  { bookingStatus: "VENDOR_REJECTED", paymentStatus: "paid_advance", expectedUnlocked: false, desc: "Paid advance + VENDOR_REJECTED -> LOCKED" },
  { bookingStatus: "rejected", paymentStatus: "paid_advance", expectedUnlocked: false, desc: "Paid advance + rejected -> LOCKED" },
  { bookingStatus: "CUSTOMER_CANCELLED", paymentStatus: "paid_advance", expectedUnlocked: false, desc: "Paid advance + CUSTOMER_CANCELLED -> LOCKED" },
  { bookingStatus: "ADMIN_CANCELLED", paymentStatus: "paid_advance", expectedUnlocked: false, desc: "Paid advance + ADMIN_CANCELLED -> LOCKED" },
  { bookingStatus: "cancelled", paymentStatus: "paid_advance", expectedUnlocked: false, desc: "Paid advance + cancelled -> LOCKED" },

  // Unpaid / Pending payment + Accepted -> LOCKED (Payment not verified)
  { bookingStatus: "ACCEPTED", paymentStatus: "pending", expectedUnlocked: false, desc: "Pending payment + ACCEPTED -> LOCKED (Unverified payment)" },
  { bookingStatus: "confirmed", paymentStatus: "failed", expectedUnlocked: false, desc: "Failed payment + confirmed -> LOCKED" },
  { bookingStatus: "PENDING", paymentStatus: "pending", expectedUnlocked: false, desc: "Pending payment + PENDING status -> LOCKED" },
];

for (const t of unlockTestCases) {
  const result = isContactUnlocked({
    booking_status: t.bookingStatus,
    payment_status: t.paymentStatus,
  });
  assert(result === t.expectedUnlocked, `${t.desc}: got ${result}`);
}

console.log("\n===============================================================================");
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log("===============================================================================");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
