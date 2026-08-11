import { supabase } from "@/services/supabase";
import { requireVendorRegistrationEnabled } from "@/services/vendorRegistration";

export type VendorApplicationSubmission = {
  full_name: string;
  email: string;
  phone: string;
  business_name: string;
  category_id: string;
  description: string;
  experience: number;
  address: string;
  pincode: string;
  city_id: string | null;
  area_id: string | null;
  service_area_ids: string[];
  geo_pincode_locality_id: string | null;
  location_fallback: boolean;
  instagram: string | null;
  facebook: string | null;
  website: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  business_documents: unknown[];
};

export async function submitVendorApplication(input: VendorApplicationSubmission) {
  await requireVendorRegistrationEnabled();
  const { data, error } = await supabase.functions.invoke("submit-vendor-application", {
    body: { ...input, terms_accepted: true },
  });
  if (error) {
    let message = "Unable to submit your application.";
    const response = (error as any)?.context;
    if (typeof response?.json === "function") {
      const body = await response.json().catch(() => null);
      if (typeof body?.error === "string") message = body.error;
    }
    throw new Error(message);
  }
  return data?.application;
}
