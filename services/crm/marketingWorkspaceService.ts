import { supabase } from "@/services/supabase";
import { crmError } from "@/services/crm/errors";
import type {
  CrmAssignableVendor,
  CrmMarketingWorkspace,
  CrmMarketingWorkspaceCreateInput,
  CrmMarketingWorkspaceStats,
  MarketingWorkspaceStatus,
} from "@/types/crm/marketingWorkspace";

let channelSequence = 0;

export const CrmMarketingWorkspaceService = {
  async list(): Promise<CrmMarketingWorkspace[]> {
    const { data, error } = await supabase
      .from("crm_marketing_workspaces")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw crmError(error);
    return (data ?? []) as CrmMarketingWorkspace[];
  },

  async get(id: string): Promise<CrmMarketingWorkspace> {
    const { data, error } = await supabase.from("crm_marketing_workspaces").select("*").eq("id", id).maybeSingle();
    if (error) throw crmError(error);
    if (!data) throw new Error("Workspace not found.");
    return data as CrmMarketingWorkspace;
  },

  async create(input: CrmMarketingWorkspaceCreateInput): Promise<CrmMarketingWorkspace> {
    const { data, error } = await supabase.rpc("admin_crm_create_marketing_workspace", {
      workspace_name: input.name.trim(),
      target_team_name: input.teamName.trim(),
      target_description: input.description?.trim() || null,
      target_start_date: input.startDate || null,
      target_end_date: input.endDate || null,
      target_priority: input.priority ?? "medium",
      target_status: input.status ?? "active",
    });
    if (error) throw crmError(error);
    return data as CrmMarketingWorkspace;
  },

  async update(id: string, changes: Partial<CrmMarketingWorkspaceCreateInput>) {
    const payload: Record<string, unknown> = {};
    if (changes.name !== undefined) payload.name = changes.name.trim();
    if (changes.teamName !== undefined) payload.team_name = changes.teamName.trim();
    if (changes.description !== undefined) payload.description = changes.description?.trim() || null;
    if (changes.startDate !== undefined) payload.start_date = changes.startDate || null;
    if (changes.endDate !== undefined) payload.end_date = changes.endDate || null;
    if (changes.priority !== undefined) payload.priority = changes.priority;
    const { data, error } = await supabase.rpc("admin_crm_update_marketing_workspace", {
      target_workspace_id: id,
      changes: payload,
    });
    if (error) throw crmError(error);
    return data as CrmMarketingWorkspace;
  },

  async setStatus(id: string, status: MarketingWorkspaceStatus) {
    const { data, error } = await supabase.rpc("admin_crm_set_marketing_workspace_status", {
      target_workspace_id: id,
      target_status: status,
    });
    if (error) throw crmError(error);
    return data as CrmMarketingWorkspace;
  },

  async regenerateToken(id: string) {
    const { data, error } = await supabase.rpc("admin_crm_regenerate_marketing_workspace_token", {
      target_workspace_id: id,
    });
    if (error) throw crmError(error);
    return data as CrmMarketingWorkspace;
  },

  async getCategoryIds(workspaceId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from("crm_marketing_workspace_categories")
      .select("category_id")
      .eq("workspace_id", workspaceId);
    if (error) throw crmError(error);
    return (data ?? []).map((row) => row.category_id);
  },

  async setCategories(workspaceId: string, categoryIds: string[]) {
    const { error } = await supabase.rpc("admin_crm_set_marketing_workspace_categories", {
      target_workspace_id: workspaceId,
      target_category_ids: categoryIds,
    });
    if (error) throw crmError(error);
  },

  async listAssignableVendors(
    workspaceId: string,
    categoryIds: string[] | null,
    query = "",
    page = 1,
    pageSize = 50,
  ): Promise<{ rows: CrmAssignableVendor[]; total: number }> {
    const { data, error } = await supabase.rpc("admin_crm_list_assignable_vendors", {
      target_workspace_id: workspaceId,
      target_category_ids: categoryIds && categoryIds.length ? categoryIds : null,
      search_text: query.trim() || null,
      page_size: pageSize,
      page_offset: (page - 1) * pageSize,
    });
    if (error) throw crmError(error);
    const rows = (data ?? []) as (CrmAssignableVendor & { total_count: number })[];
    return { rows, total: Number(rows[0]?.total_count ?? 0) };
  },

  async assignVendors(workspaceId: string, vendorIds: string[]): Promise<number> {
    const { data, error } = await supabase.rpc("admin_crm_assign_marketing_workspace_vendors", {
      target_workspace_id: workspaceId,
      target_vendor_ids: vendorIds,
    });
    if (error) throw crmError(error);
    return Number(data ?? 0);
  },

  async unassignVendor(workspaceId: string, vendorId: string) {
    const { error } = await supabase.rpc("admin_crm_unassign_marketing_workspace_vendor", {
      target_workspace_id: workspaceId,
      target_vendor_id: vendorId,
    });
    if (error) throw crmError(error);
  },

  async stats(workspaceId: string): Promise<CrmMarketingWorkspaceStats> {
    const { data, error } = await supabase.rpc("admin_crm_marketing_workspace_stats", {
      target_workspace_id: workspaceId,
    });
    if (error) throw crmError(error);
    const row = Array.isArray(data) ? data[0] : data;
    return (row ?? {
      assigned: 0, contacted: 0, meeting_done: 0, interested: 0,
      not_interested: 0, registered: 0, pending: 0, weighted_completion: 0,
    }) as CrmMarketingWorkspaceStats;
  },

  subscribe(onChange: () => void) {
    channelSequence += 1;
    const channel = supabase.channel(`admin-crm-marketing-workspaces-${channelSequence}`);
    for (const table of ["crm_marketing_workspaces", "crm_marketing_workspace_vendors"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
    }
    channel.subscribe();
    return () => {
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  },
};
