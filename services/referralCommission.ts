import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/services/supabase";

export const REFERRAL_STORAGE_KEY_CODE = "royallagn_referral_code";
export const REFERRAL_STORAGE_KEY_PROFILE = "royallagn.referral.profile.v1";
export const REFERRAL_STORAGE_KEY_CACHE = "royallagn.referral.dashboard.v1";

export type OfficialCommissionSlab = {
  min: number;
  max: number | null;
  referrerReward: number;
  royallagnCommission: number;
  totalCommission: number;
  label: string;
};

/**
 * OFFICIAL FIXED SLAB COMMISSION TABLE (MANDATORY & FINAL)
 * Strictly calculated on TOTAL BOOKING VALUE (Never on the 30% advance)
 */
export const OFFICIAL_COMMISSION_SLABS: OfficialCommissionSlab[] = [
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

export const COMMISSION_SLABS = OFFICIAL_COMMISSION_SLABS;

export function getCommissionForBookingAmount(totalAmount: number): {
  referrerReward: number;
  royallagnCommission: number;
  totalCommission: number;
  slab: OfficialCommissionSlab;
} {
  const rounded = Math.round(Number(totalAmount || 0));
  for (let i = OFFICIAL_COMMISSION_SLABS.length - 1; i >= 0; i--) {
    const slab = OFFICIAL_COMMISSION_SLABS[i];
    if (rounded >= slab.min && (slab.max === null || rounded <= slab.max)) {
      return {
        referrerReward: slab.referrerReward,
        royallagnCommission: slab.royallagnCommission,
        totalCommission: slab.totalCommission,
        slab,
      };
    }
  }
  return {
    referrerReward: 0,
    royallagnCommission: 0,
    totalCommission: 0,
    slab: OFFICIAL_COMMISSION_SLABS[0],
  };
}

export type ReferralProfile = {
  id: string;
  customerId: string;
  referralCode: string;
  referralUrl: string;
  totalReferrals: number;
  successfulReferrals: number;
  pendingEarnings: number;
  earnedBalance: number;
  reservedBalance: number;
  totalPaidOut: number;
  payoutMobile?: string | null;
  payoutBeneficiary?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReferralCommissionTransaction = {
  id: string;
  bookingId: string;
  bookingRecordId: string;
  ticketId?: string | null;
  referrerId: string;
  referredCustomerId?: string | null;
  referralCode: string;
  bookingTotal: number;
  advancePaid: number;
  remainingDue: number;
  commissionSlab: string;
  referrerReward: number;
  royallagnCommission: number;
  totalCommission: number;
  status: "pending" | "earned" | "cancelled" | "reversed";
  payoutStatus: "unpaid" | "requested" | "paid" | "reversed";
  referrerProfile?: { fullName?: string; email?: string; phone?: string };
  referredProfile?: { fullName?: string; email?: string; phone?: string };
  createdAt: string;
  updatedAt: string;
};

export type PaymentDestinationStatus = "pending" | "under_review" | "approved" | "changes_required";

export type CustomerPaymentDestination = {
  id: string;
  customerId: string;
  version: number;
  beneficiaryName: string;
  upiId: string;
  qrCodeUrl?: string | null;
  mobile?: string | null;
  ownershipConfirmed: boolean;
  status: PaymentDestinationStatus;
  observedRecipientName?: string | null;
  reviewNotes?: string | null;
  rejectionReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  customerProfile?: {
    fullName?: string;
    phone?: string;
    email?: string;
  };
};

export type WithdrawalRequestStatus =
  | "requested"
  | "under_review"
  | "approved"
  | "processing"
  | "payment_pending"
  | "paid"
  | "processed"
  | "rejected"
  | "cancelled"
  | "failed"
  | "reversed";

export type ReferralPayoutRequest = {
  id: string;
  customerId: string;
  destinationId?: string | null;
  amount: number;
  mobile: string;
  beneficiaryName: string;
  status: WithdrawalRequestStatus;
  destinationSnapshot?: {
    destination_id?: string;
    version?: number;
    beneficiary_name?: string;
    upi_id?: string;
    qr_code_url?: string | null;
    mobile?: string | null;
    approved_at?: string | null;
    observed_recipient_name?: string | null;
  } | null;
  claimedBy?: string | null;
  claimedAt?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  businessSourceAccount?: string | null;
  transactionRef?: string | null;
  paymentEvidenceUrl?: string | null;
  reconciliationNotes?: string | null;
  rejectionReason?: string | null;
  reversalReason?: string | null;
  requestedAt: string;
  processedAt?: string | null;
  paidAt?: string | null;
  cancelledAt?: string | null;
  customerProfile?: {
    fullName?: string;
    phone?: string;
    email?: string;
  };
};

export type ReferralDashboardData = {
  profile: ReferralProfile;
  paymentDestination: CustomerPaymentDestination | null;
  activeWithdrawal: ReferralPayoutRequest | null;
  commissions: ReferralCommissionTransaction[];
  payoutRequests: ReferralPayoutRequest[];
};

export const ReferralCommissionService = {
  /**
   * Generates or fetches customer's unique referral profile.
   * Auto-provisions referral account if not existing.
   */
  async ensureCustomerReferralProfile(customerId: string): Promise<ReferralProfile | null> {
    if (!customerId) return null;

    try {
      const { data, error } = await supabase.rpc("ensure_customer_referral_profile", {
        p_customer_id: customerId,
      });

      if (error) {
        console.warn("RPC ensure_customer_referral_profile error:", error.message);
      } else if (data) {
        const mapped: ReferralProfile = {
          id: data.id,
          customerId: data.customer_id,
          referralCode: data.referral_code,
          referralUrl: data.referral_url,
          totalReferrals: Number(data.total_referrals || 0),
          successfulReferrals: Number(data.successful_referrals || 0),
          pendingEarnings: Number(data.pending_earnings || 0),
          earnedBalance: Number(data.earned_balance || 0),
          reservedBalance: Number(data.reserved_balance || 0),
          totalPaidOut: Number(data.total_paid_out || 0),
          payoutMobile: data.payout_mobile,
          payoutBeneficiary: data.payout_beneficiary,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
        await AsyncStorage.setItem(REFERRAL_STORAGE_KEY_PROFILE, JSON.stringify(mapped));
        return mapped;
      }
    } catch (rpcErr) {
      console.warn("ensureCustomerReferralProfile call failed:", rpcErr);
    }

    // Direct table fetch fallback
    try {
      const { data: row } = await supabase
        .from("referral_profiles")
        .select("*")
        .eq("customer_id", customerId)
        .maybeSingle();

      if (row) {
        const mapped: ReferralProfile = {
          id: row.id,
          customerId: row.customer_id,
          referralCode: row.referral_code,
          referralUrl: row.referral_url,
          totalReferrals: Number(row.total_referrals || 0),
          successfulReferrals: Number(row.successful_referrals || 0),
          pendingEarnings: Number(row.pending_earnings || 0),
          earnedBalance: Number(row.earned_balance || 0),
          reservedBalance: Number(row.reserved_balance || 0),
          totalPaidOut: Number(row.total_paid_out || 0),
          payoutMobile: row.payout_mobile,
          payoutBeneficiary: row.payout_beneficiary,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
        return mapped;
      }
    } catch {
      // ignore
    }

    // Cached fallback
    try {
      const cached = await AsyncStorage.getItem(REFERRAL_STORAGE_KEY_PROFILE);
      if (cached) return JSON.parse(cached);
    } catch {
      // ignore
    }

    return null;
  },

  /**
   * Attributes a customer to a referrer using referral link / QR / checkout code.
   * Enforces server-side self-referral prevention and first-touch immutability.
   */
  async attributeCustomer(
    referredCustomerId: string,
    referralCode: string,
    source: string = "link"
  ): Promise<{ success: boolean; reason?: string; referrerId?: string }> {
    const cleanCode = (referralCode || "").trim().toUpperCase();
    if (!cleanCode || !referredCustomerId) {
      return { success: false, reason: "missing_parameters" };
    }

    try {
      const { data, error } = await supabase.rpc("attribute_customer_referral", {
        p_referred_id: referredCustomerId,
        p_referral_code: cleanCode,
        p_source: source,
      });

      if (error) {
        console.warn("attribute_customer_referral error:", error.message);
        return { success: false, reason: error.message };
      }

      return data as { success: boolean; reason?: string; referrerId?: string };
    } catch (err: any) {
      return { success: false, reason: err.message || "attribution_failed" };
    }
  },

  /**
   * Records a pending referral commission for a direct booking with verified 30% advance.
   * Calculated strictly on TOTAL BOOKING VALUE.
   */
  async recordPendingBookingCommission(
    bookingRecordId: string
  ): Promise<{ success: boolean; commissionId?: string; referrerReward?: number }> {
    if (!bookingRecordId) return { success: false };

    try {
      const { data, error } = await supabase.rpc("record_booking_referral_commission", {
        p_booking_id: bookingRecordId,
      });

      if (error) {
        console.warn("record_booking_referral_commission RPC error:", error.message);
        return { success: false };
      }

      return data as { success: boolean; commissionId?: string; referrerReward?: number };
    } catch (err) {
      console.warn("recordPendingBookingCommission call failed:", err);
      return { success: false };
    }
  },

  /**
   * Helper called upon vendor confirmation.
   */
  async processBookingConfirmation(booking: { id: string }): Promise<void> {
    try {
      await this.recordPendingBookingCommission(booking.id);
    } catch {
      // ignore
    }
  },

  /**
   * Fetches the currently active payment destination for a customer.
   */
  async getActivePaymentDestination(customerId: string): Promise<CustomerPaymentDestination | null> {
    if (!customerId) return null;
    try {
      const { data, error } = await supabase
        .from("customer_payment_destinations")
        .select("*")
        .eq("customer_id", customerId)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        customerId: data.customer_id,
        version: data.version,
        beneficiaryName: data.beneficiary_name,
        upiId: data.upi_id,
        qrCodeUrl: data.qr_code_url,
        mobile: data.mobile,
        ownershipConfirmed: data.ownership_confirmed,
        status: data.status,
        observedRecipientName: data.observed_recipient_name,
        reviewNotes: data.review_notes,
        rejectionReason: data.rejection_reason,
        reviewedBy: data.reviewed_by,
        reviewedAt: data.reviewed_at,
        isActive: data.is_active,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (err) {
      console.warn("getActivePaymentDestination error:", err);
      return null;
    }
  },

  /**
   * Submits or updates customer's receiving payment details.
   * Creates a new version and automatically resets status to 'pending'.
   */
  async submitPaymentDestination(details: {
    beneficiaryName: string;
    upiId: string;
    qrCodeUrl?: string | null;
    mobile?: string | null;
    ownershipConfirmed: boolean;
  }): Promise<{ success: boolean; destination?: CustomerPaymentDestination; message?: string }> {
    try {
      const { data, error } = await supabase.rpc("submit_customer_payment_destination", {
        p_beneficiary_name: details.beneficiaryName.trim(),
        p_upi_id: details.upiId.trim().toLowerCase(),
        p_qr_code_url: details.qrCodeUrl?.trim() || null,
        p_mobile: details.mobile?.trim() || null,
        p_ownership_confirmed: details.ownershipConfirmed,
      });

      if (error) {
        return { success: false, message: error.message };
      }

      const mapped: CustomerPaymentDestination = {
        id: data.id,
        customerId: data.customer_id,
        version: data.version,
        beneficiaryName: data.beneficiary_name,
        upiId: data.upi_id,
        qrCodeUrl: data.qr_code_url,
        mobile: data.mobile,
        ownershipConfirmed: data.ownership_confirmed,
        status: data.status,
        observedRecipientName: data.observed_recipient_name,
        reviewNotes: data.review_notes,
        rejectionReason: data.rejection_reason,
        reviewedBy: data.reviewed_by,
        reviewedAt: data.reviewed_at,
        isActive: data.is_active,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      return { success: true, destination: mapped };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to submit payment details." };
    }
  },

  /**
   * Legacy alias for savePayoutDestination
   */
  async savePayoutDestination(
    customerId: string,
    mobile: string,
    beneficiaryName: string
  ): Promise<{ success: boolean; message?: string }> {
    return this.submitPaymentDestination({
      beneficiaryName,
      upiId: mobile.includes("@") ? mobile : `${mobile.replace(/\D/g, "")}@upi`,
      mobile: mobile.replace(/\D/g, ""),
      ownershipConfirmed: true,
    });
  },

  /**
   * Legacy alias for requestPayout
   */
  async requestPayout(
    customerId: string,
    amount: number,
    mobile?: string,
    beneficiaryName?: string
  ): Promise<{ success: boolean; message?: string }> {
    return this.requestWithdrawal(amount);
  },

  /**
   * Requests a withdrawal from available earnings (Min ₹500, Max = Available earnings).
   * Atomically moves amount from available earnings into reserved_balance.
   */
  async requestWithdrawal(
    amount: number
  ): Promise<{ success: boolean; requestId?: string; reservedAmount?: number; message?: string }> {
    const val = Number(amount);
    if (!val || val < 500) {
      return { success: false, message: "Minimum ₹500 balance is required for withdrawal." };
    }

    try {
      const { data, error } = await supabase.rpc("request_referral_withdrawal", {
        p_amount: val,
      });

      if (error) {
        return { success: false, message: error.message };
      }

      return {
        success: true,
        requestId: data?.request_id,
        reservedAmount: data?.reserved_amount,
        message: `Withdrawal request for ₹${val} submitted successfully.`,
      };
    } catch (err: any) {
      return { success: false, message: err.message || "Could not submit withdrawal request." };
    }
  },

  /**
   * Cancels a customer withdrawal request (if not yet in processing).
   * Atomically restores reserved funds back to available earnings.
   */
  async cancelWithdrawal(
    requestId: string
  ): Promise<{ success: boolean; releasedAmount?: number; message?: string }> {
    if (!requestId) return { success: false, message: "Missing request ID." };

    try {
      const { data, error } = await supabase.rpc("cancel_customer_referral_withdrawal", {
        p_request_id: requestId,
      });

      if (error) {
        return { success: false, message: error.message };
      }

      return {
        success: true,
        releasedAmount: data?.released_amount,
        message: "Withdrawal request cancelled. Funds restored to your balance.",
      };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to cancel withdrawal." };
    }
  },

  /**
   * Fetches full dashboard data for customer (metrics, destination, active withdrawal, history).
   */
  async getReferralDashboardData(customerId: string): Promise<ReferralDashboardData | null> {
    if (!customerId) return null;

    const profile = await this.ensureCustomerReferralProfile(customerId);
    if (!profile) return null;

    const paymentDestination = await this.getActivePaymentDestination(customerId);

    let commissions: ReferralCommissionTransaction[] = [];
    try {
      const { data: commRows } = await supabase
        .from("referral_commissions")
        .select("*")
        .eq("referrer_id", customerId)
        .order("created_at", { ascending: false });

      if (commRows) {
        commissions = commRows.map((c) => ({
          id: c.id,
          bookingId: c.booking_id,
          bookingRecordId: c.booking_record_id,
          ticketId: c.ticket_id,
          referrerId: c.referrer_id,
          referredCustomerId: c.referred_customer_id,
          referralCode: c.referral_code,
          bookingTotal: Number(c.booking_total || 0),
          advancePaid: Number(c.advance_paid || 0),
          remainingDue: Number(c.remaining_due || 0),
          commissionSlab: c.commission_slab,
          referrerReward: Number(c.referrer_reward || 0),
          royallagnCommission: Number(c.royallagn_commission || 0),
          totalCommission: Number(c.total_commission || 0),
          status: c.status,
          payoutStatus: c.payout_status,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        }));
      }
    } catch (commErr) {
      console.warn("Error fetching referral commissions:", commErr);
    }

    let payoutRequests: ReferralPayoutRequest[] = [];
    try {
      const { data: pRows } = await supabase
        .from("referral_payout_requests")
        .select("*")
        .eq("customer_id", customerId)
        .order("requested_at", { ascending: false });

      if (pRows) {
        payoutRequests = pRows.map((p) => ({
          id: p.id,
          customerId: p.customer_id,
          destinationId: p.destination_id,
          amount: Number(p.amount || 0),
          mobile: p.mobile,
          beneficiaryName: p.beneficiary_name,
          status: p.status,
          destinationSnapshot: p.destination_snapshot,
          claimedBy: p.claimed_by,
          claimedAt: p.claimed_at,
          reviewedBy: p.reviewed_by,
          reviewedAt: p.reviewed_at,
          approvedBy: p.approved_by,
          approvedAt: p.approved_at,
          businessSourceAccount: p.business_source_account,
          transactionRef: p.transaction_ref,
          paymentEvidenceUrl: p.payment_evidence_url,
          reconciliationNotes: p.reconciliation_notes,
          rejectionReason: p.rejection_reason,
          reversalReason: p.reversal_reason,
          requestedAt: p.requested_at,
          processedAt: p.processed_at,
          paidAt: p.paid_at,
          cancelledAt: p.cancelled_at,
        }));
      }
    } catch (pErr) {
      console.warn("Error fetching payout requests:", pErr);
    }

    // Active withdrawal request (if any)
    const activeWithdrawal =
      payoutRequests.find((p) =>
        ["requested", "under_review", "approved", "processing", "payment_pending"].includes(p.status)
      ) || null;

    // Derived ledger reconciliation
    const derivedPending = commissions
      .filter((c) => c.status === "pending")
      .reduce((sum, c) => sum + c.referrerReward, 0);

    const derivedEarnedGross = commissions
      .filter((c) => c.status === "earned")
      .reduce((sum, c) => sum + c.referrerReward, 0);

    const totalPaidOut = payoutRequests
      .filter((p) => p.status === "paid" || p.status === "processed")
      .reduce((sum, p) => sum + p.amount, 0);

    const reservedBalance = payoutRequests
      .filter((p) => ["requested", "under_review", "approved", "processing", "payment_pending"].includes(p.status))
      .reduce((sum, p) => sum + p.amount, 0);

    const successfulCount = commissions.filter((c) => c.status === "earned").length;

    profile.pendingEarnings = derivedPending;
    profile.reservedBalance = reservedBalance;
    profile.earnedBalance = Math.max(0, derivedEarnedGross - totalPaidOut - reservedBalance);
    profile.totalPaidOut = totalPaidOut;
    profile.successfulReferrals = successfulCount;

    const result: ReferralDashboardData = {
      profile,
      paymentDestination,
      activeWithdrawal,
      commissions,
      payoutRequests,
    };

    try {
      await AsyncStorage.setItem(REFERRAL_STORAGE_KEY_CACHE, JSON.stringify(result));
    } catch {
      // ignore
    }

    return result;
  },

  // ==========================================================================
  // ADMIN METHODS (Verification & Payout Management)
  // ==========================================================================

  /**
   * Lists customer payment destination verification submissions for admin review.
   */
  async listAdminPaymentDestinations(filters?: {
    status?: string;
    query?: string;
  }): Promise<CustomerPaymentDestination[]> {
    try {
      let query = supabase
        .from("customer_payment_destinations")
        .select(`
          *,
          profiles:customer_id (
            full_name,
            phone,
            email
          )
        `)
        .order("created_at", { ascending: false });

      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data) return [];

      let list = data.map((d: any) => ({
        id: d.id,
        customerId: d.customer_id,
        version: d.version,
        beneficiaryName: d.beneficiary_name,
        upiId: d.upi_id,
        qrCodeUrl: d.qr_code_url,
        mobile: d.mobile,
        ownershipConfirmed: d.ownership_confirmed,
        status: d.status,
        observedRecipientName: d.observed_recipient_name,
        reviewNotes: d.review_notes,
        rejectionReason: d.rejection_reason,
        reviewedBy: d.reviewed_by,
        reviewedAt: d.reviewed_at,
        isActive: d.is_active,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
        customerProfile: d.profiles
          ? {
              fullName: (Array.isArray(d.profiles) ? d.profiles[0] : d.profiles)?.full_name,
              phone: (Array.isArray(d.profiles) ? d.profiles[0] : d.profiles)?.phone,
              email: (Array.isArray(d.profiles) ? d.profiles[0] : d.profiles)?.email,
            }
          : undefined,
      }));

      if (filters?.query && filters.query.trim()) {
        const q = filters.query.trim().toLowerCase();
        list = list.filter(
          (item) =>
            item.beneficiaryName.toLowerCase().includes(q) ||
            item.upiId.toLowerCase().includes(q) ||
            (item.mobile && item.mobile.includes(q)) ||
            (item.customerProfile?.fullName && item.customerProfile.fullName.toLowerCase().includes(q)) ||
            (item.customerProfile?.email && item.customerProfile.email.toLowerCase().includes(q))
        );
      }

      return list;
    } catch (err) {
      console.error("listAdminPaymentDestinations error:", err);
      return [];
    }
  },

  /**
   * Reviews a payment destination submission (Approve or Changes Required).
   */
  async reviewPaymentDestination(
    destinationId: string,
    decision: "approved" | "changes_required",
    observedName?: string,
    notes?: string,
    rejectionReason?: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const { data, error } = await supabase.rpc("review_customer_payment_destination", {
        p_destination_id: destinationId,
        p_decision: decision,
        p_observed_name: observedName?.trim() || null,
        p_notes: notes?.trim() || null,
        p_rejection_reason: rejectionReason?.trim() || null,
      });

      if (error) {
        return { success: false, message: error.message };
      }

      return { success: true, message: `Payment destination marked as ${decision}.` };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to submit review." };
    }
  },

  /**
   * Lists withdrawal payout requests for admin processing.
   */
  async listAdminWithdrawalRequests(filters?: {
    status?: string;
    query?: string;
  }): Promise<ReferralPayoutRequest[]> {
    try {
      let query = supabase
        .from("referral_payout_requests")
        .select(`
          *,
          profiles:customer_id (
            full_name,
            phone,
            email
          )
        `)
        .order("requested_at", { ascending: false });

      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data) return [];

      let list = data.map((p: any) => ({
        id: p.id,
        customerId: p.customer_id,
        destinationId: p.destination_id,
        amount: Number(p.amount || 0),
        mobile: p.mobile,
        beneficiaryName: p.beneficiary_name,
        status: p.status,
        destinationSnapshot: p.destination_snapshot,
        claimedBy: p.claimed_by,
        claimedAt: p.claimed_at,
        reviewedBy: p.reviewed_by,
        reviewedAt: p.reviewed_at,
        approvedBy: p.approved_by,
        approvedAt: p.approved_at,
        businessSourceAccount: p.business_source_account,
        transactionRef: p.transaction_ref,
        paymentEvidenceUrl: p.payment_evidence_url,
        reconciliationNotes: p.reconciliation_notes,
        rejectionReason: p.rejection_reason,
        reversalReason: p.reversal_reason,
        requestedAt: p.requested_at,
        processedAt: p.processed_at,
        paidAt: p.paid_at,
        cancelledAt: p.cancelled_at,
        customerProfile: p.profiles
          ? {
              fullName: (Array.isArray(p.profiles) ? p.profiles[0] : p.profiles)?.full_name,
              phone: (Array.isArray(p.profiles) ? p.profiles[0] : p.profiles)?.phone,
              email: (Array.isArray(p.profiles) ? p.profiles[0] : p.profiles)?.email,
            }
          : undefined,
      }));

      if (filters?.query && filters.query.trim()) {
        const q = filters.query.trim().toLowerCase();
        list = list.filter(
          (item) =>
            item.beneficiaryName.toLowerCase().includes(q) ||
            item.mobile.includes(q) ||
            (item.transactionRef && item.transactionRef.toLowerCase().includes(q)) ||
            (item.destinationSnapshot?.upi_id && item.destinationSnapshot.upi_id.toLowerCase().includes(q)) ||
            (item.customerProfile?.fullName && item.customerProfile.fullName.toLowerCase().includes(q))
        );
      }

      return list;
    } catch (err) {
      console.error("listAdminWithdrawalRequests error:", err);
      return [];
    }
  },

  /**
   * Claims a withdrawal request atomically for processing.
   */
  async claimWithdrawalPayout(requestId: string): Promise<{ success: boolean; message?: string }> {
    try {
      const { data, error } = await supabase.rpc("claim_withdrawal_payout", {
        p_request_id: requestId,
      });

      if (error) return { success: false, message: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to claim request." };
    }
  },

  /**
   * Releases an operator claim on a withdrawal request.
   */
  async releaseWithdrawalClaim(requestId: string): Promise<{ success: boolean; message?: string }> {
    try {
      const { data, error } = await supabase.rpc("release_withdrawal_claim", {
        p_request_id: requestId,
      });

      if (error) return { success: false, message: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to release claim." };
    }
  },

  /**
   * Marks a withdrawal request as Paid (requires UTR reference).
   */
  async markWithdrawalPaid(
    requestId: string,
    transactionRef: string,
    sourceAccount: string = "RoyalLagn Business UPI",
    notes?: string,
    evidenceUrl?: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const { data, error } = await supabase.rpc("mark_withdrawal_payout_paid", {
        p_request_id: requestId,
        p_transaction_ref: transactionRef.trim(),
        p_source_account: sourceAccount.trim(),
        p_notes: notes?.trim() || null,
        p_evidence_url: evidenceUrl?.trim() || null,
      });

      if (error) return { success: false, message: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to mark withdrawal as paid." };
    }
  },

  /**
   * Updates withdrawal status across processing, payment_pending, and paid.
   */
  async updatePayoutStatus(
    requestId: string,
    status: "processing" | "payment_pending" | "paid",
    transactionRef?: string,
    sourceAccount: string = "RoyalLagn Business UPI",
    notes?: string,
    evidenceUrl?: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const { data, error } = await supabase.rpc("team_update_withdrawal_payout_status", {
        p_request_id: requestId,
        p_status: status,
        p_transaction_ref: transactionRef?.trim() || null,
        p_source_account: sourceAccount.trim(),
        p_notes: notes?.trim() || null,
        p_evidence_url: evidenceUrl?.trim() || null,
      });

      if (error) return { success: false, message: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to update payout status." };
    }
  },

  /**
   * Rejects a withdrawal request with a mandatory reason.
   */
  async rejectWithdrawal(
    requestId: string,
    reason: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const { data, error } = await supabase.rpc("reject_withdrawal_payout", {
        p_request_id: requestId,
        p_reason: reason.trim(),
      });

      if (error) return { success: false, message: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to reject withdrawal." };
    }
  },

  /**
   * Marks a withdrawal request as payment pending (uncertain transfer result).
   */
  async markWithdrawalPaymentPending(
    requestId: string,
    notes?: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const { data, error } = await supabase.rpc("mark_withdrawal_payment_pending", {
        p_request_id: requestId,
        p_notes: notes?.trim() || null,
      });

      if (error) return { success: false, message: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to mark payment pending." };
    }
  },

  /**
   * Reconciles a failed or reversed bank transfer.
   */
  async reconcileWithdrawalFailure(
    requestId: string,
    status: "failed" | "reversed",
    reason: string,
    notes?: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const { data, error } = await supabase.rpc("reconcile_withdrawal_failure_or_reversal", {
        p_request_id: requestId,
        p_status: status,
        p_reason: reason.trim(),
        p_notes: notes?.trim() || null,
      });

      if (error) return { success: false, message: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to reconcile transfer." };
    }
  },

  /**
   * Lists referral commission transactions platform-wide for admin reporting.
   */
  async listAdminCommissionLedger(filters?: {
    status?: string;
    query?: string;
    limit?: number;
  }): Promise<ReferralCommissionTransaction[]> {
    try {
      let query = supabase
        .from("referral_commissions")
        .select(`
          *,
          referrer:referrer_id (
            full_name,
            email,
            phone
          ),
          referred:referred_customer_id (
            full_name,
            email,
            phone
          )
        `)
        .order("created_at", { ascending: false })
        .limit(filters?.limit || 100);

      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data) return [];

      let list: ReferralCommissionTransaction[] = data.map((c: any) => ({
        id: c.id,
        bookingId: c.booking_id,
        bookingRecordId: c.booking_record_id,
        ticketId: c.ticket_id,
        referrerId: c.referrer_id,
        referredCustomerId: c.referred_customer_id,
        referralCode: c.referral_code,
        bookingTotal: Number(c.booking_total || 0),
        advancePaid: Number(c.advance_paid || 0),
        remainingDue: Number(c.remaining_due || 0),
        commissionSlab: c.commission_slab,
        referrerReward: Number(c.referrer_reward || 0),
        royallagnCommission: Number(c.royallagn_commission || 0),
        totalCommission: Number(c.total_commission || 0),
        status: c.status,
        payoutStatus: c.payout_status,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        referrerProfile: c.referrer
          ? {
              fullName: c.referrer.full_name,
              email: c.referrer.email,
              phone: c.referrer.phone,
            }
          : undefined,
        referredProfile: c.referred
          ? {
              fullName: c.referred.full_name,
              email: c.referred.email,
              phone: c.referred.phone,
            }
          : undefined,
      }));

      if (filters?.query && filters.query.trim()) {
        const q = filters.query.trim().toLowerCase();
        list = list.filter(
          (item) =>
            item.referralCode.toLowerCase().includes(q) ||
            (item.ticketId && item.ticketId.toLowerCase().includes(q)) ||
            (item.referrerProfile?.fullName && item.referrerProfile.fullName.toLowerCase().includes(q)) ||
            (item.referrerProfile?.email && item.referrerProfile.email.toLowerCase().includes(q)) ||
            (item.referredProfile?.fullName && item.referredProfile.fullName.toLowerCase().includes(q))
        );
      }

      return list;
    } catch (err) {
      console.error("listAdminCommissionLedger error:", err);
      return [];
    }
  },

  /**
   * Subscribes to real-time changes on referral payment destinations,
   * withdrawals, commissions, and profiles with debounced refresh.
   */
  subscribeToReferralRealtime(onChange: () => void): () => void {
    const channelId = `admin-referrals-rt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase.channel(channelId);

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const notify = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        onChange();
      }, 150);
    };

    const tables = [
      "customer_payment_destinations",
      "referral_payout_requests",
      "referral_commissions",
      "referral_profiles",
    ];

    tables.forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, notify);
    });

    channel.subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  },
};

