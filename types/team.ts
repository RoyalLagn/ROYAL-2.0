export const TEAM_PERMISSIONS = [
  "payment_verifier",
  "finance_operator",
  "vendor_verifier",
  "marketing_teammate",
  "team_manager",
  "admin_owner",
] as const;

export type TeamPermission = (typeof TEAM_PERMISSIONS)[number];

export const TEAM_PERMISSION_LABELS: Record<TeamPermission, { title: string; description: string; badgeColor: string }> = {
  payment_verifier: {
    title: "Payment Verifier",
    description: "Verify customer UPI/QR payment details, check names against banking apps, approve or request corrections.",
    badgeColor: "#059669",
  },
  finance_operator: {
    title: "Finance Operator",
    description: "Review approved withdrawal requests, perform bank transfers, enter UTR reference numbers, and reconcile reversals.",
    badgeColor: "#2563EB",
  },
  vendor_verifier: {
    title: "Vendor Verifier",
    description: "Review vendor applications, verify business credentials and coverage, submit structured recommendations.",
    badgeColor: "#D97706",
  },
  marketing_teammate: {
    title: "Marketing Teammate",
    description: "Access marketing workspaces, campaigns, and vendor lead tracking. Zero access to financial data or balances.",
    badgeColor: "#7C3AED",
  },
  team_manager: {
    title: "Team Manager",
    description: "Supervise operational queues, assign and rebalance workloads, resolve escalations, and provide second approvals.",
    badgeColor: "#DC2626",
  },
  admin_owner: {
    title: "Admin / Owner",
    description: "Full operational access, configure teammate permissions, supervise metrics, and manage platform settings.",
    badgeColor: "#E11D48",
  },
};

export type TeamMembership = {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  phone?: string | null;
  permissions: TeamPermission[];
  isActive: boolean;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TeamActivityLogEntry = {
  id: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  entityType: "payment_destination" | "payout_request" | "vendor_application" | "team_membership";
  entityId: string;
  action: string;
  details: Record<string, any>;
  createdAt: string;
};

export type TeamPortalOverview = {
  destinations: {
    pending: number;
    unassigned: number;
    my_assigned: number;
  };
  withdrawals: {
    pending: number;
    unassigned: number;
    my_assigned: number;
    pending_second_approval: number;
    pending_amount: number;
  };
  vendors: {
    pending: number;
    unassigned: number;
    my_assigned: number;
  };
  overdue_count: number;
  escalated_count: number;
  active_members_count: number;
};

export type VendorChecklist = {
  identityVerified: boolean;
  locationCoverageVerified: boolean;
  portfolioAuthentic: boolean;
  categoryMatched: boolean;
  notes?: string;
};
