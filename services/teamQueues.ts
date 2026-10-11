import { supabase } from "@/services/supabase";
import type { TeamPortalOverview, VendorChecklist } from "@/types/team";
import type { CustomerPaymentDestination, ReferralPayoutRequest } from "@/services/referralCommission";

export type QueueAssignmentFilter = "all" | "unassigned" | "my_assigned" | "other_assigned" | "escalated" | "overdue";

export type TeamPaymentDestinationItem = CustomerPaymentDestination & {
  assignedTo?: string | null;
  assignedAt?: string | null;
  assignedBy?: string | null;
  escalated?: boolean;
  escalatedAt?: string | null;
  escalationReason?: string | null;
  isOverdue?: boolean;
};

export type TeamWithdrawalItem = ReferralPayoutRequest & {
  assignedTo?: string | null;
  assignedAt?: string | null;
  assignedBy?: string | null;
  escalated?: boolean;
  escalatedAt?: string | null;
  escalationReason?: string | null;
  secondApprovalRequired?: boolean;
  secondApprovedBy?: string | null;
  secondApprovedAt?: string | null;
  secondApprovalNotes?: string | null;
  isOverdue?: boolean;
};

export type TeamVendorApplicationItem = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  businessName: string;
  categoryName?: string;
  description: string;
  experience: number;
  address: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
  instagram?: string | null;
  facebook?: string | null;
  website?: string | null;
  logoUrl: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  rejectionReason?: string | null;
  assignedTo?: string | null;
  assignedAt?: string | null;
  assignedBy?: string | null;
  escalated?: boolean;
  escalatedAt?: string | null;
  escalationReason?: string | null;
  verifierRecommendation?: string | null;
  verifierNotes?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  isOverdue?: boolean;
};

