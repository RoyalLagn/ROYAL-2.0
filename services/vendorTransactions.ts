import { supabase } from "@/services/supabase";
import { SubscriptionAccessService } from "@/subscriptions/services/SubscriptionAccessService";
import { VendorBookingService, type VendorBooking } from "@/services/vendorBookings";

export type TransactionType =
  | "subscription"
  | "featured_placement"
  | "royallagn_advance"
  | "admin_advance"
  | "offline_booking";

export type TransactionDirection = "inflow" | "outflow";

export type TransactionStatus = "completed" | "pending" | "failed" | "refunded";

export interface UnifiedTransaction {
  id: string;
  type: TransactionType;
  direction: TransactionDirection;
  title: string;
  subtitle: string;
  amount: number; // Inflow (+) or Outflow (-) value
  totalBookingAmount?: number;
  dueAmount?: number;
  advanceAmount?: number;
  currency: string;
  status: TransactionStatus;
  statusLabel: string;
  paymentMethod: string;
  referenceNumber: string;
  counterparty: string;
  eventDate?: string;
  date: string; // ISO date string for sorting & filtering
  displayDate: string;
  notes?: string | null;
  rawItem?: any;
}

export interface FinanceSummary {
  totalInflow: number;      // Total Money In (Offline bookings + RoyalLagn Advance Payouts)
  totalOutflow: number;     // Total Platform Expenses (Subscriptions + Featured Ads)
  netBalance: number;       // Inflow - Outflow
  pendingReceivables: number; // Remaining customer balances from bookings
  royalLagnAdvances: number; // Total RoyalLagn advance disbursements
  transactionCount: number;

  // Online earnings breakdown (Card 1: Online Earning)
  onlineTotal: number;
  onlineAdvance: number;       // Advanced amount 30%
  onlineBookingAmount: number; // Booking amount 70%

  // Offline earnings breakdown (Card 2: Offline Earning)
  offlineTotal: number;
  offlineAdvance: number;       // Advanced amount 30%
  offlineBookingAmount: number; // Booking amount 70%

  // Combined totals (Card 3: Total Earning)
  totalEarnings: number;
  totalAdvanceAmount: number;
  totalBookingAmount: number;
}

export interface CreateOfflineBookingInput {
  vendorId: string;
  customerName: string;
  customerPhone: string;
  eventDate: string; // YYYY-MM-DD
  endDate?: string;
  eventType?: string;
  packageTitle?: string;
  totalAmount: number;
  advanceAmount: number;
  paymentMethod: "Cash" | "UPI" | "Bank Transfer" | "Card" | "Cheque" | "Other";
  paymentStatus: "paid_full" | "paid_advance" | "pending";
  notes?: string;
}

const formatDisplayDate = (isoStr?: string | null): string => {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return isoStr;
  }
};

