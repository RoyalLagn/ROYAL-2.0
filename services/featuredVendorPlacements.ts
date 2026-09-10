import { supabase } from "@/services/supabase";

export const FEATURED_PLACEMENT_PRICE = 999;
export const FEATURED_PLACEMENT_CAPACITY = 10;

export type FeaturedInventory = {
  pincode: string;
  capacity: number;
  occupied: number;
  remaining: number;
  nextAvailableAt: string | null;
  slots: FeaturedInventorySlot[];
};

export type FeaturedInventorySlot = {
  slotNumber: number;
  status: "available" | "booked" | "mine";
  availableAt: string | null;
};

type PublicActivePlacementRow = {
  vendor_id: string;
  slot_number: number;
  ends_at: string;
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

export async function getFeaturedInventory(pincode: string, vendorId?: string): Promise<FeaturedInventory> {
  const { data, error } = await supabase.rpc("get_featured_inventory", { target_pincode: pincode });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const occupied = Number(row?.occupied ?? 0);
  const nextAvailableAt = row?.next_available_at ?? null;
  const { data: activeRows, error: activeRowsError } = await supabase
    .from("featured_vendor_placements")
    .select("vendor_id,slot_number,ends_at")
    .eq("pincode", pincode)
    .eq("status", "active")
    .gt("ends_at", new Date().toISOString());
  if (activeRowsError) throw activeRowsError;
  const activeBySlot = new Map<number, PublicActivePlacementRow>(
    ((activeRows ?? []) as PublicActivePlacementRow[]).map((placement) => [Number(placement.slot_number), placement]),
  );
  const placeholderBookedSlots = new Set<number>();
  for (let slotNumber = 1; placeholderBookedSlots.size + activeBySlot.size < occupied && slotNumber <= FEATURED_PLACEMENT_CAPACITY; slotNumber += 1) {
    if (!activeBySlot.has(slotNumber)) placeholderBookedSlots.add(slotNumber);
  }
  return {
    pincode,
    capacity: Number(row?.capacity ?? FEATURED_PLACEMENT_CAPACITY),
    occupied,
    remaining: Number(row?.remaining ?? FEATURED_PLACEMENT_CAPACITY),
    nextAvailableAt,
    slots: Array.from({ length: FEATURED_PLACEMENT_CAPACITY }, (_, index) => {
      const slotNumber = index + 1;
      const activePlacement = activeBySlot.get(slotNumber);
      const isBooked = Boolean(activePlacement) || placeholderBookedSlots.has(slotNumber);
      return {
        slotNumber,
        status: activePlacement?.vendor_id === vendorId ? "mine" as const : isBooked ? "booked" as const : "available" as const,
        availableAt: activePlacement?.ends_at ?? (isBooked ? nextAvailableAt : null),
      };
    }),
  };
}

export async function listFeaturedVendorIdsForPincode(pincode?: string | null): Promise<string[]> {
  if (!pincode || !/^[1-9][0-9]{5}$/.test(pincode)) return [];
  const { data, error } = await supabase.rpc("get_featured_vendor_ids_for_pincode", { target_pincode: pincode });
  if (error) throw error;
  return (data ?? []).map((row: { vendor_id: string }) => row.vendor_id);
}

/**
 * Reads the signed-in vendor's placements through a server-owned identity
 * lookup. Do not make this a client-filtered table query: when RLS filters a
 * row out, PostgREST returns an empty array, which is indistinguishable from
 * "the vendor has never purchased a placement" to the UI.
 */
export async function getMyFeaturedPlacements(): Promise<FeaturedPlacement[]> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) return [];
  const { data: vendor, error: vendorError } = await supabase.from("vendors").select("id").eq("profile_id", user.id).maybeSingle();
  if (vendorError) throw vendorError;
  if (!vendor) return [];
  const { data, error } = await supabase.from("featured_vendor_placements").select("*")
    .eq("vendor_id", vendor.id).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FeaturedPlacement[];
}

export function subscribeToFeaturedPlacements(onChange: () => void) {
  const channel = supabase.channel(`featured-placements-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "featured_vendor_placements" }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
