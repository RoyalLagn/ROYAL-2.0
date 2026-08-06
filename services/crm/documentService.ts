import { supabase } from "@/services/supabase";
import { crmError } from "@/services/crm/errors";

export type CrmDocument = {
  id: string;
  vendor_id: string;
  label: string;
  file_url: string;
  uploaded_by: string | null;
  created_at: string;
};

// Upload flow (storage bucket + picker) lands in a later phase; this reads
// whatever exists so the profile tab is honest rather than a static stub.
export const CrmDocumentService = {
  async list(vendorId: string): Promise<CrmDocument[]> {
    const { data, error } = await supabase
      .from("crm_documents")
      .select("*")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false });
    if (error) throw crmError(error);
    return (data ?? []) as CrmDocument[];
  },
};
