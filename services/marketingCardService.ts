import { supabase } from "@/services/supabase";

// The Vendor Marketing Card reuses almost everything from the vendor's
// existing profile (business_name, category, logo_url, city, state, slug,
// contact_phone, contact_email, instagram, website, experience -- all
// already on `vendors`, and rating/reviews via services/reviews.ts). This
// service only covers the handful of fields that don't exist anywhere else:
// WhatsApp number, business tagline and "happy clients" count, stored in
// their own vendor-owned table (supabase/migrations/20260805140000_vendor_marketing_cards.sql).

export type VendorMarketingCardExtra = {
  vendorId: string;
  whatsappNumber: string;
  businessTagline: string;
  happyClients: string;
  updatedAt: string;
};

export type VendorMarketingCardExtraInput = {
  whatsappNumber: string;
  businessTagline: string;
  happyClients: string;
};

export async function getVendorMarketingCardExtra(vendorId: string): Promise<VendorMarketingCardExtra | null> {
  const { data, error } = await supabase
    .from("vendor_marketing_cards")
    .select("vendor_id, whatsapp_number, business_tagline, happy_clients, updated_at")
    .eq("vendor_id", vendorId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    vendorId: data.vendor_id,
    whatsappNumber: data.whatsapp_number ?? "",
    businessTagline: data.business_tagline ?? "",
    happyClients: data.happy_clients ?? "",
    updatedAt: data.updated_at,
  };
}

export async function saveVendorMarketingCardExtra(
  vendorId: string,
  input: VendorMarketingCardExtraInput,
): Promise<void> {
  const { error } = await supabase.from("vendor_marketing_cards").upsert(
    {
      vendor_id: vendorId,
      whatsapp_number: input.whatsappNumber.trim() || null,
      business_tagline: input.businessTagline.trim() || null,
      happy_clients: input.happyClients.trim() || null,
    },
    { onConflict: "vendor_id" },
  );
  if (error) throw error;
}
