import { supabase } from "@/services/supabase";
import { crmError } from "@/services/crm/errors";
import type { CrmNote } from "@/types/crm/activity";

export const CrmNoteService = {
  async list(vendorId: string): Promise<CrmNote[]> {
    const { data, error } = await supabase
      .from("crm_notes")
      .select("*")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false });
    if (error) throw crmError(error);
    return (data ?? []) as CrmNote[];
  },

  async create(vendorId: string, body: string) {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw crmError(error);
    const { error: insertError } = await supabase.from("crm_notes").insert({
      vendor_id: vendorId,
      author_id: data.user?.id ?? null,
      body: body.trim(),
    });
    if (insertError) throw crmError(insertError);
  },
};
