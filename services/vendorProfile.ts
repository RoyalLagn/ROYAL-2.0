import { supabase } from "@/services/supabase";

export type VendorProfileChanges = {
  business_name: string;
  owner_name: string;
  category_id: string;
  description: string;
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
};

export async function updateVendorPublicProfile(changes: VendorProfileChanges) {
  const { data, error } = await supabase.rpc("update_vendor_public_profile", {
    changes,
  });
  if (error) throw error;
  return data;
}
