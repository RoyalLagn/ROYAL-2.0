import { Platform, Share } from "react-native";
import { crmError } from "@/services/crm/errors";
import { supabase } from "@/services/supabase";
import type {
  CrmVendorFilters,
  CrmVendorInput,
  CrmVendorListItem,
  CrmVendorRecord,
  CrmVendorStatistics,
  CrmVendorStatus,
} from "@/types/crm/vendor";

let channelSequence = 0;

async function count(table: string, apply: (query: any) => any = (query) => query) {
  const result = await apply(supabase.from(table).select("id", { count: "exact", head: true }));
  if (result.error) throw crmError(result.error);
  return result.count ?? 0;
}

const LIST_SELECT = "*, crm_vendor_categories(name), crm_sales_executives(name), crm_clusters(name)";

function toListItem(row: any): CrmVendorListItem {
  const { crm_vendor_categories, crm_sales_executives, crm_clusters, ...rest } = row;
  return {
    ...(rest as CrmVendorRecord),
    category_name: crm_vendor_categories?.name ?? null,
    executive_name: crm_sales_executives?.name ?? null,
    cluster_name: crm_clusters?.name ?? null,
  };
}

function payloadFromInput(input: CrmVendorInput) {
  return {
    cluster_id: input.clusterId,
    category_id: input.categoryId,
    assigned_executive_id: input.assignedExecutiveId ?? null,
    business_name: input.businessName.trim(),
    owner_name: input.ownerName?.trim() || null,
    phone: input.phone?.trim() || null,
    alternate_phone: input.alternatePhone?.trim() || null,
    whatsapp: input.whatsapp?.trim() || null,
    email: input.email?.trim() || null,
    website: input.website?.trim() || null,
    instagram: input.instagram?.trim() || null,
    google_maps_url: input.googleMapsUrl?.trim() || null,
    area: input.area?.trim() || null,
    priority: input.priority ?? "medium",
    lead_source: input.leadSource?.trim() || null,
    visited_date: input.visitedDate || null,
    notes: input.notes?.trim() || null,
    rating: input.rating ?? null,
  };
}

