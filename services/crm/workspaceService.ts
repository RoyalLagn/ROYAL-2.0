import { supabase } from "@/services/supabase";
import type { CrmFieldWorkspace, CrmWorkspaceCreateInput, CrmWorkspacePermissions, WorkspaceStatus } from "@/types/crm/workspace";

let channelSequence = 0;

export const CrmWorkspaceService = {
  async list(force = false): Promise<CrmFieldWorkspace[]> {
    void force;
    const { data, error } = await supabase
      .from("crm_field_workspaces")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as CrmFieldWorkspace[];
  },

  async getPermissions(workspaceId: string): Promise<CrmWorkspacePermissions | null> {
    const { data, error } = await supabase
      .from("crm_workspace_permissions")
      .select("add_vendors, edit_own_vendors, add_notes, add_followups, upload_photos, call_vendor, whatsapp_vendor, view_assigned_vendors, delete_vendors, export_data, view_reports, view_analytics, view_settings, vendor_approval, subscription_access, other_clusters")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (error) throw error;
    return (data as CrmWorkspacePermissions | null) ?? null;
  },

  async create(input: CrmWorkspaceCreateInput): Promise<CrmFieldWorkspace> {
    const { data, error } = await supabase.rpc("admin_crm_create_workspace", {
      workspace_name: input.name.trim(),
      target_employee_name: input.employeeName.trim(),
      target_employee_phone: input.employeePhone?.trim() || null,
      target_cluster_id: input.clusterId,
      target_campaign_id: input.campaignId || null,
      target_expires_at: input.expiresAt,
      target_permissions: input.permissions ?? {},
    });
    if (error) throw error;
    return data as CrmFieldWorkspace;
  },

  async regenerateToken(workspaceId: string): Promise<CrmFieldWorkspace> {
    const { data, error } = await supabase.rpc("admin_crm_regenerate_workspace_token", {
      target_workspace_id: workspaceId,
    });
    if (error) throw error;
    return data as CrmFieldWorkspace;
  },

  async setStatus(workspaceId: string, status: Extract<WorkspaceStatus, "active" | "paused" | "revoked">): Promise<CrmFieldWorkspace> {
    const { data, error } = await supabase.rpc("admin_crm_set_workspace_status", {
      target_workspace_id: workspaceId,
      target_status: status,
    });
    if (error) throw error;
    return data as CrmFieldWorkspace;
  },

  async extendExpiry(workspaceId: string, newExpiresAt: string): Promise<CrmFieldWorkspace> {
    const { data, error } = await supabase.rpc("admin_crm_extend_workspace_expiry", {
      target_workspace_id: workspaceId,
      new_expires_at: newExpiresAt,
    });
    if (error) throw error;
    return data as CrmFieldWorkspace;
  },

  async updatePermissions(workspaceId: string, permissions: Partial<CrmWorkspacePermissions>) {
    const { error } = await supabase.rpc("admin_crm_update_workspace_permissions", {
      target_workspace_id: workspaceId,
      target_permissions: permissions,
    });
    if (error) throw error;
  },

  subscribe(onChange: () => void) {
    channelSequence += 1;
    const channel = supabase.channel(`admin-crm-workspaces-${channelSequence}`);
    for (const table of ["crm_field_workspaces", "crm_workspace_activity"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
    }
    channel.subscribe();
    return () => {
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  },
};
