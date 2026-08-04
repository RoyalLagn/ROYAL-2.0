import { supabase } from "@/services/supabase";
import type { CrmActivity } from "@/types/crm/activity";

export const CrmActivityService = {
  async list(vendorId: string): Promise<CrmActivity[]> {
    const { data, error } = await supabase
      .from("crm_activities")
      .select("*")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as CrmActivity[];
  },
};
