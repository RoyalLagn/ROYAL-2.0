import type { CrmVendorPriority, CrmVendorStatus } from "@/types/crm/vendor";
import type { CrmFollowupPriority, CrmFollowupStatus, CrmFollowupType } from "@/types/crm/followup";

export type WorkspaceStatus = "active" | "paused" | "expired" | "revoked";

export const workspaceStatusLabels: Record<WorkspaceStatus, string> = {
  active: "Active",
  paused: "Paused",
  expired: "Expired",
  revoked: "Revoked",
};

// Tailwind color pair (background/foreground), same convention as
// crmVendorStatusColors in types/crm/vendor.ts.
export const workspaceStatusColors: Record<WorkspaceStatus, string> = {
  active: "bg-emerald-500/10 text-emerald-500",
  paused: "bg-amber-500/10 text-amber-500",
  expired: "bg-slate-500/10 text-slate-500",
  revoked: "bg-red-500/10 text-red-500",
};

export type CrmWorkspacePermissions = {
  add_vendors: boolean;
  edit_own_vendors: boolean;
  add_notes: boolean;
  add_followups: boolean;
  upload_photos: boolean;
  call_vendor: boolean;
  whatsapp_vendor: boolean;
  view_assigned_vendors: boolean;
  delete_vendors: boolean;
  export_data: boolean;
  view_reports: boolean;
  view_analytics: boolean;
  view_settings: boolean;
  vendor_approval: boolean;
  subscription_access: boolean;
  other_clusters: boolean;
};

export const defaultWorkspacePermissions: CrmWorkspacePermissions = {
  add_vendors: true,
  edit_own_vendors: true,
  add_notes: true,
  add_followups: true,
  upload_photos: true,
  call_vendor: true,
  whatsapp_vendor: true,
  view_assigned_vendors: true,
  delete_vendors: false,
  export_data: false,
  view_reports: false,
  view_analytics: false,
  view_settings: false,
  vendor_approval: false,
  subscription_access: false,
  other_clusters: false,
};

// Admin-facing row shape (matches crm_field_workspaces). RLS already
// restricts reads to admins; the token is only meant to be surfaced in the
// share UI (Phase 2+), not logged or displayed incidentally.
export type CrmFieldWorkspace = {
  id: string;
  token: string;
  name: string;
  employee_name: string;
  employee_phone: string | null;
  cluster_id: string;
  campaign_id: string | null;
  employee_profile_id: string | null;
  status: WorkspaceStatus;
  starts_at: string;
  expires_at: string;
  last_activity_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmWorkspaceCreateInput = {
  name: string;
  employeeName: string;
  employeePhone?: string | null;
  clusterId: string;
  campaignId?: string | null;
  expiresAt: string;
  permissions?: Partial<CrmWorkspacePermissions>;
};

// Shape returned by the anon-callable workspace_authenticate RPC — no raw
// database IDs, only human-readable names + permissions.
export type CrmWorkspaceSession = {
  workspace_name: string;
  employee_name: string;
  campaign_name: string | null;
  cluster_name: string;
  expires_at: string;
  permissions: CrmWorkspacePermissions;
};

// ----------------------------------------------------------------------------
// Phase 2 — employee-facing vendor/follow-up shapes. These mirror the admin
// CRM's crm_vendors/crm_followups types but only carry what the
// workspace_* RPCs actually return (no raw workspace/cluster/campaign IDs).
// ----------------------------------------------------------------------------

export type CrmWorkspaceVendor = {
  id: string;
  business_name: string;
  owner_name: string | null;
  phone: string | null;
  area: string | null;
  priority: CrmVendorPriority;
  status: CrmVendorStatus;
  category_name: string | null;
  is_own: boolean;
  created_at: string;
};

export type CrmWorkspaceVendorInput = {
  businessName: string;
  categoryId: string;
  ownerName?: string | null;
  phone?: string | null;
  alternatePhone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  website?: string | null;
  instagram?: string | null;
  googleMapsUrl?: string | null;
  area?: string | null;
  priority?: CrmVendorPriority;
  leadSource?: string | null;
  visitedDate?: string | null;
  notes?: string | null;
};

export type CrmWorkspaceFollowup = {
  id: string;
  vendor_id: string;
  business_name: string;
  type: CrmFollowupType;
  scheduled_date: string;
  scheduled_time: string | null;
  priority: CrmFollowupPriority;
  notes: string | null;
  status: CrmFollowupStatus;
};

export type CrmWorkspaceProgress = {
  vendors_added: number;
  interested: number;
  not_interested: number;
  meetings: number;
  registered: number;
  followups_pending: number;
  followups_completed: number;
};
