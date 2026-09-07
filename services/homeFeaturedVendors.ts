import { supabase } from "@/services/supabase";

export const HOME_FEATURED_VENDOR_LIMIT = 10;

export async function listHomeFeaturedVendorIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from("home_featured_vendors")
    .select("vendor_id,display_order")
    .order("display_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: { vendor_id: string }) => row.vendor_id);
}

export async function saveHomeFeaturedVendorIds(vendorIds: string[]): Promise<void> {
  if (vendorIds.length > HOME_FEATURED_VENDOR_LIMIT) {
    throw new Error(`Choose no more than ${HOME_FEATURED_VENDOR_LIMIT} vendors.`);
  }
  if (new Set(vendorIds).size !== vendorIds.length) {
    throw new Error("Each featured vendor can only be selected once.");
  }
  const { error } = await supabase.rpc("set_home_featured_vendors_v2", {
    p_vendor_ids: vendorIds,
  });
  if (error) throw error;
}

export function subscribeToHomeFeaturedVendors(onChange: () => void) {
  const channel = supabase
    .channel(`home-featured-vendors-${Date.now()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "home_featured_vendors" },
      onChange,
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