export const TeamQueuesService = {
  /**
   * Fetches aggregated overview counts across all team queues.
   */
  async getOverview(): Promise<TeamPortalOverview | null> {
    try {
      const { data, error } = await supabase.rpc("get_team_portal_overview");
      if (error) throw error;
      return data as TeamPortalOverview;
    } catch (err) {
      console.error("TeamQueuesService.getOverview error:", err);
      return null;
    }
  },

  /**
   * Lists customer payment destination verification queue items.
   */
  async listPaymentDestinations(filters?: {
    status?: string;
    assignment?: QueueAssignmentFilter;
    query?: string;
    currentUserId?: string;
  }): Promise<TeamPaymentDestinationItem[]> {
    try {
      let query = supabase
        .from("customer_payment_destinations")
        .select(`
          *,
          customer:customer_id (
            full_name,
            phone,
            email
          )
        `)
        .order("created_at", { ascending: false });

      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      } else {
        query = query.eq("is_active", true);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data) return [];

      const nowMs = Date.now();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;

      let items: TeamPaymentDestinationItem[] = data.map((d: any) => {
        const ageMs = nowMs - new Date(d.created_at).getTime();
        return {
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
          assignedTo: d.assigned_to,
          assignedAt: d.assigned_at,
          assignedBy: d.assigned_by,
          escalated: Boolean(d.escalated),
          escalatedAt: d.escalated_at,
          escalationReason: d.escalation_reason,
          isOverdue: (d.status === "pending" || d.status === "under_review") && ageMs > twentyFourHoursMs,
          customerProfile: d.customer
            ? {
                fullName: (Array.isArray(d.customer) ? d.customer[0] : d.customer)?.full_name,
                phone: (Array.isArray(d.customer) ? d.customer[0] : d.customer)?.phone,
                email: (Array.isArray(d.customer) ? d.customer[0] : d.customer)?.email,
              }
            : undefined,
        };
      });

      // Filter by assignment
      if (filters?.assignment && filters.assignment !== "all") {
        const uid = filters.currentUserId;
        if (filters.assignment === "unassigned") {
          items = items.filter((i) => !i.assignedTo);
        } else if (filters.assignment === "my_assigned") {
          items = items.filter((i) => i.assignedTo === uid);
        } else if (filters.assignment === "other_assigned") {
          items = items.filter((i) => i.assignedTo && i.assignedTo !== uid);
        } else if (filters.assignment === "escalated") {
          items = items.filter((i) => i.escalated);
        } else if (filters.assignment === "overdue") {
          items = items.filter((i) => i.isOverdue);
        }
      }

      // Filter by search query
      if (filters?.query?.trim()) {
        const q = filters.query.trim().toLowerCase();
        items = items.filter(
          (i) =>
            i.beneficiaryName.toLowerCase().includes(q) ||
            i.upiId.toLowerCase().includes(q) ||
            (i.mobile && i.mobile.includes(q)) ||
            (i.customerProfile?.fullName && i.customerProfile.fullName.toLowerCase().includes(q)) ||
            (i.observedRecipientName && i.observedRecipientName.toLowerCase().includes(q))
        );
      }

      return items;
    } catch (err) {
      console.error("listPaymentDestinations error:", err);
      return [];
    }
  },

  /**
   * Lists withdrawal payout requests for finance operators.
   */
  async listWithdrawals(filters?: {
    status?: string;
    assignment?: QueueAssignmentFilter | "pending_second_approval";
    query?: string;
    currentUserId?: string;
  }): Promise<TeamWithdrawalItem[]> {
    try {
      let query = supabase
        .from("referral_payout_requests")
        .select(`
          *,
          customer:customer_id (
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

      const nowMs = Date.now();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;

      let items: TeamWithdrawalItem[] = data.map((p: any) => {
        const ageMs = nowMs - new Date(p.requested_at).getTime();
        const pending = ["requested", "under_review", "approved", "processing"].includes(p.status);
        return {
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
          assignedTo: p.assigned_to,
          assignedAt: p.assigned_at,
          assignedBy: p.assigned_by,
          escalated: Boolean(p.escalated),
          escalatedAt: p.escalated_at,
          escalationReason: p.escalation_reason,
          secondApprovalRequired: Boolean(p.second_approval_required || p.amount >= 5000),
          secondApprovedBy: p.second_approved_by,
          secondApprovedAt: p.second_approved_at,
          secondApprovalNotes: p.second_approval_notes,
          isOverdue: pending && ageMs > twentyFourHoursMs,
          customerProfile: p.customer
            ? {
                fullName: (Array.isArray(p.customer) ? p.customer[0] : p.customer)?.full_name,
                phone: (Array.isArray(p.customer) ? p.customer[0] : p.customer)?.phone,
                email: (Array.isArray(p.customer) ? p.customer[0] : p.customer)?.email,
              }
            : undefined,
        };
      });

      // Filter by assignment / second approval
      if (filters?.assignment && filters.assignment !== "all") {
        const uid = filters.currentUserId;
        if (filters.assignment === "unassigned") {
          items = items.filter((i) => !i.assignedTo);
        } else if (filters.assignment === "my_assigned") {
          items = items.filter((i) => i.assignedTo === uid);
        } else if (filters.assignment === "other_assigned") {
          items = items.filter((i) => i.assignedTo && i.assignedTo !== uid);
        } else if (filters.assignment === "escalated") {
          items = items.filter((i) => i.escalated);
        } else if (filters.assignment === "overdue") {
          items = items.filter((i) => i.isOverdue);
        } else if (filters.assignment === "pending_second_approval") {
          items = items.filter((i) => i.secondApprovalRequired && !i.secondApprovedBy);
        }
      }

      // Filter by search query
      if (filters?.query?.trim()) {
        const q = filters.query.trim().toLowerCase();
        items = items.filter(
          (i) =>
            i.beneficiaryName.toLowerCase().includes(q) ||
            i.mobile.includes(q) ||
            (i.transactionRef && i.transactionRef.toLowerCase().includes(q)) ||
            (i.destinationSnapshot?.upi_id && i.destinationSnapshot.upi_id.toLowerCase().includes(q)) ||
            (i.customerProfile?.fullName && i.customerProfile.fullName.toLowerCase().includes(q))
        );
      }

      return items;
    } catch (err) {
      console.error("listWithdrawals error:", err);
      return [];
    }
  },

  /**
   * Lists vendor applications for vendor verifiers.
   */
  async listVendorApplications(filters?: {
    status?: string;
    assignment?: QueueAssignmentFilter;
    query?: string;
    currentUserId?: string;
  }): Promise<TeamVendorApplicationItem[]> {
    try {
      let query = supabase
        .from("vendor_applications")
        .select(`
          *,
          category:category_id (name)
        `)
        .order("submitted_at", { ascending: false });

      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data) return [];

      const nowMs = Date.now();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;

      let items: TeamVendorApplicationItem[] = data.map((v: any) => {
        const ageMs = nowMs - new Date(v.submitted_at).getTime();
        return {
          id: v.id,
          fullName: v.full_name,
          email: v.email,
          phone: v.phone,
          businessName: v.business_name,
          categoryName: v.category?.name || "General",
          description: v.description,
          experience: v.experience,
          address: v.address,
          city: v.city,
          state: v.state,
          country: v.country,
          pincode: v.pincode,
          instagram: v.instagram,
          facebook: v.facebook,
          website: v.website,
          logoUrl: v.logo_url,
          status: v.status,
          submittedAt: v.submitted_at,
          reviewedAt: v.reviewed_at,
          reviewedBy: v.reviewed_by,
          rejectionReason: v.rejection_reason,
          assignedTo: v.assigned_to,
          assignedAt: v.assigned_at,
          assignedBy: v.assigned_by,
          escalated: Boolean(v.escalated),
          escalatedAt: v.escalated_at,
          escalationReason: v.escalation_reason,
          verifierRecommendation: v.verifier_recommendation,
          verifierNotes: v.verifier_notes,
          verifiedBy: v.verified_by,
          verifiedAt: v.verified_at,
          isOverdue: v.status === "pending" && ageMs > twentyFourHoursMs,
        };
      });

      // Filter by assignment
      if (filters?.assignment && filters.assignment !== "all") {
        const uid = filters.currentUserId;
        if (filters.assignment === "unassigned") {
          items = items.filter((i) => !i.assignedTo);
        } else if (filters.assignment === "my_assigned") {
          items = items.filter((i) => i.assignedTo === uid);
        } else if (filters.assignment === "other_assigned") {
          items = items.filter((i) => i.assignedTo && i.assignedTo !== uid);
        } else if (filters.assignment === "escalated") {
          items = items.filter((i) => i.escalated);
        } else if (filters.assignment === "overdue") {
          items = items.filter((i) => i.isOverdue);
        }
      }

      // Filter by search query
      if (filters?.query?.trim()) {
        const q = filters.query.trim().toLowerCase();
        items = items.filter(
          (i) =>
            i.businessName.toLowerCase().includes(q) ||
            i.fullName.toLowerCase().includes(q) ||
            i.city.toLowerCase().includes(q) ||
            i.phone.includes(q) ||
            i.email.toLowerCase().includes(q)
        );
      }

      return items;
    } catch (err) {
      console.error("listVendorApplications error:", err);
      return [];
    }
  },

  /**
   * Atomically claims an unassigned request.
   */
  async claimRequest(
    queueType: "payment_destination" | "withdrawal" | "vendor_application",
    requestId: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const { data, error } = await supabase.rpc("claim_team_request", {
        p_queue_type: queueType,
        p_request_id: requestId,
      });
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to claim request" };
    }
  },

  /**
   * Releases a claimed request.
   */
  async releaseClaim(
    queueType: "payment_destination" | "withdrawal" | "vendor_application",
    requestId: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const { data, error } = await supabase.rpc("release_team_request", {
        p_queue_type: queueType,
        p_request_id: requestId,
      });
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to release request" };
    }
  },

  /**
   * Reassigns a request to another team member (Manager/Admin).
   */
  async assignRequest(
    queueType: "payment_destination" | "withdrawal" | "vendor_application",
    requestId: string,
    targetUserId: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const { data, error } = await supabase.rpc("assign_team_request", {
        p_queue_type: queueType,
        p_request_id: requestId,
        p_target_user_id: targetUserId,
      });
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to reassign request" };
    }
  },

  /**
   * Escalates a request with an explicit reason.
   */
  async escalateRequest(
    queueType: "payment_destination" | "withdrawal" | "vendor_application",
    requestId: string,
    reason: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const { data, error } = await supabase.rpc("escalate_team_request", {
        p_queue_type: queueType,
        p_request_id: requestId,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to escalate request" };
    }
  },

  /**
   * Payment Verifier reviews customer payment details.
   */
  async reviewPaymentDestination(
    destinationId: string,
    decision: "approved" | "changes_required",
    observedName?: string,
    notes?: string,
    rejectionReason?: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const { data, error } = await supabase.rpc("team_review_customer_payment_destination", {
        p_destination_id: destinationId,
        p_decision: decision,
        p_observed_name: observedName?.trim() || null,
        p_notes: notes?.trim() || null,
        p_rejection_reason: rejectionReason?.trim() || null,
      });
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to record review" };
    }
  },

  /**
   * Finance Operator/Manager provides 2nd approval on high-tier withdrawals.
   */
  async secondApprovePayout(
    requestId: string,
    notes?: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const { data, error } = await supabase.rpc("team_second_approve_payout", {
        p_request_id: requestId,
        p_notes: notes?.trim() || null,
      });
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to second-approve payout" };
    }
  },

  /**
   * Finance Operator executes payment transfer.
   */
  async executePayout(
    requestId: string,
    transactionRef: string,
    sourceAccount: string = "RoyalLagn Business Account",
    notes?: string,
    evidenceUrl?: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const { data, error } = await supabase.rpc("team_execute_withdrawal_payout", {
        p_request_id: requestId,
        p_transaction_ref: transactionRef.trim(),
        p_source_account: sourceAccount.trim(),
        p_notes: notes?.trim() || null,
        p_evidence_url: evidenceUrl?.trim() || null,
      });
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to execute payout" };
    }
  },

  /**
   * Updates withdrawal payout status across processing, payment_pending, and paid.
   */
  async updatePayoutStatus(
    requestId: string,
    status: "processing" | "payment_pending" | "paid",
    transactionRef?: string,
    sourceAccount: string = "RoyalLagn Business Account",
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
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to update payout status" };
    }
  },

  /**
   * Vendor Verifier records checklist and recommendation.
   */
  async recommendVendorApplication(
    applicationId: string,
    recommendation: "recommended_approval" | "recommended_rejection" | "needs_clarification",
    notes?: string,
    checklist?: VendorChecklist
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const { data, error } = await supabase.rpc("team_recommend_vendor_application", {
        p_application_id: applicationId,
        p_recommendation: recommendation,
        p_notes: notes?.trim() || null,
        p_checklist: checklist || {},
      });
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to submit recommendation" };
    }
  },

  /**
   * Manager / Admin records final decision on vendor application.
   */
  async decideVendorApplication(
    applicationId: string,
    decision: "approved" | "rejected",
    reason?: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const { data, error } = await supabase.rpc("team_decide_vendor_application", {
        p_application_id: applicationId,
        p_decision: decision,
        p_reason: reason?.trim() || null,
      });
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to submit final decision" };
    }
  },

  /**
   * Subscribes to real-time changes across all team operational queues.
   */
  subscribeToTeamQueuesRealtime(onChange: () => void): () => void {
    const channelId = `team-portal-rt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
      "vendor_applications",
      "team_activity_log",
      "team_memberships",
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
