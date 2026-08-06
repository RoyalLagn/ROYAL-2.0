import { supabase } from "@/services/supabase";
import { crmError } from "@/services/crm/errors";
import type { CrmActivity } from "@/types/crm/activity";
import type { CrmVendorStatus } from "@/types/crm/vendor";

// A vendor's activity has two independent sources that were never merged:
// `crm_activities` (admin-driven status changes, written by admin_manage_vendor)
// and `crm_workspace_activity` (everything a field employee does through a
// workspace link — adding the vendor, notes, follow-ups, calls, WhatsApp —
// written by the workspace_* RPCs). The Admin vendor profile only ever read
// the first table, so field activity was silently invisible to admins even
// though it was being recorded correctly. Merge both into one timeline.
type WorkspaceActivityRow = {
  id: string;
  vendor_id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function fromWorkspaceActivity(row: WorkspaceActivityRow): CrmActivity {
  const metadata = row.metadata ?? {};
  const fromStatus = typeof metadata.from_status === "string" ? (metadata.from_status as CrmVendorStatus) : null;
  const toStatus = typeof metadata.to_status === "string" ? (metadata.to_status as CrmVendorStatus) : null;
  return {
    id: row.id,
    vendor_id: row.vendor_id,
    actor_id: null,
    action: row.action,
    from_status: fromStatus,
    to_status: toStatus,
    metadata: { ...metadata, source: "workspace" },
    created_at: row.created_at,
  };
}

export const CrmActivityService = {
  async list(vendorId: string): Promise<CrmActivity[]> {
    const [adminActivity, workspaceActivity] = await Promise.all([
      supabase
        .from("crm_activities")
        .select("*")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false }),
      supabase
        .from("crm_workspace_activity")
        .select("id, vendor_id, action, metadata, created_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false }),
    ]);
    if (adminActivity.error) throw crmError(adminActivity.error);
    if (workspaceActivity.error) throw crmError(workspaceActivity.error);

    const merged = [
      ...((adminActivity.data ?? []) as CrmActivity[]),
      ...((workspaceActivity.data ?? []) as WorkspaceActivityRow[]).map(fromWorkspaceActivity),
    ];
    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return merged;
  },
};
