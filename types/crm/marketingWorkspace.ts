import type { CrmVendorStatus } from "@/types/crm/vendor";

export type MarketingWorkspaceStatus = "active" | "paused" | "completed" | "revoked";
export type MarketingWorkspacePriority = "low" | "medium" | "high";
export type MarketingInterestStatus = "pending" | "interested" | "not_interested";
export type MarketingWorkspaceVendorFilter = "assigned" | "contacted" | "meeting_done" | "interested" | "not_interested" | "registered" | "pending";

// Admin-facing row shape (matches crm_marketing_workspaces).
export type CrmMarketingWorkspace = {
  id: string;
  token: string;
  name: string;
  team_name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  priority: MarketingWorkspacePriority;
  status: MarketingWorkspaceStatus;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmMarketingWorkspaceCreateInput = {
  name: string;
  teamName: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  priority?: MarketingWorkspacePriority;
  status?: MarketingWorkspaceStatus;
};

export type CrmMarketingWorkspaceStats = {
  assigned: number;
  contacted: number;
  meeting_done: number;
  interested: number;
  not_interested: number;
  registered: number;
  pending: number;
  weighted_completion: number;
};

// Shape returned by the anon-callable marketing_workspace_authenticate RPC —
// no raw database IDs, only human-readable names.
export type CrmMarketingWorkspaceSession = {
  workspace_name: string;
  team_name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  priority: MarketingWorkspacePriority;
  status: MarketingWorkspaceStatus;
  category_names: string[];
};

// Vendor picker row for the admin assignment screen.
export type CrmAssignableVendor = {
  id: string;
  business_name: string;
  owner_name: string | null;
  phone: string | null;
  area: string | null;
  category_id: string | null;
  category_name: string | null;
  cluster_name: string | null;
  status: CrmVendorStatus;
  is_assigned: boolean;
};

// Admin-facing assignment row. This is deliberately separate from the vendor
// picker row: it only includes vendors that are already part of a workspace.
export type CrmMarketingWorkspaceAssignedVendor = {
  id: string;
  business_name: string;
  owner_name: string | null;
  phone: string | null;
  area: string | null;
  category_name: string | null;
  cluster_name: string | null;
  status: CrmVendorStatus;
  assigned_at: string;
};

export type CrmMarketingRegisteredVendor = CrmMarketingWorkspaceAssignedVendor & {
  workspace_names: string[];
};

export type CrmMarketingDashboardMetric = "interested" | "calls_today" | "meetings_today" | "followups_pending";
export type CrmMarketingDashboardVendor = CrmMarketingWorkspaceAssignedVendor & { workspace_name: string };

// Team-facing "My Vendors" list row.
export type CrmMarketingWorkspaceVendorListItem = {
  assignment_id: string;
  vendor_id: string;
  business_name: string;
  owner_name: string | null;
  phone: string | null;
  area: string | null;
  category_name: string | null;
  vendor_status: CrmVendorStatus;
  contacted: boolean;
  meeting_done: boolean;
  interest_status: MarketingInterestStatus;
  registered: boolean;
  next_followup_date: string | null;
};

// Team-facing vendor detail (pipeline update screen).
export type CrmMarketingWorkspaceVendorDetail = {
  vendor_id: string;
  business_name: string;
  owner_name: string | null;
  phone: string | null;
  whatsapp: string | null;
  area: string | null;
  category_name: string | null;
  cluster_name: string | null;
  vendor_status: CrmVendorStatus;
  contacted: boolean;
  meeting_done: boolean;
  interest_status: MarketingInterestStatus;
  not_interested_reason: string | null;
  registered: boolean;
  next_followup_date: string | null;
  notes: string | null;
  remarks: string | null;
  call_outcome: string | null;
};

export type CrmMarketingWorkspaceProgressUpdate = {
  contacted?: boolean;
  meetingDone?: boolean;
  interestStatus?: MarketingInterestStatus;
  notInterestedReason?: string | null;
  registered?: boolean;
  nextFollowupDate?: string | null;
  notes?: string | null;
  remarks?: string | null;
  callOutcome?: string | null;
};

export const notInterestedReasons = [
  "Already using another platform",
  "No budget",
  "Busy",
  "Will join later",
  "Other",
];