export const VendorTransactionsService = {
  /**
   * Fetches and unifies all transactions for the vendor:
   * 1. Subscriptions (Outflow)
   * 2. Featured vendor placements (Outflow)
   * 3. Admin advance payouts for online bookings (Inflow)
   * 4. Offline bookings CRM transactions (Inflow)
   */
  async listVendorTransactions(vendorId: string): Promise<UnifiedTransaction[]> {
    if (!vendorId) return [];

    const transactions: UnifiedTransaction[] = [];

    // 1. Fetch Subscription Payments (Outflow)
    try {
      const subPayments = await SubscriptionAccessService.listPayments(vendorId);
      for (const p of subPayments) {
        const isSuccess = p.payment_status === "verified" || p.payment_status === "captured";
        const isFail = p.payment_status === "failed";
        const status: TransactionStatus = isSuccess ? "completed" : isFail ? "failed" : "pending";
        const statusLabel = isSuccess ? "Verified" : isFail ? "Failed" : "Pending";

        transactions.push({
          id: `sub_${p.id}`,
          type: "subscription",
          direction: "outflow",
          title: p.subscription_plans?.name || "Subscription Plan",
          subtitle: p.failure_reason
            ? `Failed: ${p.failure_reason}`
            : p.razorpay_payment_id
            ? `Razorpay ID: ${p.razorpay_payment_id}`
            : "Platform Subscription",
          amount: Number(p.amount || 0),
          currency: p.currency || "INR",
          status,
          statusLabel,
          paymentMethod: p.payment_method || "Razorpay Online",
          referenceNumber: p.razorpay_payment_id || p.razorpay_order_id || p.id,
          counterparty: "RoyalLagn Platform",
          date: p.paid_at || p.created_at,
          displayDate: formatDisplayDate(p.paid_at || p.created_at),
          notes: p.failure_reason || null,
          rawItem: p,
        });
      }
    } catch (err) {
      console.warn("Could not load subscription payments in transactions:", err);
    }

    // 2. Fetch Featured Placement Payments (Outflow)
    try {
      const { data: featPayments, error: featErr } = await supabase
        .from("featured_vendor_payments")
        .select("id, placement_id, amount, currency, payment_status, razorpay_order_id, razorpay_payment_id, payment_method, failure_reason, paid_at, created_at, featured_vendor_placements(pincode, slot_number, status, starts_at, ends_at)")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false });

      if (!featErr && Array.isArray(featPayments)) {
        for (const fp of featPayments) {
          const placement = fp.featured_vendor_placements as any;
          const isSuccess = fp.payment_status === "verified" || fp.payment_status === "captured" || fp.payment_status === "active";
          const isFail = fp.payment_status === "failed";
          const status: TransactionStatus = isSuccess ? "completed" : isFail ? "failed" : "pending";
          const statusLabel = isSuccess ? "Active Slot" : isFail ? "Failed" : "Reserved";

          transactions.push({
            id: `feat_${fp.id}`,
            type: "featured_placement",
            direction: "outflow",
            title: placement?.pincode
              ? `Featured Slot #${placement.slot_number ?? 1} (PIN ${placement.pincode})`
              : "Featured Vendor Placement",
            subtitle: fp.razorpay_payment_id
              ? `Razorpay ID: ${fp.razorpay_payment_id} · 30-Day Boost`
              : "PIN-code Promotion",
            amount: Number(fp.amount || 999),
            currency: fp.currency || "INR",
            status,
            statusLabel,
            paymentMethod: fp.payment_method || "Razorpay Online",
            referenceNumber: fp.razorpay_payment_id || fp.razorpay_order_id || fp.id,
            counterparty: "RoyalLagn Featured Ads",
            date: fp.paid_at || fp.created_at,
            displayDate: formatDisplayDate(fp.paid_at || fp.created_at),
            notes: fp.failure_reason || null,
            rawItem: fp,
          });
        }
      }
    } catch (featErr) {
      console.warn("Could not load featured placement payments in transactions:", featErr);
    }

    // 3 & 4. Fetch Bookings (Online Admin Advances + Offline Bookings)
    try {
      const allBookings = await VendorBookingService.getVendorBookings(vendorId);

      for (const b of allBookings) {
        const total = Number(b.total_amount || 0);
        const advance = typeof b.advance_amount === "number" && b.advance_amount > 0
          ? Number(b.advance_amount)
          : Math.round(total * 0.3);
        const due = typeof b.due_amount === "number" ? Number(b.due_amount) : Math.max(0, total - advance);

        if (b.source === "offline") {
          // 4. Offline Booking Transaction (CRM)
          const receivedAmount = b.advance_amount > 0 ? b.advance_amount : total;
          const isConfirmed = b.booking_status === "confirmed" || b.booking_status === "completed";
          const isCancelled = b.booking_status?.startsWith("cancel");
          const status: TransactionStatus = isCancelled ? "refunded" : isConfirmed ? "completed" : "pending";
          const statusLabel = isCancelled
            ? "Cancelled"
            : b.due_amount === 0
            ? "Full Payment Received"
            : "Advance Received";

          // Extract payment method from special_notes if stored
          let method = "Direct Payment";
          if (b.special_notes?.includes("Method: UPI")) method = "UPI Transfer";
          else if (b.special_notes?.includes("Method: Cash")) method = "Cash";
          else if (b.special_notes?.includes("Method: Bank Transfer")) method = "Bank Transfer";
          else if (b.special_notes?.includes("Method: Card")) method = "Card";
          else if (b.special_notes?.includes("Method: Cheque")) method = "Cheque";

          transactions.push({
            id: `bkg_off_${b.id}`,
            type: "offline_booking",
            direction: "inflow",
            title: `Offline: ${b.customer_name}`,
            subtitle: `${b.package_title || b.event_type} (${formatDisplayDate(b.event_date)}) · Ticket #${b.ticket_id}`,
            amount: receivedAmount,
            totalBookingAmount: total,
            advanceAmount: advance,
            dueAmount: due,
            currency: "INR",
            status,
            statusLabel,
            paymentMethod: method,
            referenceNumber: b.ticket_id,
            counterparty: b.customer_name,
            eventDate: b.event_date,
            date: b.created_at,
            displayDate: formatDisplayDate(b.created_at),
            notes: b.special_notes || null,
            rawItem: b,
          });
        } else if (b.advance_amount > 0 || total > 0) {
          // 3. Online Booking Advance (RoyalLagn Escrow / Disbursed)
          const isConfirmed = b.booking_status === "confirmed" || b.booking_status === "completed";
          const isCancelled = b.booking_status?.startsWith("cancel");
          const status: TransactionStatus = isCancelled ? "refunded" : isConfirmed ? "completed" : "pending";
          const statusLabel = isCancelled
            ? "Refunded to Customer"
            : isConfirmed
            ? "Disbursed by RoyalLagn"
            : "In RoyalLagn Escrow (Awaiting Confirmation)";

          transactions.push({
            id: `bkg_on_${b.id}`,
            type: "royallagn_advance",
            direction: "inflow",
            title: `RoyalLagn Advance: ${b.customer_name}`,
            subtitle: `${b.event_type} (${formatDisplayDate(b.event_date)}) · Ticket #${b.ticket_id}`,
            amount: advance,
            totalBookingAmount: total,
            advanceAmount: advance,
            dueAmount: due,
            currency: "INR",
            status,
            statusLabel,
            paymentMethod: "RoyalLagn Escrow Transfer",
            referenceNumber: b.razorpay_payment_id || b.ticket_id,
            counterparty: "RoyalLagn Platform",
            eventDate: b.event_date,
            date: b.created_at,
            displayDate: formatDisplayDate(b.created_at),
            notes: b.special_notes || null,
            rawItem: b,
          });
        }
      }
    } catch (bkgErr) {
      console.warn("Could not load bookings in transactions:", bkgErr);
    }

    // Sort descending by transaction date (newest first)
    return transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },

  /**
   * Computes financial summaries from transactions
   */
  getFinancialSummary(transactions: UnifiedTransaction[]): FinanceSummary {
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

    for (const txn of transactions) {
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
      transactionCount: transactions.length,
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
  },

  /**
   * Helper to record an offline booking transaction
   */
  async createOfflineTransaction(input: CreateOfflineBookingInput): Promise<VendorBooking> {
    const total = input.totalAmount;
    const advance = Math.min(input.advanceAmount, total);
    const due = Math.max(0, total - advance);

    const structuredNote = [
      `[Offline CRM Booking]`,
      `Method: ${input.paymentMethod}`,
      `Status: ${input.paymentStatus === "paid_full" ? "Fully Paid" : input.paymentStatus === "paid_advance" ? "Advance Received" : "Pending"}`,
      input.notes ? `Notes: ${input.notes}` : null,
    ].filter(Boolean).join(" | ");

    return VendorBookingService.createOfflineBooking({
      vendorId: input.vendorId,
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone.trim(),
      eventDate: input.eventDate,
      eventType: input.eventType || "Wedding",
      packageTitle: input.packageTitle?.trim() || "Offline Booking",
      totalAmount: total,
      advanceAmount: advance,
      specialNotes: structuredNote,
    });
  },

  /**
   * Realtime subscriptions across all 3 tables:
   * - vendor_bookings
   * - subscription_payments
   * - featured_vendor_payments
   */
  subscribeToVendorTransactions(vendorId: string, onChange: () => void): () => void {
    const unsubBookings = VendorBookingService.subscribeToBookings(onChange, { vendorId });

    const channelName = `txn-rt-${vendorId}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscription_payments",
          filter: `vendor_id=eq.${vendorId}`,
        },
        onChange
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "featured_vendor_payments",
          filter: `vendor_id=eq.${vendorId}`,
        },
        onChange
      )
      .subscribe();

    return () => {
      unsubBookings();
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  },
};
