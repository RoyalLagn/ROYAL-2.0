import { supabase } from "@/services/supabase";
import { crmError } from "@/services/crm/errors";
import type {
  CrmMarketingWorkspaceProgressUpdate,
  CrmMarketingWorkspaceSession,
  CrmMarketingWorkspaceStats,
  CrmMarketingWorkspaceVendorDetail,
  CrmMarketingWorkspaceVendorListItem,
  MarketingInterestStatus,
} from "@/types/crm/marketingWorkspace";

function firstRow<T>(data: unknown): T {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("This workspace link is invalid.");
  return row as T;
}

// Anonymous (no Supabase session) surface for a marketing team member
// working inside a workspace link. Mirrors workspaceSessionService.ts's
// pattern exactly, but against the separate crm_marketing_workspaces
// tables/RPCs. Every call reaches the `anon` Postgres role; all validation
// happens server-side inside each marketing_workspace_* RPC.
export const CrmMarketingWorkspaceSessionService = {
  async authenticate(token: string): Promise<CrmMarketingWorkspaceSession> {
    const { data, error } = await supabase.rpc("marketing_workspace_authenticate", { target_token: token.trim() });
    if (error) throw crmError(error);
    return firstRow<CrmMarketingWorkspaceSession>(data);
  },

  async progress(token: string): Promise<CrmMarketingWorkspaceStats> {
    const { data, error } = await supabase.rpc("marketing_workspace_progress", { target_token: token });
    if (error) throw crmError(error);
    return firstRow<CrmMarketingWorkspaceStats>(data);
  },

  async listVendors(
    token: string,
    query = "",
    interestFilter: "all" | MarketingInterestStatus = "all",
    registeredFilter: boolean | null = null,
    page = 1,
    pageSize = 20,
  ) {
    const { data, error } = await supabase.rpc("marketing_workspace_list_vendors", {
      target_token: token,
      search_text: query.trim() || null,
      interest_filter: interestFilter,
      registered_filter: registeredFilter,
      page_size: pageSize,
      page_offset: (page - 1) * pageSize,
    });
    if (error) throw crmError(error);
    const rows = (data ?? []) as (CrmMarketingWorkspaceVendorListItem & { total_count: number })[];
    return { rows, total: Number(rows[0]?.total_count ?? 0) };
  },

  async getVendor(token: string, vendorId: string): Promise<CrmMarketingWorkspaceVendorDetail> {
    const { data, error } = await supabase.rpc("marketing_workspace_get_vendor", {
      target_token: token,
      target_vendor_id: vendorId,
    });
    if (error) throw crmError(error);
    return firstRow<CrmMarketingWorkspaceVendorDetail>(data);
  },

  async updateProgress(token: string, vendorId: string, update: CrmMarketingWorkspaceProgressUpdate) {
    const { error } = await supabase.rpc("marketing_workspace_update_vendor_progress", {
      target_token: token,
      target_vendor_id: vendorId,
      set_contacted: update.contacted ?? null,
      set_meeting_done: update.meetingDone ?? null,
      set_interest_status: update.interestStatus ?? null,
      set_not_interested_reason: update.notInterestedReason ?? null,
      set_registered: update.registered ?? null,
      set_next_followup_date: update.nextFollowupDate ?? null,
      set_notes: update.notes ?? null,
      set_remarks: update.remarks ?? null,
      set_call_outcome: update.callOutcome ?? null,
    });
    if (error) throw crmError(error);
  },

  async logActivity(token: string, vendorId: string, action: "call_started" | "whatsapp_opened") {
    const { error } = await supabase.rpc("marketing_workspace_log_activity", {
      target_token: token,
      target_vendor_id: vendorId,
      action,
    });
    if (error) throw crmError(error);
  },
};
