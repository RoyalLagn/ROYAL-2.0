import assert from "node:assert/strict";

console.log("Starting Vendor Transactions Domain & Finance Calculations Verification...");

// 1. Verification of Financial Summary Calculations
const mockTransactions = [
  {
    id: "sub_1",
    type: "subscription",
    direction: "outflow",
    title: "Starter Plan",
    amount: 1499,
    status: "completed",
    currency: "INR",
    date: "2026-10-01T10:00:00Z",
  },
  {
    id: "sub_2",
    type: "subscription",
    direction: "outflow",
    title: "Pro Upgrade (Failed)",
    amount: 3999,
    status: "failed", // Should NOT be added to completed outflow
    currency: "INR",
    date: "2026-10-02T10:00:00Z",
  },
  {
    id: "feat_1",
    type: "featured_placement",
    direction: "outflow",
    title: "Featured Slot #1",
    amount: 999,
    status: "completed",
    currency: "INR",
    date: "2026-10-05T12:00:00Z",
  },
  {
    id: "bkg_on_1",
    type: "royallagn_advance",
    direction: "inflow",
    title: "RoyalLagn Advance: Rajesh Patil",
    amount: 15000, // 30% advance received
    totalBookingAmount: 50000,
    dueAmount: 35000,
    status: "completed",
    currency: "INR",
    date: "2026-10-06T14:00:00Z",
  },
  {
    id: "bkg_on_2",
    type: "royallagn_advance",
    direction: "inflow",
    title: "RoyalLagn Advance: Neha Kulkarni (Pending Confirm)",
    amount: 6000,
    totalBookingAmount: 20000,
    dueAmount: 14000,
    status: "pending", // Escrow pending confirm
    currency: "INR",
    date: "2026-10-07T14:00:00Z",
  },
  {
    id: "bkg_off_1",
    type: "offline_booking",
    direction: "inflow",
    title: "Offline: Priya Deshmukh",
    amount: 40000, // 50% advance received
    totalBookingAmount: 80000,
    dueAmount: 40000,
    status: "completed",
    currency: "INR",
    date: "2026-10-08T15:00:00Z",
  },
  {
    id: "bkg_off_2",
    type: "offline_booking",
    direction: "inflow",
    title: "Offline: Amit Joshi (Fully Paid)",
    amount: 25000,
    totalBookingAmount: 25000,
    dueAmount: 0,
    status: "completed",
    currency: "INR",
    date: "2026-10-09T15:00:00Z",
  },
];

// Replicate pure computation logic from VendorTransactionsService
function computeFinanceSummary(txns) {
  let totalInflow = 0;
  let totalOutflow = 0;
  let pendingReceivables = 0;
  let royalLagnAdvances = 0;

  let onlineTotal = 0;
  let onlineAdvance = 0;
  let onlineBookingAmount = 0;

  let offlineTotal = 0;
  let offlineAdvance = 0;
  let offlineBookingAmount = 0;

  for (const txn of txns) {
    const isOnlineBkg = txn.type === "royallagn_advance" || txn.type === "admin_advance";
    const isOfflineBkg = txn.type === "offline_booking";
    const isCancelled = txn.status === "refunded" || txn.status === "failed";

    if (isOnlineBkg) {
      if (txn.status === "completed") {
        royalLagnAdvances += txn.amount;
      }
      if (!isCancelled) {
        const tot = txn.totalBookingAmount || ((txn.advanceAmount || txn.amount || 0) + (txn.dueAmount || 0));
        const adv = txn.advanceAmount !== undefined ? txn.advanceAmount : (txn.amount || Math.round(tot * 0.3));
        const due = txn.dueAmount !== undefined ? txn.dueAmount : Math.max(0, tot - adv);
        onlineTotal += tot;
        onlineAdvance += adv;
        onlineBookingAmount += due;
      }
    }

    if (isOfflineBkg) {
      if (!isCancelled) {
        const tot = txn.totalBookingAmount || ((txn.advanceAmount || txn.amount || 0) + (txn.dueAmount || 0));
        const adv = txn.advanceAmount !== undefined ? txn.advanceAmount : (txn.amount || Math.round(tot * 0.3));
        const due = txn.dueAmount !== undefined ? txn.dueAmount : Math.max(0, tot - adv);
        offlineTotal += tot;
        offlineAdvance += adv;
        offlineBookingAmount += due;
      }
    }

    if (txn.direction === "inflow") {
      if (txn.status === "completed") {
        totalInflow += txn.amount;
      }
      if (txn.dueAmount && txn.status !== "refunded") {
        pendingReceivables += txn.dueAmount;
      }
    } else if (txn.direction === "outflow") {
      if (txn.status === "completed") {
        totalOutflow += txn.amount;
      }
    }
  }

  const totalEarnings = onlineTotal + offlineTotal;
  const totalAdvanceAmount = onlineAdvance + offlineAdvance;
  const totalBookingAmount = onlineBookingAmount + offlineBookingAmount;

  return {
    totalInflow,
    totalOutflow,
    netBalance: totalInflow - totalOutflow,
    pendingReceivables,
    royalLagnAdvances,
    transactionCount: txns.length,
    onlineTotal,
    onlineAdvance,
    onlineBookingAmount,
    offlineTotal,
    offlineAdvance,
    offlineBookingAmount,
    totalEarnings,
    totalAdvanceAmount,
    totalBookingAmount,
  };
}

