import { supabase } from "@/services/supabase";

export const FEATURED_PLACEMENT_PRICE = 999;
export const FEATURED_PLACEMENT_CAPACITY = 10;

export type FeaturedInventory = {
  pincode: string;
  capacity: number;
  occupied: number;
  remaining: number;
  nextAvailableAt: string | null;
};

export type FeaturedPlacement = {
  id: string;
  vendor_id: string;
  pincode: string;
  slot_number: number;
  status: "reserved" | "active" | "expired" | "cancelled";
  reserved_until: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

export async function getFeaturedInventory(pincode: string): Promise<FeaturedInventory> {
  const { data, error } = await supabase.rpc("get_featured_inventory", { target_pincode: pincode });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    pincode,
    capacity: Number(row?.capacity ?? FEATURED_PLACEMENT_CAPACITY),
    occupied: Number(row?.occupied ?? 0),
    remaining: Number(row?.remaining ?? FEATURED_PLACEMENT_CAPACITY),
    nextAvailableAt: row?.next_available_at ?? null,
  };
}

export async function listFeaturedVendorIdsForPincode(pincode?: string | null): Promise<string[]> {
  if (!pincode || !/^[1-9][0-9]{5}$/.test(pincode)) return [];
  const { data, error } = await supabase.rpc("get_featured_vendor_ids_for_pincode", { target_pincode: pincode });
  if (error) throw error;
  return (data ?? []).map((row: { vendor_id: string }) => row.vendor_id);
}

export async function getMyFeaturedPlacements(vendorId: string): Promise<FeaturedPlacement[]> {
  const { data, error } = await supabase.from("featured_vendor_placements").select("*")
    .eq("vendor_id", vendorId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FeaturedPlacement[];
}

export function subscribeToFeaturedPlacements(onChange: () => void) {
  const channel = supabase.channel(`featured-placements-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "featured_vendor_placements" }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
