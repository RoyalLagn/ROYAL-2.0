import { supabase } from "@/services/supabase";
import type { CrmFollowupPriority, CrmFollowupType } from "@/types/crm/followup";

export type CrmTaskFollowupItem = {
  id: string;
  vendor_id: string;
  business_name: string;
  phone: string | null;
  type: CrmFollowupType;
  scheduled_time: string | null;
  priority: CrmFollowupPriority;
  notes: string | null;
};

export type CrmTaskDocumentItem = {
  vendor_id: string;
  business_name: string;
  phone: string | null;
  category_name: string | null;
};

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export const CrmTaskService = {
  async todaysFollowups(type: CrmFollowupType | null = null): Promise<CrmTaskFollowupItem[]> {
    let query = supabase
      .from("crm_followups")
      .select("id, vendor_id, type, scheduled_time, priority, notes, crm_vendors(business_name, phone)")
      .eq("status", "pending")
      .eq("scheduled_date", todayISODate());
    if (type) query = query.eq("type", type);
    const { data, error } = await query.order("scheduled_time", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      id: row.id,
      vendor_id: row.vendor_id,
      business_name: row.crm_vendors?.business_name ?? "Unknown vendor",
      phone: row.crm_vendors?.phone ?? null,
      type: row.type,
      scheduled_time: row.scheduled_time,
      priority: row.priority,
      notes: row.notes,
    }));
  },

  async pendingDocumentVendors(): Promise<CrmTaskDocumentItem[]> {
    const { data, error } = await supabase
      .from("crm_vendors")
      .select("id, business_name, phone, crm_vendor_categories(name)")
      .eq("status", "documents_pending")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      vendor_id: row.id,
      business_name: row.business_name,
      phone: row.phone,
      category_name: row.crm_vendor_categories?.name ?? null,
    }));
  },
};