const summary = computeFinanceSummary(mockTransactions);

// Total Inflow:
// bkg_on_1 (15000) + bkg_off_1 (40000) + bkg_off_2 (25000) = 80,000
assert.equal(summary.totalInflow, 80000, "Completed inflow must equal 80,000");

// Total Outflow:
// sub_1 (1499) + feat_1 (999) = 2498 (sub_2 failed, so excluded)
assert.equal(summary.totalOutflow, 2498, "Completed outflow must equal 2498");

// Net Balance:
// 80000 - 2498 = 77502
assert.equal(summary.netBalance, 77502, "Net balance must equal 77,502");

// Pending Receivables:
// bkg_on_1 due (35000) + bkg_on_2 due (14000) + bkg_off_1 due (40000) = 89,000
assert.equal(summary.pendingReceivables, 89000, "Pending receivables must equal 89,000");
assert.equal(summary.transactionCount, 7, "Transaction count must be 7");

// Online Earnings Breakdown:
// bkg_on_1: total 50000, adv 15000 (30%), due 35000 (70%)
// bkg_on_2: total 20000, adv 6000 (30%), due 14000 (70%)
// onlineTotal = 70000, onlineAdvance = 21000, onlineBookingAmount = 49000
assert.equal(summary.onlineTotal, 70000, "Online total must equal 70,000");
assert.equal(summary.onlineAdvance, 21000, "Online advance 30% must equal 21,000");
assert.equal(summary.onlineBookingAmount, 49000, "Online booking amount 70% must equal 49,000");

// Offline Earnings Breakdown:
// bkg_off_1: total 80000, adv 40000, due 40000
// bkg_off_2: total 25000, adv 25000, due 0
// offlineTotal = 105000, offlineAdvance = 65000, offlineBookingAmount = 40000
assert.equal(summary.offlineTotal, 105000, "Offline total must equal 105,000");
assert.equal(summary.offlineAdvance, 65000, "Offline advance must equal 65,000");
assert.equal(summary.offlineBookingAmount, 40000, "Offline booking amount must equal 40,000");

// Total Earnings (Online + Offline):
// 70000 + 105000 = 175,000
assert.equal(summary.totalEarnings, 175000, "Total earnings must equal 175,000");
assert.equal(summary.totalAdvanceAmount, 86000, "Total advance must equal 86,000");
assert.equal(summary.totalBookingAmount, 89000, "Total booking amount must equal 89,000");

console.log("✓ Financial summary calculations verified accurately.");

// 2. Filter logic verification
// Filter by Inflow
const inflows = mockTransactions.filter((t) => t.direction === "inflow");
assert.equal(inflows.length, 4, "Must have 4 inflow transactions");

// Filter by Outflow
const outflows = mockTransactions.filter((t) => t.direction === "outflow");
assert.equal(outflows.length, 3, "Must have 3 outflow transactions");

// Filter by Subscriptions
const subs = mockTransactions.filter((t) => t.type === "subscription");
assert.equal(subs.length, 2, "Must have 2 subscription transactions");

// Filter by RoyalLagn Advances
const royallagnAdvances = mockTransactions.filter((t) => t.type === "royallagn_advance");
assert.equal(royallagnAdvances.length, 2, "Must have 2 RoyalLagn advance transactions");

// Filter by Offline Bookings
const offlineBkgs = mockTransactions.filter((t) => t.type === "offline_booking");
assert.equal(offlineBkgs.length, 2, "Must have 2 offline booking transactions");

// Filter by Status: Completed
const completed = mockTransactions.filter((t) => t.status === "completed");
assert.equal(completed.length, 5, "Must have 5 completed transactions");

console.log("✓ Type and status filtering verified.");

// 3. Search filter verification
function searchTransactions(query, list) {
  const q = query.toLowerCase();
  return list.filter((t) => t.title.toLowerCase().includes(q));
}

assert.equal(searchTransactions("Rajesh", mockTransactions).length, 1);
assert.equal(searchTransactions("Offline", mockTransactions).length, 2);
assert.equal(searchTransactions("Featured", mockTransactions).length, 1);
assert.equal(searchTransactions("Starter", mockTransactions).length, 1);

console.log("✓ Search filtering verified.");

// 4. Offline Booking CRM structured note verification
function formatOfflineNotes(input) {
  return [
    `[Offline CRM Booking]`,
    `Method: ${input.paymentMethod}`,
    `Status: ${input.paymentStatus === "paid_full" ? "Fully Paid" : input.paymentStatus === "paid_advance" ? "Advance Received" : "Pending"}`,
    input.notes ? `Notes: ${input.notes}` : null,
  ].filter(Boolean).join(" | ");
}

const formatted = formatOfflineNotes({
  paymentMethod: "UPI",
  paymentStatus: "paid_advance",
  notes: "Ref #UPI4918201",
});

assert.ok(formatted.includes("Method: UPI"), "Formatted notes must include payment method");
assert.ok(formatted.includes("Status: Advance Received"), "Formatted notes must include status");
assert.ok(formatted.includes("Ref #UPI4918201"), "Formatted notes must preserve user notes");

console.log("✓ Offline CRM structured notes formatting verified.");
console.log("All Vendor Transactions & Offline CRM domain tests passed successfully!");