export const CrmVendorService = {
  async list(filters: CrmVendorFilters, force = false): Promise<{ rows: CrmVendorListItem[]; total: number }> {
    void force;
    let query = supabase.from("crm_vendors").select(LIST_SELECT, { count: "exact" });
    const needle = filters.query.trim();
    if (needle) {
      query = query.or(
        `business_name.ilike.%${needle}%,owner_name.ilike.%${needle}%,phone.ilike.%${needle}%,area.ilike.%${needle}%`,
      );
    }
    if (filters.status !== "all") query = query.eq("status", filters.status);
    if (filters.priority !== "all") query = query.eq("priority", filters.priority);
    if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
    if (filters.clusterId) query = query.eq("cluster_id", filters.clusterId);
    if (filters.executiveId) query = query.eq("assigned_executive_id", filters.executiveId);
    const from = (filters.page - 1) * filters.pageSize;
    const { data, error, count: total } = await query
      .order("created_at", { ascending: false })
      .range(from, from + filters.pageSize - 1);
    if (error) throw crmError(error);
    return { rows: (data ?? []).map(toListItem), total: total ?? 0 };
  },

  async getRecord(id: string): Promise<CrmVendorListItem> {
    const { data, error } = await supabase.from("crm_vendors").select(LIST_SELECT).eq("id", id).maybeSingle();
    if (error) throw crmError(error);
    if (!data) throw new Error("Vendor not found.");
    return toListItem(data);
  },

  async create(input: CrmVendorInput) {
    const { data, error } = await supabase.from("crm_vendors").insert(payloadFromInput(input)).select().single();
    if (error) throw crmError(error);
    return data as CrmVendorRecord;
  },

  async update(id: string, input: Partial<CrmVendorInput>) {
    const payload: Record<string, unknown> = {};
    if (input.clusterId !== undefined) payload.cluster_id = input.clusterId;
    if (input.categoryId !== undefined) payload.category_id = input.categoryId;
    if (input.assignedExecutiveId !== undefined) payload.assigned_executive_id = input.assignedExecutiveId;
    if (input.businessName !== undefined) payload.business_name = input.businessName.trim();
    if (input.ownerName !== undefined) payload.owner_name = input.ownerName?.trim() || null;
    if (input.phone !== undefined) payload.phone = input.phone?.trim() || null;
    if (input.alternatePhone !== undefined) payload.alternate_phone = input.alternatePhone?.trim() || null;
    if (input.whatsapp !== undefined) payload.whatsapp = input.whatsapp?.trim() || null;
    if (input.email !== undefined) payload.email = input.email?.trim() || null;
    if (input.website !== undefined) payload.website = input.website?.trim() || null;
    if (input.instagram !== undefined) payload.instagram = input.instagram?.trim() || null;
    if (input.googleMapsUrl !== undefined) payload.google_maps_url = input.googleMapsUrl?.trim() || null;
    if (input.area !== undefined) payload.area = input.area?.trim() || null;
    if (input.priority !== undefined) payload.priority = input.priority;
    if (input.leadSource !== undefined) payload.lead_source = input.leadSource?.trim() || null;
    if (input.visitedDate !== undefined) payload.visited_date = input.visitedDate || null;
    if (input.notes !== undefined) payload.notes = input.notes?.trim() || null;
    if (input.rating !== undefined) payload.rating = input.rating;
    const { error } = await supabase.from("crm_vendors").update(payload).eq("id", id);
    if (error) throw crmError(error);
  },

  async updateStatus(id: string, status: CrmVendorStatus, note?: string) {
    const { error } = await supabase.rpc("admin_crm_update_vendor_status", {
      target_vendor_id: id,
      new_status: status,
      note: note?.trim() || null,
    });
    if (error) throw crmError(error);
  },

  async bulkUpdateStatus(ids: string[], status: CrmVendorStatus) {
    for (const id of ids) {
      await this.updateStatus(id, status);
    }
  },

  async bulkAssignExecutive(ids: string[], executiveId: string | null) {
    const { error } = await supabase.from("crm_vendors").update({ assigned_executive_id: executiveId }).in("id", ids);
    if (error) throw crmError(error);
  },

  async bulkDelete(ids: string[]) {
    const { error } = await supabase.from("crm_vendors").delete().in("id", ids);
    if (error) throw crmError(error);
  },

  async exportCsv(rows: CrmVendorListItem[]) {
    const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const headers = [
      "Business Name", "Owner", "Phone", "Alternate Phone", "WhatsApp", "Email",
      "Category", "Cluster", "Area", "Priority", "Status", "Lead Source",
      "Assigned Executive", "Visited Date", "Rating", "Created At",
    ];
    const csv = [
      headers.map(quote).join(","),
      ...rows.map((row) => [
        row.business_name, row.owner_name, row.phone, row.alternate_phone, row.whatsapp, row.email,
        row.category_name, row.cluster_name, row.area, row.priority, row.status, row.lead_source,
        row.executive_name, row.visited_date, row.rating, row.created_at,
      ].map(quote).join(",")),
    ].join("\n");
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `royallagn-crm-vendors-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }
    await Share.share({ title: "RoyalLagn CRM Vendors CSV", message: csv });
  },

  async statistics(): Promise<CrmVendorStatistics> {
    const today = new Date().toISOString().slice(0, 10);
    const [total, registered, premium, interested, followUpsPending, callsToday, meetingsToday, documentsPending] = await Promise.all([
      count("crm_vendors"),
      count("crm_vendors", (q) => q.eq("status", "registered_on_royallagn")),
      count("crm_vendors", (q) => q.eq("status", "premium_customer")),
      count("crm_vendors", (q) => q.eq("status", "interested")),
      count("crm_followups", (q) => q.eq("status", "pending")),
      count("crm_followups", (q) => q.eq("status", "pending").eq("type", "call").eq("scheduled_date", today)),
      count("crm_followups", (q) => q.eq("status", "pending").eq("type", "meeting").eq("scheduled_date", today)),
      count("crm_vendors", (q) => q.eq("status", "documents_pending")),
    ]);
    return {
      total,
      registered,
      premium,
      interested,
      callsPendingToday: callsToday,
      meetingsPendingToday: meetingsToday,
      followUpsPending,
      documentsPending,
    };
  },

  subscribe(onChange: () => void) {
    channelSequence += 1;
    const channel = supabase.channel(`admin-crm-vendors-${channelSequence}`);
    for (const table of ["crm_vendors", "crm_followups"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
    }
    channel.subscribe();
    return () => {
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  },
};
