import { supabase } from "@/services/supabase";
import type { CrmFollowup, CrmFollowupStatus, CrmFollowupType } from "@/types/crm/followup";

export type CrmFollowupInput = {
  type?: CrmFollowupType;
  scheduledDate: string;
  scheduledTime?: string | null;
  priority?: "low" | "medium" | "high";
  notes?: string | null;
};

export const CrmFollowupService = {
  async list(vendorId: string): Promise<CrmFollowup[]> {
    const { data, error } = await supabase
      .from("crm_followups")
      .select("*")
      .eq("vendor_id", vendorId)
      .order("scheduled_date", { ascending: true });
    if (error) throw error;
    return (data ?? []) as CrmFollowup[];
  },

  async create(vendorId: string, input: CrmFollowupInput) {
    const { error } = await supabase.from("crm_followups").insert({
      vendor_id: vendorId,
      type: input.type ?? "call",
      scheduled_date: input.scheduledDate,
      scheduled_time: input.scheduledTime || null,
      priority: input.priority ?? "medium",
      notes: input.notes?.trim() || null,
    });
    if (error) throw error;
  },

  async setStatus(id: string, status: CrmFollowupStatus) {
    const { error } = await supabase.from("crm_followups").update({ status }).eq("id", id);
    if (error) throw error;
  },
};
