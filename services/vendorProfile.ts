import { supabase } from "@/services/supabase";

export type VendorBusinessHourEntry = {
  day: number;
  opens: string;
  closes: string;
  closed: boolean;
};

// Every key is optional: update_vendor_public_profile() only touches the
// columns whose key is actually present in the JSON payload (see
// supabase/migrations/20260805130000_extend_vendor_public_profile_updates.sql),
// so each focused vendor-profile section form can send just the fields it
// owns without risking overwriting a section it never displayed.
export type VendorProfileChanges = Partial<{
  business_name: string;
  owner_name: string;
  category_id: string;
  description: string;
  experience: number | null;
  awards: string[];
  languages: string[];
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  city: string;
  state: string;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  tags: string[];
  logo_url: string | null;
  business_hours: VendorBusinessHourEntry[] | null;
}>;

export async function updateVendorPublicProfile(changes: VendorProfileChanges) {
  const { data, error } = await supabase.rpc("update_vendor_public_profile", {
    changes,
  });
  if (error) throw error;
  return data;
}
