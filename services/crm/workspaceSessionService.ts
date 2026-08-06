import { supabase } from "@/services/supabase";
import { crmError } from "@/services/crm/errors";
import type {
  CrmWorkspaceFollowup,
  CrmWorkspaceProgress,
  CrmWorkspaceSession,
  CrmWorkspaceVendor,
  CrmWorkspaceVendorInput,
} from "@/types/crm/workspace";
import type { CrmVendorRecord, CrmVendorStatus } from "@/types/crm/vendor";
import type { CrmFollowupStatus, CrmFollowupType } from "@/types/crm/followup";
import type { CrmNote } from "@/types/crm/activity";

function firstRow<T>(data: unknown): T {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("This workspace link is invalid.");
  return row as T;
}

function vendorPayload(input: CrmWorkspaceVendorInput) {
  return {
    target_business_name: input.businessName.trim(),
    target_category_id: input.categoryId,
    target_owner_name: input.ownerName?.trim() || null,
    target_phone: input.phone?.trim() || null,
    target_alternate_phone: input.alternatePhone?.trim() || null,
    target_whatsapp: input.whatsapp?.trim() || null,
    target_email: input.email?.trim() || null,
    target_website: input.website?.trim() || null,
    target_instagram: input.instagram?.trim() || null,
    target_google_maps_url: input.googleMapsUrl?.trim() || null,
    target_area: input.area?.trim() || null,
    target_priority: input.priority ?? "medium",
    target_lead_source: input.leadSource?.trim() || null,
    target_visited_date: input.visitedDate || null,
    target_notes: input.notes?.trim() || null,
  };
}

// Anonymous (no Supabase session) surface for an employee working inside a
// workspace link. The same `supabase` client already works unauthenticated —
// every call here reaches the `anon` Postgres role. All validation (token,
// expiry, status, permissions, cluster boundary) happens server-side inside
// each workspace_* RPC; this wrapper never sees or trusts raw IDs.
export const CrmWorkspaceSessionService = {
  async authenticate(token: string): Promise<CrmWorkspaceSession> {
    const { data, error } = await supabase.rpc("workspace_authenticate", { target_token: token.trim() });
    if (error) throw crmError(error);
    return firstRow<CrmWorkspaceSession>(data);
  },

  async listVendors(token: string, query = "", status: "all" | CrmVendorStatus = "all", page = 1, pageSize = 20) {
    const { data, error } = await supabase.rpc("workspace_list_vendors", {
      target_token: token,
      search_text: query.trim() || null,
      status_filter: status,
      page_size: pageSize,
      page_offset: (page - 1) * pageSize,
    });
    if (error) throw crmError(error);
    const rows = (data ?? []) as (CrmWorkspaceVendor & { total_count: number })[];
    return { rows, total: Number(rows[0]?.total_count ?? 0) };
  },

  async createVendor(token: string, input: CrmWorkspaceVendorInput) {
    const { data, error } = await supabase.rpc("workspace_create_vendor", {
      target_token: token,
      ...vendorPayload(input),
    });
    if (error) throw crmError(error);
    return data;
  },

  async updateVendor(token: string, vendorId: string, changes: Partial<CrmWorkspaceVendorInput>) {
    const payload: Record<string, unknown> = {};
    if (changes.businessName !== undefined) payload.business_name = changes.businessName.trim();
    if (changes.ownerName !== undefined) payload.owner_name = changes.ownerName?.trim() || null;
    if (changes.phone !== undefined) payload.phone = changes.phone?.trim() || null;
    if (changes.alternatePhone !== undefined) payload.alternate_phone = changes.alternatePhone?.trim() || null;
    if (changes.whatsapp !== undefined) payload.whatsapp = changes.whatsapp?.trim() || null;
    if (changes.email !== undefined) payload.email = changes.email?.trim() || null;
    if (changes.website !== undefined) payload.website = changes.website?.trim() || null;
    if (changes.instagram !== undefined) payload.instagram = changes.instagram?.trim() || null;
    if (changes.googleMapsUrl !== undefined) payload.google_maps_url = changes.googleMapsUrl?.trim() || null;
    if (changes.area !== undefined) payload.area = changes.area?.trim() || null;
    if (changes.priority !== undefined) payload.priority = changes.priority;
    if (changes.leadSource !== undefined) payload.lead_source = changes.leadSource?.trim() || null;
    if (changes.notes !== undefined) payload.notes = changes.notes?.trim() || null;
    const { error } = await supabase.rpc("workspace_update_vendor", {
      target_token: token,
      target_vendor_id: vendorId,
      changes: payload,
    });
    if (error) throw crmError(error);
  },

  async updateVendorStatus(token: string, vendorId: string, status: CrmVendorStatus) {
    const { error } = await supabase.rpc("workspace_update_vendor_status", {
      target_token: token,
      target_vendor_id: vendorId,
      new_status: status,
    });
    if (error) throw crmError(error);
  },

  async addNote(token: string, vendorId: string, body: string) {
    const { error } = await supabase.rpc("workspace_add_note", {
      target_token: token,
      target_vendor_id: vendorId,
      body: body.trim(),
    });
    if (error) throw crmError(error);
  },

  async addFollowup(token: string, vendorId: string, input: {
    type: CrmFollowupType; scheduledDate: string; scheduledTime?: string | null;
    priority?: "low" | "medium" | "high"; notes?: string | null;
  }) {
    const { error } = await supabase.rpc("workspace_add_followup", {
      target_token: token,
      target_vendor_id: vendorId,
      followup_type: input.type,
      scheduled_date: input.scheduledDate,
      scheduled_time: input.scheduledTime || null,
      priority: input.priority ?? "medium",
      notes: input.notes?.trim() || null,
    });
    if (error) throw crmError(error);
  },

  async listFollowups(token: string, status: CrmFollowupStatus | "all" = "pending", vendorId?: string) {
    const { data, error } = await supabase.rpc("workspace_list_followups", {
      target_token: token,
      status_filter: status,
      vendor_filter: vendorId ?? null,
    });
    if (error) throw crmError(error);
    return (data ?? []) as CrmWorkspaceFollowup[];
  },

  async getVendor(token: string, vendorId: string): Promise<CrmVendorRecord> {
    const { data, error } = await supabase.rpc("workspace_get_vendor", {
      target_token: token,
      target_vendor_id: vendorId,
    });
    if (error) throw crmError(error);
    return data as CrmVendorRecord;
  },

  async listNotes(token: string, vendorId: string): Promise<CrmNote[]> {
    const { data, error } = await supabase.rpc("workspace_list_notes", {
      target_token: token,
      target_vendor_id: vendorId,
    });
    if (error) throw crmError(error);
    return (data ?? []) as CrmNote[];
  },

  async setFollowupStatus(token: string, followupId: string, status: CrmFollowupStatus) {
    const { error } = await supabase.rpc("workspace_set_followup_status", {
      target_token: token,
      target_followup_id: followupId,
      new_status: status,
    });
    if (error) throw crmError(error);
  },

  async logActivity(token: string, vendorId: string, action: "call_started" | "whatsapp_opened") {
    const { error } = await supabase.rpc("workspace_log_activity", {
      target_token: token,
      target_vendor_id: vendorId,
      action,
    });
    if (error) throw crmError(error);
  },

  async progress(token: string): Promise<CrmWorkspaceProgress> {
    const { data, error } = await supabase.rpc("workspace_progress", { target_token: token });
    if (error) throw crmError(error);
    return firstRow<CrmWorkspaceProgress>(data);
  },
};
